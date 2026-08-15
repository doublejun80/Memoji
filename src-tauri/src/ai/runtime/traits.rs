use super::capabilities::RuntimeCapabilities;
use crate::ai::metrics::RuntimeMetrics;
use crate::local_ai::{LocalAiGenerateRequest, LocalAiGenerateResponse};
use async_trait::async_trait;
use std::fmt;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Default)]
pub struct ModelProfile {
    pub model_id: String,
    pub assistant_model_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct BenchmarkPlan {
    pub prompt: String,
    pub max_new_tokens: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeHealth {
    pub ready: bool,
    pub process_alive: Option<bool>,
    pub port_open: Option<bool>,
    pub http_ready: Option<bool>,
    pub model_registered: Option<bool>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BenchmarkReport {
    pub metrics: RuntimeMetrics,
    pub generated_tokens: usize,
}

#[derive(Debug, Clone)]
pub struct GenerateMetrics {
    pub response: LocalAiGenerateResponse,
    pub metrics: RuntimeMetrics,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeError(pub String);

impl fmt::Display for RuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for RuntimeError {}

pub type StreamSink = Arc<dyn Fn(String, usize) -> Result<(), RuntimeError> + Send + Sync>;

#[async_trait]
pub trait InferenceRuntime: Send + Sync {
    fn capabilities(&self) -> RuntimeCapabilities;
    async fn health(&self) -> Result<RuntimeHealth, RuntimeError>;
    async fn load(&self, profile: &ModelProfile) -> Result<(), RuntimeError>;
    async fn generate_stream(
        &self,
        request: LocalAiGenerateRequest,
        cancel: CancellationToken,
        sink: StreamSink,
    ) -> Result<GenerateMetrics, RuntimeError>;
    async fn benchmark(&self, plan: BenchmarkPlan) -> Result<BenchmarkReport, RuntimeError>;
    async fn shutdown(&self) -> Result<(), RuntimeError>;
}
