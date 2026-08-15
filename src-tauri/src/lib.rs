mod commands;
mod database;
mod db;
mod domain;
mod indexing;
mod local_ai;
mod search;
mod services;

use commands::pages::{
    get_page_body, list_page_revisions, list_page_summaries, restore_page, restore_page_revision,
    save_page_v2, trash_page,
};
use commands::search::{get_page_anchors, get_page_links, search_workspace};
use database::{build_page_export_entries, Database, ImportDatabaseSummary, Page};
use local_ai::{
    cancellation_checkpoint, ActiveRequestRegistry, LiteRtManagedStatus, LiteRtManager,
    LocalAiBenchmarkResult, LocalAiConfig, LocalAiGenerateRequest, LocalAiGenerateResponse,
    LocalAiGenerateStreamChunk, LocalAiRuntimeKind, LocalAiState, LocalAiStatus, MtpConfig,
    DEFAULT_MTP_MODEL,
};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window};
use tokio_util::sync::CancellationToken;
use zip::write::SimpleFileOptions;

struct AppState {
    db: Mutex<Database>,
    local_ai: LocalAiState,
    active_ai_requests: ActiveRequestRegistry,
    litert_manager: LiteRtManager,
    /// 시작할 때 결정한 경로를 모든 명령이 공유해야 일시적인 권한/네트워크
    /// 변화로 열린 DB와 가져오기·내보내기 경로가 갈라지지 않는다.
    data_dir: PathBuf,
}

const LOCAL_AI_RUNTIME_CONFIG_KEY: &str = "local_ai_runtime_config";
const DEFAULT_LITERT_LM_ENDPOINT: &str = "http://127.0.0.1:9379/v1/chat/completions";
const DEFAULT_LITERT_LM_MODEL: &str = "gemma4-e2b";
const LEGACY_LITERT_LM_MODEL: &str = "gemma-4-E2B-it-litert-lm";
// 2.0 초기 LiteRT-LM preset의 오타성 기본값. 사용자가 별도로 고른 endpoint는
// 건드리지 않고, 이 정확한 이전 기본값만 현재 LiteRT-LM 기본 포트로 옮긴다.
const LEGACY_LITERT_LM_ENDPOINT: &str = "http://127.0.0.1:8081/v1/chat/completions";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiRuntimeConfig {
    server_enabled: bool,
    endpoint: String,
    model: String,
    draft_model: Option<String>,
    #[serde(default)]
    runtime_kind: LocalAiRuntimeKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiRuntimeConfigView {
    server_enabled: bool,
    endpoint: String,
    model: String,
    draft_model: Option<String>,
    runtime_kind: LocalAiRuntimeKind,
    env_configured: bool,
    env_takes_precedence: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiRuntimeTestResult {
    ok: bool,
    message: String,
    generated_tokens: usize,
    tokens_per_second: f64,
}

#[derive(Debug, Serialize)]
struct ImportDatabaseResult {
    imported: usize,
    duplicated: usize,
    skipped: usize,
    backup_path: String,
}

#[derive(Debug, Serialize)]
struct PagesZipExportResult {
    exported: usize,
    zip_path: String,
}

impl ImportDatabaseResult {
    fn from_summary(summary: ImportDatabaseSummary, backup_path: PathBuf) -> Self {
        Self {
            imported: summary.imported,
            duplicated: summary.duplicated,
            skipped: summary.skipped,
            backup_path: backup_path.to_string_lossy().to_string(),
        }
    }
}

impl Default for LocalAiRuntimeConfig {
    fn default() -> Self {
        Self {
            server_enabled: true,
            endpoint: DEFAULT_LITERT_LM_ENDPOINT.to_string(),
            model: DEFAULT_LITERT_LM_MODEL.to_string(),
            draft_model: None,
            runtime_kind: LocalAiRuntimeKind::LitertLm,
        }
    }
}

impl LocalAiRuntimeConfig {
    fn normalized_runtime_kind(&self) -> LocalAiRuntimeKind {
        if !self.server_enabled {
            return LocalAiRuntimeKind::BuiltinCandle;
        }

        match self.runtime_kind {
            LocalAiRuntimeKind::BuiltinCandle => LocalAiRuntimeKind::LlamaCpp,
            runtime_kind => runtime_kind,
        }
    }

    fn normalized_model(&self) -> String {
        let model = self.model.trim();
        if self.normalized_runtime_kind() == LocalAiRuntimeKind::LitertLm
            && (model.is_empty() || model == LEGACY_LITERT_LM_MODEL)
        {
            return DEFAULT_LITERT_LM_MODEL.to_string();
        }

        if model.is_empty() {
            return DEFAULT_MTP_MODEL.to_string();
        }

        model.to_string()
    }

    fn migrate_legacy_litert_endpoint(&mut self) -> bool {
        if self.normalized_runtime_kind() == LocalAiRuntimeKind::LitertLm
            && self.endpoint.trim() == LEGACY_LITERT_LM_ENDPOINT
        {
            self.endpoint = DEFAULT_LITERT_LM_ENDPOINT.to_string();
            return true;
        }

        false
    }

    fn to_mtp_config(&self) -> Result<Option<MtpConfig>, String> {
        if !self.server_enabled {
            return Ok(None);
        }

        MtpConfig::from_values(
            self.endpoint.clone(),
            Some(self.normalized_model()),
            self.draft_model.clone(),
            Some(self.normalized_runtime_kind()),
            None,
        )
        .map(Some)
    }

    fn into_view(self) -> LocalAiRuntimeConfigView {
        let env_configured = MtpConfig::from_env().is_some();
        let runtime_kind = self.normalized_runtime_kind();
        let model = self.normalized_model();
        LocalAiRuntimeConfigView {
            server_enabled: self.server_enabled,
            endpoint: self.endpoint,
            model,
            draft_model: self.draft_model,
            runtime_kind,
            env_configured,
            env_takes_precedence: env_configured,
        }
    }
}

fn read_runtime_config_from_db(db: &Database) -> Result<LocalAiRuntimeConfig, String> {
    let Some(raw_config) = db
        .get_setting(LOCAL_AI_RUNTIME_CONFIG_KEY)
        .map_err(|error| error.to_string())?
    else {
        return Ok(LocalAiRuntimeConfig::default());
    };

    match serde_json::from_str::<LocalAiRuntimeConfig>(&raw_config) {
        Ok(mut config) => {
            if config.migrate_legacy_litert_endpoint() {
                if let Err(error) = save_runtime_config_to_db(db, &config) {
                    log::warn!(
                        "LiteRT-LM endpoint migration will be retried next launch: {}",
                        error
                    );
                } else {
                    log::info!("Migrated LiteRT-LM endpoint from port 8081 to 9379");
                }
            }
            Ok(config)
        }
        Err(error) => {
            log::warn!(
                "AI runtime config is invalid; falling back to defaults: {}",
                error
            );
            Ok(LocalAiRuntimeConfig::default())
        }
    }
}

fn save_runtime_config_to_db(db: &Database, config: &LocalAiRuntimeConfig) -> Result<(), String> {
    let raw_config = serde_json::to_string(config)
        .map_err(|error| format!("Failed to serialize AI runtime config: {error}"))?;
    db.save_setting(LOCAL_AI_RUNTIME_CONFIG_KEY, &raw_config)
        .map_err(|error| error.to_string())
}

fn resolve_mtp_config(state: &State<AppState>) -> Result<Option<MtpConfig>, String> {
    if let Some(config) = MtpConfig::from_env_result()? {
        return Ok(Some(config));
    }

    let db = state.db.lock().map_err(|error| error.to_string())?;
    let config = read_runtime_config_from_db(&db)?;
    config.to_mtp_config()
}

fn should_manage_litert(config: &MtpConfig) -> bool {
    config.runtime_kind == LocalAiRuntimeKind::LitertLm
        && config.endpoint == DEFAULT_LITERT_LM_ENDPOINT
        && config.model == DEFAULT_LITERT_LM_MODEL
}

#[cfg(test)]
mod runtime_config_tests {
    use super::*;

    #[test]
    fn legacy_enabled_server_config_defaults_to_llama_cpp_runtime() {
        let config: LocalAiRuntimeConfig = serde_json::from_str(
            r#"{"serverEnabled":true,"endpoint":"http://127.0.0.1:8080/v1/chat/completions","model":"google/gemma-4-E2B-it","draftModel":null}"#,
        )
        .expect("legacy config should deserialize");

        let mtp_config = config
            .to_mtp_config()
            .expect("legacy config should be valid")
            .expect("server should be enabled");

        assert_eq!(mtp_config.runtime_kind, LocalAiRuntimeKind::LlamaCpp);
    }

    #[test]
    fn default_runtime_config_uses_litert_lm() {
        let config = LocalAiRuntimeConfig::default();
        let mtp_config = config
            .to_mtp_config()
            .expect("default LiteRT config should be valid")
            .expect("default runtime should be server-backed");

        assert_eq!(mtp_config.endpoint, DEFAULT_LITERT_LM_ENDPOINT);
        assert_eq!(mtp_config.model, DEFAULT_LITERT_LM_MODEL);
        assert_eq!(mtp_config.runtime_kind, LocalAiRuntimeKind::LitertLm);
    }

    #[test]
    fn disabled_server_config_reports_builtin_candle_runtime() {
        let config = LocalAiRuntimeConfig {
            server_enabled: false,
            endpoint: "http://127.0.0.1:8080/v1/chat/completions".to_string(),
            model: DEFAULT_MTP_MODEL.to_string(),
            draft_model: None,
            runtime_kind: LocalAiRuntimeKind::BuiltinCandle,
        };
        let view = config.into_view();

        assert!(!view.server_enabled);
        assert_eq!(view.runtime_kind, LocalAiRuntimeKind::BuiltinCandle);
    }

    #[test]
    fn legacy_litert_model_id_is_mapped_to_imported_local_model_ref() {
        let config = LocalAiRuntimeConfig {
            server_enabled: true,
            endpoint: DEFAULT_LITERT_LM_ENDPOINT.to_string(),
            model: LEGACY_LITERT_LM_MODEL.to_string(),
            draft_model: None,
            runtime_kind: LocalAiRuntimeKind::LitertLm,
        };

        let mtp_config = config
            .to_mtp_config()
            .expect("LiteRT config should be valid")
            .expect("server should be enabled");

        assert_eq!(mtp_config.model, DEFAULT_LITERT_LM_MODEL);
    }

    #[test]
    fn previous_litert_default_port_is_migrated() {
        let mut config = LocalAiRuntimeConfig {
            server_enabled: true,
            endpoint: LEGACY_LITERT_LM_ENDPOINT.to_string(),
            model: DEFAULT_LITERT_LM_MODEL.to_string(),
            draft_model: None,
            runtime_kind: LocalAiRuntimeKind::LitertLm,
        };

        assert!(config.migrate_legacy_litert_endpoint());
        assert_eq!(config.endpoint, DEFAULT_LITERT_LM_ENDPOINT);
    }
}

/// 데이터 저장 디렉토리 결정
/// MEMOJI_DATA_PATH가 있으면 최우선으로 사용한다.
/// 기본은 실행 파일 옆 data 폴더이지만, 설치 위치가 쓰기 불가하면 OS 로컬 데이터 폴더로 안전하게 물러난다.
fn get_data_directory() -> Result<PathBuf, String> {
    // 1. 환경 변수 확인 (고급 사용자용 - 선택사항)
    if let Ok(custom_path) = std::env::var("MEMOJI_DATA_PATH") {
        let path = PathBuf::from(custom_path);
        log::info!("Using custom data path: {:?}", path);
        return Ok(path);
    }

    // 2. 기본값: 실행 파일과 같은 폴더의 data 디렉토리
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;

    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;

    let portable_data_dir = exe_dir.join("data");
    if directory_is_writable(&portable_data_dir) {
        log::info!("Using portable data directory: {:?}", portable_data_dir);
        return Ok(portable_data_dir);
    }

    if let Some(local_data_dir) = dirs::data_local_dir() {
        let fallback_data_dir = local_data_dir.join("Memoji").join("data");
        log::warn!(
            "Portable data directory is not writable. Falling back to the OS-local data directory; verify that this path is persistent in your VDI profile: {:?}",
            fallback_data_dir
        );
        return Ok(fallback_data_dir);
    }

    Ok(portable_data_dir)
}

fn directory_is_writable(path: &Path) -> bool {
    if std::fs::create_dir_all(path).is_err() {
        return false;
    }

    let probe_path = path.join(".memoji-write-test");
    match std::fs::write(&probe_path, b"ok") {
        Ok(_) => {
            let _ = std::fs::remove_file(probe_path);
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn init_database(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.init().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_page(page: Page, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.save_page(&page).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_pages(state: State<AppState>) -> Result<Vec<Page>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_pages().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_page(page_id: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_page(&page_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_app_title(title: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.save_setting("app_title", &title)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_app_title(state: State<AppState>) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_setting("app_title").map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_data_dir(state: State<AppState>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

#[tauri::command]
fn get_data_path(state: State<AppState>) -> String {
    state
        .data_dir
        .join("memoji.db")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn open_data_folder(state: State<AppState>) -> Result<(), String> {
    let data_dir = state.data_dir.clone();

    // Windows에서 explorer로 폴더 열기
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(data_dir.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    // macOS에서 Finder로 폴더 열기
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(data_dir.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    // Linux에서 기본 파일 관리자로 폴더 열기
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(data_dir.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn import_memoji_database(
    db_bytes: Vec<u8>,
    state: State<AppState>,
) -> Result<ImportDatabaseResult, String> {
    const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";
    // 현재 프런트 IPC는 byte 배열을 JSON 숫자 배열로 직렬화하므로 원본보다
    // 훨씬 큰 메모리를 사용한다. 파일 경로 기반 import로 바꾸기 전까지 보수적으로 제한한다.
    const MAX_IMPORT_BYTES: usize = 32 * 1024 * 1024;

    if db_bytes.len() < SQLITE_HEADER.len() || !db_bytes.starts_with(SQLITE_HEADER) {
        return Err("SQLite memoji.db 파일이 아닙니다.".to_string());
    }

    if db_bytes.len() > MAX_IMPORT_BYTES {
        return Err("DB 파일이 너무 큽니다. data 폴더에서 직접 백업 후 교체해주세요.".to_string());
    }

    let data_dir = state.data_dir.clone();
    std::fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Failed to create data directory: {}", error))?;

    let now = chrono::Local::now();
    let import_stamp = format!(
        "{}-{:03}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_subsec_millis()
    );
    let import_dir = data_dir.join("imports");
    std::fs::create_dir_all(&import_dir)
        .map_err(|error| format!("Failed to create import directory: {}", error))?;
    let import_path = import_dir.join(format!("memoji-import-{}.db", import_stamp));
    std::fs::write(&import_path, db_bytes)
        .map_err(|error| format!("Failed to stage imported database: {}", error))?;

    let source = Connection::open_with_flags(&import_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Failed to open imported database: {}", error))?;

    let backup_dir = data_dir.join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create backup directory: {}", error))?;
    let backup_path = backup_dir.join(format!("memoji-before-import-{}.db", import_stamp));

    let import_summary_result: Result<ImportDatabaseSummary, String> = match state.db.lock() {
        Ok(db) => db
            .backup_to(&backup_path)
            .and_then(|_| db.import_pages_from_connection(&source)),
        Err(error) => Err(error.to_string()),
    };

    drop(source);
    let _ = std::fs::remove_file(&import_path);
    let import_summary = import_summary_result?;

    Ok(ImportDatabaseResult::from_summary(
        import_summary,
        backup_path,
    ))
}

#[tauri::command]
fn export_pages_zip(state: State<AppState>) -> Result<PagesZipExportResult, String> {
    let pages = {
        let db = state.db.lock().map_err(|error| error.to_string())?;
        db.get_pages().map_err(|error| error.to_string())?
    };

    if pages.is_empty() {
        return Err("내보낼 페이지가 없습니다.".to_string());
    }

    let entries = build_page_export_entries(&pages);
    let data_dir = state.data_dir.clone();
    let export_dir = data_dir.join("exports");
    std::fs::create_dir_all(&export_dir)
        .map_err(|error| format!("Failed to create export directory: {}", error))?;

    let now = chrono::Local::now();
    let export_stamp = format!(
        "{}-{:03}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_subsec_millis()
    );
    let zip_path = export_dir.join(format!("memoji-pages-{}.zip", export_stamp));
    let zip_file = std::fs::File::create(&zip_path)
        .map_err(|error| format!("Failed to create export zip: {}", error))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .unix_permissions(0o644);

    let manifest = serde_json::to_string_pretty(&pages)
        .map_err(|error| format!("Failed to serialize export manifest: {}", error))?;
    zip.start_file("manifest.json", options)
        .map_err(|error| format!("Failed to write manifest: {}", error))?;
    zip.write_all(manifest.as_bytes())
        .map_err(|error| format!("Failed to write manifest: {}", error))?;

    for entry in &entries {
        zip.start_file(&entry.path, options)
            .map_err(|error| format!("Failed to write '{}': {}", entry.path, error))?;
        zip.write_all(entry.content.as_bytes())
            .map_err(|error| format!("Failed to write '{}': {}", entry.path, error))?;
    }

    zip.finish()
        .map_err(|error| format!("Failed to finalize export zip: {}", error))?;

    Ok(PagesZipExportResult {
        exported: entries.len(),
        zip_path: zip_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn local_ai_status(state: State<'_, AppState>) -> Result<LocalAiStatus, String> {
    let mtp_config = resolve_mtp_config(&state)?;
    let mut status = state.local_ai.status_with_mtp_config(mtp_config.clone());

    if let Some(config) = mtp_config {
        if should_manage_litert(&config) {
            if let Err(error) = state.litert_manager.ensure_started() {
                log::warn!("Managed LiteRT-LM start skipped: {error}");
            }
        }
        match local_ai::probe_mtp_endpoint(&config).await {
            Ok(()) => status.mtp_reachable = Some(true),
            Err(error) => {
                status.mtp_reachable = Some(false);
                status.mtp_probe_error = Some(error.to_string().chars().take(240).collect());
            }
        }
    }

    Ok(status)
}

#[tauri::command]
fn local_ai_managed_runtime_status(state: State<AppState>) -> LiteRtManagedStatus {
    state.litert_manager.status()
}

#[tauri::command]
async fn local_ai_start_managed_runtime(
    state: State<'_, AppState>,
) -> Result<LiteRtManagedStatus, String> {
    state.litert_manager.ensure_started()?;

    for _ in 0..16 {
        let status = state.litert_manager.status();
        if status.endpoint_reachable {
            return Ok(status);
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }

    let status = state.litert_manager.status();
    if let Some(error) = status.last_error.clone() {
        return Err(error);
    }
    Ok(status)
}

#[tauri::command]
async fn local_ai_load(state: State<'_, AppState>) -> Result<LocalAiStatus, String> {
    let local_ai = state.local_ai.clone();

    tauri::async_runtime::spawn_blocking(move || local_ai.load().map_err(|error| error.to_string()))
        .await
        .map_err(|error| format!("Local AI worker failed: {error}"))?
}

#[tauri::command]
fn local_ai_get_runtime_config(state: State<AppState>) -> Result<LocalAiRuntimeConfigView, String> {
    if let Some(env_config) = MtpConfig::from_env_result()? {
        return Ok(LocalAiRuntimeConfigView {
            server_enabled: true,
            endpoint: env_config.endpoint,
            model: env_config.model,
            draft_model: env_config.draft_model,
            runtime_kind: env_config.runtime_kind,
            env_configured: true,
            env_takes_precedence: true,
        });
    }

    let db = state.db.lock().map_err(|error| error.to_string())?;
    Ok(read_runtime_config_from_db(&db)?.into_view())
}

#[tauri::command]
fn local_ai_save_runtime_config(
    config: LocalAiRuntimeConfig,
    state: State<AppState>,
) -> Result<LocalAiRuntimeConfigView, String> {
    config.to_mtp_config()?;
    let db = state.db.lock().map_err(|error| error.to_string())?;
    save_runtime_config_to_db(&db, &config)?;
    Ok(config.into_view())
}

#[tauri::command]
async fn local_ai_benchmark(state: State<'_, AppState>) -> Result<LocalAiBenchmarkResult, String> {
    let local_ai = state.local_ai.clone();

    tauri::async_runtime::spawn_blocking(move || {
        local_ai.benchmark().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Local AI worker failed: {error}"))?
}

#[tauri::command]
async fn local_ai_test_runtime_config(
    config: LocalAiRuntimeConfig,
    state: State<'_, AppState>,
) -> Result<LocalAiRuntimeTestResult, String> {
    let mtp_config = config
        .to_mtp_config()?
        .ok_or_else(|| "고속 로컬 서버를 먼저 켜세요.".to_string())?;
    if should_manage_litert(&mtp_config) {
        state.litert_manager.ensure_started()?;
    }
    let started = std::time::Instant::now();
    let response = local_ai::generate_mtp_stream(
        mtp_config,
        "runtime-config-test".to_string(),
        LocalAiGenerateRequest {
            prompt: "한국어로 한 문장만 짧게 인사해줘.".to_string(),
            page_context: None,
            max_new_tokens: Some(8),
            temperature: Some(0.0),
            top_p: Some(1.0),
        },
        CancellationToken::new(),
        |_chunk| Ok(()),
    )
    .await
    .map_err(|error| error.to_string())?;
    let elapsed_ms = started.elapsed().as_millis().max(1);
    let tokens_per_second = response.generated_tokens as f64 / (elapsed_ms as f64 / 1000.0);

    Ok(LocalAiRuntimeTestResult {
        ok: true,
        message: format!(
            "연결 성공: {} chunks, {:.2} chunks/s",
            response.generated_tokens, tokens_per_second
        ),
        generated_tokens: response.generated_tokens,
        tokens_per_second,
    })
}

#[tauri::command]
async fn local_ai_generate(
    request: LocalAiGenerateRequest,
    state: State<'_, AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    let local_ai = state.local_ai.clone();

    tauri::async_runtime::spawn_blocking(move || {
        local_ai
            .generate(request)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Local AI worker failed: {error}"))?
}

#[tauri::command]
async fn local_ai_generate_stream(
    request_id: String,
    request: LocalAiGenerateRequest,
    window: Window,
    state: State<'_, AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    let requests = state.active_ai_requests.clone();
    let cancellation = requests.begin(request_id.clone())?;
    let local_ai = state.local_ai.clone();
    let stream_window = window.clone();
    let stream_request_id = request_id.clone();
    let worker_cancellation = cancellation.clone();
    let result = async {
        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;
        let response = tauri::async_runtime::spawn_blocking(move || {
            cancellation_checkpoint(&worker_cancellation)?;
            local_ai.generate_with_callback(request, |token_text, generated_tokens| {
                cancellation_checkpoint(&worker_cancellation)?;
                stream_window
                    .emit(
                        "local-ai-generate-chunk",
                        LocalAiGenerateStreamChunk {
                            request_id: stream_request_id.clone(),
                            token_text,
                            generated_tokens,
                            done: false,
                            finish_reason: None,
                        },
                    )
                    .map_err(|error| local_ai::LocalAiError::GenerateFailed(error.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|error| format!("Local AI worker failed: {error}"))?
        .map_err(|error| error.to_string())?;

        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;
        window
            .emit(
                "local-ai-generate-chunk",
                LocalAiGenerateStreamChunk {
                    request_id: request_id.clone(),
                    token_text: String::new(),
                    generated_tokens: response.generated_tokens,
                    done: true,
                    finish_reason: Some(response.finish_reason.clone()),
                },
            )
            .map_err(|error| error.to_string())?;

        Ok(response)
    }
    .await;
    requests.finish(&request_id)?;
    result
}

#[tauri::command]
async fn local_ai_generate_mtp_stream(
    request_id: String,
    request: LocalAiGenerateRequest,
    window: Window,
    state: State<'_, AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    let requests = state.active_ai_requests.clone();
    let cancellation = requests.begin(request_id.clone())?;
    let stream_window = window.clone();
    let stream_request_id = request_id.clone();
    let stream_cancellation = cancellation.clone();

    let result = async {
        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;
        let config = resolve_mtp_config(&state)?
            .ok_or_else(|| "고속 로컬 서버가 설정되어 있지 않습니다.".to_string())?;
        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;

        let response = local_ai::generate_mtp_stream(
            config,
            request_id.clone(),
            request,
            cancellation.clone(),
            |chunk| {
                cancellation_checkpoint(&stream_cancellation)?;
                stream_window
                    .emit("local-ai-generate-chunk", chunk)
                    .map_err(|error| local_ai::LocalAiError::GenerateFailed(error.to_string()))?;
                Ok(())
            },
        )
        .await
        .map_err(|error| error.to_string())?;

        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;
        window
            .emit(
                "local-ai-generate-chunk",
                LocalAiGenerateStreamChunk {
                    request_id: stream_request_id,
                    token_text: String::new(),
                    generated_tokens: response.generated_tokens,
                    done: true,
                    finish_reason: Some(response.finish_reason.clone()),
                },
            )
            .map_err(|error| error.to_string())?;

        Ok(response)
    }
    .await;
    requests.finish(&request_id)?;
    result
}

#[tauri::command]
async fn local_ai_cancel(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.active_ai_requests.cancel(&request_id)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Release builds keep single-instance behavior. In dev, a stale app process can outlive
    // Vite and leave the WebView on a blank dev URL, so keep debug launches independent.
    #[cfg(all(
        not(debug_assertions),
        any(target_os = "macos", target_os = "windows", target_os = "linux")
    ))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // 이미 실행 중인 인스턴스가 있을 때 실행되는 콜백
        log::info!("🔔 새 인스턴스 실행 시도 감지 - 기존 창 포커스");

        // 기존 창을 포커스
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
            let _ = window.unminimize();
            log::info!("✅ 기존 창 포커스 완료");
        }
    }));

    let app = builder
        .setup(|app| {
            // 릴리스 빌드에서도 로그 활성화 (에러 디버깅을 위해)
            // 로그 파일은 실행 파일과 같은 폴더의 logs 디렉토리에 저장됨
            let log_plugin = tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("memoji".to_string()),
                    },
                ))
                .build();

            app.handle().plugin(log_plugin)?;

            // 데이터베이스 초기화
            // Portable 모드: 실행 파일과 같은 폴더에 data 디렉토리 생성
            // VDI 환경에서 %APPDATA% 삭제 문제 해결
            let data_dir = match get_data_directory() {
                Ok(dir) => {
                    log::info!("✅ Data directory: {:?}", dir);
                    dir
                }
                Err(e) => {
                    log::error!("❌ Failed to get data directory: {}", e);
                    return Err(e.into());
                }
            };

            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                log::error!("❌ Failed to create data directory: {}", e);
                return Err(format!("Failed to create data dir: {}", e).into());
            }
            log::info!("✅ Data directory created/verified");

            let db_path = data_dir.join("memoji.db");
            log::info!("📁 Database path: {:?}", db_path);

            let db = match Database::new(db_path.clone()) {
                Ok(database) => {
                    log::info!("✅ Database created");
                    database
                }
                Err(e) => {
                    log::error!("❌ Failed to create database: {}", e);
                    return Err(format!("Failed to create database: {}", e).into());
                }
            };

            if let Err(e) = db.init() {
                log::error!("❌ Failed to initialize database: {}", e);
                return Err(format!("Failed to initialize database: {}", e).into());
            }
            log::info!("✅ Database initialized");

            let resource_dir = app.path().resource_dir().unwrap_or_else(|_| {
                std::env::current_exe()
                    .ok()
                    .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("resources")
            });
            log::info!("Local AI resource directory: {:?}", resource_dir);

            let litert_manager = LiteRtManager::discover(&resource_dir, &data_dir);
            let litert_status = litert_manager.status();
            let should_auto_start_litert = MtpConfig::from_env_result()
                .ok()
                .flatten()
                .or_else(|| {
                    read_runtime_config_from_db(&db)
                        .ok()
                        .and_then(|config| config.to_mtp_config().ok().flatten())
                })
                .is_some_and(|config| should_manage_litert(&config));
            if litert_status.available {
                log::info!(
                    "LiteRT-LM runtime discovered: source={:?}, bundled={}, model={:?}",
                    litert_status.source,
                    litert_status.bundled,
                    litert_status.model_path
                );
                if should_auto_start_litert {
                    if let Err(error) = litert_manager.ensure_started() {
                        log::warn!("LiteRT-LM auto start failed: {error}");
                    }
                }
            } else {
                log::warn!("LiteRT-LM runtime/model bundle was not found");
            }

            app.manage(AppState {
                db: Mutex::new(db),
                local_ai: LocalAiState::new(LocalAiConfig::from_resource_dir(resource_dir)),
                active_ai_requests: ActiveRequestRegistry::default(),
                litert_manager,
                data_dir,
            });

            log::info!("🚀 Memoji application started successfully!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_database,
            save_page,
            get_pages,
            delete_page,
            save_app_title,
            get_app_title,
            get_app_data_dir,
            get_data_path,
            open_data_folder,
            import_memoji_database,
            export_pages_zip,
            local_ai_status,
            local_ai_managed_runtime_status,
            local_ai_start_managed_runtime,
            local_ai_load,
            local_ai_get_runtime_config,
            local_ai_save_runtime_config,
            local_ai_test_runtime_config,
            local_ai_benchmark,
            local_ai_generate,
            local_ai_generate_stream,
            local_ai_generate_mtp_stream,
            local_ai_cancel,
            list_page_summaries,
            get_page_body,
            save_page_v2,
            trash_page,
            restore_page,
            list_page_revisions,
            restore_page_revision,
            search_workspace,
            get_page_anchors,
            get_page_links,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app_handle.state::<AppState>().litert_manager.stop();
        }
    });
}
