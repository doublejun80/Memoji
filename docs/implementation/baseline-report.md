# Memoji 2.0 GA baseline report

Recorded: 2026-08-15 (Asia/Seoul)

## Repository state

- Branch: `codex/memoji-2-ga-uiux`
- Source baseline: pull request #1, `258ae442a069c15e312687923aebaef48fd3bdda`
- Isolation: `/Volumes/mac_dock/github/Memoji/.worktrees/memoji-2-ga-uiux`
- The original `main` checkout remains dirty and was not used for feature edits.
- Reliability markers verified: `flushUnsaved`, `MarkdownEditorHandle`,
  `local_ai_managed_runtime_status`, and animation-frame streaming are present.

## Baseline gates

| Gate | Result |
|---|---|
| `npm ci` | Passed |
| `npm audit --audit-level=moderate` | Passed after compatible transitive lockfile updates; zero known vulnerabilities |
| `npm run check` | Passed |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Passed |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Passed: 43 passed, 0 failed, 2 model-dependent tests ignored |

The first Rust baseline run exposed one non-hermetic test that required an absent downloaded
tokenizer. The test now loads a committed synthetic WordLevel fixture and still verifies all
three Gemma turn-boundary stop tokens. The production implementation was unchanged.

The production build still emits a roughly 1.96 MB main JavaScript chunk warning. This is a
recorded performance debt for Task 19 and is not concealed by raising the warning threshold.
