CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT NOT NULL,
    parent_id TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT NOT NULL,
    page_order INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO pages (
    id, title, icon, parent_id, content, created_at, updated_at, type, tags, page_order
) VALUES (
    'legacy-1', '기존 메모', '📝', NULL, '# 기존 메모',
    '2026-08-01T09:00:00Z', '2026-08-01T09:00:00Z', 'page', '[]', 0
);
