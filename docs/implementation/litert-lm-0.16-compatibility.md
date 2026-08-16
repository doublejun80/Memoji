# LiteRT-LM 0.16.0 native promotion record

Date: 2026-08-16  
Decision: promote LiteRT-LM 0.16.0 C API 0.1.0 to the Memoji GA default.

## What changed

Memoji no longer starts the LiteRT-LM Python/HTTP server for its GA path. Rust loads the
official `litert_lm_c_api-0.1.0` dynamic library in the Tauri process and sends prompts through
the conversation streaming API. The transport is therefore `in_process`: there is no Python
runtime, child server, loopback port, HTTP request surface, or bearer-token claim.

This is a real runtime upgrade, not a version-label change. The native path implements engine
creation, CPU/XNNPACK thread configuration, conversation creation, streaming callbacks,
cancellation, model switching, status reporting, and a bounded three-attempt recovery policy.

## Locked runtime and models

The machine-readable lock is
`src-tauri/resources/local_ai/runtime-compatibility.json`.

| Component | Role | Exact lock |
|---|---|---|
| LiteRT-LM | GA runtime | 0.16.0 |
| LiteRT-LM C API | in-process ABI | 0.1.0 |
| Gemma 4 E2B IT | VDI default | 2,588,147,712 bytes, SHA-256 `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c` |
| Gemma 4 E4B IT | quality option | 3,659,530,240 bytes, SHA-256 `0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0` |
| LiteRT-LM 0.13.1 | rollback only | legacy fallback, not the default |

The prepared local E2B bundle independently passed byte-size and SHA-256 checks for both the
model and native runtime. The verification record is
`docs/implementation/litert-native-bundle-verification.json`.

Primary upstream sources:

- [LiteRT-LM v0.16.0 release](https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.16.0)
- [Gemma 4 E2B LiteRT-LM model](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- [Gemma 4 E4B LiteRT-LM model](https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm)

## Execution evidence

The ignored real-model Rust integration test loaded the official C API and E2B bundle in the
Memoji process and streamed generated text. The standalone native benchmark then executed a
cold engine load and a warm conversation against the same bundle.

Latest reproducible macOS smoke (`4` CPU threads, 128 prompt characters, 16 maximum output
tokens):

| State | Load | TTFT | Total | Generated | Decode rate |
|---|---:|---:|---:|---:|---:|
| fresh engine | 204 ms | 552 ms | 689 ms | 4 tokens | 5.81 tok/s |
| warm engine | 0 ms | 283 ms | 421 ms | 4 tokens | 9.50 tok/s |

“Fresh engine” means a new native engine in a new benchmark process; the operating-system file
cache may still be warm. The complete JSON is
`docs/implementation/vdi-benchmark-macos-native-smoke.json`.

## VDI operating profile

- E2B is the default for Windows VDI and advertises an 8 GiB recommended-RAM floor.
- E4B is opt-in and advertises a 16 GiB recommended-RAM floor.
- Default inference uses CPU/XNNPACK with four threads; the benchmark accepts a thread matrix
  so the target VDI image can tune contention rather than assuming more threads are faster.
- Model and runtime files are prepared once with exact hashes. No package installation or
  model download is required at application startup.
- The Windows bundle script stages the app, native DLL, model, benchmark executable, notices,
  manifest, and CycloneDX SBOM. When a certificate is provided it signs and verifies the EXE,
  benchmark EXE, and DLL.

## Remaining acceptance boundary

The native promotion is implemented and verified on this Apple Silicon host. It does not prove
the target Windows VDI image, EDR policy, peak RSS, Authenticode chain, or installer behavior.
Before a Windows GA artifact is released, run the checked-in benchmark matrix on the exact VDI
image, capture peak RSS with the host monitor, verify EDR allow-list behavior, and sign every
executable component. The user explicitly requested that no Windows distribution be built in
this phase, so those external acceptance gates remain open without reverting the runtime
promotion.
