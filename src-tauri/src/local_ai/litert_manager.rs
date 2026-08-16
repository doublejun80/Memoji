#[cfg(test)]
use super::litert_native::{build_native_prompt, stream_delta};
use super::{
    litert_native::NativeLiteRtEngine, LocalAiError, LocalAiGenerateRequest,
    LocalAiGenerateResponse, LocalAiGenerateStreamChunk, MtpConfig,
};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    env,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

const DEFAULT_MODEL_ID: &str = "gemma4-e2b";
const E2B_MODEL_FILE: &str = "gemma-4-E2B-it.litertlm";
const E4B_MODEL_FILE: &str = "gemma-4-E4B-it.litertlm";
const LEGACY_MODEL_FILE: &str = "model.litertlm";
const MAX_RESTART_ATTEMPTS: u8 = 3;

pub const MANAGED_TRANSPORT: &str = "in_process";
pub const LITERT_LM_VERSION: &str = "0.16.0";
pub const LITERT_C_API_VERSION: &str = "0.1.0";

#[derive(Debug, Clone)]
pub struct LiteRtManager {
    inner: Arc<LiteRtManagerInner>,
}

#[derive(Debug)]
struct LiteRtManagerInner {
    layouts: BTreeMap<String, NativeLayout>,
    state: Mutex<LiteRtRuntimeState>,
    log_path: PathBuf,
    cache_dir: PathBuf,
}

#[derive(Debug)]
struct LiteRtRuntimeState {
    engine: Option<NativeLiteRtEngine>,
    active_model_id: Option<String>,
    last_error: Option<String>,
    restart_policy: RestartPolicy,
}

#[derive(Debug, Clone)]
struct NativeLayout {
    root: PathBuf,
    library_path: PathBuf,
    model_path: PathBuf,
    source: String,
    bundled: bool,
    transport: &'static str,
}

#[derive(Debug, Clone)]
struct RestartPolicy {
    attempts: u8,
    max_attempts: u8,
}

impl RestartPolicy {
    fn new(max_attempts: u8) -> Self {
        Self {
            attempts: 0,
            max_attempts: max_attempts.max(1),
        }
    }

    fn can_attempt(&self) -> bool {
        self.attempts < self.max_attempts
    }

    fn record_failure_and_should_retry(&mut self) -> bool {
        if self.attempts < self.max_attempts {
            self.attempts += 1;
        }
        self.can_attempt()
    }

    fn record_success(&mut self) {
        self.attempts = 0;
    }

    fn attempts(&self) -> u8 {
        self.attempts
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiteRtManagedStatus {
    pub available: bool,
    pub bundled: bool,
    pub model_available: bool,
    pub process_running: bool,
    pub endpoint_reachable: bool,
    pub source: Option<String>,
    pub registry_path: Option<String>,
    pub model_path: Option<String>,
    pub library_path: Option<String>,
    pub log_path: String,
    pub last_error: Option<String>,
    pub endpoint: Option<String>,
    pub port: Option<u16>,
    pub process_id: Option<u32>,
    pub session_isolated: bool,
    pub auth_configured: bool,
    pub auth_enforced: bool,
    pub auth_applicable: bool,
    pub external_request_surface: bool,
    pub transport: String,
    pub runtime_version: String,
    pub c_api_version: String,
    pub active_model_id: Option<String>,
    pub available_model_ids: Vec<String>,
    pub backend: Option<String>,
    pub threads: Option<usize>,
    pub restart_attempts: u8,
    pub restart_limit: u8,
}

impl LiteRtManager {
    pub fn discover(resource_dir: &Path, data_dir: &Path) -> Self {
        let mut layouts = BTreeMap::new();
        for root in bundle_root_candidates(resource_dir) {
            for model_id in ["gemma4-e2b", "gemma4-e4b"] {
                if layouts.contains_key(model_id) {
                    continue;
                }
                if let Some(layout) = discover_native_layout(&root, model_id) {
                    layouts.insert(model_id.to_string(), layout);
                }
            }
        }

        Self {
            inner: Arc::new(LiteRtManagerInner {
                layouts,
                state: Mutex::new(LiteRtRuntimeState {
                    engine: None,
                    active_model_id: None,
                    last_error: None,
                    restart_policy: RestartPolicy::new(MAX_RESTART_ATTEMPTS),
                }),
                log_path: data_dir.join("logs").join("litert-lm-native.log"),
                cache_dir: data_dir.join("cache").join("litert-lm"),
            }),
        }
    }

    pub fn ensure_started(&self) -> Result<bool, String> {
        self.ensure_started_for(DEFAULT_MODEL_ID)
    }

    pub fn ensure_started_for(&self, model_id: &str) -> Result<bool, String> {
        let layout = self.inner.layouts.get(model_id).cloned().ok_or_else(|| {
            format!("VDI용 LiteRT-LM 0.16 C API 또는 {model_id} 모델을 찾지 못했습니다.")
        })?;
        std::fs::create_dir_all(&self.inner.cache_dir)
            .map_err(|error| format!("LiteRT-LM 캐시 폴더 생성 실패: {error}"))?;

        let mut state = self.inner.state.lock().map_err(|error| error.to_string())?;
        if state.engine.is_some() && state.active_model_id.as_deref() == Some(model_id) {
            return Ok(false);
        }
        if !state.restart_policy.can_attempt() {
            return Err(format!(
                "LiteRT-LM 엔진 재초기화 제한({})에 도달했습니다. 앱을 다시 시작하거나 진단 ZIP을 확인하세요.",
                state.restart_policy.max_attempts
            ));
        }

        state.engine = None;
        state.active_model_id = None;
        match NativeLiteRtEngine::load(
            layout.library_path.clone(),
            layout.model_path.clone(),
            &self.inner.cache_dir,
        ) {
            Ok(engine) => {
                log::info!(
                    "Loaded LiteRT-LM {} C API {} in-process: model={}, backend={}, threads={}",
                    LITERT_LM_VERSION,
                    LITERT_C_API_VERSION,
                    model_id,
                    engine.backend,
                    engine.threads
                );
                state.engine = Some(engine);
                state.active_model_id = Some(model_id.to_string());
                state.last_error = None;
                state.restart_policy.record_success();
                Ok(true)
            }
            Err(error) => {
                let retry = state.restart_policy.record_failure_and_should_retry();
                let message = format!(
                    "LiteRT-LM native engine 시작 실패 ({}/{}{}): {error}",
                    state.restart_policy.attempts(),
                    state.restart_policy.max_attempts,
                    if retry {
                        ", 재시도 가능"
                    } else {
                        ", 재시도 중지"
                    }
                );
                state.last_error = Some(message.clone());
                Err(message)
            }
        }
    }

    pub fn supports_model(&self, model_id: &str) -> bool {
        self.inner.layouts.contains_key(model_id)
    }

    pub fn generate_stream<F>(
        &self,
        model_id: &str,
        request_id: String,
        request: LocalAiGenerateRequest,
        cancellation: CancellationToken,
        on_chunk: F,
    ) -> Result<LocalAiGenerateResponse, LocalAiError>
    where
        F: FnMut(LocalAiGenerateStreamChunk) -> Result<(), LocalAiError>,
    {
        self.ensure_started_for(model_id)
            .map_err(LocalAiError::LoadFailed)?;
        let mut state = self
            .inner
            .state
            .lock()
            .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;
        let engine = state.engine.as_mut().ok_or(LocalAiError::ModelNotLoaded)?;
        let result = engine.generate_stream(request_id, request, cancellation, on_chunk);
        if let Err(error) = &result {
            if !matches!(error, LocalAiError::Cancelled) {
                state.last_error = Some(error.to_string());
                state.engine = None;
                state.active_model_id = None;
                state.restart_policy.record_failure_and_should_retry();
            }
        }
        result
    }

    pub fn status(&self) -> LiteRtManagedStatus {
        let active_model = self
            .inner
            .state
            .lock()
            .ok()
            .and_then(|state| state.active_model_id.clone());
        let preferred_layout = active_model
            .as_deref()
            .and_then(|model_id| self.inner.layouts.get(model_id).cloned())
            .or_else(|| self.inner.layouts.get(DEFAULT_MODEL_ID).cloned())
            .or_else(|| self.inner.layouts.values().next().cloned());

        let (process_running, last_error, backend, threads, restart_attempts) =
            match self.inner.state.lock() {
                Ok(state) => (
                    state.engine.is_some(),
                    state.last_error.clone(),
                    state.engine.as_ref().map(|engine| engine.backend.clone()),
                    state.engine.as_ref().map(|engine| engine.threads),
                    state.restart_policy.attempts(),
                ),
                Err(error) => (false, Some(error.to_string()), None, None, 0),
            };

        LiteRtManagedStatus {
            available: !self.inner.layouts.is_empty(),
            bundled: preferred_layout
                .as_ref()
                .is_some_and(|layout| layout.bundled),
            model_available: preferred_layout
                .as_ref()
                .is_some_and(|layout| layout.model_path.is_file()),
            process_running,
            endpoint_reachable: process_running,
            source: preferred_layout
                .as_ref()
                .map(|layout| layout.source.clone()),
            registry_path: preferred_layout
                .as_ref()
                .map(|layout| layout.root.to_string_lossy().to_string()),
            model_path: preferred_layout
                .as_ref()
                .map(|layout| layout.model_path.to_string_lossy().to_string()),
            library_path: preferred_layout
                .as_ref()
                .map(|layout| layout.library_path.to_string_lossy().to_string()),
            log_path: self.inner.log_path.to_string_lossy().to_string(),
            last_error,
            endpoint: None,
            port: None,
            process_id: process_running.then(std::process::id),
            session_isolated: true,
            auth_configured: false,
            auth_enforced: false,
            auth_applicable: false,
            external_request_surface: false,
            transport: preferred_layout
                .as_ref()
                .map_or(MANAGED_TRANSPORT, |layout| layout.transport)
                .to_string(),
            runtime_version: LITERT_LM_VERSION.to_string(),
            c_api_version: LITERT_C_API_VERSION.to_string(),
            active_model_id: active_model,
            available_model_ids: self.inner.layouts.keys().cloned().collect(),
            backend,
            threads,
            restart_attempts,
            restart_limit: MAX_RESTART_ATTEMPTS,
        }
    }

    pub fn apply_session_config(&self, mut config: MtpConfig) -> MtpConfig {
        config.api_key = None;
        config
    }

    pub fn stop(&self) {
        let Ok(mut state) = self.inner.state.lock() else {
            return;
        };
        state.engine = None;
        state.active_model_id = None;
        log::info!("Stopped in-process LiteRT-LM engine");
    }
}

fn model_file_for(model_id: &str) -> Option<&'static str> {
    match model_id {
        "gemma4-e2b" => Some(E2B_MODEL_FILE),
        "gemma4-e4b" => Some(E4B_MODEL_FILE),
        _ => None,
    }
}

fn native_library_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "litert-lm.dll"
    } else if cfg!(target_os = "macos") {
        "liblitert-lm.dylib"
    } else {
        "liblitert-lm.so"
    }
}

fn discover_native_layout(root: &Path, model_id: &str) -> Option<NativeLayout> {
    let model_filename = model_file_for(model_id)?;
    let library_path = env::var_os("MEMOJI_LITERT_C_API")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            [
                root.join("runtime").join("lib").join(native_library_name()),
                root.join("lib").join(native_library_name()),
                root.join(native_library_name()),
            ]
            .into_iter()
            .find(|path| path.is_file())
        })?;

    let model_env = if model_id == "gemma4-e4b" {
        "MEMOJI_LITERT_MODEL_E4B"
    } else {
        "MEMOJI_LITERT_MODEL_E2B"
    };
    let model_path = env::var_os(model_env)
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            [
                root.join("models").join(model_id).join(model_filename),
                root.join("registry")
                    .join("models")
                    .join(model_id)
                    .join(LEGACY_MODEL_FILE),
            ]
            .into_iter()
            .find(|path| path.is_file())
        })?;

    Some(NativeLayout {
        root: root.to_path_buf(),
        library_path,
        model_path,
        source: root.to_string_lossy().to_string(),
        bundled: true,
        transport: MANAGED_TRANSPORT,
    })
}

fn bundle_root_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = env::var_os("MEMOJI_LITERT_BUNDLE_DIR") {
        roots.push(PathBuf::from(path));
    }
    roots.extend([
        resource_dir.join("ai"),
        resource_dir.join("litert-lm"),
        resource_dir.join("resources").join("litert-lm"),
    ]);
    if let Ok(executable) = env::current_exe() {
        if let Some(executable_dir) = executable.parent() {
            roots.push(executable_dir.join("ai"));
        }
    }
    if cfg!(debug_assertions) {
        if let Ok(cwd) = env::current_dir() {
            roots.extend([
                cwd.join("src-tauri").join("resources").join("litert-lm"),
                cwd.join("release").join("memoji-vdi").join("ai"),
            ]);
        }
    }
    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_runtime_uses_an_in_process_transport() {
        assert_eq!(MANAGED_TRANSPORT, "in_process");
        assert_eq!(LITERT_LM_VERSION, "0.16.0");
        assert_eq!(LITERT_C_API_VERSION, "0.1.0");
    }

    #[test]
    fn bounded_restart_policy_never_retries_forever() {
        let mut policy = RestartPolicy::new(3);
        assert!(policy.record_failure_and_should_retry());
        assert!(policy.record_failure_and_should_retry());
        assert!(!policy.record_failure_and_should_retry());
        assert!(!policy.record_failure_and_should_retry());
        assert_eq!(policy.attempts(), 3);
        policy.record_success();
        assert_eq!(policy.attempts(), 0);
        assert!(policy.record_failure_and_should_retry());
    }

    #[test]
    fn vdi_presets_keep_e2b_fast_and_e4b_quality_models_distinct() {
        assert_eq!(model_file_for("gemma4-e2b"), Some(E2B_MODEL_FILE));
        assert_eq!(model_file_for("gemma4-e4b"), Some(E4B_MODEL_FILE));
        assert_eq!(model_file_for("unknown"), None);
    }

    #[test]
    fn native_bundle_discovery_requires_both_c_api_and_selected_model() {
        let root = std::env::temp_dir().join(format!(
            "memoji-litert-native-contract-{}",
            std::process::id()
        ));
        let library = root.join("runtime").join("lib").join(native_library_name());
        let model = root.join("models").join("gemma4-e2b").join(E2B_MODEL_FILE);
        std::fs::create_dir_all(library.parent().expect("library parent")).unwrap();
        std::fs::create_dir_all(model.parent().expect("model parent")).unwrap();
        std::fs::write(&library, b"native-c-api").unwrap();
        assert!(discover_native_layout(&root, "gemma4-e2b").is_none());
        std::fs::write(&model, b"gemma4").unwrap();
        let layout = discover_native_layout(&root, "gemma4-e2b").expect("native layout");
        assert_eq!(layout.library_path, library);
        assert_eq!(layout.model_path, model);
        assert_eq!(layout.transport, MANAGED_TRANSPORT);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn stream_delta_handles_both_incremental_and_cumulative_chunks() {
        assert_eq!(stream_delta("", "안녕"), "안녕");
        assert_eq!(stream_delta("안녕", "안녕하세요"), "하세요");
        assert_eq!(stream_delta("안녕하세요", " 다음 문장"), " 다음 문장");
    }

    #[test]
    fn vdi_prompt_keeps_page_context_separate_from_the_user_request() {
        let prompt = build_native_prompt("요약해줘", Some("# 회의\n결정: 출시"));
        assert!(prompt.contains("참고 문서"));
        assert!(prompt.contains("# 회의"));
        assert!(prompt.ends_with("사용자 요청:\n요약해줘"));
    }

    #[test]
    fn managed_status_never_exposes_a_loopback_endpoint() {
        let root = std::env::temp_dir().join(format!(
            "memoji-litert-native-status-{}",
            std::process::id()
        ));
        let manager = LiteRtManager::discover(Path::new("missing"), &root);
        let status = manager.status();
        assert_eq!(status.transport, MANAGED_TRANSPORT);
        assert!(status.endpoint.is_none());
        assert!(status.port.is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bundle_candidates_include_resource_and_executable_locations() {
        let candidates = bundle_root_candidates(Path::new("resource-root"));
        assert!(candidates.contains(&Path::new("resource-root").join("ai")));
        assert!(candidates.contains(&Path::new("resource-root").join("litert-lm")));
    }
}
