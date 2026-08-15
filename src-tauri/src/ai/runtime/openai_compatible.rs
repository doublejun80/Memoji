use super::capabilities::RuntimeCapabilities;
use super::traits::{
    BenchmarkPlan, BenchmarkReport, GenerateMetrics, InferenceRuntime, ModelProfile, RuntimeError,
    RuntimeHealth, StreamSink,
};
use crate::ai::metrics::{MtpMetrics, RuntimeMetrics};
use crate::local_ai::{
    generate_mtp_stream, probe_openai_compatible_endpoint, LocalAiGenerateRequest, MtpConfig,
};
use async_trait::async_trait;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct OpenAiCompatibleLoopbackRuntime {
    config: MtpConfig,
    registered_models: Vec<String>,
}

impl OpenAiCompatibleLoopbackRuntime {
    pub fn new(config: MtpConfig) -> Result<Self, RuntimeError> {
        if !crate::local_ai::endpoint_is_vdi_local(&config.endpoint) {
            return Err(RuntimeError(
                "OpenAI-compatible runtime must use a loopback endpoint".to_string(),
            ));
        }
        Ok(Self {
            config,
            registered_models: Vec::new(),
        })
    }

    pub fn with_registered_models(mut self, models: Vec<String>) -> Self {
        self.registered_models = models;
        self
    }
}

#[async_trait]
impl InferenceRuntime for OpenAiCompatibleLoopbackRuntime {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities::for_loopback(&self.config, &self.registered_models)
    }

    async fn health(&self) -> Result<RuntimeHealth, RuntimeError> {
        match probe_openai_compatible_endpoint(&self.config).await {
            Ok(probe) => Ok(RuntimeHealth {
                ready: probe.models.iter().any(|model| model == &self.config.model),
                process_alive: None,
                port_open: Some(true),
                http_ready: Some(true),
                model_registered: Some(
                    probe.models.iter().any(|model| model == &self.config.model),
                ),
                detail: probe.runtime_version,
            }),
            Err(error) => Ok(RuntimeHealth {
                ready: false,
                process_alive: None,
                port_open: None,
                http_ready: Some(false),
                model_registered: Some(false),
                detail: Some(error.to_string()),
            }),
        }
    }

    async fn load(&self, _profile: &ModelProfile) -> Result<(), RuntimeError> {
        self.health().await.and_then(|health| {
            if health.ready {
                Ok(())
            } else {
                Err(RuntimeError(
                    health
                        .detail
                        .unwrap_or_else(|| "runtime is not ready".to_string()),
                ))
            }
        })
    }

    async fn generate_stream(
        &self,
        request: LocalAiGenerateRequest,
        cancel: CancellationToken,
        sink: StreamSink,
    ) -> Result<GenerateMetrics, RuntimeError> {
        let started = Instant::now();
        let mut ttft = None;
        let response = generate_mtp_stream(
            self.config.clone(),
            format!("adapter-{}", started.elapsed().as_nanos()),
            request,
            cancel,
            |chunk| {
                ttft.get_or_insert(started.elapsed().as_millis());
                sink(chunk.token_text, chunk.generated_tokens).map_err(|error| {
                    crate::local_ai::LocalAiError::GenerateFailed(error.to_string())
                })
            },
        )
        .await
        .map_err(|error| RuntimeError(error.to_string()))?;
        let capabilities = self.capabilities();
        let elapsed = started.elapsed().as_millis();
        Ok(GenerateMetrics {
            metrics: RuntimeMetrics {
                runtime_version: Some("openai-compatible-v1".to_string()),
                ttft_ms: ttft,
                prefill_tokens: Some(response.prompt_tokens),
                decode_tokens: Some(response.generated_tokens),
                decode_ms: Some(elapsed.saturating_sub(ttft.unwrap_or(0))),
                mtp: if capabilities.mtp_verified {
                    Some(MtpMetrics {
                        target_model: self.config.model.clone(),
                        assistant_model: self.config.draft_model.clone().unwrap_or_default(),
                        accepted_draft_tokens: None,
                        proposed_draft_tokens: None,
                    })
                } else {
                    None
                },
                ..RuntimeMetrics::default()
            },
            response,
        })
    }

    async fn benchmark(&self, plan: BenchmarkPlan) -> Result<BenchmarkReport, RuntimeError> {
        let generated = self
            .generate_stream(
                LocalAiGenerateRequest {
                    prompt: plan.prompt,
                    page_context: None,
                    max_new_tokens: Some(plan.max_new_tokens),
                    temperature: Some(0.0),
                    top_p: Some(1.0),
                },
                CancellationToken::new(),
                std::sync::Arc::new(|_, _| Ok(())),
            )
            .await?;
        Ok(BenchmarkReport {
            generated_tokens: generated.response.generated_tokens,
            metrics: generated.metrics,
        })
    }

    async fn shutdown(&self) -> Result<(), RuntimeError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_ai::LocalAiRuntimeKind;

    fn config(draft: Option<&str>) -> MtpConfig {
        MtpConfig::from_values(
            "http://127.0.0.1:9379/v1/chat/completions".to_string(),
            Some("target".to_string()),
            draft.map(str::to_string),
            Some(LocalAiRuntimeKind::LitertLm),
            None,
        )
        .unwrap()
    }

    #[test]
    fn candle_reports_in_process_without_mtp() {
        let capabilities = RuntimeCapabilities::candle();
        assert!(capabilities.in_process);
        assert!(capabilities.local_only);
        assert!(!capabilities.mtp_verified);
    }

    #[test]
    fn plain_loopback_reports_streaming_without_mtp() {
        let runtime = OpenAiCompatibleLoopbackRuntime::new(config(None)).unwrap();
        let capabilities = runtime.capabilities();
        assert!(capabilities.streaming);
        assert!(capabilities.open_ai_compatible);
        assert!(!capabilities.mtp_verified);
    }

    #[test]
    fn verified_target_and_assistant_report_mtp() {
        let runtime = OpenAiCompatibleLoopbackRuntime::new(config(Some("assistant")))
            .unwrap()
            .with_registered_models(vec!["target".to_string(), "assistant".to_string()]);
        let capabilities = runtime.capabilities();
        assert!(capabilities.target_model_verified);
        assert!(capabilities.assistant_model_verified);
        assert!(capabilities.mtp_verified);
    }

    #[test]
    fn missing_assistant_cannot_report_mtp() {
        let runtime = OpenAiCompatibleLoopbackRuntime::new(config(Some("assistant")))
            .unwrap()
            .with_registered_models(vec!["target".to_string()]);
        assert!(!runtime.capabilities().mtp_verified);
    }

    #[test]
    fn external_endpoint_is_rejected() {
        let config = MtpConfig {
            endpoint: "https://example.com/v1/chat/completions".to_string(),
            model: "target".to_string(),
            draft_model: None,
            runtime_kind: LocalAiRuntimeKind::LlamaCpp,
            api_key: None,
        };
        assert!(OpenAiCompatibleLoopbackRuntime::new(config).is_err());
    }
}
