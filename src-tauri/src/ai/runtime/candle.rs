use super::capabilities::RuntimeCapabilities;
use super::traits::{
    BenchmarkPlan, BenchmarkReport, GenerateMetrics, InferenceRuntime, ModelProfile, RuntimeError,
    RuntimeHealth, StreamSink,
};
use crate::ai::metrics::RuntimeMetrics;
use crate::local_ai::{cancellation_checkpoint, LocalAiGenerateRequest, LocalAiState};
use async_trait::async_trait;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct CandleRuntime {
    state: LocalAiState,
}

impl CandleRuntime {
    pub fn new(state: LocalAiState) -> Self {
        Self { state }
    }
}

#[async_trait]
impl InferenceRuntime for CandleRuntime {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities::candle()
    }

    async fn health(&self) -> Result<RuntimeHealth, RuntimeError> {
        let status = self.state.status();
        Ok(RuntimeHealth {
            ready: matches!(status.state, crate::local_ai::LocalAiLoadState::Loaded),
            process_alive: None,
            port_open: None,
            http_ready: None,
            model_registered: Some(status.model_exists && status.tokenizer_exists),
            detail: status.last_error,
        })
    }

    async fn load(&self, _profile: &ModelProfile) -> Result<(), RuntimeError> {
        self.state
            .load()
            .map(|_| ())
            .map_err(|error| RuntimeError(error.to_string()))
    }

    async fn generate_stream(
        &self,
        request: LocalAiGenerateRequest,
        cancel: CancellationToken,
        sink: StreamSink,
    ) -> Result<GenerateMetrics, RuntimeError> {
        cancellation_checkpoint(&cancel).map_err(|error| RuntimeError(error.to_string()))?;
        let started = Instant::now();
        let mut ttft = None;
        let response = self
            .state
            .generate_with_callback(request, |text, generated| {
                cancellation_checkpoint(&cancel)?;
                ttft.get_or_insert(started.elapsed().as_millis());
                sink(text, generated).map_err(|error| {
                    crate::local_ai::LocalAiError::GenerateFailed(error.to_string())
                })
            })
            .map_err(|error| RuntimeError(error.to_string()))?;
        let elapsed = started.elapsed().as_millis();
        Ok(GenerateMetrics {
            metrics: RuntimeMetrics {
                runtime_version: Some(format!("candle-{}", env!("CARGO_PKG_VERSION"))),
                ttft_ms: ttft,
                prefill_tokens: Some(response.prompt_tokens),
                decode_tokens: Some(response.generated_tokens),
                decode_ms: Some(elapsed.saturating_sub(ttft.unwrap_or(0))),
                ..RuntimeMetrics::default()
            },
            response,
        })
    }

    async fn benchmark(&self, plan: BenchmarkPlan) -> Result<BenchmarkReport, RuntimeError> {
        let started = Instant::now();
        let response = self
            .state
            .generate(LocalAiGenerateRequest {
                prompt: plan.prompt,
                page_context: None,
                max_new_tokens: Some(plan.max_new_tokens),
                temperature: Some(0.0),
                top_p: Some(1.0),
            })
            .map_err(|error| RuntimeError(error.to_string()))?;
        Ok(BenchmarkReport {
            generated_tokens: response.generated_tokens,
            metrics: RuntimeMetrics {
                runtime_version: Some(format!("candle-{}", env!("CARGO_PKG_VERSION"))),
                decode_tokens: Some(response.generated_tokens),
                decode_ms: Some(started.elapsed().as_millis()),
                ..RuntimeMetrics::default()
            },
        })
    }

    async fn shutdown(&self) -> Result<(), RuntimeError> {
        Ok(())
    }
}
