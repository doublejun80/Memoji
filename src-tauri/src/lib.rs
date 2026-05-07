mod database;
mod local_ai;

use database::{Database, Page};
use local_ai::{
    LocalAiConfig, LocalAiGenerateRequest, LocalAiGenerateResponse, LocalAiGenerateStreamChunk,
    LocalAiState, LocalAiStatus, MtpConfig,
};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, Window};

struct AppState {
    db: Mutex<Database>,
    local_ai: LocalAiState,
}

/// 데이터 저장 디렉토리 결정
/// 기본값: 실행 파일과 같은 폴더의 data 디렉토리 (Portable 모드)
/// VDI 환경에서도 안전하게 작동
fn get_data_directory() -> Result<PathBuf, String> {
    // 1. 환경 변수 확인 (고급 사용자용 - 선택사항)
    if let Ok(custom_path) = std::env::var("MEMOJI_DATA_PATH") {
        let path = PathBuf::from(custom_path);
        println!("📁 Using custom data path: {:?}", path);
        return Ok(path);
    }

    // 2. 기본값: 실행 파일과 같은 폴더의 data 디렉토리
    // VDI 환경에서도 안전하게 작동
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;

    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;

    let data_dir = exe_dir.join("data");

    println!("📁 Using portable data directory: {:?}", data_dir);

    Ok(data_dir)
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
fn local_ai_status(state: State<AppState>) -> Result<LocalAiStatus, String> {
    Ok(state.local_ai.status())
}

#[tauri::command]
fn local_ai_load(state: State<AppState>) -> Result<LocalAiStatus, String> {
    state.local_ai.load().map_err(|error| error.to_string())
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
) -> Result<LocalAiGenerateResponse, String> {
    let config = MtpConfig::from_env()
        .ok_or_else(|| "MTP endpoint is not configured. Set MEMOJI_MTP_ENDPOINT.".to_string())?;
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
    let mut builder = tauri::Builder::default();

    // ⭐ Single Instance 플러그인 - 가장 먼저 등록해야 함!
    // Windows/Linux에서 앱 다중 실행 방지
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 이미 실행 중인 인스턴스가 있을 때 실행되는 콜백
            log::info!("🔔 새 인스턴스 실행 시도 감지 - 기존 창 포커스");

            // 기존 창을 포커스
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                log::info!("✅ 기존 창 포커스 완료");
            }
        }));
    }

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
            local_ai_status,
            local_ai_load,
            local_ai_generate,
            local_ai_generate_stream,
            local_ai_generate_mtp_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
