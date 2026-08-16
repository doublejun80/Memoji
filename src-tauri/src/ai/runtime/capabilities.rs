use crate::local_ai::{LocalAiRuntimeKind, MtpConfig};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeFamily {
    Candle,
    OpenAiCompatibleLoopback,
    LiteRt,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapabilities {
    pub family: RuntimeFamily,
    pub local_only: bool,
    pub in_process: bool,
    pub streaming: bool,
    pub open_ai_compatible: bool,
    pub managed_process: bool,
    pub target_model_verified: bool,
    pub assistant_model_verified: bool,
    pub mtp_verified: bool,
    pub auth_enforced: bool,
    pub auth_applicable: bool,
    pub external_request_surface: bool,
}

impl RuntimeCapabilities {
    pub fn candle() -> Self {
        Self {
            family: RuntimeFamily::Candle,
            local_only: true,
            in_process: true,
            streaming: true,
            open_ai_compatible: false,
            managed_process: false,
            target_model_verified: true,
            assistant_model_verified: false,
            mtp_verified: false,
            auth_enforced: false,
            auth_applicable: false,
            external_request_surface: false,
        }
    }

    pub fn for_loopback(config: &MtpConfig, registered_models: &[String]) -> Self {
        let target_model_verified = registered_models.iter().any(|model| model == &config.model);
        let assistant_model_verified = config
            .draft_model
            .as_ref()
            .is_some_and(|assistant| registered_models.iter().any(|model| model == assistant));
        let managed_process = config.runtime_kind == LocalAiRuntimeKind::LitertLm;
        Self {
            family: if managed_process {
                RuntimeFamily::LiteRt
            } else {
                RuntimeFamily::OpenAiCompatibleLoopback
            },
            local_only: true,
            in_process: false,
            streaming: true,
            open_ai_compatible: true,
            managed_process,
            target_model_verified,
            assistant_model_verified,
            mtp_verified: target_model_verified && assistant_model_verified,
            auth_enforced: false,
            auth_applicable: true,
            external_request_surface: true,
        }
    }

    pub fn configured_loopback(config: &MtpConfig) -> Self {
        Self::for_loopback(config, &[])
    }

    pub fn litert_native(model_verified: bool) -> Self {
        Self {
            family: RuntimeFamily::LiteRt,
            local_only: true,
            in_process: true,
            streaming: true,
            open_ai_compatible: false,
            managed_process: false,
            target_model_verified: model_verified,
            assistant_model_verified: false,
            mtp_verified: false,
            // Authentication is not applicable when the runtime has no socket or external transport.
            auth_enforced: false,
            auth_applicable: false,
            external_request_surface: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_litert_capabilities_do_not_claim_an_openai_server() {
        let capabilities = RuntimeCapabilities::litert_native(true);
        assert_eq!(capabilities.family, RuntimeFamily::LiteRt);
        assert!(capabilities.local_only);
        assert!(capabilities.in_process);
        assert!(capabilities.streaming);
        assert!(!capabilities.open_ai_compatible);
        assert!(!capabilities.managed_process);
        assert!(capabilities.target_model_verified);
        assert!(!capabilities.auth_enforced);
        assert!(!capabilities.auth_applicable);
        assert!(!capabilities.external_request_surface);
    }
}
