mod gemma4;
mod mtp_client;
mod sampler;
mod tokenizer;

use gemma4::Gemma4Runtime;
pub use mtp_client::{
    generate_mtp_stream, probe_mtp_endpoint, LocalAiRuntimeKind, MtpConfig, DEFAULT_MTP_MODEL,
};
use sampler::SamplingConfig;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fmt,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Instant,
};

const DEFAULT_CONTEXT_SIZE: usize = 2048;
const MIN_CONTEXT_SIZE: usize = 512;
const MAX_CONTEXT_SIZE: usize = 4096;
const DEFAULT_MODEL_FILE: &str = "gemma-4-e2b-it-q4.gguf";
const DEFAULT_TOKENIZER_FILE: &str = "tokenizer.json";

#[derive(Debug, Clone)]
pub struct LocalAiConfig {
    pub model_path: PathBuf,
    pub tokenizer_path: PathBuf,
    pub context_size: usize,
}

impl LocalAiConfig {
    pub fn from_resource_dir(resource_dir: PathBuf) -> Self {
        let models_dir = resolve_models_dir(resource_dir);
        let model_path = std::env::var("MEMOJI_GEMMA_GGUF")
            .map(PathBuf::from)
            .unwrap_or_else(|_| models_dir.join(DEFAULT_MODEL_FILE));

        let tokenizer_path = std::env::var("MEMOJI_GEMMA_TOKENIZER")
            .map(PathBuf::from)
            .unwrap_or_else(|_| models_dir.join(DEFAULT_TOKENIZER_FILE));

        let context_size = std::env::var("MEMOJI_LOCAL_AI_CONTEXT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .map(clamp_context_size)
            .unwrap_or(DEFAULT_CONTEXT_SIZE);

        Self {
            model_path,
            tokenizer_path,
            context_size,
        }
    }
}

fn resolve_models_dir(resource_dir: PathBuf) -> PathBuf {
    let bundled_models_dir = resource_dir.join("models");
    if bundled_models_dir.exists() {
        return bundled_models_dir;
    }

    let cwd = match std::env::current_dir() {
        Ok(cwd) => cwd,
        Err(_) => return bundled_models_dir,
    };

    for candidate in [
        cwd.join("resources").join("models"),
        cwd.join("src-tauri").join("resources").join("models"),
    ] {
        if candidate.exists() {
            return candidate;
        }
    }

    bundled_models_dir
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalAiLoadState {
    MissingModel,
    MissingTokenizer,
    NotLoaded,
    Loading,
    Loaded,
    Unsupported,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiStatus {
    pub state: LocalAiLoadState,
    pub model_path: String,
    pub tokenizer_path: String,
    pub mtp_configured: bool,
    pub mtp_endpoint: Option<String>,
    pub mtp_model: Option<String>,
    pub mtp_draft_model: Option<String>,
    pub mtp_runtime_kind: Option<LocalAiRuntimeKind>,
    pub mtp_reachable: Option<bool>,
    pub mtp_probe_error: Option<String>,
    pub model_exists: bool,
    pub tokenizer_exists: bool,
    pub context_size: usize,
    pub model_info: Option<LocalAiModelInfo>,
    pub last_error: Option<String>,
    pub cpu_features: BTreeMap<String, bool>,
    pub compiled_features: BTreeMap<String, bool>,
    pub avx512_runtime_ready: bool,
    pub avx512_build: bool,
    pub runtime_info: LocalAiRuntimeInfo,
    pub model_file_size_bytes: Option<u64>,
    pub tokenizer_file_size_bytes: Option<u64>,
    pub last_load_ms: Option<u128>,
    pub last_generation: Option<LocalAiGenerationStats>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiModelInfo {
    pub architecture: String,
    pub name: Option<String>,
    pub quantization_version: Option<u64>,
    pub file_type: Option<u64>,
    pub tensor_count: usize,
    pub metadata_count: usize,
    pub tokenizer_vocab_size: Option<usize>,
    pub context_size: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiGenerateRequest {
    pub prompt: String,
    pub page_context: Option<String>,
    pub max_new_tokens: Option<usize>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiGenerateResponse {
    pub text: String,
    pub prompt_tokens: usize,
    pub generated_tokens: usize,
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiRuntimeInfo {
    pub os: String,
    pub arch: String,
    pub available_parallelism: usize,
    pub build_profile: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiGenerationStats {
    pub elapsed_ms: u128,
    pub prompt_tokens: usize,
    pub generated_tokens: usize,
    pub tokens_per_second: f64,
    pub max_new_tokens: usize,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiBenchmarkResult {
    pub status: LocalAiStatus,
    pub load_ms: Option<u128>,
    pub cached_model: bool,
    pub generate_ms: u128,
    pub prompt_tokens: usize,
    pub generated_tokens: usize,
    pub tokens_per_second: f64,
    pub speed_label: String,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiGenerateStreamChunk {
    pub request_id: String,
    pub token_text: String,
    pub generated_tokens: usize,
    pub done: bool,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalAiError {
    ModelMissing {
        path: PathBuf,
    },
    TokenizerMissing {
        path: PathBuf,
    },
    ModelNotLoaded,
    UnsupportedArchitecture {
        architecture: String,
        message: String,
    },
    LoadFailed(String),
    GenerateFailed(String),
}

impl fmt::Display for LocalAiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ModelMissing { path } => {
                write!(
                    f,
                    "Local Gemma GGUF model file was not found: {}",
                    path.display()
                )
            }
            Self::TokenizerMissing { path } => {
                write!(
                    f,
                    "Local tokenizer.json file was not found: {}",
                    path.display()
                )
            }
            Self::ModelNotLoaded => write!(f, "Local Gemma model is not loaded"),
            Self::UnsupportedArchitecture {
                architecture,
                message,
            } => write!(
                f,
                "Unsupported GGUF architecture '{architecture}': {message}"
            ),
            Self::LoadFailed(message) => write!(f, "Failed to load local Gemma model: {message}"),
            Self::GenerateFailed(message) => {
                write!(f, "Failed to generate with local Gemma model: {message}")
            }
        }
    }
}

impl std::error::Error for LocalAiError {}

#[derive(Debug)]
struct LocalAiInner {
    runtime: Option<Gemma4Runtime>,
    load_state: LocalAiLoadState,
    model_info: Option<LocalAiModelInfo>,
    last_error: Option<String>,
    last_load_ms: Option<u128>,
    last_generation: Option<LocalAiGenerationStats>,
}

#[derive(Debug, Clone)]
pub struct LocalAiState {
    config: LocalAiConfig,
    inner: Arc<Mutex<LocalAiInner>>,
}

impl LocalAiState {
    pub fn new(config: LocalAiConfig) -> Self {
        Self {
            config,
            inner: Arc::new(Mutex::new(LocalAiInner {
                runtime: None,
                load_state: LocalAiLoadState::NotLoaded,
                model_info: None,
                last_error: None,
                last_load_ms: None,
                last_generation: None,
            })),
        }
    }

    pub fn status(&self) -> LocalAiStatus {
        let inner = self.inner.lock().expect("local ai state poisoned");
        self.status_from_inner(&inner, MtpConfig::from_env())
    }

    pub fn status_with_mtp_config(&self, mtp_config: Option<MtpConfig>) -> LocalAiStatus {
        let inner = self.inner.lock().expect("local ai state poisoned");
        self.status_from_inner(&inner, mtp_config)
    }

    pub fn load(&self) -> Result<LocalAiStatus, LocalAiError> {
        {
            let inner = self.inner.lock().expect("local ai state poisoned");
            if inner.runtime.is_some() && inner.load_state == LocalAiLoadState::Loaded {
                return Ok(self.status_from_inner(&inner, MtpConfig::from_env()));
            }
            if inner.load_state == LocalAiLoadState::Loading {
                return Err(LocalAiError::LoadFailed(
                    "another model load is already in progress".to_string(),
                ));
            }
        }

        self.validate_resource_paths()?;

        {
            let mut inner = self.inner.lock().expect("local ai state poisoned");
            if inner.runtime.is_some() && inner.load_state == LocalAiLoadState::Loaded {
                return Ok(self.status_from_inner(&inner, MtpConfig::from_env()));
            }
            if inner.load_state == LocalAiLoadState::Loading {
                return Err(LocalAiError::LoadFailed(
                    "another model load is already in progress".to_string(),
                ));
            }
            inner.load_state = LocalAiLoadState::Loading;
            inner.last_error = None;
        }

        let load_started = Instant::now();
        let load_result = Gemma4Runtime::load(&self.config);
        let load_ms = load_started.elapsed().as_millis();
        let mut inner = self.inner.lock().expect("local ai state poisoned");

        match load_result {
            Ok(runtime) => {
                inner.model_info = Some(runtime.model_info().clone());
                inner.load_state = if runtime.supports_generation() {
                    LocalAiLoadState::Loaded
                } else {
                    LocalAiLoadState::Unsupported
                };
                inner.runtime = Some(runtime);
                inner.last_load_ms = Some(load_ms);
                Ok(self.status_from_inner(&inner, MtpConfig::from_env()))
            }
            Err(error) => {
                inner.load_state = match &error {
                    LocalAiError::UnsupportedArchitecture { .. } => LocalAiLoadState::Unsupported,
                    _ => LocalAiLoadState::Error,
                };
                inner.runtime = None;
                inner.last_error = Some(error.to_string());
                inner.last_load_ms = Some(load_ms);
                Err(error)
            }
        }
    }

    pub fn generate(
        &self,
        request: LocalAiGenerateRequest,
    ) -> Result<LocalAiGenerateResponse, LocalAiError> {
        let sampling = SamplingConfig::from_request(&request);
        let mut inner = self.inner.lock().expect("local ai state poisoned");
        let runtime = inner.runtime.as_mut().ok_or(LocalAiError::ModelNotLoaded)?;

        if !runtime.supports_generation() {
            return Err(runtime.unsupported_error());
        }

        let max_new_tokens = sampling.max_new_tokens;
        let started = Instant::now();
        let response = runtime.generate(request, sampling)?;
        inner.last_generation = Some(generation_stats(
            &response,
            max_new_tokens,
            started.elapsed().as_millis(),
            "local",
        ));

        Ok(response)
    }

    pub fn generate_with_callback<F>(
        &self,
        request: LocalAiGenerateRequest,
        on_token: F,
    ) -> Result<LocalAiGenerateResponse, LocalAiError>
    where
        F: FnMut(String, usize) -> Result<(), LocalAiError>,
    {
        let sampling = SamplingConfig::from_request(&request);
        let mut inner = self.inner.lock().expect("local ai state poisoned");
        let runtime = inner.runtime.as_mut().ok_or(LocalAiError::ModelNotLoaded)?;

        if !runtime.supports_generation() {
            return Err(runtime.unsupported_error());
        }

        let max_new_tokens = sampling.max_new_tokens;
        let started = Instant::now();
        let response = runtime.generate_with_callback(request, sampling, on_token)?;
        inner.last_generation = Some(generation_stats(
            &response,
            max_new_tokens,
            started.elapsed().as_millis(),
            "local_stream",
        ));

        Ok(response)
    }

    pub fn benchmark(&self) -> Result<LocalAiBenchmarkResult, LocalAiError> {
        let was_loaded = {
            let inner = self.inner.lock().expect("local ai state poisoned");
            inner.runtime.is_some() && inner.load_state == LocalAiLoadState::Loaded
        };

        let load_started = Instant::now();
        let status_after_load = self.load()?;
        let load_ms = if was_loaded {
            None
        } else {
            Some(load_started.elapsed().as_millis())
        };

        if status_after_load.state != LocalAiLoadState::Loaded {
            return Err(LocalAiError::GenerateFailed(
                "Local AI model is not ready for benchmark".to_string(),
            ));
        }

        let request = LocalAiGenerateRequest {
            prompt: "한국어로 아주 짧게 인사하고 오늘 메모를 도와주겠다고 말해줘.".to_string(),
            page_context: None,
            max_new_tokens: Some(16),
            temperature: Some(0.0),
            top_p: Some(1.0),
        };
        let generate_started = Instant::now();
        let response = self.generate(request)?;
        let generate_ms = generate_started.elapsed().as_millis();
        let tokens_per_second = tokens_per_second(response.generated_tokens, generate_ms);

        Ok(LocalAiBenchmarkResult {
            status: self.status(),
            load_ms,
            cached_model: was_loaded,
            generate_ms,
            prompt_tokens: response.prompt_tokens,
            generated_tokens: response.generated_tokens,
            tokens_per_second,
            speed_label: speed_label(tokens_per_second).to_string(),
            recommendation: speed_recommendation(tokens_per_second).to_string(),
        })
    }

    fn validate_resource_paths(&self) -> Result<(), LocalAiError> {
        if !self.config.model_path.exists() {
            return Err(LocalAiError::ModelMissing {
                path: self.config.model_path.clone(),
            });
        }

        if !self.config.tokenizer_path.exists() {
            return Err(LocalAiError::TokenizerMissing {
                path: self.config.tokenizer_path.clone(),
            });
        }

        Ok(())
    }

    fn status_from_inner(
        &self,
        inner: &LocalAiInner,
        mtp_config: Option<MtpConfig>,
    ) -> LocalAiStatus {
        let model_exists = self.config.model_path.exists();
        let tokenizer_exists = self.config.tokenizer_path.exists();
        let state = if !model_exists {
            LocalAiLoadState::MissingModel
        } else if !tokenizer_exists {
            LocalAiLoadState::MissingTokenizer
        } else {
            inner.load_state.clone()
        };
        let cpu_features = runtime_cpu_features();
        let compiled_features = compiled_cpu_features();
        LocalAiStatus {
            state,
            model_path: self.config.model_path.to_string_lossy().into_owned(),
            tokenizer_path: self.config.tokenizer_path.to_string_lossy().into_owned(),
            mtp_configured: mtp_config.is_some(),
            mtp_endpoint: mtp_config.as_ref().map(|config| config.endpoint.clone()),
            mtp_model: mtp_config.as_ref().map(|config| config.model.clone()),
            mtp_draft_model: mtp_config
                .as_ref()
                .and_then(|config| config.draft_model.clone()),
            mtp_runtime_kind: mtp_config.map(|config| config.runtime_kind),
            mtp_reachable: None,
            mtp_probe_error: None,
            model_exists,
            tokenizer_exists,
            context_size: self.config.context_size,
            model_info: inner.model_info.clone(),
            last_error: inner.last_error.clone(),
            avx512_runtime_ready: avx512_ready(&cpu_features),
            avx512_build: avx512_ready(&compiled_features),
            cpu_features,
            compiled_features,
            runtime_info: runtime_info(),
            model_file_size_bytes: file_size(&self.config.model_path),
            tokenizer_file_size_bytes: file_size(&self.config.tokenizer_path),
            last_load_ms: inner.last_load_ms,
            last_generation: inner.last_generation.clone(),
        }
    }
}

pub fn clamp_context_size(requested: usize) -> usize {
    requested.clamp(MIN_CONTEXT_SIZE, MAX_CONTEXT_SIZE)
}

fn avx512_ready(features: &BTreeMap<String, bool>) -> bool {
    features.get("avx512f") == Some(&true)
        && features.get("avx512bw") == Some(&true)
        && features.get("avx512vl") == Some(&true)
}

fn runtime_cpu_features() -> BTreeMap<String, bool> {
    let mut features = BTreeMap::new();

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        features.insert("avx2".to_string(), std::is_x86_feature_detected!("avx2"));
        features.insert(
            "avx512bw".to_string(),
            std::is_x86_feature_detected!("avx512bw"),
        );
        features.insert(
            "avx512f".to_string(),
            std::is_x86_feature_detected!("avx512f"),
        );
        features.insert(
            "avx512vl".to_string(),
            std::is_x86_feature_detected!("avx512vl"),
        );
        features.insert("f16c".to_string(), std::is_x86_feature_detected!("f16c"));
        features.insert("fma".to_string(), std::is_x86_feature_detected!("fma"));
    }

    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        features.insert("avx2".to_string(), false);
        features.insert("avx512bw".to_string(), false);
        features.insert("avx512f".to_string(), false);
        features.insert("avx512vl".to_string(), false);
        features.insert("f16c".to_string(), false);
        features.insert("fma".to_string(), false);
    }

    features
}

fn compiled_cpu_features() -> BTreeMap<String, bool> {
    let mut features = BTreeMap::new();
    features.insert("avx2".to_string(), cfg!(target_feature = "avx2"));
    features.insert("avx512bw".to_string(), cfg!(target_feature = "avx512bw"));
    features.insert("avx512f".to_string(), cfg!(target_feature = "avx512f"));
    features.insert("avx512vl".to_string(), cfg!(target_feature = "avx512vl"));
    features.insert("f16c".to_string(), cfg!(target_feature = "f16c"));
    features.insert("fma".to_string(), cfg!(target_feature = "fma"));
    features
}

fn runtime_info() -> LocalAiRuntimeInfo {
    LocalAiRuntimeInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        available_parallelism: thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1),
        build_profile: if cfg!(debug_assertions) {
            "debug".to_string()
        } else {
            "release".to_string()
        },
    }
}

fn file_size(path: &PathBuf) -> Option<u64> {
    std::fs::metadata(path).ok().map(|metadata| metadata.len())
}

fn generation_stats(
    response: &LocalAiGenerateResponse,
    max_new_tokens: usize,
    elapsed_ms: u128,
    mode: &str,
) -> LocalAiGenerationStats {
    LocalAiGenerationStats {
        elapsed_ms,
        prompt_tokens: response.prompt_tokens,
        generated_tokens: response.generated_tokens,
        tokens_per_second: tokens_per_second(response.generated_tokens, elapsed_ms),
        max_new_tokens,
        mode: mode.to_string(),
    }
}

fn tokens_per_second(generated_tokens: usize, elapsed_ms: u128) -> f64 {
    if elapsed_ms == 0 {
        return generated_tokens as f64;
    }

    generated_tokens as f64 / (elapsed_ms as f64 / 1000.0)
}

fn speed_label(tokens_per_second: f64) -> &'static str {
    if tokens_per_second >= 8.0 {
        "빠름"
    } else if tokens_per_second >= 3.0 {
        "보통"
    } else if tokens_per_second >= 1.0 {
        "느림"
    } else {
        "매우 느림"
    }
}

fn speed_recommendation(tokens_per_second: f64) -> &'static str {
    if tokens_per_second >= 3.0 {
        "내장 로컬 모델로 짧은 답변은 사용 가능합니다. 답변 토큰을 64-96으로 유지하세요."
    } else {
        "VDI CPU에서 내장 모델이 느립니다. 답변 토큰을 64 이하로 쓰거나, VDI 내부 localhost MTP/추론 서버 구성을 검토하세요."
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn status_reports_missing_model_without_crashing() {
        let config = LocalAiConfig {
            model_path: PathBuf::from("resources/models/missing.gguf"),
            tokenizer_path: PathBuf::from("resources/models/missing-tokenizer.json"),
            context_size: 2048,
        };
        let state = LocalAiState::new(config);

        let status = state.status();

        assert_eq!(status.state, LocalAiLoadState::MissingModel);
        assert!(!status.model_exists);
        assert!(!status.tokenizer_exists);
        assert_eq!(status.context_size, 2048);
        assert!(status.cpu_features.contains_key("avx512f"));
        assert!(!status.mtp_configured);
    }

    #[test]
    fn context_size_is_clamped_for_vdi_memory_safety() {
        assert_eq!(clamp_context_size(128_000), 4096);
        assert_eq!(clamp_context_size(128), 512);
        assert_eq!(clamp_context_size(2048), 2048);
    }

    #[test]
    fn status_reports_runtime_diagnostics_without_model_load() {
        let state = LocalAiState::new(LocalAiConfig {
            model_path: PathBuf::from("resources/models/missing.gguf"),
            tokenizer_path: PathBuf::from("resources/models/missing-tokenizer.json"),
            context_size: 2048,
        });

        let status = state.status();

        assert!(!status.runtime_info.os.is_empty());
        assert!(!status.runtime_info.arch.is_empty());
        assert!(status.runtime_info.available_parallelism >= 1);
        assert!(status.cpu_features.contains_key("avx2"));
        assert!(status.compiled_features.contains_key("avx2"));
    }

    #[test]
    fn speed_recommendation_marks_slow_vdi_for_mtp_review() {
        assert_eq!(speed_label(0.5), "매우 느림");
        assert!(speed_recommendation(0.5).contains("MTP"));
        assert_eq!(speed_label(3.0), "보통");
    }

    #[test]
    fn generate_requires_loaded_model() {
        let state = LocalAiState::new(LocalAiConfig {
            model_path: PathBuf::from("resources/models/missing.gguf"),
            tokenizer_path: PathBuf::from("resources/models/missing-tokenizer.json"),
            context_size: 2048,
        });

        let error = state
            .generate(LocalAiGenerateRequest {
                prompt: "요약해줘".to_string(),
                page_context: Some("오늘 회의록".to_string()),
                max_new_tokens: Some(64),
                temperature: Some(0.7),
                top_p: Some(0.9),
            })
            .expect_err("generation should fail before the model is loaded");

        assert!(matches!(error, LocalAiError::ModelNotLoaded));
    }

    #[test]
    fn cloned_state_shares_status_for_background_generation() {
        let state = LocalAiState::new(LocalAiConfig {
            model_path: PathBuf::from("resources/models/missing.gguf"),
            tokenizer_path: PathBuf::from("resources/models/missing-tokenizer.json"),
            context_size: 2048,
        });

        let cloned_state = state.clone();

        assert_eq!(
            cloned_state.status().context_size,
            state.status().context_size
        );
    }

    #[test]
    fn duplicate_model_load_is_rejected_before_allocating_again() {
        let state = LocalAiState::new(LocalAiConfig {
            model_path: PathBuf::from("resources/models/missing.gguf"),
            tokenizer_path: PathBuf::from("resources/models/missing-tokenizer.json"),
            context_size: 2048,
        });
        state.inner.lock().expect("state lock").load_state = LocalAiLoadState::Loading;

        let error = state.load().expect_err("parallel load must be rejected");

        assert!(
            matches!(error, LocalAiError::LoadFailed(message) if message.contains("already in progress"))
        );
    }

    #[test]
    #[ignore = "requires downloaded Gemma 4 GGUF and tokenizer resources"]
    fn local_downloaded_gemma4_benchmark_reports_vdi_speed() {
        let models_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("models");
        let state = LocalAiState::new(LocalAiConfig {
            model_path: models_dir.join("gemma-4-e2b-it-q4.gguf"),
            tokenizer_path: models_dir.join("tokenizer.json"),
            context_size: 512,
        });

        let result = state
            .benchmark()
            .expect("benchmark should run with downloaded Gemma 4 resources");

        println!(
            "load={:?}ms generate={}ms speed={:.2} tok/s label={}",
            result.load_ms, result.generate_ms, result.tokens_per_second, result.speed_label
        );
        assert!(result.generated_tokens <= 16);
        assert!(result.generate_ms > 0);
    }
}
