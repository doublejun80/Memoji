# Local Gemma Model Resources

LiteRT-LM is the current default local AI runtime. The app keeps this directory
as the optional GGUF resource slot for the built-in Candle backend and llama.cpp
fallbacks. Large model files are intentionally ignored by git and are not
required when LiteRT-LM is selected.

Optional GGUF runtime paths:

- `gemma-4-e2b-it-q4.gguf`
- `tokenizer.json`

You can override these paths without rebuilding:

- `MEMOJI_GEMMA_GGUF=/absolute/path/to/model.gguf`
- `MEMOJI_GEMMA_TOKENIZER=/absolute/path/to/tokenizer.json`
- `MEMOJI_LOCAL_AI_CONTEXT=2048`

The built-in backend never downloads models and never falls back to a network
inference API. If `gemma-4-e2b-it-q4.gguf` is missing, the Candle and llama.cpp
runtime definitions remain available internally, but they are not shown in the
default UI. Re-enable them only after the GGUF file is downloaded again. Keep
the default context at 2048 or 4096 for VDI CPU memory safety.

## Default LiteRT-LM runtime

LiteRT-LM runs as a separate process in the same user/VDI session. Memoji does
not install it, import its model, or start the server automatically. During
image preparation, import the model into the LiteRT-LM registry:

```powershell
uv tool install litert-lm
litert-lm import --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm `
  gemma-4-E2B-it.litertlm gemma4-e2b
```

Provision that registry so it is visible to the user account that will run the
server. Once the model has been imported into the image, runtime inference can
remain offline. Start the server before Memoji:

```powershell
litert-lm serve --host 127.0.0.1 --port 9379
```

The application defaults are:

```text
Endpoint: http://127.0.0.1:9379/v1/chat/completions
Model: gemma4-e2b
```

Memoji probes the matching `/v1/models` endpoint and reports the AI as ready
only after it responds successfully and lists `gemma4-e2b`. Saving the endpoint is not enough. Rust
rejects public, LAN, and cloud hosts; only `localhost`, `127.0.0.0/8`, and
`::1` loopback endpoints are accepted.

## VDI performance diagnosis

Because VDI CPU, storage, and policy settings vary by host, measure on the
actual VDI pool. Start with the 256-token response limit and reduce it to 64 on
slow CPU-only sessions. Start LiteRT-LM at login so its registry and model are
ready before the first user request. If a supported GPU backend is available,
validate it on the golden image rather than assuming the virtual GPU is exposed.

Settings → Local AI → VDI performance diagnosis benchmarks only the optional
built-in GGUF backend and is disabled while the default server runtime is
selected. It is not a LiteRT-LM benchmark.

## Optional server overrides and MTP

Environment variables can lock the runtime configuration for a managed image:

- `MEMOJI_MTP_ENDPOINT=http://127.0.0.1:9379/v1/chat/completions`
- `MEMOJI_MTP_MODEL=gemma4-e2b`
- `MEMOJI_MTP_RUNTIME=litert_lm`
- `MEMOJI_MTP_DRAFT_MODEL=<operator-facing metadata>` (optional)
- `MEMOJI_MTP_API_KEY=<local-server key>` (optional)

Environment configuration takes precedence over Settings. An invalid or
unreachable configured endpoint produces an error; Memoji does not silently
fall back to another model or a cloud service.

Speculative decoding/MTP must be enabled in a LiteRT-LM server version and
model/backend combination that supports it. `MEMOJI_MTP_DRAFT_MODEL` is not
sent as a cloud-style API request field and does not enable acceleration by
itself.

The optional llama.cpp compatibility path can use a separate loopback server:

```powershell
.\llama-server.exe `
  -m .\models\gemma-4-e2b-it-q4.gguf `
  --host 127.0.0.1 `
  --port 8080 `
  -c 4096 `
  --spec-type ngram-simple `
  --spec-draft-n-max 64
```

Then set the managed runtime override:

```text
Endpoint: http://127.0.0.1:8080/v1/chat/completions
Model: google/gemma-4-E2B-it
Runtime: llama_cpp
```

Only OpenAI-compatible streaming responses on an allowed loopback endpoint are
supported. Verify `/v1/models` and `/v1/chat/completions` on the target VDI.

## Official references

- [LiteRT-LM OpenAI-compatible server](https://developers.google.com/edge/litert-lm/cli/openai_server)
- [LiteRT-LM Gemma 4 model guide](https://developers.google.com/edge/litert-lm/models/gemma-4)
