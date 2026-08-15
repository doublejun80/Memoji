use super::capabilities::RuntimeCapabilities;
use super::openai_compatible::OpenAiCompatibleLoopbackRuntime;
use super::traits::{
    BenchmarkPlan, BenchmarkReport, GenerateMetrics, InferenceRuntime, ModelProfile, RuntimeError,
    RuntimeHealth, StreamSink,
};
use crate::local_ai::{LocalAiGenerateRequest, MtpConfig};
use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct LiteRtRuntime {
    loopback: OpenAiCompatibleLoopbackRuntime,
}

impl LiteRtRuntime {
    pub fn new(config: MtpConfig, registered_models: Vec<String>) -> Result<Self, RuntimeError> {
        Ok(Self {
            loopback: OpenAiCompatibleLoopbackRuntime::new(config)?
                .with_registered_models(registered_models),
        })
    }
}

#[async_trait]
impl InferenceRuntime for LiteRtRuntime {
    fn capabilities(&self) -> RuntimeCapabilities {
        self.loopback.capabilities()
    }
    async fn health(&self) -> Result<RuntimeHealth, RuntimeError> {
        self.loopback.health().await
    }
    async fn load(&self, profile: &ModelProfile) -> Result<(), RuntimeError> {
        self.loopback.load(profile).await
    }
    async fn generate_stream(
        &self,
        request: LocalAiGenerateRequest,
        cancel: CancellationToken,
        sink: StreamSink,
    ) -> Result<GenerateMetrics, RuntimeError> {
        self.loopback.generate_stream(request, cancel, sink).await
    }
    async fn benchmark(&self, plan: BenchmarkPlan) -> Result<BenchmarkReport, RuntimeError> {
        self.loopback.benchmark(plan).await
    }
    async fn shutdown(&self) -> Result<(), RuntimeError> {
        self.loopback.shutdown().await
    }
}
