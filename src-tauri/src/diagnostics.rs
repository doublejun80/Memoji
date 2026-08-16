use serde::Serialize;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCounts {
    pub active_pages: i64,
    pub trashed_pages: i64,
    pub revisions: i64,
    pub tasks: i64,
    pub events: i64,
    pub ai_runs: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticAiRuntime {
    pub available: bool,
    pub bundled: bool,
    pub transport: String,
    pub runtime_version: String,
    pub c_api_version: String,
    pub active_model_id: Option<String>,
    pub available_model_ids: Vec<String>,
    pub backend: Option<String>,
    pub threads: Option<usize>,
    pub restart_attempts: u8,
    pub restart_limit: u8,
    pub error_present: bool,
    pub last_error_code: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRuntimeMetrics {
    pub runtime_version: Option<String>,
    pub load_ms: Option<u128>,
    pub ttft_ms: Option<u128>,
    pub prefill_tokens: Option<usize>,
    pub prefill_ms: Option<u128>,
    pub decode_tokens: Option<usize>,
    pub decode_ms: Option<u128>,
    pub peak_rss_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub format_version: u32,
    pub generated_at: String,
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub cpu_threads: usize,
    pub schema_version: i64,
    pub database_quick_check: String,
    pub counts: DiagnosticCounts,
    pub ai_runtime: DiagnosticAiRuntime,
    pub runtime_metrics: DiagnosticRuntimeMetrics,
    pub privacy: Vec<String>,
}

pub fn diagnostic_error_code(error: Option<&str>) -> Option<String> {
    let normalized = error?.to_ascii_lowercase();
    let code = if normalized.contains("library") || normalized.contains("dll") {
        "runtime_library_missing"
    } else if normalized.contains("model")
        && (normalized.contains("missing") || normalized.contains("not found"))
    {
        "model_missing"
    } else if normalized.contains("unsupported") {
        "unsupported_runtime"
    } else if normalized.contains("cancel") {
        "generation_cancelled"
    } else if normalized.contains("load") {
        "model_load_failed"
    } else {
        "runtime_error"
    };
    Some(code.to_string())
}

pub fn write_diagnostic_zip(path: &Path, report: &DiagnosticReport) -> Result<(), String> {
    let file = std::fs::File::create(path)
        .map_err(|error| format!("Failed to create diagnostic ZIP: {error}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .unix_permissions(0o644);
    let report_json = serde_json::to_vec_pretty(report)
        .map_err(|error| format!("Failed to serialize diagnostics: {error}"))?;
    zip.start_file("diagnostics.json", options)
        .map_err(|error| format!("Failed to write diagnostics: {error}"))?;
    zip.write_all(&report_json)
        .map_err(|error| format!("Failed to write diagnostics: {error}"))?;
    zip.start_file("README.txt", options)
        .map_err(|error| format!("Failed to write diagnostic README: {error}"))?;
    zip.write_all(
        b"Memoji VDI diagnostic bundle\nContains runtime, schema, integrity, and row-count metadata only.\nDocument bodies, prompts, environment variables, credentials, and absolute paths are excluded.\n",
    )
    .map_err(|error| format!("Failed to write diagnostic README: {error}"))?;
    zip.finish()
        .map_err(|error| format!("Failed to finalize diagnostic ZIP: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn diagnostic_zip_excludes_document_bodies_paths_and_credentials() {
        let path =
            std::env::temp_dir().join(format!("memoji-diagnostic-{}.zip", std::process::id()));
        let report = DiagnosticReport {
            format_version: 1,
            generated_at: "2026-08-16T00:00:00Z".into(),
            app_version: "2.0.0".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
            cpu_threads: 4,
            schema_version: 6,
            database_quick_check: "ok".into(),
            counts: DiagnosticCounts {
                active_pages: 1,
                trashed_pages: 0,
                revisions: 1,
                tasks: 1,
                events: 0,
                ai_runs: 0,
            },
            ai_runtime: DiagnosticAiRuntime {
                available: true,
                bundled: true,
                transport: "in_process".into(),
                runtime_version: "0.16.0".into(),
                c_api_version: "0.1.0".into(),
                active_model_id: Some("gemma4-e2b".into()),
                available_model_ids: vec!["gemma4-e2b".into()],
                backend: Some("cpu".into()),
                threads: Some(4),
                restart_attempts: 0,
                restart_limit: 3,
                error_present: false,
                last_error_code: Some("runtime_error".into()),
            },
            runtime_metrics: DiagnosticRuntimeMetrics {
                runtime_version: Some("0.16.0".into()),
                load_ms: Some(1_500),
                ttft_ms: Some(180),
                prefill_tokens: Some(32),
                prefill_ms: Some(120),
                decode_tokens: Some(8),
                decode_ms: Some(260),
                peak_rss_bytes: Some(1_024),
            },
            privacy: vec!["document bodies excluded".into()],
        };
        write_diagnostic_zip(&path, &report).expect("write ZIP");
        let file = std::fs::File::open(&path).expect("open ZIP");
        let mut zip = zip::ZipArchive::new(file).expect("read ZIP");
        assert_eq!(zip.len(), 2);
        let mut diagnostics = String::new();
        zip.by_name("diagnostics.json")
            .unwrap()
            .read_to_string(&mut diagnostics)
            .unwrap();
        assert!(diagnostics.contains("in_process"));
        assert!(diagnostics.contains("\"ttftMs\": 180"));
        assert!(diagnostics.contains("\"lastErrorCode\": \"runtime_error\""));
        for forbidden in ["secret-body", "api_key", "C:\\\\Users", "/Users/"] {
            assert!(!diagnostics.contains(forbidden));
        }
        let _ = std::fs::remove_file(path);
    }
}
