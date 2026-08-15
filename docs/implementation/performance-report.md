# Memoji 2.0 GA performance and accessibility report

Recorded: 2026-08-16 (Asia/Seoul)

## Outcome

The always-on workspace shell is now separated from the document editor, calendar, task
workspace, settings, and AI diff viewer. The production HTML does not preload the deferred
editor chunks. The former approximately 2,063 KB main JavaScript bundle (644 KB gzip) is now
a 491.20 KB shell entry (152.79 KB gzip), a reduction of about 76% in both raw and compressed
size. The deferred Milkdown and CodeMirror runtime is 909.83 KB (287.53 KB gzip) and loads only
when a document editor is requested.

The final production build completed without circular-chunk or size warnings. Total JavaScript
assets are 3,299,638 bytes because CodeMirror retains independently deferred language grammars;
that total is not an initial-load claim.

## Test environment

- Host: Apple M4, 24 GB RAM, Darwin arm64
- Node.js: v24.9.0
- Fixture: 10,000 synthetic Korean pages, 10,000 tasks, 1,428 links
- Fixture size: 83,369,984 bytes (79.51 MiB)
- Production data used: none
- Target Windows VDI: unavailable, so VDI runtime and EDR overhead remain release gates

## SQLite and search measurements

All values below use 40 warm samples after an explicit warm-up. The scripts reopen the database
for connection samples and select page metadata separately from the body to reflect the GA lazy
body-loading boundary.

| Operation | p50 | p95 |
|---|---:|---:|
| SQLite open + `SELECT 1` | 0.18 ms | 0.25 ms |
| List 200 page metadata rows | 6.63 ms | 6.81 ms |
| Open one page body | <0.01 ms | 0.01 ms |
| FTS5 sparse Korean search, top 30 | 2.72 ms | 2.83 ms |

The measurement process RSS was 51.17 MiB. These are local Node/SQLite timings, not native UI
latency. The machine-readable result is in
`artifacts/benchmark/large-workspace-performance.json`.

## Browser interaction and responsive QA

At 1200x800 with 125% zoom, 20 responsive context-panel toggles measured 49.2 ms p50 and
49.8 ms p95, including two animation frames. Horizontal overflow was zero. Additional checks at
1440x900 light/dark and 800x600 light also had zero document-level horizontal overflow.

The 125% case correctly switches the right Context Hub to a responsive drawer instead of
compressing the central editor below its minimum width. At 800x600, the shell remains usable with
the same command bar and panel controls. Screenshots are stored under `artifacts/ui/`.

## Accessibility

Chrome Lighthouse desktop snapshot results after remediation:

- Accessibility: 100
- Best Practices: 100
- Passed accessibility audits: 34
- Failed accessibility audits: 0

The remediation added a stable editor name, corrected low-contrast 11 px support text, aligned
visible and accessible button names, restored semantic `ul/ol > li` rendering, and added focus
containment and Escape handling to the AI diff dialog. The JSON and HTML Lighthouse reports are
stored under `artifacts/benchmark/`.

## Visual reference validation

The rendered shell was checked against the locked Refero direction in
`docs/memoji-ga/16_IMPLEMENTATION_BASELINE_AND_REFERENCE_LOCK.md`: compact desktop command bar,
workspace-first left navigation, document-dominant center canvas, contextual right hub, restrained
neutral surfaces, and dense but readable controls. Light and dark modes retain the same hierarchy;
responsive behavior changes panel presentation without changing information architecture.

## Reproduction

```bash
npm run build
node scripts/generate-large-workspace-fixture.mjs --output /tmp/memoji-large-workspace.db
node scripts/measure-search.mjs \
  --db /tmp/memoji-large-workspace.db \
  --output artifacts/benchmark/large-workspace-performance.json
```

The generator refuses to overwrite an existing file unless `--force` is supplied and labels all
rows as synthetic. The performance script records its non-VDI limitation in the JSON output.
