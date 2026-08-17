# Memoji 2.0 GA implementation baseline and reference lock

Date: 2026-08-15  
Implementation branch: `codex/memoji-2-ga-uiux`  
Baseline: pull request #1, commit `258ae442a069c15e312687923aebaef48fd3bdda`

## Approved delivery path

The checked-in GA package is the approved design and implementation specification. The
2026-08-15 repository audit compared it with the private GitHub repository and the user
approved proceeding through the complete plan. Implementation is isolated from the dirty
`main` checkout and must preserve its uncommitted desktop and mobile changes.

## Baseline evidence

- `npm ci`: passed; initial audit found two high and one moderate indirect advisories.
- `npm audit fix`: updated only compatible transitive lockfile resolutions; audit now reports
  zero known vulnerabilities.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 42 passed, one failed, two ignored.
  The failure loaded a machine-local model tokenizer from
  `src-tauri/resources/models/tokenizer.json` in a normal unit test.
- The failing tokenizer test now uses a committed five-token fixture. The focused regression
  test passes without a downloaded model.
- Full TypeScript, Rust, build, and packaging gates remain release tasks and are not claimed
  by this baseline record.

## Structural corrections locked before implementation

1. **Legacy table collision.** Existing V2 `pages` and `settings` tables will be renamed to
   `legacy_pages_v2` and `legacy_settings_v2` inside one transaction before V3 tables are
   created. The migration is append/copy based; it does not use destructive replacement.
2. **Optimistic concurrency.** `nodes.version` is the authoritative compare-and-swap token.
   For page-content commits, the newly inserted `page_revisions.revision_no` is copied to
   `nodes.version` in the same transaction. Frontend `baseRevision` and persisted proposal
   `base_version` both carry that exact value.
3. **Typography.** No persistent product label may render below 11px. Navigation, controls,
   tabs, chips, and properties default to 12px or larger. The package prototype is structural
   evidence, not permission to retain its 7–10px labels.
4. **Overlays.** Responsive left/right panes are non-modal workspace overlays with Escape,
   explicit close, focus return, and no `aria-modal`; destructive confirmations remain modal.
5. **Plan path corrections.** `src/app/keyboardBindings.ts` and `NOTICE.md` are created when
   first required. `workspaceState.ts` is created once in Task 1 and extended thereafter.
6. **Bundle budget.** The existing oversized main chunk is a baseline warning. Command
   palette, calendar, settings, and AI-heavy panels are lazy boundaries before the release
   performance gate.

## Refero reference lock

Build target: the approved GA three-pane shell and proposal review flow, corrected by this
reference lock.  
What must not drift: neutral canvas, compact readable type, flat pane hierarchy, restrained
accent roles, resizable desktop panes, responsive non-modal overlays, and diff-before-apply.

Primary direction: shadcn-style monochrome architectural UI.

- Preserve: white/near-black neutral canvas, system sans typography, 12–14px compact UI text,
  thin borders, minimal elevation, flat pane hierarchy, and explicit focus rings.
- Borrow only: Obsidian's native knowledge-workspace density; Perplexity's focused utility
  input; Programa's fixed-width properties organization; Polar's keyboard-first command
  palette; Grammarly's select, suggest, review, accept journey.
- Role rules: blue is reserved for the active selection and primary commit action; violet is
  not a general background; shadows only separate floating layers; status colors communicate
  state rather than decoration.
- Media strategy: code-native product UI and icons only. No generated imagery is required.
- Reject: decorative gradients, card-dashboard composition, excessive pills, persistent text
  below 11px, ornamental serif swaps, and AI-generated decorative surfaces.

## Decision ledger

| Decision | Source | Source role | Implementation reason |
|---|---|---|---|
| Three flat panes with resizable rails | Approved GA spec + shadcn direction | Layout foundation | Keeps editor primary while exposing navigation and context |
| 12–14px system UI type | shadcn direction + GA token rules | Persistent product text | Retains density without the prototype's readability defect |
| Fixed-width contextual properties | Programa screen | Secondary panel pattern | Makes metadata scannable and prevents editor reflow |
| Keyboard command palette | Polar screen | Navigation utility | Centralizes commands without adding permanent chrome |
| Selection to suggestion to diff to commit | Grammarly flow + GA safety contract | AI journey only | Adds an auditable revision guard before document mutation |
| Neutral surfaces and rare blue accent | shadcn primary, Obsidian secondary | Canvas and active/primary roles | Avoids decorative color drift and clarifies state |
| Non-modal overlays below breakpoints | GA responsive requirement | Workspace continuity | Preserves editing context and deterministic focus return |

## Visual QA contract

Rendered desktop evidence is required at 1440×900 and 1200×800. Responsive evidence is
required at 1024×768 and 800×600, in both light and dark themes where supported. Open,
collapsed, overlay, command palette, AI streaming, diff, conflict, empty, error, and offline
states are checked. P0–P2 findings must be fixed before handoff unless an external VDI or
signing dependency is explicitly recorded as blocked.

## 2026-08-16 gap-closure reference extension

Scope: central Knowledge/Search views, revision/trash recovery, and explicit AI context/model
controls. This is a direct extension of the existing shell, not a visual redesign.

### Research summary

- Style foundation: Refero `Ui` / shadcn monochromatic architectural blueprint
  (`c14c0a94-1037-449e-bf5b-4cb972656ac7`).
- Bounded style details: Readwise list/knowledge hierarchy
  (`c848b5d7-c7e8-4c76-85d3-6c91cbaa1c42`) and Perplexity compact utility input
  (`b95e58ce-d00e-4de1-ad6b-6f1c7d7a5593`).
- Product screens: Cursor three-column documentation/context layout
  (`55b7b14c-c7aa-4b14-b101-624a5fd4380b`), Tango trash list
  (`66d59495-3b30-4477-ba60-51a71149fb9a`), and Spyglass history feedback
  (`693f627e-7df2-44e3-beff-cf94fa56e30b`).
- Recovery journey: Spyglass delete flow `13473`; Memoji adapts the list/action/feedback
  sequence but keeps deletion recoverable through Trash rather than permanently destructive.

### Reference lock

- Primary: keep the existing white/neutral canvas, 12–14px system UI, hairline dividers,
  compact 8px rhythm, flat panes, and rare blue active/commit accent.
- Borrow only: Readwise's list-first knowledge scanning, Perplexity's contained search field,
  Cursor's narrow contextual control row, and the archive screens' lightweight row actions.
- Role rules: blue means active selection or primary commit; yellow may only mark a matched
  search fragment; red is reserved for irreversible/destructive states; recovery uses neutral
  or blue treatment.
- Media: Lucide line icons and native product data only; no decorative cards, gradients,
  photography, or generated imagery.
- Responsive: central views stay one-column and scrollable; existing side panes continue to
  become non-modal overlays at their locked breakpoints.
- Reject: dashboard card grids, a second persistent search sidebar, ornamental headings,
  oversized empty-state art, and hidden recovery actions.

### Decision ledger

| Decision | Source | Source role | Implementation reason |
|---|---|---|---|
| Knowledge/Search use compact rows under one toolbar | Readwise + Spyglass | Scannable archive/list | Handles large local workspaces without card-grid noise |
| Trash is a filtered central list with explicit Restore | Tango trash + user requirement | Recovery surface | Makes soft deletion operational and auditable |
| Revision number stays in document chrome | Existing shadcn lock | Status metadata | Exposes concurrency state without taking editor space |
| AI context is a small segmented/select control above composer | Cursor right context + Perplexity input | Context scope only | Makes retrieval scope explicit without creating another panel |
| E2B/E4B is a model-quality choice, not a runtime choice | Runtime contract + compact control pattern | Performance/quality selector | Keeps VDI default fast while allowing an honest high-memory preset |

## 2026-08-16 implementation closure

The extension was implemented without changing the locked visual language. Knowledge and
Search are now center workspaces; Trash has an explicit Restore action; outline navigation
moves the editor and tracks the active heading; document chrome exposes revision, status, and
due date; AI exposes context and E2B/E4B selectors in the existing Context Hub hierarchy.

The runtime decision also changed after execution evidence became available. LiteRT-LM 0.16.0
C API 0.1.0 is the GA default and is loaded in-process. The official E2B bundle generated real
output in both the Rust integration path and the standalone benchmark. Because the native path
opens no HTTP listener, no visual language or user-facing authentication fiction was added to
the UI. Runtime state is shown as library/model/engine readiness instead.

Rendered validation must continue to compare against the same neutral, compact, row-first
reference lock. The remaining target-specific work is Windows VDI performance/EDR/signing
acceptance, not another product redesign.

## 2026-08-17 Context panel and AI composer repair lock

Scope: repair the clipped Properties view and restore direct typing in the AI conversation
composer. This is a layout and interaction correction inside the existing Context Hub.

### Research summary and reference lock

- Primary visual foundation: Attio precision toolkit
  (`9f0c028b-6b11-415e-ab92-f32e4597cbe2`) for compact 8px rhythm, hairline borders,
  neutral UI type, and an interaction-only focus accent.
- Secondary visual bounds: Audyr (`9552d07f-2f68-4dd7-a0e9-d779d4a31562`) and Grammarly
  (`e9513ef7-1ac1-404a-bdb0-bfd269d2c3c9`) for flat white surfaces and contained,
  readable text controls.
- Product patterns: Craft document information sidebar
  (`c31dbdcd-5c34-43d4-aff0-7d267d264e55`) for a consistently padded narrow metadata
  column; GlossGenius AI side sheet (`18a6c8a9-3e60-484e-bba5-9a0f70eac321`) for a
  scrollable conversation with a persistent, directly editable composer.
- Preserve: existing neutral canvas, 8px panel gutter, compact labels, flat hierarchy,
  native controls, and existing responsive overlay breakpoints.
- Borrow only: Craft's consistent inner gutter and GlossGenius's always-editable draft
  field with readiness enforced at the send action.
- Role rules: focus blue is only for keyboard/input focus; unavailable AI readiness may
  disable sending but must not disable draft composition.
- Media strategy: code-native controls and Lucide icons only.
- Reject: wider global panels as a symptom workaround, nested horizontal scrolling,
  decorative cards, or loss of a typed draft while the model is loading.

### Repair decision ledger

| Decision | Source | Source role | Implementation reason |
|---|---|---|---|
| Give the entire Properties form one 8px content gutter | Craft info sidebar + Attio spacing | Narrow metadata layout | Keeps inputs, counts, and revision controls clear of the clipping edge |
| Remove the nested list-only gutter | Existing Context Hub hierarchy | Internal alignment | Aligns editor, metadata, and history on one column instead of double-indenting one section |
| Keep AI textarea editable before model readiness | GlossGenius AI side sheet | Composer interaction | Lets users prepare a prompt while loading/configuring the local model |
| Gate only Send when the model is unavailable | Existing runtime contract | Readiness enforcement | Preserves safety without blocking text entry or IME composition |
