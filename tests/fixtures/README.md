# Fixture policy

All Memoji test fixtures are synthetic and purpose-built. They must never be copied from the
user's real `memoji.db`, exported notes, model files, credentials, or personal workspace.

The fixture set must cover, as relevant to each test:

- supported legacy database schemas;
- parent cycles and dangling relationships;
- Korean titles, body text, tags, and search terms;
- large notes and bounded large-workspace scenarios.

Fixtures should be the smallest complete inputs that exercise real parsing, migration, and
persistence behavior. Do not use partial mocks where a real temporary SQLite database or
committed synthetic file can exercise the contract.
