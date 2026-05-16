use super::{
    sampler::DEFAULT_MAX_NEW_TOKENS, LocalAiError, LocalAiGenerateRequest, LocalAiGenerateResponse,
    LocalAiGenerateStreamChunk,
};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::time::Duration;

pub const DEFAULT_MTP_MODEL: &str = "google/gemma-4-E2B-it";
const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 600;
const MAX_MTP_ERROR_BODY_CHARS: usize = 600;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MtpConfig {
    pub endpoint: String,
    pub model: String,
    pub draft_model: Option<String>,
    pub api_key: Option<String>,
}

impl MtpConfig {
    pub fn from_env() -> Option<Self> {
        let endpoint = std::env::var("MEMOJI_MTP_ENDPOINT").ok()?;
        let model = std::env::var("MEMOJI_MTP_MODEL").ok();
        let draft_model = std::env::var("MEMOJI_MTP_DRAFT_MODEL").ok();
        let api_key = std::env::var("MEMOJI_MTP_API_KEY").ok();

        Self::from_values(endpoint, model, draft_model, api_key).ok()
    }

    pub fn from_values(
        endpoint: String,
        model: Option<String>,
        draft_model: Option<String>,
        api_key: Option<String>,
    ) -> Result<Self, String> {
        let endpoint = endpoint.trim().to_string();
        if endpoint.is_empty() {
            return Err("고속 로컬 서버 endpoint를 입력하세요.".to_string());
        }
        if !endpoint_is_vdi_local(&endpoint) {
            return Err("고속 로컬 서버는 localhost, 127.0.0.1, ::1만 허용합니다.".to_string());
        }

        Ok(Self {
            endpoint,
            model: model
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| DEFAULT_MTP_MODEL.to_string()),
            draft_model: draft_model
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            api_key: api_key
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
        })
    }
}

pub fn endpoint_is_vdi_local(endpoint: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(endpoint) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    let Some(host) = url.host_str().map(|host| host.to_ascii_lowercase()) else {
        return false;
    };
    if host == "localhost" {
        return true;
    }

    host.parse::<IpAddr>()
        .map(|addr| addr.is_loopback())
        .unwrap_or(false)
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: usize,
    temperature: f32,
    top_p: f32,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChunk {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    delta: Option<ChatCompletionDelta>,
    text: Option<String>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionDelta {
    content: Option<String>,
}

pub async fn generate_mtp_stream<F>(
    config: MtpConfig,
    request_id: String,
    request: LocalAiGenerateRequest,
    mut on_chunk: F,
) -> Result<LocalAiGenerateResponse, LocalAiError>
where
    F: FnMut(LocalAiGenerateStreamChunk) -> Result<(), LocalAiError>,
{
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
        .redirect(Policy::none())
        .build()
        .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;

    let payload = ChatCompletionRequest {
        model: config.model,
        messages: build_messages(&request),
        max_tokens: request.max_new_tokens.unwrap_or(DEFAULT_MAX_NEW_TOKENS),
        temperature: request.temperature.unwrap_or(0.4),
        top_p: request.top_p.unwrap_or(0.95),
        stream: true,
    };

    let mut builder = client
        .post(config.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    if let Some(api_key) = config.api_key {
        builder = builder.header(AUTHORIZATION, format!("Bearer {api_key}"));
    }

    let mut response = builder
        .send()
        .await
        .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = sanitize_error_body(&response.text().await.unwrap_or_default());
        return Err(LocalAiError::GenerateFailed(format!(
            "MTP endpoint returned {status}: {body}"
        )));
    }

    let mut pending = String::new();
    let mut text = String::new();
    let mut generated_tokens = 0usize;
    let mut finish_reason = "stop".to_string();

    while let Some(bytes) = response
        .chunk()
        .await
        .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?
    {
        pending.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(line_end) = pending.find('\n') {
            let line = pending[..line_end].trim_end_matches('\r').to_string();
            pending.replace_range(..=line_end, "");

            let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                continue;
            };
            if data.is_empty() {
                continue;
            }
            if data == "[DONE]" {
                break;
            }

            for event in parse_stream_event(data)? {
                if let Some(reason) = event.finish_reason {
                    finish_reason = reason;
                }
                if let Some(token_text) = event.token_text.filter(|value| !value.is_empty()) {
                    text.push_str(&token_text);
                    generated_tokens += 1;
                    on_chunk(LocalAiGenerateStreamChunk {
                        request_id: request_id.clone(),
                        token_text,
                        generated_tokens,
                        done: false,
                        finish_reason: None,
                    })?;
                }
            }
        }
    }

    Ok(LocalAiGenerateResponse {
        text,
        prompt_tokens: 0,
        generated_tokens,
        finish_reason,
    })
}

#[derive(Debug, PartialEq, Eq)]
struct StreamEvent {
    token_text: Option<String>,
    finish_reason: Option<String>,
}

fn parse_stream_event(data: &str) -> Result<Vec<StreamEvent>, LocalAiError> {
    let chunk: ChatCompletionChunk = serde_json::from_str(data)
        .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;

    Ok(chunk
        .choices
        .into_iter()
        .map(|choice| StreamEvent {
            token_text: choice.delta.and_then(|delta| delta.content).or(choice.text),
            finish_reason: choice.finish_reason,
        })
        .collect())
}

fn sanitize_error_body(body: &str) -> String {
    let redacted = body
        .split_whitespace()
        .map(|part| {
            if part.len() > 24
                && (part.to_ascii_lowercase().contains("bearer")
                    || part.chars().filter(|ch| *ch == '.').count() >= 2)
            {
                "[redacted]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    redacted.chars().take(MAX_MTP_ERROR_BODY_CHARS).collect()
}

fn build_messages(request: &LocalAiGenerateRequest) -> Vec<ChatMessage> {
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

    vec![
        ChatMessage {
            role: "system",
            content: system,
        },
        ChatMessage {
            role: "user",
            content: request.prompt.trim().to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openai_style_delta_stream_chunk() {
        let events = parse_stream_event(
            r#"{"choices":[{"delta":{"content":"안녕"},"finish_reason":null}]}"#,
        )
        .expect("event should parse");

        assert_eq!(
            events,
            vec![StreamEvent {
                token_text: Some("안녕".to_string()),
                finish_reason: None,
            }]
        );
    }

    #[test]
    fn parses_llama_style_text_stream_chunk() {
        let events =
            parse_stream_event(r#"{"choices":[{"text":"하세요","finish_reason":"stop"}]}"#)
                .expect("event should parse");

        assert_eq!(
            events,
            vec![StreamEvent {
                token_text: Some("하세요".to_string()),
                finish_reason: Some("stop".to_string()),
            }]
        );
    }

    #[test]
    fn truncates_mtp_error_body_before_returning_to_ui() {
        let body = format!("error {}", "x".repeat(1200));
        let sanitized = sanitize_error_body(&body);

        assert!(sanitized.chars().count() <= MAX_MTP_ERROR_BODY_CHARS);
    }

    #[test]
    fn builds_config_from_trimmed_loopback_values() {
        let config = MtpConfig::from_values(
            " http://127.0.0.1:8080/v1/chat/completions ".to_string(),
            Some(" local-gemma ".to_string()),
            Some(" draft ".to_string()),
            None,
        )
        .expect("loopback config should be accepted");

        assert_eq!(config.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
        assert_eq!(config.model, "local-gemma");
        assert_eq!(config.draft_model.as_deref(), Some("draft"));
    }

    #[test]
    fn allows_only_loopback_mtp_endpoints() {
        assert!(endpoint_is_vdi_local(
            "http://127.0.0.1:8080/v1/chat/completions"
        ));
        assert!(endpoint_is_vdi_local(
            "http://localhost:8080/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "http://evil.localhost:8080/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "http://10.20.30.40:8080/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "http://192.168.10.5:8080/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "http://172.16.0.5:8080/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "https://api.openai.com/v1/chat/completions"
        ));
        assert!(!endpoint_is_vdi_local(
            "https://example.com/v1/chat/completions"
        ));
    }
}
