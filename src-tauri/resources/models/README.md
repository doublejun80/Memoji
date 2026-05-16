# Local Gemma Model Resources

Place local Gemma 4 E2B GGUF assets in this directory before packaging or running
the local assistant. Large model files are intentionally ignored by git.

Default runtime paths:

- `gemma-4-e2b-it-q4.gguf`
- `tokenizer.json`

You can override these paths without rebuilding:

- `MEMOJI_GEMMA_GGUF=/absolute/path/to/model.gguf`
- `MEMOJI_GEMMA_TOKENIZER=/absolute/path/to/tokenizer.json`
- `MEMOJI_LOCAL_AI_CONTEXT=2048`

The built-in backend never downloads models and never falls back to a network
inference API. Keep the default context at 2048 or 4096 for VDI CPU memory
safety.

Memoji can also use a separate high-speed local server for long answers. That
mode is still local-only: Settings saves only a loopback endpoint and Rust
rejects public, LAN, and cloud hosts.

## VDI performance diagnosis

Because VDI CPU, storage, and policy settings vary by host, use Settings →
Local AI → VDI performance diagnosis on the actual VDI image. The benchmark
loads the bundled Gemma model if needed, generates a short fixed 16-token
sample, and reports load time, generation time, tokens per second, and a
recommendation. If the result is below roughly 3 tok/s, keep answers short or
consider the loopback MTP/server mode below.

## VDI MTP streaming

For faster VDI deployments, run an OpenAI-compatible inference process inside
the same VDI machine. This is not an internet fallback: Memoji accepts only
`localhost`, `127.0.0.0/8`, or `::1` endpoints for MTP streaming.

- `MEMOJI_MTP_ENDPOINT=http://127.0.0.1:8080/v1/chat/completions`
- `MEMOJI_MTP_MODEL=google/gemma-4-E2B-it`
- `MEMOJI_MTP_DRAFT_MODEL=google/gemma-4-E2B-it-assistant`

When `MEMOJI_MTP_ENDPOINT` points at an allowed VDI-local endpoint, the Tauri
command streams through that local process and skips the built-in Candle GGUF
generator. Public internet endpoints are ignored; when no allowed endpoint is
configured, the app uses the local GGUF files above.

Memoji does not send `MEMOJI_MTP_DRAFT_MODEL` as a cloud-style API field. Treat
it as operator-facing metadata; configure speculative decoding or MTP on the
local inference server process itself.

Example llama.cpp server command for long responses:

```powershell
.\llama-server.exe `
  -m .\models\gemma-4-e2b-it-q4.gguf `
  --host 127.0.0.1 `
  --port 8080 `
  -c 4096 `
  --spec-type ngram-simple `
  --spec-draft-n-max 64
```

Then set Settings → Local AI → High-speed local server:

```text
Endpoint: http://127.0.0.1:8080/v1/chat/completions
Model: google/gemma-4-E2B-it
```

For vLLM or ONNX Runtime GenAI, expose an OpenAI-compatible
`/v1/chat/completions` endpoint on `127.0.0.1` and use the same Settings card.
