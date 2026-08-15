# Codex Phase 05 · Safe Local AI UX

Implement Tasks 9, 10 and the frontend portion of Task 17.

- Split AI runtime status, stream, composer, conversation and proposal components.
- Preserve PR #1 requestAnimationFrame stream batching.
- Add cancellation and ignore late chunks.
- Remove the direct `content.indexOf(targetText)` replacement path.
- Selection changes produce an `AiProposal`.
- Show base revision, sources, diff, apply, reject and conflict.
- Apply only through a typed backend API.
- A plain loopback server must not be labeled MTP.
- Add tests for cancel, listener cleanup, proposal state and revision conflict.

Do not silently apply AI changes.
