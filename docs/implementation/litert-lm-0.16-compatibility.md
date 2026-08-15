# LiteRT-LM 0.16.0 Compatibility Decision

Date: 2026-08-16  
Decision: retain LiteRT-LM 0.13.1 as the GA default; keep 0.16.0 as a pinned upgrade candidate.

## Why the default did not change

The official v0.16.0 release and Python packages exist and their published sizes and SHA-256 digests were verified. The current host, however, is an Apple Silicon macOS machine without `uv`, a LiteRT-LM executable, a registered Gemma 4 E2B `.litertlm` model, Windows VDI, or the target EDR policy. It therefore cannot produce the required Windows VDI start/stop, memory, performance, signing, or EDR evidence.

Changing the default under those conditions would turn an unverified candidate into a GA dependency. The bundle continues to default to 0.13.1. `scripts/prepare-vdi-ai-bundle.mjs --litert-version 0.16.0` is available for an explicit compatibility build, but only for versions and platform wheels pinned in `runtime-compatibility.json`.

## Release and asset lock

Primary sources:

- [LiteRT-LM v0.16.0 release](https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.16.0), published 2026-08-11T18:25:33Z.
- [litert-lm 0.16.0 on PyPI](https://pypi.org/project/litert-lm/0.16.0/).
- [LiteRT-LM v0.13.1 release](https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.13.1).

The complete machine-readable lock is in `src-tauri/resources/local_ai/runtime-compatibility.json`. The principal CLI wheels independently downloaded and hashed on this host were:

| Version | File | Bytes | SHA-256 |
|---|---|---:|---|
| 0.13.1 | `litert_lm-0.13.1-py3-none-any.whl` | 60,408 | `2390a09693f3d728ecfad56119b326a9f9e302d2901392ff75b025040ca365b9` |
| 0.16.0 | `litert_lm-0.16.0-py3-none-any.whl` | 79,203 | `ae9a14fcbb5c8f3e53652b89624bf4473df0f858257fa70a31425ded14d90d8b` |

The lock also pins the platform API wheels, builder wheels, and every GitHub release asset published for v0.16.0. The bundle script downloads the locked CLI, builder, and matching platform API wheels, verifies byte size and SHA-256, then installs those local artifacts. General Python transitive packages still resolve through the configured package index; an air-gapped release mirror must snapshot those dependencies before production packaging.

## CLI/API snapshot

Because the runtime could not be executed, this comparison was extracted from the two verified CLI wheels. It is source-contract evidence, not execution evidence.

| Contract | 0.13.1 | 0.16.0 | Result |
|---|---|---|---|
| console entry | `litert-lm = litert_lm_cli.main:main` | same | compatible |
| `serve` | present | present | compatible |
| `--host` | present, default `0.0.0.0` | present, default `0.0.0.0` | app must continue forcing `127.0.0.1` |
| `--port` | present, default 9379 | present, default 9379 | compatible |
| `/v1/models` | declared | declared | requires runtime test |
| `/v1/chat/completions` | declared | declared | requires runtime test |
| `--cors-origin` | absent | added | non-breaking |
| CLI config option | absent | added | non-breaking candidate |
| server auth flag | absent | absent | residual risk remains |
| new commands | none | `pack`, `unpack` | additive |

Memoji therefore keeps loopback-only binding, a random per-session port, child-process ownership checks, and an optional per-session token only when a future server explicitly exposes an auth capability. The UI must not claim authentication or MTP from version alone.

## Compatibility matrix

| Gate | Result on this host | Required before default promotion |
|---|---|---|
| exact tag, asset size and SHA-256 | pass | repeat in release CI |
| CLI source contract comparison | pass | run `--version`, `--help`, `serve --help` on Windows |
| start/stop and three load cycles | blocked: runtime/model unavailable | pass on target Windows VDI |
| `/v1/models` and chat streaming | blocked | pass |
| Korean UTF-8 | blocked | pass |
| 2K/4K context | blocked | pass with server token counts |
| cancellation and restart | blocked | pass |
| missing model and port collision | blocked | pass |
| E2B 256/1024 by 64/256 cold/warm benchmark | blocked | record TTFT, total time, tokens/s and peak RSS |
| EDR scan and process policy | blocked: no target VDI/EDR | pass |
| rollback to 0.13.1 | design pass | rehearse with signed candidate package |

The executable harness is `scripts/verify-litert-runtime.mjs`; the benchmark harness is `scripts/benchmark-local-ai.mjs`. Both emit explicit `blocked` evidence when prerequisites are absent and accept `--strict` for release gates.

## Promotion rule

Promote 0.16.0 only after the exact Windows assets in the compatibility lock complete every required gate on the target VDI image. Store the JSON harness outputs, peak-RSS capture, EDR result, bundle checksum, and rollback rehearsal with the release artifacts. A macOS or non-VDI result may supplement that record but cannot replace it.
