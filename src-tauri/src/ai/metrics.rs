use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MtpMetrics {
    pub target_model: String,
    pub assistant_model: String,
    pub accepted_draft_tokens: Option<usize>,
    pub proposed_draft_tokens: Option<usize>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetrics {
    pub runtime_version: Option<String>,
    pub load_ms: Option<u128>,
    pub ttft_ms: Option<u128>,
    pub prefill_tokens: Option<usize>,
    pub prefill_ms: Option<u128>,
    pub decode_tokens: Option<usize>,
    pub decode_ms: Option<u128>,
    pub peak_rss_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtp: Option<MtpMetrics>,
}
