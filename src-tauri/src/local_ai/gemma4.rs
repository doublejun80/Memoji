use super::{
    tokenizer::LocalTokenizer, LocalAiConfig, LocalAiError, LocalAiGenerateRequest,
    LocalAiGenerateResponse, LocalAiModelInfo,
};
use crate::local_ai::sampler::SamplingConfig;
use candle_core::quantized::{
    ggml_file,
    gguf_file::{Content, Value},
    QMatMul as CandleQMatMul, QTensor,
};
use candle_core::{DType, Device, IndexOp, Result as CandleResult, Tensor};
use candle_nn::Module;
use candle_transformers::{generation::LogitsProcessor, quantized_nn::RmsNorm, utils::repeat_kv};
use std::fs::File;

const DEFAULT_ROPE_FREQUENCY: f32 = 1_000_000.;
const DEFAULT_ROPE_FREQUENCY_SLIDING: f32 = 10_000.;

#[derive(Debug)]
pub struct Gemma4Runtime {
    model_info: LocalAiModelInfo,
    tokenizer: LocalTokenizer,
    model: Gemma4Model,
    eos_token_id: u32,
    context_size: usize,
}

impl Gemma4Runtime {
    pub fn load(config: &LocalAiConfig) -> Result<Self, LocalAiError> {
        let tokenizer = LocalTokenizer::from_file(&config.tokenizer_path)?;
        let mut file = File::open(&config.model_path).map_err(|error| {
            LocalAiError::LoadFailed(format!(
                "failed to open {}: {error}",
                config.model_path.display()
            ))
        })?;
        let content = Content::read(&mut file)
            .map_err(|error| LocalAiError::LoadFailed(error.to_string()))?;
        let architecture = metadata_string(&content, "general.architecture")
            .unwrap_or_else(|| "unknown".to_string());

        if architecture != "gemma4" {
            return Err(LocalAiError::UnsupportedArchitecture {
                architecture,
                message: "Only Gemma 4 GGUF text models are supported by the local Candle backend."
                    .to_string(),
            });
        }

        let eos_token_id =
            metadata_u32(&content, "tokenizer.ggml.eos_token_id").unwrap_or_else(|| {
                tokenizer
                    .token_to_id("<eos>")
                    .or_else(|| tokenizer.token_to_id("</s>"))
                    .unwrap_or(1)
            });

        let model_info = LocalAiModelInfo {
            architecture: architecture.clone(),
            name: metadata_string(&content, "general.name"),
            quantization_version: metadata_u64(&content, "general.quantization_version"),
            file_type: metadata_u64(&content, "general.file_type"),
            tensor_count: content.tensor_infos.len(),
            metadata_count: content.metadata.len(),
            tokenizer_vocab_size: tokenizer.vocab_size(),
            context_size: config.context_size,
        };

        let device = Device::Cpu;
        let model = Gemma4Model::from_gguf(content, &mut file, &device, config.context_size)
            .map_err(|error| LocalAiError::LoadFailed(error.to_string()))?;

        Ok(Self {
            model_info,
            tokenizer,
            model,
            eos_token_id,
            context_size: config.context_size,
        })
    }

    pub fn model_info(&self) -> &LocalAiModelInfo {
        &self.model_info
    }

    pub fn supports_generation(&self) -> bool {
        true
    }

    pub fn unsupported_error(&self) -> LocalAiError {
        LocalAiError::UnsupportedArchitecture {
            architecture: self.model_info.architecture.clone(),
            message: "The loaded model unexpectedly does not expose a Gemma 4 decoder.".to_string(),
        }
    }

    pub fn generate(
        &mut self,
        request: LocalAiGenerateRequest,
        sampling: SamplingConfig,
    ) -> Result<LocalAiGenerateResponse, LocalAiError> {
        self.generate_with_callback(request, sampling, |_token_text, _generated_tokens| Ok(()))
    }

    pub fn generate_with_callback<F>(
        &mut self,
        request: LocalAiGenerateRequest,
        sampling: SamplingConfig,
        mut on_token: F,
    ) -> Result<LocalAiGenerateResponse, LocalAiError>
    where
        F: FnMut(String, usize) -> Result<(), LocalAiError>,
    {
        let prompt = build_prompt(&request);
        let mut prompt_tokens = self.tokenizer.encode(&prompt, false)?;
        if prompt_tokens.is_empty() {
            return Err(LocalAiError::GenerateFailed(
                "prompt did not produce any tokens".to_string(),
            ));
        }

        if prompt_tokens.len() > self.context_size {
            let start = prompt_tokens.len() - self.context_size;
            prompt_tokens = prompt_tokens[start..].to_vec();
        }

        let prompt_token_count = prompt_tokens.len();
        let max_new_tokens = sampling
            .max_new_tokens
            .min(self.context_size.saturating_sub(prompt_tokens.len()).max(1));
        let mut logits_processor = LogitsProcessor::new(
            42,
            Some(sampling.temperature as f64),
            Some(sampling.top_p as f64),
        );

        self.model.clear_kv_cache();
        let device = self.model.device().clone();
        let mut index_pos = 0;
        let mut generated = Vec::with_capacity(max_new_tokens);
        let mut input_tokens = prompt_tokens;
        let mut finish_reason = "length".to_string();

        for _ in 0..max_new_tokens {
            let input = Tensor::new(input_tokens.as_slice(), &device)
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?
                .unsqueeze(0)
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;
            let input_len = input_tokens.len();
            let logits = self
                .model
                .forward(&input, index_pos)
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;
            index_pos += input_len;

            let logits = logits
                .squeeze(0)
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;
            let next_token = logits_processor
                .sample(&logits)
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;

            if next_token == self.eos_token_id {
                finish_reason = "eos_token".to_string();
                break;
            }

            generated.push(next_token);
            let token_text = self.tokenizer.decode(&[next_token], true)?;
            if !token_text.is_empty() {
                on_token(token_text, generated.len())?;
            }
            input_tokens.clear();
            input_tokens.push(next_token);
        }

        let text = self.tokenizer.decode(&generated, true)?;

        Ok(LocalAiGenerateResponse {
            text,
            prompt_tokens: prompt_token_count,
            generated_tokens: generated.len(),
            finish_reason,
        })
    }
}

#[derive(Debug, Clone)]
struct Gemma4Config {
    block_count: usize,
    embedding_length: usize,
    per_layer_input_length: usize,
    head_count: usize,
    head_count_kv: usize,
    key_length: usize,
    key_length_swa: usize,
    value_length: usize,
    value_length_swa: usize,
    sliding_window: usize,
    sliding_window_pattern: Vec<bool>,
    feed_forward_lengths: Vec<usize>,
    shared_kv_layers: usize,
    rms_norm_eps: f64,
    rope_freq_base: f32,
    rope_freq_base_swa: f32,
    final_logit_softcapping: Option<f64>,
}

impl Gemma4Config {
    fn from_gguf(content: &Content) -> CandleResult<Self> {
        let get = |suffix: &str| {
            let key = format!("gemma4.{suffix}");
            content
                .metadata
                .get(&key)
                .ok_or_else(|| candle_core::Error::msg(format!("missing GGUF metadata {key}")))
        };

        let block_count = get("block_count")?.to_u32()? as usize;
        let embedding_length = get("embedding_length")?.to_u32()? as usize;
        let per_layer_input_length = get("embedding_length_per_layer_input")?.to_u32()? as usize;
        let head_count = get("attention.head_count")?.to_u32()? as usize;
        let head_count_kv = get("attention.head_count_kv")?.to_u32()? as usize;
        let key_length = get("attention.key_length")?.to_u32()? as usize;
        let key_length_swa = get("attention.key_length_swa")?.to_u32()? as usize;
        let value_length = get("attention.value_length")?.to_u32()? as usize;
        let value_length_swa = get("attention.value_length_swa")?.to_u32()? as usize;
        let sliding_window = get("attention.sliding_window")?.to_u32()? as usize;
        let sliding_window_pattern = values_to_bool_vec(get("attention.sliding_window_pattern")?)?;
        let feed_forward_lengths = values_to_usize_vec(get("feed_forward_length")?)?;
        let shared_kv_layers = get("attention.shared_kv_layers")
            .and_then(|value| Ok(value.to_u32()? as usize))
            .unwrap_or(0);
        let rms_norm_eps = get("attention.layer_norm_rms_epsilon")?.to_f32()? as f64;
        let rope_freq_base = get("rope.freq_base")
            .and_then(|value| value.to_f32())
            .unwrap_or(DEFAULT_ROPE_FREQUENCY);
        let rope_freq_base_swa = get("rope.freq_base_swa")
            .and_then(|value| value.to_f32())
            .unwrap_or(DEFAULT_ROPE_FREQUENCY_SLIDING);
        let final_logit_softcapping = get("final_logit_softcapping").and_then(value_to_f64).ok();

        if sliding_window_pattern.len() != block_count {
            candle_core::bail!(
                "gemma4.attention.sliding_window_pattern has {} entries, expected {block_count}",
                sliding_window_pattern.len()
            );
        }
        if feed_forward_lengths.len() != block_count {
            candle_core::bail!(
                "gemma4.feed_forward_length has {} entries, expected {block_count}",
                feed_forward_lengths.len()
            );
        }
        if key_length != value_length || key_length_swa != value_length_swa {
            candle_core::bail!("Gemma 4 backend currently expects equal key/value head dimensions");
        }

        Ok(Self {
            block_count,
            embedding_length,
            per_layer_input_length,
            head_count,
            head_count_kv,
            key_length,
            key_length_swa,
            value_length,
            value_length_swa,
            sliding_window,
            sliding_window_pattern,
            feed_forward_lengths,
            shared_kv_layers,
            rms_norm_eps,
            rope_freq_base,
            rope_freq_base_swa,
            final_logit_softcapping,
        })
    }

    fn layer_config(&self, layer_idx: usize) -> LayerConfig {
        let is_sliding = self.sliding_window_pattern[layer_idx];
        let head_dim = if is_sliding {
            self.key_length_swa
        } else {
            self.key_length
        };
        let value_dim = if is_sliding {
            self.value_length_swa
        } else {
            self.value_length
        };
        let rope_frequency = if is_sliding {
            self.rope_freq_base_swa
        } else {
            self.rope_freq_base
        };

        LayerConfig {
            is_sliding,
            head_dim,
            value_dim,
            q_dim: self.head_count * head_dim,
            kv_dim: self.head_count_kv * value_dim,
            feed_forward_length: self.feed_forward_lengths[layer_idx],
            sliding_window_size: is_sliding.then_some(self.sliding_window),
            rope_frequency,
            kv_share_source: self.kv_share_source(layer_idx),
        }
    }

    fn kv_share_source(&self, layer_idx: usize) -> Option<usize> {
        if self.shared_kv_layers == 0 || layer_idx < self.block_count - self.shared_kv_layers {
            return None;
        }

        let first_shared_layer_idx = self.block_count - self.shared_kv_layers;
        let current_is_sliding = self.sliding_window_pattern[layer_idx];
        self.sliding_window_pattern[..first_shared_layer_idx]
            .iter()
            .enumerate()
            .rev()
            .find_map(|(idx, is_sliding)| (*is_sliding == current_is_sliding).then_some(idx))
    }
}

#[derive(Debug, Clone, Copy)]
struct LayerConfig {
    is_sliding: bool,
    head_dim: usize,
    value_dim: usize,
    q_dim: usize,
    kv_dim: usize,
    feed_forward_length: usize,
    sliding_window_size: Option<usize>,
    rope_frequency: f32,
    kv_share_source: Option<usize>,
}

#[derive(Debug, Clone)]
struct QMatMul {
    inner: CandleQMatMul,
}

impl QMatMul {
    fn from_qtensor(qtensor: QTensor) -> CandleResult<Self> {
        Ok(Self {
            inner: CandleQMatMul::from_qtensor(qtensor)?,
        })
    }

    fn forward(&self, xs: &Tensor) -> CandleResult<Tensor> {
        self.inner.forward(xs)
    }
}

#[derive(Debug)]
struct QuantizedEmbeddingRows {
    weight: QTensor,
    vocab_size: usize,
    hidden_size: usize,
    row_size_in_bytes: usize,
    device: Device,
}

impl QuantizedEmbeddingRows {
    fn new(weight: QTensor, device: &Device) -> CandleResult<Self> {
        let (vocab_size, hidden_size) = weight.shape().dims2()?;
        let dtype = weight.dtype();
        let block_size = dtype.block_size();
        if hidden_size % block_size != 0 {
            candle_core::bail!(
                "embedding hidden size {hidden_size} is not divisible by GGML block size {block_size}"
            );
        }
        let row_size_in_bytes = hidden_size / block_size * dtype.type_size();
        Ok(Self {
            weight,
            vocab_size,
            hidden_size,
            row_size_in_bytes,
            device: device.clone(),
        })
    }

    fn forward(&self, input_ids: &Tensor) -> CandleResult<Tensor> {
        let input_shape = input_ids.shape().clone();
        let ids = input_ids.flatten_all()?.to_vec1::<u32>()?;
        let data = self.weight.data()?;
        let bytes = data.as_ref();
        let mut selected = Vec::with_capacity(ids.len() * self.row_size_in_bytes);

        for id in ids {
            let row = id as usize;
            if row >= self.vocab_size {
                candle_core::bail!(
                    "token id {row} is outside embedding vocab size {}",
                    self.vocab_size
                );
            }
            let start = row * self.row_size_in_bytes;
            let end = start + self.row_size_in_bytes;
            selected.extend_from_slice(&bytes[start..end]);
        }

        let rows = ggml_file::qtensor_from_ggml(
            self.weight.dtype(),
            selected.as_slice(),
            vec![input_shape.elem_count(), self.hidden_size],
            &self.device,
        )?;
        let rows = rows.dequantize(&self.device)?;
        let mut out_shape = input_shape.dims().to_vec();
        out_shape.push(self.hidden_size);
        rows.reshape(out_shape)
    }
}

#[derive(Debug, Clone)]
struct Mlp {
    feed_forward_gate: QMatMul,
    feed_forward_up: QMatMul,
    feed_forward_down: QMatMul,
}

impl Module for Mlp {
    fn forward(&self, xs: &Tensor) -> CandleResult<Tensor> {
        let gate = self.feed_forward_gate.forward(xs)?.gelu()?;
        let up = self.feed_forward_up.forward(xs)?;
        let gated = (gate * up)?;
        self.feed_forward_down.forward(&gated)
    }
}

#[derive(Debug, Clone)]
struct RotaryEmbedding {
    sin: Tensor,
    cos: Tensor,
}

impl RotaryEmbedding {
    fn new(
        head_dim: usize,
        rope_frequency: f32,
        max_seq_len: usize,
        device: &Device,
    ) -> CandleResult<Self> {
        let theta: Vec<_> = (0..head_dim)
            .step_by(2)
            .map(|i| 1f32 / rope_frequency.powf(i as f32 / head_dim as f32))
            .collect();
        let theta = Tensor::new(theta.as_slice(), device)?;
        let idx_theta = Tensor::arange(0, max_seq_len as u32, device)?
            .to_dtype(DType::F32)?
            .reshape((max_seq_len, 1))?
            .matmul(&theta.reshape((1, theta.elem_count()))?)?;
        let cos = idx_theta.cos()?;
        let sin = idx_theta.sin()?;
        Ok(Self { sin, cos })
    }

    fn apply_rotary_emb_qkv(
        &self,
        q: &Tensor,
        k: &Tensor,
        index_pos: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        let (_b_sz, _h, seq_len, _n_embd) = q.dims4()?;
        let cos = self.cos.narrow(0, index_pos, seq_len)?;
        let sin = self.sin.narrow(0, index_pos, seq_len)?;
        let q_embed = candle_nn::rotary_emb::rope(&q.contiguous()?, &cos, &sin)?;
        let k_embed = candle_nn::rotary_emb::rope(&k.contiguous()?, &cos, &sin)?;
        Ok((q_embed, k_embed))
    }

    fn apply_rotary_emb_q(&self, q: &Tensor, index_pos: usize) -> CandleResult<Tensor> {
        let (_b_sz, _h, seq_len, _n_embd) = q.dims4()?;
        let cos = self.cos.narrow(0, index_pos, seq_len)?;
        let sin = self.sin.narrow(0, index_pos, seq_len)?;
        candle_nn::rotary_emb::rope(&q.contiguous()?, &cos, &sin)
    }
}

#[derive(Debug, Clone)]
struct LayerWeights {
    attention_wq: QMatMul,
    attention_wk: QMatMul,
    attention_wv: QMatMul,
    attention_wo: QMatMul,
    attention_q_norm: RmsNorm,
    attention_k_norm: RmsNorm,
    attention_v_norm_weight: Tensor,
    rms_norm_eps: f64,
    attention_norm: RmsNorm,
    post_attention_norm: RmsNorm,
    ffn_norm: RmsNorm,
    post_ffn_norm: RmsNorm,
    post_per_layer_input_norm: RmsNorm,
    per_layer_input_gate: QMatMul,
    per_layer_projection: QMatMul,
    layer_output_scale: f64,
    mlp: Mlp,
    n_head: usize,
    n_kv_head: usize,
    head_dim: usize,
    q_dim: usize,
    sliding_window_size: Option<usize>,
    kv_share_source: Option<usize>,
    rotary_embedding: RotaryEmbedding,
    neg_inf: Tensor,
    kv_cache: Option<(Tensor, Tensor)>,
}

impl LayerWeights {
    fn mask(
        &self,
        b_sz: usize,
        seq_len: usize,
        key_len: usize,
        index_pos: usize,
        device: &Device,
    ) -> CandleResult<Tensor> {
        let mask: Vec<_> = (0..seq_len)
            .flat_map(|query_idx| {
                let query_pos = index_pos + query_idx;
                (0..key_len).map(move |key_pos| {
                    let future = key_pos > query_pos;
                    let outside_window = self
                        .sliding_window_size
                        .is_some_and(|window| key_pos + window < query_pos);
                    if future || outside_window {
                        0u32
                    } else {
                        1u32
                    }
                })
            })
            .collect();

        Tensor::from_slice(&mask, (seq_len, key_len), device)?.expand((b_sz, 1, seq_len, key_len))
    }

    fn forward_attn(
        &mut self,
        x: &Tensor,
        index_pos: usize,
        shared_kv_cache: Option<&(Tensor, Tensor)>,
    ) -> CandleResult<Tensor> {
        let (b_sz, seq_len, _) = x.dims3()?;

        let q = self.attention_wq.forward(x)?;
        let q = q
            .reshape((b_sz, seq_len, self.n_head, self.head_dim))?
            .transpose(1, 2)?;
        let q = self.attention_q_norm.forward(&q.contiguous()?)?;

        let (q, k, v) = if let Some((k_cache, v_cache)) = shared_kv_cache {
            let q = self.rotary_embedding.apply_rotary_emb_q(&q, index_pos)?;
            (q, k_cache.clone(), v_cache.clone())
        } else {
            let k = self.attention_wk.forward(x)?;
            let v = self.attention_wv.forward(x)?;
            let k = k
                .reshape((b_sz, seq_len, self.n_kv_head, self.head_dim))?
                .transpose(1, 2)?;
            let v = v
                .reshape((b_sz, seq_len, self.n_kv_head, self.head_dim))?
                .transpose(1, 2)?;
            let k = self.attention_k_norm.forward(&k.contiguous()?)?;
            let v = rms_norm_no_weight(
                &v.contiguous()?,
                &self.attention_v_norm_weight,
                self.rms_norm_eps,
            )?;
            let (q, k) = self
                .rotary_embedding
                .apply_rotary_emb_qkv(&q, &k, index_pos)?;

            let (k, v) = match &self.kv_cache {
                None => (k, v),
                Some((k_cache, v_cache)) => {
                    if index_pos == 0 {
                        (k, v)
                    } else {
                        let k = Tensor::cat(&[k_cache, &k], 2)?;
                        let v = Tensor::cat(&[v_cache, &v], 2)?;
                        (k, v)
                    }
                }
            };
            self.kv_cache = Some((k.clone(), v.clone()));
            (q, k, v)
        };

        let key_len = k.dim(2)?;
        let mask = if seq_len == 1 && self.sliding_window_size.is_none() {
            None
        } else {
            Some(self.mask(b_sz, seq_len, key_len, index_pos, x.device())?)
        };

        let k = repeat_kv(k, self.n_head / self.n_kv_head)?;
        let v = repeat_kv(v, self.n_head / self.n_kv_head)?;

        let mut attn_weights = q.matmul(&k.transpose(2, 3)?)?;

        if let Some(mask) = mask {
            let mask = mask.broadcast_as(attn_weights.shape())?;
            let neg_inf = self.neg_inf.broadcast_as(attn_weights.dims())?;
            attn_weights = mask.eq(0u32)?.where_cond(&neg_inf, &attn_weights)?;
        }

        let attn_weights = candle_nn::ops::softmax_last_dim(&attn_weights)?;
        let attn_output = attn_weights.matmul(&v)?;
        let attn_output = attn_output
            .transpose(1, 2)?
            .reshape((b_sz, seq_len, self.q_dim))?;

        self.attention_wo.forward(&attn_output)
    }
}

#[derive(Debug)]
struct Gemma4Model {
    config: Gemma4Config,
    tok_embeddings: QuantizedEmbeddingRows,
    per_layer_embeddings: QuantizedEmbeddingRows,
    per_layer_model_projection: QMatMul,
    per_layer_projection_norm: RmsNorm,
    layers: Vec<LayerWeights>,
    norm: RmsNorm,
    output: QMatMul,
    device: Device,
}

impl Gemma4Model {
    fn from_gguf<R: std::io::Seek + std::io::Read>(
        content: Content,
        reader: &mut R,
        device: &Device,
        max_seq_len: usize,
    ) -> CandleResult<Self> {
        let config = Gemma4Config::from_gguf(&content)?;
        let neg_inf = Tensor::new(f32::NEG_INFINITY, device)?;

        let tok_embeddings = QuantizedEmbeddingRows::new(
            content.tensor(reader, "token_embd.weight", device)?,
            device,
        )?;
        let per_layer_embeddings = QuantizedEmbeddingRows::new(
            content.tensor(reader, "per_layer_token_embd.weight", device)?,
            device,
        )?;
        let per_layer_model_projection = QMatMul::from_qtensor(content.tensor(
            reader,
            "per_layer_model_proj.weight",
            device,
        )?)?;
        let per_layer_projection_norm = RmsNorm::from_qtensor(
            content.tensor(reader, "per_layer_proj_norm.weight", device)?,
            config.rms_norm_eps,
        )?;
        let norm = RmsNorm::from_qtensor(
            content.tensor(reader, "output_norm.weight", device)?,
            config.rms_norm_eps,
        )?;
        let output = match content.tensor(reader, "output.weight", device) {
            Ok(tensor) => tensor,
            Err(_) => content.tensor(reader, "token_embd.weight", device)?,
        };

        let mut layers = Vec::with_capacity(config.block_count);
        for layer_idx in 0..config.block_count {
            let prefix = format!("blk.{layer_idx}");
            let layer_config = config.layer_config(layer_idx);
            let _ = (
                layer_config.is_sliding,
                layer_config.value_dim,
                layer_config.kv_dim,
                layer_config.feed_forward_length,
            );

            let attention_wq =
                content.tensor(reader, &format!("{prefix}.attn_q.weight"), device)?;
            let attention_wk =
                content.tensor(reader, &format!("{prefix}.attn_k.weight"), device)?;
            let attention_wv =
                content.tensor(reader, &format!("{prefix}.attn_v.weight"), device)?;
            let attention_wo =
                content.tensor(reader, &format!("{prefix}.attn_output.weight"), device)?;

            let attention_q_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.attn_q_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;
            let attention_k_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.attn_k_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;
            let attention_v_norm_weight = Tensor::ones(layer_config.head_dim, DType::F32, device)?;

            let attention_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.attn_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;
            let post_attention_norm = RmsNorm::from_qtensor(
                content.tensor(
                    reader,
                    &format!("{prefix}.post_attention_norm.weight"),
                    device,
                )?,
                config.rms_norm_eps,
            )?;
            let ffn_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.ffn_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;
            let post_ffn_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.post_ffw_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;
            let post_per_layer_input_norm = RmsNorm::from_qtensor(
                content.tensor(reader, &format!("{prefix}.post_norm.weight"), device)?,
                config.rms_norm_eps,
            )?;

            let mlp = Mlp {
                feed_forward_gate: QMatMul::from_qtensor(content.tensor(
                    reader,
                    &format!("{prefix}.ffn_gate.weight"),
                    device,
                )?)?,
                feed_forward_up: QMatMul::from_qtensor(content.tensor(
                    reader,
                    &format!("{prefix}.ffn_up.weight"),
                    device,
                )?)?,
                feed_forward_down: QMatMul::from_qtensor(content.tensor(
                    reader,
                    &format!("{prefix}.ffn_down.weight"),
                    device,
                )?)?,
            };
            let layer_output_scale = content
                .tensor(
                    reader,
                    &format!("{prefix}.layer_output_scale.weight"),
                    device,
                )?
                .dequantize(device)?
                .flatten_all()?
                .to_vec1::<f32>()?
                .first()
                .copied()
                .ok_or_else(|| candle_core::Error::msg("empty layer_output_scale tensor"))?
                as f64;

            layers.push(LayerWeights {
                attention_wq: QMatMul::from_qtensor(attention_wq)?,
                attention_wk: QMatMul::from_qtensor(attention_wk)?,
                attention_wv: QMatMul::from_qtensor(attention_wv)?,
                attention_wo: QMatMul::from_qtensor(attention_wo)?,
                attention_q_norm,
                attention_k_norm,
                attention_v_norm_weight,
                rms_norm_eps: config.rms_norm_eps,
                attention_norm,
                post_attention_norm,
                ffn_norm,
                post_ffn_norm,
                post_per_layer_input_norm,
                per_layer_input_gate: QMatMul::from_qtensor(content.tensor(
                    reader,
                    &format!("{prefix}.inp_gate.weight"),
                    device,
                )?)?,
                per_layer_projection: QMatMul::from_qtensor(content.tensor(
                    reader,
                    &format!("{prefix}.proj.weight"),
                    device,
                )?)?,
                layer_output_scale,
                mlp,
                n_head: config.head_count,
                n_kv_head: config.head_count_kv,
                head_dim: layer_config.head_dim,
                q_dim: layer_config.q_dim,
                sliding_window_size: layer_config.sliding_window_size,
                kv_share_source: layer_config.kv_share_source,
                rotary_embedding: RotaryEmbedding::new(
                    layer_config.head_dim,
                    layer_config.rope_frequency,
                    max_seq_len,
                    device,
                )?,
                neg_inf: neg_inf.clone(),
                kv_cache: None,
            });
        }

        Ok(Self {
            config,
            tok_embeddings,
            per_layer_embeddings,
            per_layer_model_projection,
            per_layer_projection_norm,
            layers,
            norm,
            output: QMatMul::from_qtensor(output)?,
            device: device.clone(),
        })
    }

    fn device(&self) -> &Device {
        &self.device
    }

    fn clear_kv_cache(&mut self) {
        for layer in self.layers.iter_mut() {
            layer.kv_cache = None;
        }
    }

    fn forward(&mut self, input_ids: &Tensor, index_pos: usize) -> CandleResult<Tensor> {
        let (_b_sz, seq_len) = input_ids.dims2()?;
        let mut hidden_states = self.tok_embeddings.forward(input_ids)?;
        hidden_states = (hidden_states * (self.config.embedding_length as f64).sqrt())?;

        let per_layer_inputs = self.prepare_per_layer_inputs(input_ids, &hidden_states)?;

        for layer_idx in 0..self.layers.len() {
            let shared_kv_cache = self.layers[layer_idx].kv_share_source.and_then(|source| {
                self.layers
                    .get(source)
                    .and_then(|layer| layer.kv_cache.clone())
            });

            let layer_per_input = per_layer_inputs.i((.., .., layer_idx, ..))?;
            let layer = &mut self.layers[layer_idx];
            let residual = &hidden_states;
            let x = layer.attention_norm.forward(&hidden_states)?;
            let x = layer.forward_attn(&x, index_pos, shared_kv_cache.as_ref())?;
            let x = layer.post_attention_norm.forward(&x)?;
            let x = (x + residual)?;

            let residual = &x;
            let x = layer.ffn_norm.forward(&x)?;
            let x = layer.mlp.forward(&x)?;
            let x = layer.post_ffn_norm.forward(&x)?;
            let mut x = (x + residual)?;

            let gate = layer.per_layer_input_gate.forward(&x)?.gelu()?;
            let gated_per_layer = (gate * layer_per_input)?;
            let per_layer_contribution = layer.per_layer_projection.forward(&gated_per_layer)?;
            let per_layer_contribution = layer
                .post_per_layer_input_norm
                .forward(&per_layer_contribution)?;
            x = (x + per_layer_contribution)?;
            x = (x * layer.layer_output_scale)?;
            hidden_states = x;
        }

        let x = hidden_states.i((.., seq_len - 1, ..))?;
        let x = self.norm.forward(&x)?;
        let mut logits = self.output.forward(&x)?;
        if let Some(softcap) = self.config.final_logit_softcapping {
            logits = ((logits / softcap)?.tanh()? * softcap)?;
        }

        Ok(logits)
    }

    fn prepare_per_layer_inputs(
        &self,
        input_ids: &Tensor,
        hidden_states: &Tensor,
    ) -> CandleResult<Tensor> {
        let per_layer_embeds = self.per_layer_embeddings.forward(input_ids)?;
        let per_layer_embeds =
            (per_layer_embeds * (self.config.per_layer_input_length as f64).sqrt())?;

        let per_layer_projection = self.per_layer_model_projection.forward(hidden_states)?;
        let per_layer_projection =
            (per_layer_projection * (self.config.embedding_length as f64).powf(-0.5))?;

        let mut shape = hidden_states.dims().to_vec();
        shape.pop();
        shape.push(self.config.block_count);
        shape.push(self.config.per_layer_input_length);
        let per_layer_projection = per_layer_projection.reshape(shape.as_slice())?;
        let per_layer_projection = self
            .per_layer_projection_norm
            .forward(&per_layer_projection)?;
        let per_layer_embeds = per_layer_embeds.reshape(shape.as_slice())?;

        (per_layer_projection + per_layer_embeds)? * std::f64::consts::FRAC_1_SQRT_2
    }
}

fn rms_norm_no_weight(x: &Tensor, weight: &Tensor, eps: f64) -> CandleResult<Tensor> {
    candle_nn::ops::rms_norm(x, weight, eps as f32)
}

fn build_prompt(request: &LocalAiGenerateRequest) -> String {
    let mut system = String::from(
        "You are Memoji's local note assistant. Answer concisely in Korean unless the user asks otherwise. Do not use tools or hidden reasoning.",
    );

    if let Some(context) = request
        .page_context
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        system.push_str("\n\nCurrent note context:\n");
        system.push_str(context.trim());
    }

    format!(
        "<bos><|turn>system\n{}<turn|>\n<|turn>user\n{}<turn|>\n<|turn>model\n",
        system,
        request.prompt.trim()
    )
}

fn metadata_string(content: &Content, key: &str) -> Option<String> {
    content
        .metadata
        .get(key)
        .and_then(|value| value.to_string().ok())
        .cloned()
}

fn metadata_u32(content: &Content, key: &str) -> Option<u32> {
    content
        .metadata
        .get(key)
        .and_then(|value| value.to_u32().ok())
}

fn metadata_u64(content: &Content, key: &str) -> Option<u64> {
    content
        .metadata
        .get(key)
        .and_then(|value| value_to_u64(value).ok())
}

fn value_to_u64(value: &Value) -> candle_core::Result<u64> {
    match value {
        Value::U8(value) => Ok(*value as u64),
        Value::U16(value) => Ok(*value as u64),
        Value::U32(value) => Ok(*value as u64),
        Value::U64(value) => Ok(*value),
        Value::I8(value) if *value >= 0 => Ok(*value as u64),
        Value::I16(value) if *value >= 0 => Ok(*value as u64),
        Value::I32(value) if *value >= 0 => Ok(*value as u64),
        Value::I64(value) if *value >= 0 => Ok(*value as u64),
        _ => candle_core::bail!("metadata value cannot be read as u64"),
    }
}

fn value_to_f64(value: &Value) -> candle_core::Result<f64> {
    match value {
        Value::F32(value) => Ok(*value as f64),
        Value::F64(value) => Ok(*value),
        Value::U32(value) => Ok(*value as f64),
        Value::U64(value) => Ok(*value as f64),
        _ => candle_core::bail!("metadata value cannot be read as f64"),
    }
}

fn values_to_bool_vec(value: &Value) -> candle_core::Result<Vec<bool>> {
    value
        .to_vec()?
        .iter()
        .map(|value| value.to_bool())
        .collect()
}

fn values_to_usize_vec(value: &Value) -> candle_core::Result<Vec<usize>> {
    value
        .to_vec()?
        .iter()
        .map(|value| Ok(value_to_u64(value)? as usize))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::quantized::GgmlDType;
    use std::collections::HashMap;

    fn sample_content() -> Content {
        let mut metadata = HashMap::new();
        metadata.insert("gemma4.block_count".to_string(), Value::U32(35));
        metadata.insert("gemma4.embedding_length".to_string(), Value::U32(1536));
        metadata.insert(
            "gemma4.embedding_length_per_layer_input".to_string(),
            Value::U32(256),
        );
        metadata.insert("gemma4.attention.head_count".to_string(), Value::U32(8));
        metadata.insert("gemma4.attention.head_count_kv".to_string(), Value::U32(1));
        metadata.insert("gemma4.attention.key_length".to_string(), Value::U32(512));
        metadata.insert(
            "gemma4.attention.key_length_swa".to_string(),
            Value::U32(256),
        );
        metadata.insert("gemma4.attention.value_length".to_string(), Value::U32(512));
        metadata.insert(
            "gemma4.attention.value_length_swa".to_string(),
            Value::U32(256),
        );
        metadata.insert(
            "gemma4.attention.layer_norm_rms_epsilon".to_string(),
            Value::F32(1e-6),
        );
        metadata.insert(
            "gemma4.attention.shared_kv_layers".to_string(),
            Value::U32(20),
        );
        metadata.insert(
            "gemma4.attention.sliding_window".to_string(),
            Value::U32(512),
        );
        metadata.insert(
            "gemma4.attention.sliding_window_pattern".to_string(),
            Value::Array(
                [
                    true, true, true, true, false, true, true, true, true, false, true, true, true,
                    true, false, true, true, true, true, false, true, true, true, true, false,
                    true, true, true, true, false, true, true, true, true, false,
                ]
                .iter()
                .copied()
                .map(Value::Bool)
                .collect(),
            ),
        );
        metadata.insert(
            "gemma4.feed_forward_length".to_string(),
            Value::Array(
                (0..35)
                    .map(|idx| Value::U32(if idx < 15 { 6144 } else { 12288 }))
                    .collect(),
            ),
        );
        metadata.insert("gemma4.rope.freq_base".to_string(), Value::F32(1_000_000.));
        metadata.insert("gemma4.rope.freq_base_swa".to_string(), Value::F32(10_000.));
        metadata.insert(
            "gemma4.final_logit_softcapping".to_string(),
            Value::F32(30.),
        );

        Content {
            magic: candle_core::quantized::gguf_file::VersionedMagic::GgufV3,
            metadata,
            tensor_infos: HashMap::new(),
            tensor_data_offset: 0,
        }
    }

    #[test]
    fn parses_gemma4_e2b_layer_metadata() {
        let content = sample_content();
        let config = Gemma4Config::from_gguf(&content).expect("config should parse");

        assert_eq!(config.block_count, 35);
        assert_eq!(config.embedding_length, 1536);
        assert_eq!(config.per_layer_input_length, 256);

        let layer0 = config.layer_config(0);
        assert!(layer0.is_sliding);
        assert_eq!(layer0.head_dim, 256);
        assert_eq!(layer0.q_dim, 2048);
        assert_eq!(layer0.feed_forward_length, 6144);
        assert_eq!(layer0.rope_frequency, 10_000.);
        assert_eq!(layer0.kv_share_source, None);

        let layer4 = config.layer_config(4);
        assert!(!layer4.is_sliding);
        assert_eq!(layer4.head_dim, 512);
        assert_eq!(layer4.q_dim, 4096);
        assert_eq!(layer4.rope_frequency, 1_000_000.);

        let layer15 = config.layer_config(15);
        assert!(layer15.is_sliding);
        assert_eq!(layer15.feed_forward_length, 12288);
        assert_eq!(layer15.kv_share_source, Some(13));

        let layer19 = config.layer_config(19);
        assert!(!layer19.is_sliding);
        assert_eq!(layer19.kv_share_source, Some(14));
    }

    #[test]
    fn gathers_quantized_embedding_rows_without_dequantizing_full_table() {
        let device = Device::Cpu;
        let mut values = Vec::new();
        for row in 0..3 {
            for col in 0..32 {
                values.push((row * 100 + col) as f32);
            }
        }
        let source =
            Tensor::from_slice(values.as_slice(), (3, 32), &device).expect("source tensor");
        let qtensor = QTensor::quantize(&source, GgmlDType::Q8_0).expect("quantized tensor");
        let expected = qtensor
            .dequantize(&device)
            .expect("dequantized source")
            .i((.., ..))
            .expect("expected rows");
        let expected_values = expected.flatten_all().unwrap().to_vec1::<f32>().unwrap();
        let embedding = QuantizedEmbeddingRows::new(qtensor, &device).expect("embedding");
        let input_ids = Tensor::from_slice(&[2u32, 0u32], (1, 2), &device).expect("ids");

        let rows = embedding.forward(&input_ids).expect("rows");
        assert_eq!(rows.dims(), &[1, 2, 32]);
        let values = rows.flatten_all().unwrap().to_vec1::<f32>().unwrap();
        assert!((values[0] - expected_values[64]).abs() < 1e-4);
        assert!((values[31] - expected_values[95]).abs() < 1e-4);
        assert!((values[32] - expected_values[0]).abs() < 1e-4);
        assert!((values[63] - expected_values[31]).abs() < 1e-4);
    }

    #[test]
    #[ignore = "requires downloaded Gemma 4 GGUF and tokenizer resources"]
    fn local_downloaded_gemma4_model_loads_and_generates_one_token() {
        let models_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("models");
        let config = LocalAiConfig {
            model_path: models_dir.join("gemma-4-e2b-it-q4.gguf"),
            tokenizer_path: models_dir.join("tokenizer.json"),
            context_size: 512,
        };

        assert!(
            config.model_path.exists(),
            "missing model: {}",
            config.model_path.display()
        );
        assert!(
            config.tokenizer_path.exists(),
            "missing tokenizer: {}",
            config.tokenizer_path.display()
        );

        let mut runtime = Gemma4Runtime::load(&config).expect("Gemma 4 model should load");
        let response = runtime
            .generate(
                LocalAiGenerateRequest {
                    prompt: "한 문장으로 인사해줘.".to_string(),
                    page_context: None,
                    max_new_tokens: Some(1),
                    temperature: Some(0.0),
                    top_p: Some(1.0),
                },
                SamplingConfig {
                    max_new_tokens: 1,
                    temperature: 0.0,
                    top_p: 1.0,
                },
            )
            .expect("Gemma 4 should generate locally");

        assert!(response.prompt_tokens > 0);
        assert!(response.generated_tokens <= 1);
    }
}
