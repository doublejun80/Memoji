use serde::Serialize;
use std::{
    env,
    fs::{File, OpenOptions},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 9379;
const MODEL_ID: &str = "gemma4-e2b";
const MODEL_FILE: &str = "model.litertlm";

#[derive(Debug, Clone)]
pub struct LiteRtManager {
    inner: Arc<LiteRtManagerInner>,
}

#[derive(Debug)]
struct LiteRtManagerInner {
    layout: Option<LiteRtLayout>,
    process: Mutex<LiteRtProcessState>,
    log_path: PathBuf,
}

#[derive(Debug)]
struct LiteRtProcessState {
    child: Option<Child>,
    last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct LiteRtLayout {
    launcher: LiteRtLauncher,
    registry_dir: PathBuf,
    model_path: PathBuf,
    source: String,
    bundled: bool,
}

#[derive(Debug, Clone)]
enum LiteRtLauncher {
    Python {
        executable: PathBuf,
        python_home: PathBuf,
        python_path: PathBuf,
    },
    Cli {
        executable: PathBuf,
    },
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
    pub log_path: String,
    pub last_error: Option<String>,
}

impl LiteRtManager {
    pub fn discover(resource_dir: &Path, data_dir: &Path) -> Self {
        let layout = discover_layout(resource_dir);
        let log_path = data_dir.join("logs").join("litert-lm.log");

        Self {
            inner: Arc::new(LiteRtManagerInner {
                layout,
                process: Mutex::new(LiteRtProcessState {
                    child: None,
                    last_error: None,
                }),
                log_path,
            }),
        }
    }

    pub fn ensure_started(&self) -> Result<bool, String> {
        if endpoint_reachable() {
            return Ok(false);
        }

        let layout =
            self.inner.layout.as_ref().ok_or_else(|| {
                "VDI용 LiteRT 런타임 또는 Gemma 모델을 찾지 못했습니다.".to_string()
            })?;

        let mut state = self
            .inner
            .process
            .lock()
            .map_err(|error| error.to_string())?;

        if let Some(child) = state.child.as_mut() {
            match child.try_wait() {
                Ok(None) => return Ok(false),
                Ok(Some(status)) => {
                    state.last_error = Some(format!("LiteRT-LM 서버가 종료되었습니다: {status}"));
                    state.child = None;
                }
                Err(error) => {
                    state.last_error = Some(format!("LiteRT-LM 프로세스 상태 확인 실패: {error}"));
                    state.child = None;
                }
            }
        }

        let (stdout, stderr) = open_log_files(&self.inner.log_path)?;
        let mut command = layout.command();
        command
            .arg("serve")
            .arg("--host")
            .arg(DEFAULT_HOST)
            .arg("--port")
            .arg(DEFAULT_PORT.to_string())
            .env("LITERT_LM_DIR", &layout.registry_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr));

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        match command.spawn() {
            Ok(child) => {
                log::info!(
                    "Started managed LiteRT-LM server from {} using registry {:?}",
                    layout.source,
                    layout.registry_dir
                );
                state.child = Some(child);
                state.last_error = None;
                Ok(true)
            }
            Err(error) => {
                let message = format!("VDI 내장 LiteRT-LM 서버 시작 실패: {error}");
                state.last_error = Some(message.clone());
                Err(message)
            }
        }
    }

    pub fn status(&self) -> LiteRtManagedStatus {
        let mut process_running = false;
        let last_error;

        match self.inner.process.lock() {
            Ok(mut state) => {
                if let Some(child) = state.child.as_mut() {
                    match child.try_wait() {
                        Ok(None) => process_running = true,
                        Ok(Some(status)) => {
                            state.last_error =
                                Some(format!("LiteRT-LM 서버가 종료되었습니다: {status}"));
                            state.child = None;
                        }
                        Err(error) => {
                            state.last_error =
                                Some(format!("LiteRT-LM 프로세스 상태 확인 실패: {error}"));
                            state.child = None;
                        }
                    }
                }
                last_error = state.last_error.clone();
            }
            Err(error) => last_error = Some(error.to_string()),
        }

        let layout = self.inner.layout.as_ref();
        LiteRtManagedStatus {
            available: layout.is_some(),
            bundled: layout.is_some_and(|layout| layout.bundled),
            model_available: layout.is_some_and(|layout| layout.model_path.is_file()),
            process_running,
            endpoint_reachable: endpoint_reachable(),
            source: layout.map(|layout| layout.source.clone()),
            registry_path: layout.map(|layout| layout.registry_dir.to_string_lossy().to_string()),
            model_path: layout.map(|layout| layout.model_path.to_string_lossy().to_string()),
            log_path: self.inner.log_path.to_string_lossy().to_string(),
            last_error,
        }
    }

    pub fn stop(&self) {
        let Ok(mut state) = self.inner.process.lock() else {
            return;
        };
        if let Some(mut child) = state.child.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("Stopped managed LiteRT-LM server");
        }
    }
}

impl LiteRtLayout {
    fn command(&self) -> Command {
        match &self.launcher {
            LiteRtLauncher::Python {
                executable,
                python_home,
                python_path,
            } => {
                let mut command = Command::new(executable);
                command
                    .arg("-m")
                    .arg("litert_lm_cli.main")
                    .env("PYTHONHOME", python_home)
                    .env("PYTHONPATH", python_path);
                command
            }
            LiteRtLauncher::Cli { executable } => Command::new(executable),
        }
    }
}

impl Drop for LiteRtManagerInner {
    fn drop(&mut self) {
        if let Ok(state) = self.process.get_mut() {
            if let Some(child) = state.child.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn discover_layout(resource_dir: &Path) -> Option<LiteRtLayout> {
    let roots = bundle_root_candidates(resource_dir);

    for root in roots {
        let registry_dir = root.join("registry");
        let model_path = model_path(&registry_dir);
        if !model_path.is_file() {
            continue;
        }

        if let Some(launcher) = bundled_launcher(&root) {
            return Some(LiteRtLayout {
                launcher,
                registry_dir,
                model_path,
                source: root.to_string_lossy().to_string(),
                bundled: true,
            });
        }

        if let Some(executable) = system_litert_executable() {
            return Some(LiteRtLayout {
                launcher: LiteRtLauncher::Cli { executable },
                registry_dir,
                model_path,
                source: format!("{} (시스템 LiteRT 런타임)", root.to_string_lossy()),
                bundled: true,
            });
        }
    }

    let registry_dir = env::var_os("MEMOJI_LITERT_REGISTRY")
        .map(PathBuf::from)
        .or_else(default_registry_dir)?;
    let model_path = model_path(&registry_dir);
    if !model_path.is_file() {
        return None;
    }

    let executable = system_litert_executable()?;
    Some(LiteRtLayout {
        launcher: LiteRtLauncher::Cli { executable },
        registry_dir,
        model_path,
        source: "사용자 LiteRT-LM 설치".to_string(),
        bundled: false,
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

fn bundled_launcher(root: &Path) -> Option<LiteRtLauncher> {
    if let Some(executable) = env::var_os("MEMOJI_LITERT_RUNTIME").map(PathBuf::from) {
        if executable.is_file() {
            return Some(LiteRtLauncher::Cli { executable });
        }
    }

    #[cfg(target_os = "windows")]
    let python = root.join("runtime").join("python").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    let python = root
        .join("runtime")
        .join("python")
        .join("bin")
        .join("python3");

    let python_home = root.join("runtime").join("python");
    let python_path = root.join("runtime").join("site-packages");
    if python.is_file() && python_path.is_dir() {
        return Some(LiteRtLauncher::Python {
            executable: python,
            python_home,
            python_path,
        });
    }

    None
}

fn system_litert_executable() -> Option<PathBuf> {
    if let Some(executable) = env::var_os("MEMOJI_LITERT_RUNTIME").map(PathBuf::from) {
        if executable.is_file() {
            return Some(executable);
        }
    }

    find_in_path(if cfg!(target_os = "windows") {
        "litert-lm.exe"
    } else {
        "litert-lm"
    })
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
}

fn default_registry_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".litert-lm"))
}

fn model_path(registry_dir: &Path) -> PathBuf {
    registry_dir.join("models").join(MODEL_ID).join(MODEL_FILE)
}

fn endpoint_reachable() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], DEFAULT_PORT));
    TcpStream::connect_timeout(&address, Duration::from_millis(120)).is_ok()
}

fn open_log_files(path: &Path) -> Result<(File, File), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("LiteRT 로그 폴더 생성 실패: {error}"))?;
    }

    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("LiteRT 로그 파일 열기 실패: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("LiteRT 로그 파일 복제 실패: {error}"))?;
    Ok((stdout, stderr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_path_uses_litert_registry_layout() {
        assert_eq!(
            model_path(Path::new("registry")),
            Path::new("registry")
                .join("models")
                .join("gemma4-e2b")
                .join("model.litertlm")
        );
    }

    #[test]
    fn endpoint_probe_is_loopback_only() {
        let address = SocketAddr::from(([127, 0, 0, 1], DEFAULT_PORT));
        assert!(address.ip().is_loopback());
    }

    #[test]
    fn bundle_candidates_include_resource_and_executable_locations() {
        let candidates = bundle_root_candidates(Path::new("resource-root"));
        assert!(candidates.contains(&Path::new("resource-root").join("ai")));
        assert!(candidates.contains(&Path::new("resource-root").join("litert-lm")));
    }
}
