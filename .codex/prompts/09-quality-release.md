# Codex Phase 09 · Runtime Compatibility, VDI and Release

Implement Tasks 16, 18, 19, 20 and 21.

- Refactor runtimes by capability.
- Evaluate LiteRT-LM 0.16.0 in a separate compatibility branch.
- Preserve 0.13.1 if 0.16.0 is not verified on Windows VDI.
- Add cold/warm benchmark metrics, cancellation, port conflict and runtime recovery tests.
- Replace JS byte-array database import with a path-based Rust import.
- Add CI, dynamic versions, checksums, NOTICE, SBOM and signing hooks.
- Validate accessibility, 125% scale and four viewport sizes.
- Produce `MEMOJI_2_GA_IMPLEMENTATION_REPORT.md`.

Never claim an actual Windows VDI test from another OS or from static inspection.
