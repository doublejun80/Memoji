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
