use super::{
    LocalAiError, LocalAiGenerateRequest, LocalAiGenerateResponse, LocalAiGenerateStreamChunk,
};
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    path::{Path, PathBuf},
    ptr,
    sync::mpsc::{self, RecvTimeoutError, Sender},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

const SAMPLER_TYPE_TOP_P: c_int = 2;
const LITERT_E2B_MAX_TOKENS: c_int = 4096;
const LITERT_DEFAULT_OUTPUT_TOKENS: usize = 1024;
const CALLBACK_POLL_INTERVAL: Duration = Duration::from_millis(40);
const CANCELLATION_DRAIN_TIMEOUT: Duration = Duration::from_secs(5);

type Opaque = *mut c_void;
type ConstOpaque = *const c_void;
type StreamCallback = unsafe extern "C" fn(*mut c_void, ConstOpaque);

type EngineSettingsCreate =
    unsafe extern "C" fn(*const c_char, *const c_char, *const c_char, *const c_char) -> Opaque;
type EngineSettingsDelete = unsafe extern "C" fn(Opaque);
type EngineSettingsSetInt = unsafe extern "C" fn(Opaque, c_int);
type EngineSettingsSetBool = unsafe extern "C" fn(Opaque, bool);
type EngineSettingsSetString = unsafe extern "C" fn(Opaque, *const c_char);
type EngineCreate = unsafe extern "C" fn(ConstOpaque) -> Opaque;
type EngineDelete = unsafe extern "C" fn(Opaque);
type SamplerCreate = unsafe extern "C" fn(c_int) -> Opaque;
type SamplerDelete = unsafe extern "C" fn(Opaque);
type SamplerSetInt = unsafe extern "C" fn(Opaque, c_int);
type SamplerSetFloat = unsafe extern "C" fn(Opaque, f32);
type SessionConfigCreate = unsafe extern "C" fn() -> Opaque;
type SessionConfigDelete = unsafe extern "C" fn(Opaque);
type SessionConfigSetInt = unsafe extern "C" fn(Opaque, c_int);
type SessionConfigSetBool = unsafe extern "C" fn(Opaque, bool);
type SessionConfigSetSampler = unsafe extern "C" fn(Opaque, ConstOpaque);
type ConversationConfigCreate = unsafe extern "C" fn() -> Opaque;
type ConversationConfigDelete = unsafe extern "C" fn(Opaque);
type ConversationConfigSetSessionConfig = unsafe extern "C" fn(Opaque, ConstOpaque);
type ConversationCreate = unsafe extern "C" fn(Opaque, Opaque) -> Opaque;
type ConversationDelete = unsafe extern "C" fn(Opaque);
type ConversationCancel = unsafe extern "C" fn(Opaque);
type ConversationOptionalArgsCreate = unsafe extern "C" fn() -> Opaque;
type ConversationOptionalArgsDelete = unsafe extern "C" fn(Opaque);
type ConversationOptionalArgsSetInt = unsafe extern "C" fn(Opaque, c_int);
type ConversationSendMessageStream = unsafe extern "C" fn(
    Opaque,
    *const c_char,
    *const c_char,
    ConstOpaque,
    StreamCallback,
    Opaque,
) -> c_int;
type StreamChunkGetString = unsafe extern "C" fn(ConstOpaque) -> *const c_char;
type StreamChunkIsFinal = unsafe extern "C" fn(ConstOpaque) -> bool;

fn normalized_max_output_tokens(requested: Option<usize>) -> c_int {
    requested
        .unwrap_or(LITERT_DEFAULT_OUTPUT_TOKENS)
        .clamp(1, LITERT_E2B_MAX_TOKENS as usize) as c_int
}

struct LiteRtApi {
    _library: Library,
    engine_settings_create: EngineSettingsCreate,
    engine_settings_delete: EngineSettingsDelete,
    engine_settings_set_max_num_tokens: EngineSettingsSetInt,
    engine_settings_set_num_threads: EngineSettingsSetInt,
    engine_settings_set_parallel_file_section_loading: EngineSettingsSetBool,
    engine_settings_set_cache_dir: EngineSettingsSetString,
    engine_settings_set_prefill_chunk_size: EngineSettingsSetInt,
    engine_settings_set_enable_speculative_decoding: EngineSettingsSetBool,
    engine_create: EngineCreate,
    engine_delete: EngineDelete,
    sampler_create: SamplerCreate,
    sampler_delete: SamplerDelete,
    sampler_set_top_k: SamplerSetInt,
    sampler_set_top_p: SamplerSetFloat,
    sampler_set_temperature: SamplerSetFloat,
    sampler_set_seed: SamplerSetInt,
    session_config_create: SessionConfigCreate,
    session_config_delete: SessionConfigDelete,
    session_config_set_max_output_tokens: SessionConfigSetInt,
    session_config_set_apply_prompt_template: SessionConfigSetBool,
    session_config_set_sampler_params: SessionConfigSetSampler,
    conversation_config_create: ConversationConfigCreate,
    conversation_config_delete: ConversationConfigDelete,
    conversation_config_set_session_config: ConversationConfigSetSessionConfig,
    conversation_create: ConversationCreate,
    conversation_delete: ConversationDelete,
    conversation_cancel_process: ConversationCancel,
    conversation_optional_args_create: ConversationOptionalArgsCreate,
    conversation_optional_args_delete: ConversationOptionalArgsDelete,
    conversation_optional_args_set_max_output_tokens: ConversationOptionalArgsSetInt,
    conversation_send_message_stream: ConversationSendMessageStream,
    stream_chunk_get_text: StreamChunkGetString,
    stream_chunk_is_final: StreamChunkIsFinal,
    stream_chunk_get_error: StreamChunkGetString,
}

unsafe impl Send for LiteRtApi {}
unsafe impl Sync for LiteRtApi {}

impl LiteRtApi {
    unsafe fn load(path: &Path) -> Result<Self, LocalAiError> {
        let library = Library::new(path).map_err(|error| {
            LocalAiError::LoadFailed(format!(
                "LiteRT-LM C API를 열지 못했습니다 ({}): {error}",
                path.display()
            ))
        })?;

        macro_rules! symbol {
            ($name:literal, $ty:ty) => {{
                *library
                    .get::<$ty>(concat!($name, "\0").as_bytes())
                    .map_err(|error| {
                        LocalAiError::LoadFailed(format!(
                            "LiteRT-LM C API 심볼 {}을 찾지 못했습니다: {error}",
                            $name
                        ))
                    })?
            }};
        }

        Ok(Self {
            engine_settings_create: symbol!(
                "litert_lm_engine_settings_create",
                EngineSettingsCreate
            ),
            engine_settings_delete: symbol!(
                "litert_lm_engine_settings_delete",
                EngineSettingsDelete
            ),
            engine_settings_set_max_num_tokens: symbol!(
                "litert_lm_engine_settings_set_max_num_tokens",
                EngineSettingsSetInt
            ),
            engine_settings_set_num_threads: symbol!(
                "litert_lm_engine_settings_set_num_threads",
                EngineSettingsSetInt
            ),
            engine_settings_set_parallel_file_section_loading: symbol!(
                "litert_lm_engine_settings_set_parallel_file_section_loading",
                EngineSettingsSetBool
            ),
            engine_settings_set_cache_dir: symbol!(
                "litert_lm_engine_settings_set_cache_dir",
                EngineSettingsSetString
            ),
            engine_settings_set_prefill_chunk_size: symbol!(
                "litert_lm_engine_settings_set_prefill_chunk_size",
                EngineSettingsSetInt
            ),
            engine_settings_set_enable_speculative_decoding: symbol!(
                "litert_lm_engine_settings_set_enable_speculative_decoding",
                EngineSettingsSetBool
            ),
            engine_create: symbol!("litert_lm_engine_create", EngineCreate),
            engine_delete: symbol!("litert_lm_engine_delete", EngineDelete),
            sampler_create: symbol!("litert_lm_sampler_params_create", SamplerCreate),
            sampler_delete: symbol!("litert_lm_sampler_params_delete", SamplerDelete),
            sampler_set_top_k: symbol!("litert_lm_sampler_params_set_top_k", SamplerSetInt),
            sampler_set_top_p: symbol!("litert_lm_sampler_params_set_top_p", SamplerSetFloat),
            sampler_set_temperature: symbol!(
                "litert_lm_sampler_params_set_temperature",
                SamplerSetFloat
            ),
            sampler_set_seed: symbol!("litert_lm_sampler_params_set_seed", SamplerSetInt),
            session_config_create: symbol!("litert_lm_session_config_create", SessionConfigCreate),
            session_config_delete: symbol!("litert_lm_session_config_delete", SessionConfigDelete),
            session_config_set_max_output_tokens: symbol!(
                "litert_lm_session_config_set_max_output_tokens",
                SessionConfigSetInt
            ),
            session_config_set_apply_prompt_template: symbol!(
                "litert_lm_session_config_set_apply_prompt_template",
                SessionConfigSetBool
            ),
            session_config_set_sampler_params: symbol!(
                "litert_lm_session_config_set_sampler_params",
                SessionConfigSetSampler
            ),
            conversation_config_create: symbol!(
                "litert_lm_conversation_config_create",
                ConversationConfigCreate
            ),
            conversation_config_delete: symbol!(
                "litert_lm_conversation_config_delete",
                ConversationConfigDelete
            ),
            conversation_config_set_session_config: symbol!(
                "litert_lm_conversation_config_set_session_config",
                ConversationConfigSetSessionConfig
            ),
            conversation_create: symbol!("litert_lm_conversation_create", ConversationCreate),
            conversation_delete: symbol!("litert_lm_conversation_delete", ConversationDelete),
            conversation_cancel_process: symbol!(
                "litert_lm_conversation_cancel_process",
                ConversationCancel
            ),
            conversation_optional_args_create: symbol!(
                "litert_lm_conversation_optional_args_create",
                ConversationOptionalArgsCreate
            ),
            conversation_optional_args_delete: symbol!(
                "litert_lm_conversation_optional_args_delete",
                ConversationOptionalArgsDelete
            ),
            conversation_optional_args_set_max_output_tokens: symbol!(
                "litert_lm_conversation_optional_args_set_max_output_tokens",
                ConversationOptionalArgsSetInt
            ),
            conversation_send_message_stream: symbol!(
                "litert_lm_conversation_send_message_stream",
                ConversationSendMessageStream
            ),
            stream_chunk_get_text: symbol!("litert_lm_stream_chunk_get_text", StreamChunkGetString),
            stream_chunk_is_final: symbol!("litert_lm_stream_chunk_is_final", StreamChunkIsFinal),
            stream_chunk_get_error: symbol!(
                "litert_lm_stream_chunk_get_error",
                StreamChunkGetString
            ),
            _library: library,
        })
    }
}

pub(super) struct NativeLiteRtEngine {
    api: LiteRtApi,
    engine: Opaque,
    pub library_path: PathBuf,
    pub model_path: PathBuf,
    pub backend: String,
    pub threads: usize,
}

impl std::fmt::Debug for NativeLiteRtEngine {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NativeLiteRtEngine")
            .field("library_path", &self.library_path)
            .field("model_path", &self.model_path)
            .field("backend", &self.backend)
            .field("threads", &self.threads)
            .finish_non_exhaustive()
    }
}

unsafe impl Send for NativeLiteRtEngine {}

impl NativeLiteRtEngine {
    pub fn load(
        library_path: PathBuf,
        model_path: PathBuf,
        cache_dir: &Path,
    ) -> Result<Self, LocalAiError> {
        let api = unsafe { LiteRtApi::load(&library_path)? };
        let model = path_to_cstring(&model_path, "모델")?;
        let backend_name = std::env::var("MEMOJI_LITERT_BACKEND")
            .unwrap_or_else(|_| "cpu".to_string())
            .to_ascii_lowercase();
        let backend = CString::new(backend_name.as_str()).map_err(|_| {
            LocalAiError::LoadFailed("LiteRT backend 이름이 잘못되었습니다.".to_string())
        })?;
        let cache = path_to_cstring(cache_dir, "캐시")?;
        let threads = configured_thread_count();

        let settings = unsafe {
            (api.engine_settings_create)(model.as_ptr(), backend.as_ptr(), ptr::null(), ptr::null())
        };
        if settings.is_null() {
            return Err(LocalAiError::LoadFailed(
                "LiteRT-LM engine settings 생성에 실패했습니다.".to_string(),
            ));
        }

        unsafe {
            (api.engine_settings_set_max_num_tokens)(settings, LITERT_E2B_MAX_TOKENS);
            (api.engine_settings_set_num_threads)(settings, threads as c_int);
            (api.engine_settings_set_parallel_file_section_loading)(settings, true);
            (api.engine_settings_set_cache_dir)(settings, cache.as_ptr());
            (api.engine_settings_set_prefill_chunk_size)(settings, 256);
            (api.engine_settings_set_enable_speculative_decoding)(settings, true);
        }
        let engine = unsafe { (api.engine_create)(settings) };
        unsafe { (api.engine_settings_delete)(settings) };
        if engine.is_null() {
            return Err(LocalAiError::LoadFailed(format!(
                "Gemma 4 엔진을 로드하지 못했습니다: {}",
                model_path.display()
            )));
        }

        Ok(Self {
            api,
            engine,
            library_path,
            model_path,
            backend: backend_name,
            threads,
        })
    }

    pub fn generate_stream<F>(
        &mut self,
        request_id: String,
        request: LocalAiGenerateRequest,
        cancellation: CancellationToken,
        mut on_chunk: F,
    ) -> Result<LocalAiGenerateResponse, LocalAiError>
    where
        F: FnMut(LocalAiGenerateStreamChunk) -> Result<(), LocalAiError>,
    {
        if cancellation.is_cancelled() {
            return Err(LocalAiError::Cancelled);
        }

        let max_output_tokens = normalized_max_output_tokens(request.max_new_tokens);
        let temperature = request.temperature.unwrap_or(0.4).clamp(0.0, 2.0);
        let top_p = request.top_p.unwrap_or(0.95).clamp(0.01, 1.0);
        // LiteRT-LM 0.16 exposes the Greedy enum in the C header, but the
        // released native runtime returns UNIMPLEMENTED for that sampler.
        // Top-P accepts temperature 0 and gives us the deterministic path.
        let sampler = unsafe { (self.api.sampler_create)(SAMPLER_TYPE_TOP_P) };
        if sampler.is_null() {
            return Err(LocalAiError::GenerateFailed(
                "LiteRT-LM sampler 생성에 실패했습니다.".to_string(),
            ));
        }
        unsafe {
            (self.api.sampler_set_top_k)(sampler, 40);
            (self.api.sampler_set_top_p)(sampler, top_p);
            (self.api.sampler_set_temperature)(sampler, temperature);
            (self.api.sampler_set_seed)(sampler, 42);
        }

        let session_config = unsafe { (self.api.session_config_create)() };
        if session_config.is_null() {
            unsafe { (self.api.sampler_delete)(sampler) };
            return Err(LocalAiError::GenerateFailed(
                "LiteRT-LM session config 생성에 실패했습니다.".to_string(),
            ));
        }
        unsafe {
            (self.api.session_config_set_max_output_tokens)(session_config, max_output_tokens);
            (self.api.session_config_set_apply_prompt_template)(session_config, true);
            (self.api.session_config_set_sampler_params)(session_config, sampler);
        }
        let conversation_config = unsafe { (self.api.conversation_config_create)() };
        if conversation_config.is_null() {
            unsafe {
                (self.api.session_config_delete)(session_config);
                (self.api.sampler_delete)(sampler);
            }
            return Err(LocalAiError::GenerateFailed(
                "LiteRT-LM conversation config 생성에 실패했습니다.".to_string(),
            ));
        }
        unsafe {
            (self.api.conversation_config_set_session_config)(conversation_config, session_config);
        }
        let conversation =
            unsafe { (self.api.conversation_create)(self.engine, conversation_config) };
        unsafe {
            (self.api.conversation_config_delete)(conversation_config);
            (self.api.session_config_delete)(session_config);
            (self.api.sampler_delete)(sampler);
        }
        if conversation.is_null() {
            return Err(LocalAiError::GenerateFailed(
                "LiteRT-LM conversation 생성에 실패했습니다.".to_string(),
            ));
        }

        let prompt = build_native_prompt(&request.prompt, request.page_context.as_deref());
        let message = CString::new(
            serde_json::json!({
                "role": "user",
                "content": [{ "type": "text", "text": prompt }]
            })
            .to_string(),
        )
        .map_err(|_| LocalAiError::GenerateFailed("AI 요청 JSON 생성 실패".to_string()))?;
        let optional_args = unsafe { (self.api.conversation_optional_args_create)() };
        if optional_args.is_null() {
            unsafe { (self.api.conversation_delete)(conversation) };
            return Err(LocalAiError::GenerateFailed(
                "LiteRT-LM conversation 옵션 생성에 실패했습니다.".to_string(),
            ));
        }
        unsafe {
            (self.api.conversation_optional_args_set_max_output_tokens)(
                optional_args,
                max_output_tokens,
            );
        }

        let (sender, receiver) = mpsc::channel();
        let bridge = Box::new(CallbackBridge {
            sender,
            get_text: self.api.stream_chunk_get_text,
            is_final: self.api.stream_chunk_is_final,
            get_error: self.api.stream_chunk_get_error,
        });
        let bridge_ptr = Box::into_raw(bridge);
        let start_result = unsafe {
            (self.api.conversation_send_message_stream)(
                conversation,
                message.as_ptr(),
                ptr::null(),
                optional_args,
                native_stream_callback,
                bridge_ptr.cast(),
            )
        };
        unsafe { (self.api.conversation_optional_args_delete)(optional_args) };
        if start_result != 0 {
            unsafe {
                (self.api.conversation_delete)(conversation);
                drop(Box::from_raw(bridge_ptr));
            }
            return Err(LocalAiError::GenerateFailed(format!(
                "LiteRT-LM stream 시작 실패: code {start_result}"
            )));
        }

        let started = Instant::now();
        let mut cancellation_started = None;
        let mut generated_text = String::new();
        let mut generated_chunks = 0usize;
        let result = loop {
            if cancellation.is_cancelled() && cancellation_started.is_none() {
                unsafe { (self.api.conversation_cancel_process)(conversation) };
                cancellation_started = Some(Instant::now());
            }
            if cancellation_started.is_some_and(|time| time.elapsed() > CANCELLATION_DRAIN_TIMEOUT)
            {
                break Err(LocalAiError::Cancelled);
            }

            match receiver.recv_timeout(CALLBACK_POLL_INTERVAL) {
                Ok(NativeStreamEvent::Text(chunk_text)) => {
                    if let Err(error) = apply_stream_text(
                        &request_id,
                        &mut generated_text,
                        &mut generated_chunks,
                        &chunk_text,
                        &mut on_chunk,
                    ) {
                        unsafe { (self.api.conversation_cancel_process)(conversation) };
                        break Err(error);
                    }
                }
                Ok(NativeStreamEvent::Error(error)) => {
                    if error.contains("Max number of tokens reached") && !generated_text.is_empty()
                    {
                        break Ok(LocalAiGenerateResponse {
                            text: generated_text,
                            prompt_tokens: 0,
                            generated_tokens: generated_chunks,
                            finish_reason: "length".to_string(),
                        });
                    }
                    if error.contains("CANCELLED") {
                        break Err(LocalAiError::Cancelled);
                    }
                    break Err(LocalAiError::GenerateFailed(error));
                }
                Ok(NativeStreamEvent::Final) => {
                    if cancellation.is_cancelled() {
                        break Err(LocalAiError::Cancelled);
                    }
                    break Ok(LocalAiGenerateResponse {
                        text: generated_text,
                        prompt_tokens: 0,
                        generated_tokens: generated_chunks,
                        finish_reason: "stop".to_string(),
                    });
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    break Err(LocalAiError::GenerateFailed(format!(
                        "LiteRT-LM callback channel ended after {} ms",
                        started.elapsed().as_millis()
                    )));
                }
            }
        };

        // The native conversation owns the asynchronous callback lifetime. Delete it first so
        // the runtime has finished/cancelled callback delivery before callback_data is released.
        unsafe {
            (self.api.conversation_delete)(conversation);
            drop(Box::from_raw(bridge_ptr));
        }
        result
    }
}

impl Drop for NativeLiteRtEngine {
    fn drop(&mut self) {
        if !self.engine.is_null() {
            unsafe { (self.api.engine_delete)(self.engine) };
            self.engine = ptr::null_mut();
        }
    }
}

struct CallbackBridge {
    sender: Sender<NativeStreamEvent>,
    get_text: StreamChunkGetString,
    is_final: StreamChunkIsFinal,
    get_error: StreamChunkGetString,
}

enum NativeStreamEvent {
    Text(String),
    Error(String),
    Final,
}

unsafe extern "C" fn native_stream_callback(callback_data: Opaque, chunk: ConstOpaque) {
    if callback_data.is_null() || chunk.is_null() {
        return;
    }
    let bridge = &*(callback_data as *const CallbackBridge);
    let error = (bridge.get_error)(chunk);
    if !error.is_null() {
        let _ = bridge.sender.send(NativeStreamEvent::Error(
            CStr::from_ptr(error).to_string_lossy().into_owned(),
        ));
    }
    let text = (bridge.get_text)(chunk);
    if !text.is_null() {
        let text = CStr::from_ptr(text).to_string_lossy().into_owned();
        if !text.is_empty() {
            let _ = bridge.sender.send(NativeStreamEvent::Text(text));
        }
    }
    if (bridge.is_final)(chunk) {
        let _ = bridge.sender.send(NativeStreamEvent::Final);
    }
}

fn path_to_cstring(path: &Path, label: &str) -> Result<CString, LocalAiError> {
    CString::new(path.to_string_lossy().as_bytes()).map_err(|_| {
        LocalAiError::LoadFailed(format!(
            "LiteRT {label} 경로에 NUL 문자가 포함되어 있습니다."
        ))
    })
}

fn configured_thread_count() -> usize {
    let available = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(2);
    std::env::var("MEMOJI_LITERT_THREADS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or_else(|| available.min(4))
        .clamp(1, 8)
}

pub(super) fn build_native_prompt(prompt: &str, page_context: Option<&str>) -> String {
    match page_context.map(str::trim).filter(|value| !value.is_empty()) {
        Some(context) => format!(
            "다음 참고 문서는 VDI 내부의 로컬 데이터입니다. 문서에 없는 사실을 만들지 말고 한국어 Markdown으로 답하세요.\n\n참고 문서:\n{context}\n\n사용자 요청:\n{}",
            prompt.trim()
        ),
        None => prompt.trim().to_string(),
    }
}

pub(super) fn stream_delta(previous: &str, chunk: &str) -> String {
    chunk.strip_prefix(previous).unwrap_or(chunk).to_string()
}

fn conversation_chunk_text(chunk: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(chunk) else {
        return chunk.to_string();
    };
    match value.get("content") {
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                (item.get("type").and_then(serde_json::Value::as_str) == Some("text"))
                    .then(|| item.get("text").and_then(serde_json::Value::as_str))
                    .flatten()
            })
            .collect(),
        _ => String::new(),
    }
}

fn apply_stream_text<F>(
    request_id: &str,
    generated_text: &mut String,
    generated_chunks: &mut usize,
    chunk_text: &str,
    mut on_chunk: F,
) -> Result<(), LocalAiError>
where
    F: FnMut(LocalAiGenerateStreamChunk) -> Result<(), LocalAiError>,
{
    let response_text = conversation_chunk_text(chunk_text);
    let delta = stream_delta(generated_text, &response_text);
    if delta.is_empty() {
        return Ok(());
    }
    generated_text.push_str(&delta);
    *generated_chunks += 1;
    on_chunk(LocalAiGenerateStreamChunk {
        request_id: request_id.to_string(),
        token_text: delta,
        generated_tokens: *generated_chunks,
        done: false,
        finish_reason: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn e2b_output_budget_uses_the_full_supported_context_limit() {
        assert_eq!(LITERT_E2B_MAX_TOKENS, 4096);
        assert_eq!(normalized_max_output_tokens(None), 1024);
        assert_eq!(normalized_max_output_tokens(Some(2048)), 2048);
        assert_eq!(normalized_max_output_tokens(Some(9000)), 4096);
    }

    #[test]
    fn stream_consumer_error_is_returned_to_the_loop_without_losing_state() {
        let mut generated = String::from("안녕");
        let mut chunks = 1;
        let error = apply_stream_text(
            "request-1",
            &mut generated,
            &mut chunks,
            "안녕하세요",
            |_| Err(LocalAiError::GenerateFailed("window closed".to_string())),
        )
        .expect_err("consumer failure must be handled by the stream loop");

        assert!(error.to_string().contains("window closed"));
        assert_eq!(generated, "안녕하세요");
        assert_eq!(chunks, 2);
    }

    #[test]
    #[ignore = "requires the downloaded official LiteRT-LM C API and Gemma 4 model"]
    fn official_e2b_bundle_streams_real_tokens_in_process() {
        let library_path = PathBuf::from(
            std::env::var_os("MEMOJI_LITERT_C_API_TEST_LIBRARY")
                .expect("set MEMOJI_LITERT_C_API_TEST_LIBRARY"),
        );
        let model_path = PathBuf::from(
            std::env::var_os("MEMOJI_LITERT_C_API_TEST_MODEL")
                .expect("set MEMOJI_LITERT_C_API_TEST_MODEL"),
        );
        let cache_dir = std::env::temp_dir().join("memoji-litert-native-test-cache");
        std::fs::create_dir_all(&cache_dir).expect("create test cache");

        let mut engine = NativeLiteRtEngine::load(library_path, model_path, &cache_dir)
            .expect("load official native bundle");
        let mut streamed = String::new();
        let response = engine
            .generate_stream(
                "native-smoke".to_string(),
                LocalAiGenerateRequest {
                    prompt: "Reply with one friendly greeting.".to_string(),
                    page_context: None,
                    max_new_tokens: Some(32),
                    temperature: Some(0.4),
                    top_p: Some(0.95),
                },
                CancellationToken::new(),
                |chunk| {
                    streamed.push_str(&chunk.token_text);
                    Ok(())
                },
            )
            .expect("generate real tokens");

        eprintln!(
            "LiteRT-LM native smoke: text={:?}, chunks={}",
            response.text, response.generated_tokens
        );
        assert!(!response.text.trim().is_empty());
        assert_eq!(response.text, streamed);
        assert!(response.generated_tokens > 0);
    }
}
