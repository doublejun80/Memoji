# Third-Party Notices

Memoji includes or can bundle the following third-party components. See the package lock files and generated SBOM for the complete dependency inventory.

## LiteRT-LM

Copyright The LiteRT-LM Authors.

Licensed under the Apache License, Version 2.0. Source: [google-ai-edge/LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM).

The GA bundle default is LiteRT-LM 0.13.1. LiteRT-LM 0.16.0 is pinned as a compatibility candidate and is not the default until the Windows VDI gate passes. Exact release assets and hashes are recorded in `src-tauri/resources/local_ai/runtime-compatibility.json`.

## Gemma 4 E2B

Copyright Google LLC.

The VDI bundle may include the `litert-community/gemma-4-E2B-it-litert-lm` model under its published license and notice requirements. The model is not stored in this source repository. Release builders must preserve the model license, source, byte size, and SHA-256 in the generated bundle manifest.

## Application dependencies

The React, Tauri, Rust, Milkdown, SQLite, Radix UI, Candle, and related dependencies retain their respective licenses. Production packages must include the generated SBOM and license inventory; this notice is not a substitute for those files.
