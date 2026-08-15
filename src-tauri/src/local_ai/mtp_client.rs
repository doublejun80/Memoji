use super::{
    cancellation_checkpoint, sampler::SamplingConfig, LocalAiError, LocalAiGenerateRequest,
    LocalAiGenerateResponse, LocalAiGenerateStreamChunk,
};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub const DEFAULT_MTP_MODEL: &str = "google/gemma-4-E2B-it";
const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 600;
const CONNECT_TIMEOUT_SECS: u64 = 2;
const PROBE_TIMEOUT_MILLIS: u64 = 1_500;
const MAX_MTP_ERROR_BODY_CHARS: usize = 600;
static MTP_CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalAiRuntimeKind {
    #[default]
    BuiltinCandle,
    LlamaCpp,
    LitertLm,
}

impl LocalAiRuntimeKind {
    fn server_default() -> Self {
        Self::LlamaCpp
    }

    fn from_env_value(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "llama_cpp" | "llamacpp" | "llama.cpp" => Some(Self::LlamaCpp),
            "litert_lm" | "litertlm" | "litert-lm" | "litert.lm" => Some(Self::LitertLm),
            "builtin_candle" | "candle" | "builtin" => Some(Self::BuiltinCandle),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MtpConfig {
    pub endpoint: String,
    pub model: String,
    pub draft_model: Option<String>,
    pub runtime_kind: LocalAiRuntimeKind,
    pub api_key: Option<String>,
}

impl MtpConfig {
    pub fn from_env() -> Option<Self> {
        Self::from_env_result().ok().flatten()
    }

    pub fn from_env_result() -> Result<Option<Self>, String> {
        let endpoint = match std::env::var("MEMOJI_MTP_ENDPOINT") {
            Ok(endpoint) => endpoint,
            Err(std::env::VarError::NotPresent) => return Ok(None),
            Err(error) => return Err(format!("MEMOJI_MTP_ENDPOINT is invalid: {error}")),
        };
        let model = std::env::var("MEMOJI_MTP_MODEL").ok();
        let draft_model = std::env::var("MEMOJI_MTP_DRAFT_MODEL").ok();
        let runtime_kind = std::env::var("MEMOJI_MTP_RUNTIME")
            .ok()
            .and_then(|value| LocalAiRuntimeKind::from_env_value(&value));
        let api_key = std::env::var("MEMOJI_MTP_API_KEY").ok();

        Self::from_values(endpoint, model, draft_model, runtime_kind, api_key).map(Some)
    }

    pub fn from_values(
        endpoint: String,
        model: Option<String>,
        draft_model: Option<String>,
        runtime_kind: Option<LocalAiRuntimeKind>,
        api_key: Option<String>,
    ) -> Result<Self, String> {
        let endpoint = endpoint.trim().to_string();
        if endpoint.is_empty() {
            return Err("고속 로컬 서버 endpoint를 입력하세요.".to_string());
        }
        if !endpoint_is_vdi_local(&endpoint) {
            return Err("고속 로컬 서버는 localhost, 127.0.0.1, ::1만 허용합니다.".to_string());
        }

        let runtime_kind = match runtime_kind.unwrap_or_else(LocalAiRuntimeKind::server_default) {
            LocalAiRuntimeKind::BuiltinCandle => LocalAiRuntimeKind::server_default(),
            runtime_kind => runtime_kind,
        };

        Ok(Self {
            endpoint,
            model: model
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| DEFAULT_MTP_MODEL.to_string()),
            draft_model: draft_model
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            runtime_kind,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiCompatibleProbe {
    pub models: Vec<String>,
    pub runtime_version: Option<String>,
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

#[derive(Debug, Default)]
struct SseLineBuffer {
    pending: Vec<u8>,
}

impl SseLineBuffer {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>, LocalAiError> {
        self.pending.extend_from_slice(bytes);
        self.take_complete_lines()
    }

    fn finish(&mut self) -> Result<Vec<String>, LocalAiError> {
        let mut lines = self.take_complete_lines()?;
        if !self.pending.is_empty() {
            let trailing = std::mem::take(&mut self.pending);
            lines.push(decode_sse_line(&trailing)?);
        }
        Ok(lines)
    }

    fn take_complete_lines(&mut self) -> Result<Vec<String>, LocalAiError> {
        let mut lines = Vec::new();
        let mut consumed = 0usize;

        while let Some(relative_end) = self.pending[consumed..]
            .iter()
            .position(|byte| *byte == b'\n')
        {
            let line_end = consumed + relative_end;
            lines.push(decode_sse_line(&self.pending[consumed..line_end])?);
            consumed = line_end + 1;
        }

        if consumed > 0 {
            self.pending.drain(..consumed);
        }

        Ok(lines)
    }
}

fn decode_sse_line(bytes: &[u8]) -> Result<String, LocalAiError> {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    std::str::from_utf8(bytes)
        .map(str::to_owned)
        .map_err(|error| {
            LocalAiError::GenerateFailed(format!(
                "Local server stream returned invalid UTF-8: {error}"
            ))
        })
}

fn shared_mtp_client() -> Result<&'static reqwest::Client, LocalAiError> {
    MTP_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
                .tcp_nodelay(true)
                .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
                .redirect(Policy::none())
                .build()
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|error| {
            LocalAiError::GenerateFailed(format!("failed to build loopback HTTP client: {error}"))
        })
}

fn models_endpoint(endpoint: &str) -> Result<reqwest::Url, LocalAiError> {
    let mut url = reqwest::Url::parse(endpoint).map_err(|error| {
        LocalAiError::GenerateFailed(format!("invalid loopback endpoint URL: {error}"))
    })?;
    url.set_path("/v1/models");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub async fn probe_openai_compatible_endpoint(
    config: &MtpConfig,
) -> Result<OpenAiCompatibleProbe, LocalAiError> {
    let client = shared_mtp_client()?;
    let mut builder = client
        .get(models_endpoint(&config.endpoint)?)
        .timeout(Duration::from_millis(PROBE_TIMEOUT_MILLIS));

    if let Some(api_key) = config.api_key.as_deref() {
        builder = builder.header(AUTHORIZATION, format!("Bearer {api_key}"));
    }

    let response = builder.send().await.map_err(|error| {
        LocalAiError::GenerateFailed(format!("Local server probe failed: {error}"))
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = sanitize_error_body(&response.text().await.unwrap_or_default());
        return Err(LocalAiError::GenerateFailed(format!(
            "Local server probe returned {status}: {body}"
        )));
    }

    #[derive(Deserialize)]
    struct ModelsResponse {
        data: Vec<ModelEntry>,
    }

    #[derive(Deserialize)]
    struct ModelEntry {
        id: String,
    }

    let models: ModelsResponse = response.json().await.map_err(|error| {
        LocalAiError::GenerateFailed(format!("Local server models response is invalid: {error}"))
    })?;
    if !models.data.iter().any(|model| model.id == config.model) {
        return Err(LocalAiError::GenerateFailed(format!(
            "Local server is reachable, but configured model '{}' is not registered",
            config.model
        )));
    }

    Ok(OpenAiCompatibleProbe {
        models: models.data.into_iter().map(|model| model.id).collect(),
        runtime_version: None,
    })
}

pub async fn probe_mtp_endpoint(config: &MtpConfig) -> Result<(), LocalAiError> {
    probe_openai_compatible_endpoint(config).await.map(|_| ())
}

pub async fn generate_mtp_stream<F>(
    config: MtpConfig,
    request_id: String,
    request: LocalAiGenerateRequest,
    cancellation: CancellationToken,
    mut on_chunk: F,
) -> Result<LocalAiGenerateResponse, LocalAiError>
where
    F: FnMut(LocalAiGenerateStreamChunk) -> Result<(), LocalAiError>,
{
    cancellation_checkpoint(&cancellation)?;
    let client = shared_mtp_client()?;

    let sampling = SamplingConfig::from_request(&request);
    let payload = ChatCompletionRequest {
        model: config.model,
        messages: build_messages(&request),
        max_tokens: sampling.max_new_tokens,
        temperature: sampling.temperature,
        top_p: sampling.top_p,
        stream: true,
    };

    let mut builder = client
        .post(config.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    if let Some(api_key) = config.api_key {
        builder = builder.header(AUTHORIZATION, format!("Bearer {api_key}"));
    }

    cancellation_checkpoint(&cancellation)?;
    let mut response = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return Err(LocalAiError::Cancelled),
        result = builder.send() => result
            .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?,
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = sanitize_error_body(&response.text().await.unwrap_or_default());
        return Err(LocalAiError::GenerateFailed(format!(
            "Local server endpoint returned {status}: {body}"
        )));
    }

    let mut line_buffer = SseLineBuffer::default();
    let mut text = String::new();
    let mut generated_tokens = 0usize;
    let mut finish_reason = "stop".to_string();
    let mut received_done = false;
    let mut received_finish_reason = false;

    while !received_done {
        cancellation_checkpoint(&cancellation)?;
        let bytes = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(LocalAiError::Cancelled),
            result = response.chunk() => result
                .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?,
        };
        let reached_eof = bytes.is_none();
        let lines = match bytes {
            Some(bytes) => line_buffer.push(&bytes)?,
            None => line_buffer.finish()?,
        };

        for line in lines {
            cancellation_checkpoint(&cancellation)?;
            let Some(data) = line.strip_prefix("data:").map(str::trim) else {
                continue;
            };
            if data.is_empty() {
                continue;
            }
            if data == "[DONE]" {
                received_done = true;
                break;
            }

            for event in parse_stream_event(data)? {
                cancellation_checkpoint(&cancellation)?;
                if let Some(reason) = event.finish_reason {
                    finish_reason = reason;
                    received_finish_reason = true;
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

        if reached_eof {
            if !received_done && !received_finish_reason {
                return Err(LocalAiError::GenerateFailed(
                    "Local server stream ended before a completion marker was received".to_string(),
                ));
            }
            break;
        }
    }

    cancellation_checkpoint(&cancellation)?;
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn spawn_probe_server(status: &str, body: &str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("probe listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let status = status.to_string();
        let body = body.to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("probe connection should arrive");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout should be configured");

            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let read = stream
                    .read(&mut buffer)
                    .expect("request should be readable");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
            }

            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream
                .write_all(response.as_bytes())
                .expect("probe response should be writable");

            String::from_utf8(request).expect("HTTP request should be UTF-8")
        });

        (format!("http://{address}/v1/chat/completions"), handle)
    }

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
    fn shared_http_client_is_reused() {
        let first = shared_mtp_client().expect("shared client should build");
        let second = shared_mtp_client().expect("shared client should remain available");

        assert!(std::ptr::eq(first, second));
    }

    #[test]
    fn cancellation_interrupts_a_waiting_loopback_stream() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("stream listener should bind");
        let address = listener
            .local_addr()
            .expect("listener should have an address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("stream connection should arrive");
            let mut request = [0u8; 4096];
            let _ = stream.read(&mut request);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                )
                .expect("stream headers should be writable");
            thread::sleep(Duration::from_millis(800));
            let _ = stream.write_all(
                b"50\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"late\"},\"finish_reason\":null}]}\n\n\r\n",
            );
        });

        let config = MtpConfig::from_values(
            format!("http://{address}/v1/chat/completions"),
            Some("gemma4-e2b".to_string()),
            None,
            Some(LocalAiRuntimeKind::LitertLm),
            None,
        )
        .expect("loopback config should be valid");
        let cancellation = CancellationToken::new();
        let cancellation_from_ui = cancellation.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            cancellation_from_ui.cancel();
        });

        let started = std::time::Instant::now();
        let error = tauri::async_runtime::block_on(generate_mtp_stream(
            config,
            "cancel-loopback".to_string(),
            LocalAiGenerateRequest {
                prompt: "취소 테스트".to_string(),
                page_context: None,
                max_new_tokens: Some(8),
                temperature: Some(0.0),
                top_p: Some(1.0),
            },
            cancellation,
            |_chunk| Ok(()),
        ))
        .expect_err("cancelled stream should not complete");

        assert!(matches!(error, LocalAiError::Cancelled));
        assert!(started.elapsed() < Duration::from_millis(500));
        server.join().expect("stream server should finish");
    }

    #[test]
    fn models_endpoint_replaces_completion_path_and_query() {
        let endpoint = models_endpoint(
            "http://127.0.0.1:8080/custom/v1/chat/completions?request_id=secret#fragment",
        )
        .expect("models endpoint should be derived");

        assert_eq!(endpoint.as_str(), "http://127.0.0.1:8080/v1/models");
    }

    #[test]
    fn sse_line_buffer_preserves_split_korean_utf8_and_trailing_line() {
        let first_line = r#"data: {"choices":[{"delta":{"content":"안녕"},"finish_reason":null}]}"#;
        let mut first_line_with_newline = first_line.as_bytes().to_vec();
        first_line_with_newline.push(b'\n');
        let split_inside_korean = first_line.find('안').expect("Korean text should exist") + 1;
        let mut buffer = SseLineBuffer::default();

        assert!(buffer
            .push(&first_line_with_newline[..split_inside_korean])
            .expect("partial UTF-8 should remain buffered")
            .is_empty());
        assert_eq!(
            buffer
                .push(&first_line_with_newline[split_inside_korean..])
                .expect("complete line should decode"),
            vec![first_line.to_string()]
        );

        let trailing_line =
            r#"data: {"choices":[{"delta":{"content":"하세요"},"finish_reason":"stop"}]}"#;
        assert!(buffer
            .push(trailing_line.as_bytes())
            .expect("trailing line should remain buffered")
            .is_empty());
        assert_eq!(
            buffer.finish().expect("EOF should flush trailing line"),
            vec![trailing_line.to_string()]
        );
    }

    #[test]
    fn sse_line_buffer_rejects_invalid_utf8_after_complete_line() {
        let mut buffer = SseLineBuffer::default();
        let error = buffer
            .push(b"data: \xff\n")
            .expect_err("invalid UTF-8 should fail once the line is complete");

        assert!(error.to_string().contains("invalid UTF-8"));
    }

    #[test]
    fn probe_uses_models_endpoint_and_authorization_header() {
        let (endpoint, server) = spawn_probe_server("200 OK", r#"{"data":[{"id":"gemma4-e2b"}]}"#);
        let config = MtpConfig::from_values(
            endpoint,
            Some("gemma4-e2b".to_string()),
            None,
            Some(LocalAiRuntimeKind::LitertLm),
            Some("test-key".to_string()),
        )
        .expect("probe config should be valid");

        tauri::async_runtime::block_on(probe_mtp_endpoint(&config))
            .expect("successful models response should pass the probe");
        let request = server.join().expect("probe server should finish");
        let lowercase_request = request.to_ascii_lowercase();

        assert!(request.starts_with("GET /v1/models HTTP/1.1\r\n"));
        assert!(lowercase_request.contains("authorization: bearer test-key\r\n"));
    }

    #[test]
    fn probe_rejects_server_without_the_configured_model() {
        let (endpoint, server) =
            spawn_probe_server("200 OK", r#"{"data":[{"id":"another-model"}]}"#);
        let config = MtpConfig::from_values(
            endpoint,
            Some("gemma4-e2b".to_string()),
            None,
            Some(LocalAiRuntimeKind::LitertLm),
            None,
        )
        .expect("probe config should be valid");

        let error = tauri::async_runtime::block_on(probe_mtp_endpoint(&config))
            .expect_err("a missing configured model must not be reported ready");
        server.join().expect("probe server should finish");

        assert!(error.to_string().contains("gemma4-e2b"));
        assert!(error.to_string().contains("not registered"));
    }

    #[test]
    fn probe_rejects_non_success_status() {
        let (endpoint, server) = spawn_probe_server("503 Service Unavailable", "model loading");
        let config = MtpConfig::from_values(
            endpoint,
            Some("gemma4-e2b".to_string()),
            None,
            Some(LocalAiRuntimeKind::LitertLm),
            None,
        )
        .expect("probe config should be valid");

        let error = tauri::async_runtime::block_on(probe_mtp_endpoint(&config))
            .expect_err("non-success models response should fail the probe");
        let request = server.join().expect("probe server should finish");

        assert!(request.starts_with("GET /v1/models HTTP/1.1\r\n"));
        assert!(error.to_string().contains("503 Service Unavailable"));
        assert!(error.to_string().contains("model loading"));
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
            Some(LocalAiRuntimeKind::LlamaCpp),
            None,
        )
        .expect("loopback config should be accepted");

        assert_eq!(config.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
        assert_eq!(config.model, "local-gemma");
        assert_eq!(config.draft_model.as_deref(), Some("draft"));
        assert_eq!(config.runtime_kind, LocalAiRuntimeKind::LlamaCpp);
    }

    #[test]
    fn server_config_normalizes_builtin_runtime_to_llama_cpp() {
        let config = MtpConfig::from_values(
            "http://127.0.0.1:8080/v1/chat/completions".to_string(),
            None,
            None,
            Some(LocalAiRuntimeKind::BuiltinCandle),
            None,
        )
        .expect("loopback config should be accepted");

        assert_eq!(config.runtime_kind, LocalAiRuntimeKind::LlamaCpp);
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
