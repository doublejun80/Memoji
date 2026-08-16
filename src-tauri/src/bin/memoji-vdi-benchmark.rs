use app_lib::local_ai::{LiteRtManager, LocalAiGenerateRequest};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkRow {
    iteration: usize,
    threads: usize,
    prompt_chars: usize,
    max_output_tokens: usize,
    state: &'static str,
    load_ms: u128,
    ttft_ms: Option<u128>,
    total_ms: u128,
    prompt_tokens: usize,
    generated_tokens: usize,
    decode_tokens_per_second: f64,
    output_chars: usize,
    ok: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkSummary {
    threads: usize,
    prompt_chars: usize,
    max_output_tokens: usize,
    state: &'static str,
    samples: usize,
    failures: usize,
    load_ms_median: Option<f64>,
    load_ms_p95: Option<f64>,
    ttft_ms_median: Option<f64>,
    ttft_ms_p95: Option<f64>,
    total_ms_median: Option<f64>,
    total_ms_p95: Option<f64>,
    decode_tokens_per_second_median: Option<f64>,
    decode_tokens_per_second_p95: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
struct BenchmarkCase {
    iteration: usize,
    threads: usize,
    prompt_chars: usize,
    max_output_tokens: usize,
    state: &'static str,
    load_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkReport {
    schema_version: u32,
    captured_at: String,
    platform: String,
    arch: String,
    model: String,
    transport: &'static str,
    runtime_version: &'static str,
    c_api_version: &'static str,
    iterations: usize,
    matrix: Vec<BenchmarkRow>,
    summaries: Vec<BenchmarkSummary>,
    limitations: Vec<String>,
}

fn percentile(samples: &[u128], quantile: f64) -> Option<f64> {
    percentile_f64(
        &samples
            .iter()
            .map(|value| *value as f64)
            .collect::<Vec<_>>(),
        quantile,
    )
}

fn percentile_f64(samples: &[f64], quantile: f64) -> Option<f64> {
    if samples.is_empty() {
        return None;
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let position = quantile.clamp(0.0, 1.0) * (sorted.len() - 1) as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    let weight = position - lower as f64;
    Some(sorted[lower] + (sorted[upper] - sorted[lower]) * weight)
}

fn summarize(matrix: &[BenchmarkRow]) -> Vec<BenchmarkSummary> {
    let mut keys = matrix
        .iter()
        .map(|row| {
            (
                row.threads,
                row.prompt_chars,
                row.max_output_tokens,
                row.state,
            )
        })
        .collect::<Vec<_>>();
    keys.sort_unstable();
    keys.dedup();
    keys.into_iter()
        .map(|(threads, prompt_chars, max_output_tokens, state)| {
            let matching = matrix
                .iter()
                .filter(|row| {
                    row.threads == threads
                        && row.prompt_chars == prompt_chars
                        && row.max_output_tokens == max_output_tokens
                        && row.state == state
                })
                .collect::<Vec<_>>();
            let successful = matching
                .iter()
                .copied()
                .filter(|row| row.ok)
                .collect::<Vec<_>>();
            let load_ms = successful.iter().map(|row| row.load_ms).collect::<Vec<_>>();
            let ttft_ms = successful
                .iter()
                .filter_map(|row| row.ttft_ms)
                .collect::<Vec<_>>();
            let total_ms = successful
                .iter()
                .map(|row| row.total_ms)
                .collect::<Vec<_>>();
            let decode_rate = successful
                .iter()
                .map(|row| row.decode_tokens_per_second)
                .collect::<Vec<_>>();
            BenchmarkSummary {
                threads,
                prompt_chars,
                max_output_tokens,
                state,
                samples: successful.len(),
                failures: matching.len() - successful.len(),
                load_ms_median: percentile(&load_ms, 0.5),
                load_ms_p95: percentile(&load_ms, 0.95),
                ttft_ms_median: percentile(&ttft_ms, 0.5),
                ttft_ms_p95: percentile(&ttft_ms, 0.95),
                total_ms_median: percentile(&total_ms, 0.5),
                total_ms_p95: percentile(&total_ms, 0.95),
                decode_tokens_per_second_median: percentile_f64(&decode_rate, 0.5),
                decode_tokens_per_second_p95: percentile_f64(&decode_rate, 0.95),
            }
        })
        .collect()
}

fn value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn numbers(args: &[String], name: &str, defaults: &[usize]) -> Vec<usize> {
    value(args, name)
        .map(|raw| {
            raw.split(',')
                .filter_map(|part| part.trim().parse().ok())
                .collect()
        })
        .filter(|items: &Vec<usize>| !items.is_empty())
        .unwrap_or_else(|| defaults.to_vec())
}

fn prompt(chars: usize) -> String {
    let prefix = "다음 VDI 배포 메모에서 결정과 위험을 요약하세요. ";
    format!("{prefix}{}", "가나다라마바사 아자차카타파하 ".repeat(chars))
        .chars()
        .take(chars)
        .collect()
}

fn measure(manager: &LiteRtManager, model: &str, case: BenchmarkCase) -> BenchmarkRow {
    let BenchmarkCase {
        iteration,
        threads,
        prompt_chars,
        max_output_tokens,
        state,
        load_ms,
    } = case;
    let started = Instant::now();
    let mut ttft_ms = None;
    let request = LocalAiGenerateRequest {
        prompt: prompt(prompt_chars),
        page_context: None,
        max_new_tokens: Some(max_output_tokens),
        temperature: Some(0.4),
        top_p: Some(0.95),
    };
    let result = manager.generate_stream(
        model,
        format!("benchmark-{iteration}-{threads}-{prompt_chars}-{max_output_tokens}-{state}"),
        request,
        CancellationToken::new(),
        |_| {
            if ttft_ms.is_none() {
                ttft_ms = Some(started.elapsed().as_millis());
            }
            Ok(())
        },
    );
    let total_ms = started.elapsed().as_millis();
    match result {
        Ok(response) => BenchmarkRow {
            iteration,
            threads,
            prompt_chars,
            max_output_tokens,
            state,
            load_ms,
            ttft_ms,
            total_ms,
            prompt_tokens: response.prompt_tokens,
            generated_tokens: response.generated_tokens,
            decode_tokens_per_second: if total_ms.saturating_sub(ttft_ms.unwrap_or(0)) == 0 {
                0.0
            } else {
                response.generated_tokens as f64
                    / (total_ms.saturating_sub(ttft_ms.unwrap_or(0)) as f64 / 1_000.0)
            },
            output_chars: response.text.chars().count(),
            ok: true,
            error: None,
        },
        Err(error) => BenchmarkRow {
            iteration,
            threads,
            prompt_chars,
            max_output_tokens,
            state,
            load_ms,
            ttft_ms,
            total_ms,
            prompt_tokens: 0,
            generated_tokens: 0,
            decode_tokens_per_second: 0.0,
            output_chars: 0,
            ok: false,
            error: Some(error.to_string()),
        },
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--help") {
        println!("Usage: memoji-vdi-benchmark --bundle <dir> [--model gemma4-e2b] [--threads 2,4] [--prompt-chars 256,1024] [--output-tokens 64,256] [--iterations 10] [--output report.json]");
        return Ok(());
    }
    let bundle = value(&args, "--bundle")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("MEMOJI_LITERT_BUNDLE_DIR").map(PathBuf::from))
        .ok_or("--bundle or MEMOJI_LITERT_BUNDLE_DIR is required")?;
    let model = value(&args, "--model").unwrap_or_else(|| "gemma4-e2b".into());
    let threads = numbers(&args, "--threads", &[2, 4]);
    let prompt_chars = numbers(&args, "--prompt-chars", &[256, 1_024]);
    let output_tokens = numbers(&args, "--output-tokens", &[64, 256]);
    let iterations = value(&args, "--iterations")
        .and_then(|raw| raw.parse::<usize>().ok())
        .unwrap_or(10)
        .clamp(1, 100);
    let output = value(&args, "--output").map(PathBuf::from);
    std::env::set_var("MEMOJI_LITERT_BUNDLE_DIR", &bundle);
    let data_dir = std::env::temp_dir().join("memoji-vdi-benchmark");
    std::fs::create_dir_all(&data_dir)?;
    let mut matrix = Vec::new();

    for thread_count in threads {
        std::env::set_var("MEMOJI_LITERT_THREADS", thread_count.to_string());
        for prompt_chars in &prompt_chars {
            for max_output_tokens in &output_tokens {
                for iteration in 1..=iterations {
                    let manager = LiteRtManager::discover(&bundle, &data_dir);
                    let load_started = Instant::now();
                    let load = manager.ensure_started_for(&model);
                    let load_ms = load_started.elapsed().as_millis();
                    if let Err(error) = load {
                        matrix.push(BenchmarkRow {
                            iteration,
                            threads: thread_count,
                            prompt_chars: *prompt_chars,
                            max_output_tokens: *max_output_tokens,
                            state: "cold",
                            load_ms,
                            ttft_ms: None,
                            total_ms: load_ms,
                            prompt_tokens: 0,
                            generated_tokens: 0,
                            decode_tokens_per_second: 0.0,
                            output_chars: 0,
                            ok: false,
                            error: Some(error),
                        });
                        continue;
                    }
                    matrix.push(measure(
                        &manager,
                        &model,
                        BenchmarkCase {
                            iteration,
                            threads: thread_count,
                            prompt_chars: *prompt_chars,
                            max_output_tokens: *max_output_tokens,
                            state: "cold",
                            load_ms,
                        },
                    ));
                    matrix.push(measure(
                        &manager,
                        &model,
                        BenchmarkCase {
                            iteration,
                            threads: thread_count,
                            prompt_chars: *prompt_chars,
                            max_output_tokens: *max_output_tokens,
                            state: "warm",
                            load_ms: 0,
                        },
                    ));
                }
            }
        }
    }
    let mut limitations = Vec::new();
    if std::env::consts::OS != "windows" {
        limitations.push("This host result is not Windows VDI acceptance evidence.".to_string());
    }
    limitations.push(
        "Peak RSS must be captured by the VDI host monitor or Task Manager during this matrix."
            .to_string(),
    );
    limitations.push(
        "promptChars is the input workload axis; the current LiteRT C API does not expose tokenizer prompt-token counts."
            .to_string(),
    );
    let summaries = summarize(&matrix);
    let report = BenchmarkReport {
        schema_version: 3,
        captured_at: chrono::Utc::now().to_rfc3339(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        model,
        transport: "in_process",
        runtime_version: "0.16.0",
        c_api_version: "0.1.0",
        iterations,
        matrix,
        summaries,
        limitations,
    };
    let rendered = serde_json::to_string_pretty(&report)? + "\n";
    if let Some(path) = output {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, &rendered)?;
    }
    print!("{rendered}");
    if report.matrix.iter().any(|row| !row.ok) {
        std::process::exit(2);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_uses_linear_interpolation_for_repeatable_summaries() {
        let samples = [10_u128, 20, 30, 40];
        assert_eq!(percentile(&samples, 0.5), Some(25.0));
        assert_eq!(percentile(&samples, 0.95), Some(38.5));
        assert_eq!(percentile(&[], 0.95), None);
    }
}
