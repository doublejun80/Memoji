mod gemma4;
mod mtp_client;
mod sampler;
mod tokenizer;

use gemma4::Gemma4Runtime;
pub use mtp_client::{generate_mtp_stream, MtpConfig};
use sampler::SamplingConfig;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fmt, path::PathBuf, sync::Mutex};

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
    pub model_exists: bool,
    pub tokenizer_exists: bool,
    pub context_size: usize,
    pub model_info: Option<LocalAiModelInfo>,
    pub last_error: Option<String>,
    pub cpu_features: BTreeMap<String, bool>,
    pub compiled_features: BTreeMap<String, bool>,
    pub avx512_runtime_ready: bool,
    pub avx512_build: bool,
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
}

#[derive(Debug)]
pub struct LocalAiState {
    config: LocalAiConfig,
    inner: Mutex<LocalAiInner>,
}

impl LocalAiState {
    pub fn new(config: LocalAiConfig) -> Self {
        Self {
            config,
            inner: Mutex::new(LocalAiInner {
                runtime: None,
                load_state: LocalAiLoadState::NotLoaded,
                model_info: None,
                last_error: None,
            }),
        }
    }

    pub fn status(&self) -> LocalAiStatus {
        let inner = self.inner.lock().expect("local ai state poisoned");
        self.status_from_inner(&inner)
    }

    pub fn load(&self) -> Result<LocalAiStatus, LocalAiError> {
        self.validate_resource_paths()?;

        {
            let mut inner = self.inner.lock().expect("local ai state poisoned");
            inner.load_state = LocalAiLoadState::Loading;
            inner.last_error = None;
        }

        let load_result = Gemma4Runtime::load(&self.config);
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
                Ok(self.status_from_inner(&inner))
            }
            Err(error) => {
                inner.load_state = match &error {
                    LocalAiError::UnsupportedArchitecture { .. } => LocalAiLoadState::Unsupported,
                    _ => LocalAiLoadState::Error,
                };
                inner.runtime = None;
                inner.last_error = Some(error.to_string());
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

        runtime.generate(request, sampling)
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

        runtime.generate_with_callback(request, sampling, on_token)
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

    fn status_from_inner(&self, inner: &LocalAiInner) -> LocalAiStatus {
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
        let mtp_config = MtpConfig::from_env();

        LocalAiStatus {
            state,
            model_path: self.config.model_path.to_string_lossy().into_owned(),
            tokenizer_path: self.config.tokenizer_path.to_string_lossy().into_owned(),
            mtp_configured: mtp_config.is_some(),
            mtp_endpoint: mtp_config.as_ref().map(|config| config.endpoint.clone()),
            mtp_model: mtp_config.as_ref().map(|config| config.model.clone()),
            mtp_draft_model: mtp_config.and_then(|config| config.draft_model),
            model_exists,
            tokenizer_exists,
            context_size: self.config.context_size,
            model_info: inner.model_info.clone(),
            last_error: inner.last_error.clone(),
            avx512_runtime_ready: avx512_ready(&cpu_features),
            avx512_build: avx512_ready(&compiled_features),
            cpu_features,
            compiled_features,
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
}
