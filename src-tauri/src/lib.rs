mod database;
mod local_ai;

use database::{build_page_export_entries, Database, ImportDatabaseSummary, Page};
use local_ai::{
    LocalAiBenchmarkResult, LocalAiConfig, LocalAiGenerateRequest, LocalAiGenerateResponse,
    LocalAiGenerateStreamChunk, LocalAiState, LocalAiStatus, MtpConfig, DEFAULT_MTP_MODEL,
};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window};
use zip::write::SimpleFileOptions;

struct AppState {
    db: Mutex<Database>,
    local_ai: LocalAiState,
}

const LOCAL_AI_RUNTIME_CONFIG_KEY: &str = "local_ai_runtime_config";
const DEFAULT_MTP_ENDPOINT: &str = "http://127.0.0.1:8080/v1/chat/completions";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiRuntimeConfig {
    server_enabled: bool,
    endpoint: String,
    model: String,
    draft_model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiRuntimeConfigView {
    server_enabled: bool,
    endpoint: String,
    model: String,
    draft_model: Option<String>,
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
            server_enabled: false,
            endpoint: DEFAULT_MTP_ENDPOINT.to_string(),
            model: DEFAULT_MTP_MODEL.to_string(),
            draft_model: None,
        }
    }
}

impl LocalAiRuntimeConfig {
    fn to_mtp_config(&self) -> Result<Option<MtpConfig>, String> {
        if !self.server_enabled {
            return Ok(None);
        }

        MtpConfig::from_values(
            self.endpoint.clone(),
            Some(self.model.clone()),
            self.draft_model.clone(),
            None,
        )
        .map(Some)
    }

    fn into_view(self) -> LocalAiRuntimeConfigView {
        let env_configured = MtpConfig::from_env().is_some();
        LocalAiRuntimeConfigView {
            server_enabled: self.server_enabled,
            endpoint: self.endpoint,
            model: self.model,
            draft_model: self.draft_model,
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

    match serde_json::from_str(&raw_config) {
        Ok(config) => Ok(config),
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
    if let Some(config) = MtpConfig::from_env() {
        return Ok(Some(config));
    }

    let db = state.db.lock().map_err(|error| error.to_string())?;
    let config = read_runtime_config_from_db(&db)?;
    config.to_mtp_config()
}

/// 데이터 저장 디렉토리 결정
/// MEMOJI_DATA_PATH가 있으면 최우선으로 사용한다.
/// 기본은 실행 파일 옆 data 폴더이지만, 설치 위치가 쓰기 불가하면 OS 로컬 데이터 폴더로 안전하게 물러난다.
fn get_data_directory() -> Result<PathBuf, String> {
    // 1. 환경 변수 확인 (고급 사용자용 - 선택사항)
    if let Ok(custom_path) = std::env::var("MEMOJI_DATA_PATH") {
        let path = PathBuf::from(custom_path);
        println!("📁 Using custom data path: {:?}", path);
        return Ok(path);
    }

    // 2. 기본값: 실행 파일과 같은 폴더의 data 디렉토리
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;

    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;

    let portable_data_dir = exe_dir.join("data");
    if directory_is_writable(&portable_data_dir) {
        println!("📁 Using portable data directory: {:?}", portable_data_dir);
        return Ok(portable_data_dir);
    }

    if let Some(local_data_dir) = dirs::data_local_dir() {
        let fallback_data_dir = local_data_dir.join("Memoji").join("data");
        println!(
            "📁 Portable data directory is not writable, using local data directory: {:?}",
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
fn get_app_data_dir() -> Result<String, String> {
    let data_dir = get_data_directory()?;
    Ok(data_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_data_path() -> Result<String, String> {
    let data_dir = get_data_directory()?;
    let db_path = data_dir.join("memoji.db");
    Ok(db_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_data_folder() -> Result<(), String> {
    let data_dir = get_data_directory()?;

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
    const MAX_IMPORT_BYTES: usize = 256 * 1024 * 1024;

    if db_bytes.len() < SQLITE_HEADER.len() || !db_bytes.starts_with(SQLITE_HEADER) {
        return Err("SQLite memoji.db 파일이 아닙니다.".to_string());
    }

    if db_bytes.len() > MAX_IMPORT_BYTES {
        return Err("DB 파일이 너무 큽니다. data 폴더에서 직접 백업 후 교체해주세요.".to_string());
    }

    let data_dir = get_data_directory()?;
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
    let data_dir = get_data_directory()?;
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
fn local_ai_status(state: State<AppState>) -> Result<LocalAiStatus, String> {
    let mtp_config = resolve_mtp_config(&state)?;
    Ok(state.local_ai.status_with_mtp_config(mtp_config))
}

#[tauri::command]
fn local_ai_load(state: State<AppState>) -> Result<LocalAiStatus, String> {
    state.local_ai.load().map_err(|error| error.to_string())
}

#[tauri::command]
fn local_ai_get_runtime_config(state: State<AppState>) -> Result<LocalAiRuntimeConfigView, String> {
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
fn local_ai_benchmark(state: State<AppState>) -> Result<LocalAiBenchmarkResult, String> {
    state
        .local_ai
        .benchmark()
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_ai_test_runtime_config(
    config: LocalAiRuntimeConfig,
) -> Result<LocalAiRuntimeTestResult, String> {
    let mtp_config = config
        .to_mtp_config()?
        .ok_or_else(|| "고속 로컬 서버를 먼저 켜세요.".to_string())?;
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
        |_chunk| Ok(()),
    )
    .await
    .map_err(|error| error.to_string())?;
    let elapsed_ms = started.elapsed().as_millis().max(1);
    let tokens_per_second = response.generated_tokens as f64 / (elapsed_ms as f64 / 1000.0);

    Ok(LocalAiRuntimeTestResult {
        ok: true,
        message: format!(
            "연결 성공: {} chunks, {:.2} tok/s",
            response.generated_tokens, tokens_per_second
        ),
        generated_tokens: response.generated_tokens,
        tokens_per_second,
    })
}

#[tauri::command]
fn local_ai_generate(
    request: LocalAiGenerateRequest,
    state: State<AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    state
        .local_ai
        .generate(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_ai_generate_stream(
    request_id: String,
    request: LocalAiGenerateRequest,
    window: Window,
    state: State<AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    let stream_window = window.clone();
    let stream_request_id = request_id.clone();
    let response = state
        .local_ai
        .generate_with_callback(request, move |token_text, generated_tokens| {
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
                .map_err(|error| local_ai::LocalAiError::GenerateFailed(error.to_string()))
        })
        .map_err(|error| error.to_string())?;

    window
        .emit(
            "local-ai-generate-chunk",
            LocalAiGenerateStreamChunk {
                request_id,
                token_text: response.text.clone(),
                generated_tokens: response.generated_tokens,
                done: true,
                finish_reason: Some(response.finish_reason.clone()),
            },
        )
        .map_err(|error| error.to_string())?;

    Ok(response)
}

#[tauri::command]
async fn local_ai_generate_mtp_stream(
    request_id: String,
    request: LocalAiGenerateRequest,
    window: Window,
    state: State<'_, AppState>,
) -> Result<LocalAiGenerateResponse, String> {
    let config = resolve_mtp_config(&state)?
        .ok_or_else(|| "고속 로컬 서버가 설정되어 있지 않습니다.".to_string())?;
    let stream_window = window.clone();
    let stream_request_id = request_id.clone();

    let response =
        local_ai::generate_mtp_stream(config, request_id.clone(), request, move |chunk| {
            stream_window
                .emit("local-ai-generate-chunk", chunk)
                .map_err(|error| local_ai::LocalAiError::GenerateFailed(error.to_string()))
        })
        .await
        .map_err(|error| error.to_string())?;

    window
        .emit(
            "local-ai-generate-chunk",
            LocalAiGenerateStreamChunk {
                request_id: stream_request_id,
                token_text: response.text.clone(),
                generated_tokens: response.generated_tokens,
                done: true,
                finish_reason: Some(response.finish_reason.clone()),
            },
        )
        .map_err(|error| error.to_string())?;

    Ok(response)
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

    builder
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

            app.manage(AppState {
                db: Mutex::new(db),
                local_ai: LocalAiState::new(LocalAiConfig::from_resource_dir(resource_dir)),
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
            local_ai_load,
            local_ai_get_runtime_config,
            local_ai_save_runtime_config,
            local_ai_test_runtime_config,
            local_ai_benchmark,
            local_ai_generate,
            local_ai_generate_stream,
            local_ai_generate_mtp_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
