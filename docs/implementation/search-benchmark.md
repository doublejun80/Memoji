# Search benchmark

- Dataset: 10,000 synthetic local pages in SQLite FTS5
- Query: Korean sparse term (`희소검색어`), 30-result limit
- Warm samples: 20 after one warm-up query
- Observed warm p95: **0.17 ms** on the development Mac (2026-08-16)
- Regression ceiling in the portable test: 2,000 ms to avoid treating CI/VDI variance as a functional failure

Reproduce with:

```bash
cd src-tauri
cargo test search::tests::synthetic_10000_page_search_records_warm_p95 -- --nocapture
```

This is an in-memory index benchmark, not a VDI disk or end-to-end UI latency claim.
