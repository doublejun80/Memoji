# Memoji Current Plan

Last updated: 2026-06-14

## Current Objective

Memoji is being maintained as a Windows VDI-first local Markdown note app with:

- Tauri v2 desktop packaging
- React + TypeScript frontend
- SQLite local database as the durable source of truth
- Milkdown/Crepe immediate-render Markdown editing
- Optional local AI through bundled Gemma resources or a loopback OpenAI-compatible runtime

The active work should preserve existing user notes and avoid destructive database changes.

## Current Data Model

`Page.content` remains the Markdown source of truth.

Each page can independently belong to:

- a daily date through `dateKey`
- a project/folder tree through `projectParentId`
- the project index through `projectIndex`

This means one page can carry optional daily membership and optional project membership without duplicating the page in two storage locations.

Important fields:

- `id`
- `title`
- `icon`
- `type`: `page` or `folder`
- `content`
- `dateKey`
- `projectParentId`
- `projectIndex`
- `order`
- `createdAt`
- `updatedAt`
- `tags`

SQLite columns use snake_case equivalents:

- `date_key`
- `project_parent_id`
- `project_index`
- `page_order`

Migration/default behavior:

- Legacy `parent_id` is copied into `project_parent_id` when needed.
- Daily pages without explicit `date_key` derive it from `created_at`.
- Project pages without `date_key` remain project-index pages.

## Sidebar State

The sidebar is split into two axes:

- Daily index
- Project/event index

Daily index:

- Keeps the selected date and calendar flow.
- Shows pages for the selected date.
- Creates date-based pages.

Project/event index:

- Shows a folder/page tree independent of date.
- Supports folder creation, project page creation, subpage creation, move, delete, and drag/drop into folders.
- Project pages are stored as normal pages with project metadata, not as copied files.

Latest stability fix:

- Page creation now reads from a current `pagesRef` instead of relying only on a possibly stale render closure.
- When creating a child under a project parent, the parent id must exist in the latest page list.
- This prevents orphan pages from being saved and later rendered at the bottom/root of the project tree.

## Data Export / Import

Settings contains DB import and all-pages export under the data section.

DB import:

- Accepts `memoji.db`.
- Validates SQLite header and schema.
- Creates a backup before merging.
- Preserves existing pages and duplicates conflicting ids instead of overwriting current data.

All-pages ZIP export:

- Creates `data/exports/memoji-pages-YYYYMMDD-HHMMSS-ms.zip`.
- Exports one Markdown file per non-folder page.
- Stores project pages under `projects/<folder path>/<title>__<id>.md`.
- Stores daily pages under `daily/<date>/<title>__<id>.md`.
- Includes `manifest.json` with full page metadata, including folders.
- Sanitizes Windows-unsafe filename characters.

Relevant files:

- `src/components/SettingsModal.tsx`
- `src/utils/tauriStorage.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/database.rs`

## Editor State

The editor is Milkdown/Crepe based.

Principles:

- Do not reintroduce an ad hoc Markdown parser as the main editor path.
- Keep `Page.content` as Markdown.
- Prefer Milkdown commands/schema behavior for editing operations.
- Avoid saving rendered HTML into Markdown content.

Previously fixed/guarded areas:

- Paragraph dropdown contrast/direction in dark mode
- Code block language menu contrast in dark mode
- Selection bubble interaction
- Heading/list styling consistency
- Sidebar action menu hover dismissal

## Local AI / VDI Runtime

LiteRT-LM is the default local AI runtime. The bundled GGUF path remains as a
downloadable compatibility shell for the built-in Candle and llama.cpp paths,
but the large GGUF model is not required for the current default deployment.

Current visible runtime selection:

- `litert_lm`: Gemma 4 E2B through a VDI-local LiteRT-LM OpenAI-compatible
  endpoint. This is the selected default for VDI CPU-only use.

Hidden legacy runtime definitions:

- `builtin_candle`: Gemma 4 E2B Q4_0 through the app's built-in Rust Candle
  backend. Hidden from the UI until `gemma-4-e2b-it-q4.gguf` is downloaded again
  and the selector is intentionally re-enabled.
- `llama_cpp`: Gemma 4 E2B through a VDI-local `llama-server`
  OpenAI-compatible endpoint. Hidden from the UI until the GGUF model is
  downloaded again, a local `llama-server` is started, and the selector is
  intentionally re-enabled.

The AI panel and Settings > Local AI now share the same runtime preset. Selecting
a model/runtime in the AI panel saves the config and the next request uses that
runtime.

Current intended fast path:

- Run LiteRT-LM on a VDI-local OpenAI-compatible loopback endpoint.
- Allowed endpoints are localhost/loopback addresses.
- Cloud/API endpoints should not be accepted for this local mode.
- Keep `builtin_candle` and `llama_cpp` in app code as hidden legacy definitions
  so the GGUF model can be downloaded later without redesigning the runtime
  layer.

Relevant commands:

- `local_ai_status`
- `local_ai_load`
- `local_ai_generate`
- `local_ai_generate_stream`
- `local_ai_get_runtime_config`
- `local_ai_save_runtime_config`
- `local_ai_test_runtime_config`
- `local_ai_benchmark`

## Build / Release Notes

Previously created VDI pack:

- `release/Memoji_2.0.0_windows_x64_vdi_gemma4_129a04f`
- `release/Memoji_2.0.0_windows_x64_vdi_gemma4_129a04f.zip`

That pack was based on commit:

- `129a04f Harden storage and editor stability`

If a new VDI executable is needed after the latest export/sidebar fixes, rebuild Windows artifacts from the latest pushed commit. Do not assume the old VDI pack contains these new changes.

## Current Validation

Latest local validation completed:

```bash
cargo test --lib --manifest-path src-tauri/Cargo.toml
npm run type-check
npm run build
```

Result:

- Rust library tests passed.
- TypeScript type check passed.
- Vite production build passed.
- Vite still reports large chunk warnings; this is not a build failure.

## Immediate Next Steps

1. In Tauri dev mode, verify the AI panel runtime selector only shows
   `Gemma 4 LiteRT-LM`.
2. Verify Settings > Local AI also exposes only the LiteRT-LM runtime by
   default.
3. In Tauri dev mode, manually verify Settings > Data > all-pages ZIP export.
4. Inspect the created ZIP:
   - daily paths
   - project folder paths
   - `manifest.json`
   - Korean filenames
5. Re-test adding more than four child pages under the same folder.
6. If VDI delivery is required, build a new Windows executable/pack from the latest pushed commit.
7. If editor editing still feels inconsistent, isolate it at the Milkdown schema/command level instead of patching rendered output.

## Git Notes

The local working directory `/Users/doublejun_air/github/memoji` is now a git
repo connected to:

```text
https://github.com/doublejun80/Memoji.git
```

Review work is prepared on `codex/review-settings-vdi-performance`; keep `main`
clean and merge through the reviewed pull request.
