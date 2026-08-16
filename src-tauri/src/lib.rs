pub mod ai;
mod calendar;
mod commands;
mod database;
mod db;
mod diagnostics;
mod domain;
mod indexing;
pub mod local_ai;
mod search;
mod services;
mod tasks;

use ai::metrics::{MtpMetrics, RuntimeMetrics};
use ai::runtime::capabilities::RuntimeCapabilities;
use commands::ai::{
    apply_ai_proposal, create_ai_proposal, create_ai_run, finish_ai_run, get_ai_proposal,
    list_ai_proposals, reject_ai_proposal,
};
use commands::calendar::{
    delete_calendar_event, export_calendar_ics, import_calendar_ics, list_calendar_items,
    save_calendar_event,
};
use commands::pages::{
    get_page_body, list_page_revisions, list_page_summaries, list_trashed_page_summaries,
    restore_page, restore_page_revision, save_page_v2, trash_page,
};
use commands::search::{get_page_anchors, get_page_links, reindex_workspace, search_workspace};
use commands::tasks::{list_tasks, update_task};
use database::{build_page_export_entries, Database, ImportDatabaseSummary, Page};
use diagnostics::{
    diagnostic_error_code, write_diagnostic_zip, DiagnosticAiRuntime, DiagnosticCounts,
    DiagnosticReport, DiagnosticRuntimeMetrics,
};
use indexing::worker::IndexWorker;
use local_ai::{
    cancellation_checkpoint, ActiveRequestRegistry, LiteRtManagedStatus, LiteRtManager,
    LocalAiBenchmarkResult, LocalAiConfig, LocalAiGenerateRequest, LocalAiGenerateResponse,
    LocalAiGenerateStreamChunk, LocalAiRuntimeKind, LocalAiState, LocalAiStatus, MtpConfig,
    DEFAULT_MTP_MODEL,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
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
    ai_runtime_metrics: Mutex<RuntimeMetrics>,
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
    revisions_imported: usize,
    source_schema_version: Option<i64>,
    backup_path: String,
    backup_sha256: String,
    backup_bytes: u64,
}

#[derive(Debug, Serialize)]
struct PagesZipExportResult {
    exported: usize,
    zip_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticZipResult {
    zip_path: String,
    sha256: String,
    bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataPathStatus {
    database_path: String,
    source: String,
    writable: bool,
    persistence_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportDatabaseManifest {
    path: String,
    sha256: String,
    bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportCountsManifest {
    pages: usize,
    markdown_files: usize,
    revisions: i64,
    attachments: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportPageManifest {
    id: String,
    title: String,
    page_type: String,
    revision: i64,
    updated_at: String,
    markdown_path: Option<String>,
    sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportAttachmentManifest {
    path: String,
    sha256: String,
    bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    format_version: u32,
    app_version: String,
    schema_version: i64,
    generated_at: String,
    database: ExportDatabaseManifest,
    counts: ExportCountsManifest,
    pages: Vec<ExportPageManifest>,
    attachments: Vec<ExportAttachmentManifest>,
}

impl ImportDatabaseResult {
    fn from_summary(
        summary: ImportDatabaseSummary,
        backup_path: PathBuf,
        backup_sha256: String,
        backup_bytes: u64,
    ) -> Self {
        Self {
            imported: summary.imported,
            duplicated: summary.duplicated,
            skipped: summary.skipped,
            revisions_imported: summary.revisions_imported,
            source_schema_version: summary.source_schema_version,
            backup_path: backup_path.to_string_lossy().to_string(),
            backup_sha256,
            backup_bytes,
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
        && matches!(config.model.as_str(), "gemma4-e2b" | "gemma4-e4b")
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
    fn managed_litert_accepts_the_e4b_quality_preset() {
        let config = MtpConfig::from_values(
            DEFAULT_LITERT_LM_ENDPOINT.to_string(),
            Some("gemma4-e4b".to_string()),
            None,
            Some(LocalAiRuntimeKind::LitertLm),
            None,
        )
        .expect("E4B preset should be valid");

        assert!(should_manage_litert(&config));
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

    #[test]
    fn os_local_fallback_reports_a_vdi_persistence_warning() {
        assert!(data_path_persistence_warning("os_local_fallback").is_some());
        assert!(data_path_persistence_warning("os_local").is_none());
        assert!(data_path_persistence_warning("policy_env").is_none());
        assert!(data_path_persistence_warning("portable").is_none());
    }

    #[test]
    fn macos_default_data_directory_stays_outside_the_signed_app_bundle() {
        let executable_directory = Path::new("/Applications/Memoji.app/Contents/MacOS");
        let local_data_directory = Path::new("/Users/test/Library/Application Support");

        let selected = choose_default_data_directory(
            executable_directory,
            Some(local_data_directory),
            true,
            true,
        );

        assert_eq!(selected, local_data_directory.join("Memoji").join("data"));
    }

    #[test]
    fn windows_vdi_default_keeps_writable_portable_storage() {
        let executable_directory = Path::new(r"C:\Memoji");
        let local_data_directory = Path::new(r"C:\Users\test\AppData\Local");

        let selected = choose_default_data_directory(
            executable_directory,
            Some(local_data_directory),
            false,
            true,
        );

        assert_eq!(selected, executable_directory.join("data"));
    }

    #[test]
    fn export_manifest_uses_versioned_camel_case_contract_and_sha256() {
        let manifest = ExportManifest {
            format_version: 1,
            app_version: "2.0.0".to_string(),
            schema_version: 6,
            generated_at: "2026-08-16T00:00:00+09:00".to_string(),
            database: ExportDatabaseManifest {
                path: "database/memoji.db".to_string(),
                sha256: sha256_bytes(b"abc"),
                bytes: 3,
            },
            counts: ExportCountsManifest {
                pages: 1,
                markdown_files: 1,
                revisions: 2,
                attachments: 0,
            },
            pages: vec![ExportPageManifest {
                id: "page-1".to_string(),
                title: "테스트".to_string(),
                page_type: "page".to_string(),
                revision: 2,
                updated_at: "2026-08-16T00:00:00Z".to_string(),
                markdown_path: Some("daily/2026-08-16/테스트__page-1.md".to_string()),
                sha256: Some(sha256_bytes(b"body")),
            }],
            attachments: Vec::new(),
        };

        let json = serde_json::to_value(manifest).expect("serialize export manifest");
        assert_eq!(json["formatVersion"], 1);
        assert_eq!(json["appVersion"], "2.0.0");
        assert_eq!(json["schemaVersion"], 6);
        assert_eq!(
            json["database"]["sha256"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            json["pages"][0]["markdownPath"],
            "daily/2026-08-16/테스트__page-1.md"
        );
        assert_eq!(json["attachments"].as_array().map(Vec::len), Some(0));
    }
}

/// 데이터 저장 디렉토리 결정
/// MEMOJI_DATA_PATH가 있으면 최우선으로 사용한다.
/// 기본은 실행 파일 옆 data 폴더이지만, 설치 위치가 쓰기 불가하면 OS 로컬 데이터 폴더로 안전하게 물러난다.
fn get_data_directory() -> Result<PathBuf, String> {
    // 1. 환경 변수 확인 (고급 사용자용 - 선택사항)
    if let Ok(custom_path) = std::env::var("MEMOJI_DATA_PATH") {
        let path = PathBuf::from(custom_path);
        log::info!("Using the administrator-configured data directory");
        return Ok(path);
    }

    // 2. 플랫폼 기본값 결정
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;

    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
    let portable_data_dir = exe_dir.join("data");
    let prefer_os_local = cfg!(target_os = "macos");
    let portable_writable = !prefer_os_local && directory_is_writable(&portable_data_dir);
    let selected = choose_default_data_directory(
        exe_dir,
        dirs::data_local_dir().as_deref(),
        prefer_os_local,
        portable_writable,
    );

    if selected == portable_data_dir {
        log::info!("Using the portable data directory");
    } else if prefer_os_local {
        log::info!("Using the macOS application data directory");
    } else {
        log::warn!("Portable data directory is not writable; using the OS-local fallback. Verify VDI profile persistence in Settings.");
    }
    Ok(selected)
}

fn choose_default_data_directory(
    executable_directory: &Path,
    local_data_directory: Option<&Path>,
    prefer_os_local: bool,
    portable_writable: bool,
) -> PathBuf {
    let portable_data_directory = executable_directory.join("data");
    if prefer_os_local {
        if let Some(local_data_directory) = local_data_directory {
            return local_data_directory.join("Memoji").join("data");
        }
    }
    if portable_writable {
        return portable_data_directory;
    }
    local_data_directory
        .map(|directory| directory.join("Memoji").join("data"))
        .unwrap_or(portable_data_directory)
}

fn data_path_source(data_dir: &Path) -> &'static str {
    if std::env::var_os("MEMOJI_DATA_PATH")
        .map(PathBuf::from)
        .is_some_and(|configured| configured == data_dir)
    {
        return "policy_env";
    }
    if std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("data")))
        .is_some_and(|portable| portable == data_dir)
    {
        return "portable";
    }
    if cfg!(target_os = "macos")
        && dirs::data_local_dir()
            .map(|directory| directory.join("Memoji").join("data"))
            .is_some_and(|os_local| os_local == data_dir)
    {
        return "os_local";
    }
    "os_local_fallback"
}

fn data_path_persistence_warning(source: &str) -> Option<String> {
    (source == "os_local_fallback").then(|| {
        "OS 로컬 저장소를 사용 중입니다. 비영구 VDI 프로필에서는 로그아웃 후 데이터가 삭제될 수 있으므로 MEMOJI_DATA_PATH를 영구 드라이브로 지정하세요."
            .to_string()
    })
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
fn get_data_path_status(state: State<AppState>) -> DataPathStatus {
    let source = data_path_source(&state.data_dir);
    DataPathStatus {
        database_path: state
            .data_dir
            .join("memoji.db")
            .to_string_lossy()
            .to_string(),
        source: source.to_string(),
        writable: directory_is_writable(&state.data_dir),
        persistence_warning: data_path_persistence_warning(source),
    }
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
    db_path: String,
    state: State<AppState>,
) -> Result<ImportDatabaseResult, String> {
    let data_dir = state.data_dir.clone();
    std::fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Failed to create data directory: {}", error))?;

    let selected_path = PathBuf::from(db_path);
    let selected_canonical = selected_path
        .canonicalize()
        .map_err(|error| format!("Failed to resolve imported database path: {error}"))?;
    let live_path = data_dir.join("memoji.db");
    if live_path
        .canonicalize()
        .map(|path| path == selected_canonical)
        .unwrap_or(false)
    {
        return Err("현재 사용 중인 memoji.db는 가져오기 소스로 선택할 수 없습니다.".to_string());
    }

    let now = chrono::Local::now();
    let import_stamp = format!(
        "{}-{:03}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_subsec_millis()
    );
    let backup_dir = data_dir.join("backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create backup directory: {}", error))?;
    let backup_path = backup_dir.join(format!("memoji-before-import-{}.db", import_stamp));

    let import_summary_result: Result<ImportDatabaseSummary, String> = match state.db.lock() {
        Ok(db) => db.import_pages_from_path(&selected_canonical, &backup_path),
        Err(error) => Err(error.to_string()),
    };
    let import_summary = import_summary_result?;
    let backup_sha256 = sha256_file(&backup_path)?;
    let backup_bytes = backup_path
        .metadata()
        .map_err(|error| format!("Failed to inspect import backup: {error}"))?
        .len();

    Ok(ImportDatabaseResult::from_summary(
        import_summary,
        backup_path,
        backup_sha256,
        backup_bytes,
    ))
}

#[tauri::command]
fn export_pages_zip(state: State<AppState>) -> Result<PagesZipExportResult, String> {
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
    let snapshot_path = export_dir.join(format!("memoji-export-snapshot-{}.db", export_stamp));

    let export_result = (|| -> Result<PagesZipExportResult, String> {
        let (pages, schema_version, revision_count, page_revisions) = {
            let db = state.db.lock().map_err(|error| error.to_string())?;
            db.backup_to(&snapshot_path)?;
            let pages = db.get_pages().map_err(|error| error.to_string())?;
            let schema_version = db
                .connection()
                .query_row(
                    "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| format!("Failed to read schema version: {error}"))?;
            let revision_count = db
                .connection()
                .query_row("SELECT COUNT(*) FROM page_revisions", [], |row| {
                    row.get::<_, i64>(0)
                })
                .map_err(|error| format!("Failed to count page revisions: {error}"))?;
            let mut statement = db
                .connection()
                .prepare("SELECT id, revision FROM pages")
                .map_err(|error| format!("Failed to read page revisions: {error}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .map_err(|error| format!("Failed to read page revisions: {error}"))?;
            let mut page_revisions = HashMap::new();
            for row in rows {
                let (page_id, revision) =
                    row.map_err(|error| format!("Failed to read page revision: {error}"))?;
                page_revisions.insert(page_id, revision);
            }
            (pages, schema_version, revision_count, page_revisions)
        };

        if pages.is_empty() {
            return Err("내보낼 페이지가 없습니다.".to_string());
        }

        let entries = build_page_export_entries(&pages);
        let entry_by_id: HashMap<String, (&str, &str)> = entries
            .iter()
            .map(|entry| {
                (
                    entry.page_id.clone(),
                    (entry.path.as_str(), entry.content.as_str()),
                )
            })
            .collect();
        let page_manifest = pages
            .iter()
            .map(|page| {
                let exported = entry_by_id.get(&page.id);
                ExportPageManifest {
                    id: page.id.clone(),
                    title: page.title.clone(),
                    page_type: page.page_type.clone(),
                    revision: page_revisions.get(&page.id).copied().unwrap_or(0),
                    updated_at: page.updated_at.clone(),
                    markdown_path: exported.map(|(path, _)| (*path).to_string()),
                    sha256: exported.map(|(_, content)| sha256_bytes(content.as_bytes())),
                }
            })
            .collect();
        let database_hash = sha256_file(&snapshot_path)?;
        let database_bytes = snapshot_path
            .metadata()
            .map_err(|error| format!("Failed to inspect export snapshot: {error}"))?
            .len();
        let manifest = ExportManifest {
            format_version: 1,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            schema_version,
            generated_at: chrono::Local::now().to_rfc3339(),
            database: ExportDatabaseManifest {
                path: "database/memoji.db".to_string(),
                sha256: database_hash,
                bytes: database_bytes,
            },
            counts: ExportCountsManifest {
                pages: pages.len(),
                markdown_files: entries.len(),
                revisions: revision_count,
                attachments: 0,
            },
            pages: page_manifest,
            attachments: Vec::new(),
        };

        let zip_file = std::fs::File::create(&zip_path)
            .map_err(|error| format!("Failed to create export zip: {}", error))?;
        let mut zip = zip::ZipWriter::new(zip_file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);

        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("Failed to serialize export manifest: {}", error))?;
        zip.start_file("manifest.json", options)
            .map_err(|error| format!("Failed to write manifest: {}", error))?;
        zip.write_all(manifest_json.as_bytes())
            .map_err(|error| format!("Failed to write manifest: {}", error))?;

        zip.start_file("database/memoji.db", options)
            .map_err(|error| format!("Failed to write database snapshot: {error}"))?;
        let mut snapshot_file = std::fs::File::open(&snapshot_path)
            .map_err(|error| format!("Failed to open export snapshot: {error}"))?;
        std::io::copy(&mut snapshot_file, &mut zip)
            .map_err(|error| format!("Failed to stream database snapshot: {error}"))?;

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
    })();

    let _ = std::fs::remove_file(&snapshot_path);
    if export_result.is_err() {
        let _ = std::fs::remove_file(&zip_path);
    }
    export_result
}

#[tauri::command]
fn export_diagnostic_zip(state: State<AppState>) -> Result<DiagnosticZipResult, String> {
    let export_dir = state.data_dir.join("diagnostics");
    std::fs::create_dir_all(&export_dir)
        .map_err(|error| format!("Failed to create diagnostics directory: {error}"))?;
    let now = chrono::Local::now();
    let stamp = format!(
        "{}-{:03}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_subsec_millis()
    );
    let zip_path = export_dir.join(format!("memoji-vdi-diagnostics-{stamp}.zip"));

    let (schema_version, database_quick_check, counts) = {
        let db = state.db.lock().map_err(|error| error.to_string())?;
        let connection = db.connection();
        let scalar = |sql: &str| -> Result<i64, String> {
            connection
                .query_row(sql, [], |row| row.get(0))
                .map_err(|error| error.to_string())
        };
        (
            scalar("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")?,
            connection
                .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?,
            DiagnosticCounts {
                active_pages: scalar("SELECT COUNT(*) FROM pages WHERE deleted_at IS NULL")?,
                trashed_pages: scalar("SELECT COUNT(*) FROM pages WHERE deleted_at IS NOT NULL")?,
                revisions: scalar("SELECT COUNT(*) FROM page_revisions")?,
                tasks: scalar("SELECT COUNT(*) FROM tasks")?,
                events: scalar("SELECT COUNT(*) FROM events")?,
                ai_runs: scalar("SELECT COUNT(*) FROM ai_runs")?,
            },
        )
    };
    let runtime = state.litert_manager.status();
    let runtime_metrics = state
        .ai_runtime_metrics
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    let report = DiagnosticReport {
        format_version: 1,
        generated_at: now.to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_threads: std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(1),
        schema_version,
        database_quick_check,
        counts,
        ai_runtime: DiagnosticAiRuntime {
            available: runtime.available,
            bundled: runtime.bundled,
            transport: runtime.transport,
            runtime_version: runtime.runtime_version,
            c_api_version: runtime.c_api_version,
            active_model_id: runtime.active_model_id,
            available_model_ids: runtime.available_model_ids,
            backend: runtime.backend,
            threads: runtime.threads,
            restart_attempts: runtime.restart_attempts,
            restart_limit: runtime.restart_limit,
            error_present: runtime.last_error.is_some(),
            last_error_code: diagnostic_error_code(runtime.last_error.as_deref()),
        },
        runtime_metrics: DiagnosticRuntimeMetrics {
            runtime_version: runtime_metrics.runtime_version,
            load_ms: runtime_metrics.load_ms,
            ttft_ms: runtime_metrics.ttft_ms,
            prefill_tokens: runtime_metrics.prefill_tokens,
            prefill_ms: runtime_metrics.prefill_ms,
            decode_tokens: runtime_metrics.decode_tokens,
            decode_ms: runtime_metrics.decode_ms,
            peak_rss_bytes: runtime_metrics.peak_rss_bytes,
        },
        privacy: vec![
            "document bodies excluded".to_string(),
            "AI prompts and responses excluded".to_string(),
            "credentials and environment variables excluded".to_string(),
            "absolute filesystem paths excluded".to_string(),
        ],
    };
    if let Err(error) = write_diagnostic_zip(&zip_path, &report) {
        let _ = std::fs::remove_file(&zip_path);
        return Err(error);
    }
    Ok(DiagnosticZipResult {
        sha256: sha256_file(&zip_path)?,
        bytes: zip_path
            .metadata()
            .map_err(|error| error.to_string())?
            .len(),
        zip_path: zip_path.to_string_lossy().to_string(),
    })
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("Failed to open '{}' for hashing: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to hash '{}': {error}", path.display()))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[tauri::command]
async fn local_ai_status(state: State<'_, AppState>) -> Result<LocalAiStatus, String> {
    let mtp_config = resolve_mtp_config(&state)?;
    if let Some(config) = mtp_config.as_ref() {
        if should_manage_litert(config) {
            if let Err(error) = state.litert_manager.ensure_started_for(&config.model) {
                log::warn!(
                    "Managed LiteRT-LM start skipped: code={}",
                    diagnostic_error_code(Some(&error)).unwrap_or_else(|| "runtime_error".into())
                );
            }
        }
    }
    let mut status = state.local_ai.status_with_mtp_config(mtp_config.clone());
    if mtp_config.is_some() {
        if let Ok(metrics) = state.ai_runtime_metrics.lock() {
            status.runtime_metrics = metrics.clone();
        }
    }

    if let Some(config) = mtp_config {
        if status.runtime_metrics.runtime_version.is_none() {
            status.runtime_metrics.runtime_version = Some(match config.runtime_kind {
                LocalAiRuntimeKind::LitertLm => "litert-lm".to_string(),
                LocalAiRuntimeKind::LlamaCpp => "openai-compatible-v1".to_string(),
                LocalAiRuntimeKind::BuiltinCandle => "candle".to_string(),
            });
        }
        if should_manage_litert(&config) {
            let managed = state.litert_manager.status();
            status.mtp_reachable = Some(managed.process_running);
            status.mtp_probe_error = managed.last_error.clone();
            status.runtime_capabilities =
                RuntimeCapabilities::litert_native(managed.model_available);
            status.runtime_metrics.runtime_version = Some(format!(
                "LiteRT-LM {} / C API {}",
                managed.runtime_version, managed.c_api_version
            ));
            return Ok(status);
        }

        match local_ai::probe_openai_compatible_endpoint(&config).await {
            Ok(probe) => {
                status.mtp_reachable = Some(true);
                status.runtime_capabilities =
                    RuntimeCapabilities::for_loopback(&config, &probe.models);
                if probe.runtime_version.is_some() {
                    status.runtime_metrics.runtime_version = probe.runtime_version;
                }
            }
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
    let model_id = resolve_mtp_config(&state)?
        .filter(should_manage_litert)
        .map(|config| config.model)
        .unwrap_or_else(|| DEFAULT_LITERT_LM_MODEL.to_string());
    state.litert_manager.ensure_started_for(&model_id)?;
    Ok(state.litert_manager.status())
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
    let started = std::time::Instant::now();
    let request = LocalAiGenerateRequest {
        prompt: "한국어로 한 문장만 짧게 인사해줘.".to_string(),
        page_context: None,
        max_new_tokens: Some(8),
        temperature: Some(0.0),
        top_p: Some(1.0),
    };
    let response = if should_manage_litert(&mtp_config) {
        let manager = state.litert_manager.clone();
        let model_id = mtp_config.model.clone();
        tauri::async_runtime::spawn_blocking(move || {
            manager.generate_stream(
                &model_id,
                "runtime-config-test".to_string(),
                request,
                CancellationToken::new(),
                |_chunk| Ok(()),
            )
        })
        .await
        .map_err(|error| format!("LiteRT-LM worker failed: {error}"))?
        .map_err(|error| error.to_string())?
    } else {
        local_ai::generate_mtp_stream(
            mtp_config,
            "runtime-config-test".to_string(),
            request,
            CancellationToken::new(),
            |_chunk| Ok(()),
        )
        .await
        .map_err(|error| error.to_string())?
    };
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

    let result = async {
        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;
        let config = resolve_mtp_config(&state)?
            .ok_or_else(|| "로컬 AI 런타임이 설정되어 있지 않습니다.".to_string())?;
        cancellation_checkpoint(&cancellation).map_err(|error| error.to_string())?;

        let started = std::time::Instant::now();
        let (response, ttft_ms, capabilities, runtime_version) = if should_manage_litert(&config) {
            let manager = state.litert_manager.clone();
            let model_id = config.model.clone();
            let worker_request_id = request_id.clone();
            let worker_cancellation = cancellation.clone();
            let worker_window = window.clone();
            let worker_started = started;
            let (response, ttft_ms) = tauri::async_runtime::spawn_blocking(move || {
                let mut ttft_ms = None;
                let response = manager.generate_stream(
                    &model_id,
                    worker_request_id,
                    request,
                    worker_cancellation.clone(),
                    |chunk| {
                        cancellation_checkpoint(&worker_cancellation)?;
                        ttft_ms.get_or_insert(worker_started.elapsed().as_millis());
                        worker_window
                            .emit("local-ai-generate-chunk", chunk)
                            .map_err(|error| {
                                local_ai::LocalAiError::GenerateFailed(error.to_string())
                            })?;
                        Ok(())
                    },
                )?;
                Ok::<_, local_ai::LocalAiError>((response, ttft_ms))
            })
            .await
            .map_err(|error| format!("LiteRT-LM worker failed: {error}"))?
            .map_err(|error| error.to_string())?;
            (
                response,
                ttft_ms,
                RuntimeCapabilities::litert_native(true),
                format!("LiteRT-LM {} / C API {}", "0.16.0", "0.1.0"),
            )
        } else {
            let probe = local_ai::probe_openai_compatible_endpoint(&config)
                .await
                .ok();
            let capabilities = RuntimeCapabilities::for_loopback(
                &config,
                &probe
                    .as_ref()
                    .map(|value| value.models.clone())
                    .unwrap_or_default(),
            );
            let stream_window = window.clone();
            let stream_cancellation = cancellation.clone();
            let mut ttft_ms = None;
            let response = local_ai::generate_mtp_stream(
                config.clone(),
                request_id.clone(),
                request,
                cancellation.clone(),
                |chunk| {
                    cancellation_checkpoint(&stream_cancellation)?;
                    ttft_ms.get_or_insert(started.elapsed().as_millis());
                    stream_window
                        .emit("local-ai-generate-chunk", chunk)
                        .map_err(|error| {
                            local_ai::LocalAiError::GenerateFailed(error.to_string())
                        })?;
                    Ok(())
                },
            )
            .await
            .map_err(|error| error.to_string())?;
            (
                response,
                ttft_ms,
                capabilities,
                probe
                    .and_then(|value| value.runtime_version)
                    .unwrap_or_else(|| "openai-compatible-v1".to_string()),
            )
        };

        let elapsed_ms = started.elapsed().as_millis();
        if let Ok(mut metrics) = state.ai_runtime_metrics.lock() {
            *metrics = RuntimeMetrics {
                runtime_version: Some(runtime_version),
                ttft_ms,
                prefill_tokens: Some(response.prompt_tokens),
                decode_tokens: Some(response.generated_tokens),
                decode_ms: Some(elapsed_ms.saturating_sub(ttft_ms.unwrap_or(0))),
                mtp: capabilities.mtp_verified.then(|| MtpMetrics {
                    target_model: config.model.clone(),
                    assistant_model: config.draft_model.clone().unwrap_or_default(),
                    accepted_draft_tokens: None,
                    proposed_draft_tokens: None,
                }),
                ..RuntimeMetrics::default()
            };
        }

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
async fn local_ai_cancel(request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.active_ai_requests.cancel(&request_id)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

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
                Ok(dir) => dir,
                Err(e) => {
                    log::error!("❌ Failed to resolve the data directory");
                    return Err(e.into());
                }
            };

            if let Err(e) = std::fs::create_dir_all(&data_dir) {
                log::error!("❌ Failed to create the data directory");
                return Err(format!("Failed to create data dir: {}", e).into());
            }
            log::info!("✅ Data directory created/verified");

            let db_path = data_dir.join("memoji.db");
            let mut db = match Database::new(db_path.clone()) {
                Ok(database) => {
                    log::info!("✅ Database created");
                    database
                }
                Err(e) => {
                    log::error!("❌ Failed to create the database");
                    return Err(format!("Failed to create database: {}", e).into());
                }
            };

            if let Err(e) = db.init() {
                log::error!("❌ Failed to initialize the database");
                return Err(format!("Failed to initialize database: {}", e).into());
            }
            log::info!("✅ Database initialized");

            match IndexWorker::drain_page_jobs(db.connection_mut(), None) {
                Ok(report) if report.completed > 0 || report.failed > 0 => log::info!(
                    "Derived page jobs drained at startup: completed={}, failed={}",
                    report.completed,
                    report.failed
                ),
                Ok(_) => {}
                Err(error) => {
                    log::warn!("Derived page jobs could not be drained at startup: {error}")
                }
            }

            let resource_dir = app.path().resource_dir().unwrap_or_else(|_| {
                std::env::current_exe()
                    .ok()
                    .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("resources")
            });
            let litert_manager = LiteRtManager::discover(&resource_dir, &data_dir);
            let litert_status = litert_manager.status();
            let auto_start_litert_model = MtpConfig::from_env_result()
                .ok()
                .flatten()
                .or_else(|| {
                    read_runtime_config_from_db(&db)
                        .ok()
                        .and_then(|config| config.to_mtp_config().ok().flatten())
                })
                .filter(should_manage_litert)
                .map(|config| config.model);
            if litert_status.available {
                log::info!(
                    "LiteRT-LM runtime discovered: bundled={}",
                    litert_status.bundled
                );
                if let Some(model) = auto_start_litert_model.as_deref() {
                    if let Err(error) = litert_manager.ensure_started_for(model) {
                        log::warn!(
                            "LiteRT-LM auto start failed: code={}",
                            diagnostic_error_code(Some(&error))
                                .unwrap_or_else(|| "runtime_error".into())
                        );
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
                ai_runtime_metrics: Mutex::new(RuntimeMetrics::default()),
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
            get_data_path_status,
            open_data_folder,
            import_memoji_database,
            export_pages_zip,
            export_diagnostic_zip,
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
            create_ai_run,
            finish_ai_run,
            create_ai_proposal,
            get_ai_proposal,
            list_ai_proposals,
            apply_ai_proposal,
            reject_ai_proposal,
            list_page_summaries,
            list_trashed_page_summaries,
            get_page_body,
            save_page_v2,
            trash_page,
            restore_page,
            list_page_revisions,
            restore_page_revision,
            search_workspace,
            reindex_workspace,
            get_page_anchors,
            get_page_links,
            list_tasks,
            update_task,
            list_calendar_items,
            save_calendar_event,
            delete_calendar_event,
            export_calendar_ics,
            import_calendar_ics,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app_handle.state::<AppState>().litert_manager.stop();
        }
    });
}
