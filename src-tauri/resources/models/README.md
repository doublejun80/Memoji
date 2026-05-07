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

## VDI MTP streaming

For faster VDI deployments, run an OpenAI-compatible inference process inside
the same VDI machine or private VDI network. This is not an internet fallback:
Memoji accepts only `localhost`, loopback, link-local, or RFC1918 private IP
endpoints for MTP streaming.

- `MEMOJI_MTP_ENDPOINT=http://127.0.0.1:8080/v1/chat/completions`
- `MEMOJI_MTP_MODEL=google/gemma-4-E2B-it`
- `MEMOJI_MTP_DRAFT_MODEL=google/gemma-4-E2B-it-assistant`

When `MEMOJI_MTP_ENDPOINT` points at an allowed VDI-local endpoint, the Tauri
command streams through that local process and skips the built-in Candle GGUF
generator. Public internet endpoints are ignored; when no allowed endpoint is
configured, the app uses the local GGUF files above.
