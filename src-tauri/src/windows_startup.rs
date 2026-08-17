pub(crate) fn webview2_runtime_present(registry_outputs: &[String]) -> bool {
    registry_outputs.iter().any(|output| {
        output.lines().any(|line| {
            if !line.contains("REG_SZ") {
                return false;
            }
            line.split_whitespace()
                .next_back()
                .is_some_and(|version| !version.is_empty() && version != "0.0.0.0")
        })
    })
}

#[cfg(target_os = "windows")]
const WEBVIEW2_CLIENT_ID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

#[cfg(target_os = "windows")]
const WEBVIEW2_INSTALLER: &str = "MicrosoftEdgeWebView2RuntimeInstallerX64.exe";

#[cfg(target_os = "windows")]
pub(crate) fn install_panic_reporter() {
    std::panic::set_hook(Box::new(|panic_info| {
        let message = format!("Memoji 시작 중 예기치 않은 오류가 발생했습니다.\n\n{panic_info}");
        append_startup_log(&message);
        show_message_box(&message);
    }));
    append_startup_log("Memoji Windows VDI startup preflight started");
}

#[cfg(target_os = "windows")]
pub(crate) fn prepare_vdi_runtime() -> Result<(), String> {
    let registry_outputs = query_webview2_registry();
    if webview2_runtime_present(&registry_outputs) {
        append_startup_log("WebView2 Runtime detected");
        return Ok(());
    }

    let executable = std::env::current_exe()
        .map_err(|error| format!("실행 파일 경로를 확인하지 못했습니다: {error}"))?;
    let executable_directory = executable
        .parent()
        .ok_or_else(|| "실행 파일 폴더를 확인하지 못했습니다".to_string())?;
    let installer = executable_directory
        .join("webview2")
        .join(WEBVIEW2_INSTALLER);
    if !installer.is_file() {
        return Err(format!(
            "WebView2 Runtime이 없고 오프라인 설치 파일도 없습니다.\n필요한 파일: {}",
            installer.display()
        ));
    }

    append_startup_log("WebView2 Runtime missing; launching bundled offline installer");
    let status = std::process::Command::new(&installer)
        .args(["/silent", "/install"])
        .status()
        .map_err(|error| {
            format!("WebView2 오프라인 설치 프로그램을 실행하지 못했습니다: {error}")
        })?;
    let exit_code = status.code().unwrap_or(-1);
    if !status.success() && exit_code != 3010 {
        return Err(format!(
            "WebView2 Runtime 설치가 실패했습니다. 종료 코드: {exit_code}\nVDI EDR 또는 실행 정책에서 설치 파일 허용 여부를 확인하세요."
        ));
    }

    for _ in 0..20 {
        if webview2_runtime_present(&query_webview2_registry()) {
            append_startup_log("WebView2 Runtime installation completed");
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }

    Err("WebView2 설치 프로그램은 종료됐지만 Runtime 등록을 확인하지 못했습니다. VDI 정책 또는 재로그인이 필요할 수 있습니다.".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) fn report_fatal_startup_error(error: &str) {
    let message = format!(
        "Memoji를 시작하지 못했습니다.\n\n{error}\n\n진단 로그: {}",
        startup_log_path().display()
    );
    append_startup_log(&message);
    show_message_box(&message);
}

#[cfg(target_os = "windows")]
fn query_webview2_registry() -> Vec<String> {
    [
        format!(r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
        format!(r"HKCU\Software\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_CLIENT_ID}"),
    ]
    .into_iter()
    .map(|registry_path| {
        std::process::Command::new("reg.exe")
            .args(["query", &registry_path, "/v", "pv"])
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
            .unwrap_or_default()
    })
    .collect()
}

#[cfg(target_os = "windows")]
fn startup_log_path() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(std::path::Path::to_path_buf))
        .unwrap_or_else(std::env::temp_dir)
        .join("Memoji-startup-diagnostics.log")
}

#[cfg(target_os = "windows")]
fn append_startup_log(message: &str) {
    use std::io::Write;

    let path = startup_log_path();
    let timestamp = chrono::Local::now().to_rfc3339();
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "[{timestamp}] {message}");
    }
}

#[cfg(target_os = "windows")]
fn show_message_box(message: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let title: Vec<u16> = "Memoji 시작 오류\0".encode_utf16().collect();
    let body: Vec<u16> = format!("{message}\0").encode_utf16().collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::webview2_runtime_present;

    #[test]
    fn detects_a_nonzero_webview2_registry_version() {
        let outputs = vec![
            String::new(),
            "HKEY_CURRENT_USER\\Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\n    pv    REG_SZ    146.0.3856.62"
                .to_string(),
        ];

        assert!(webview2_runtime_present(&outputs));
    }
}
