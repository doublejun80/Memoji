use super::IndexedLink;

pub fn extract_wiki_links(text: &str, base_offset: usize) -> Vec<IndexedLink> {
    let mut links = Vec::new();
    let mut cursor = 0usize;
    let mut inline_code = false;
    while cursor < text.len() {
        let Some(character) = text[cursor..].chars().next() else {
            break;
        };
        if character == '`' && !is_escaped(text, cursor) {
            inline_code = !inline_code;
            cursor += character.len_utf8();
            continue;
        }
        if !inline_code && text[cursor..].starts_with("[[") && !is_escaped(text, cursor) {
            if let Some(relative_end) = text[cursor + 2..].find("]]") {
                let end = cursor + 2 + relative_end + 2;
                let raw = &text[cursor + 2..end - 2];
                if let Some(link) = parse_link(raw, base_offset + cursor, base_offset + end) {
                    links.push(link);
                }
                cursor = end;
                continue;
            }
        }
        cursor += character.len_utf8();
    }
    links
}

fn parse_link(raw: &str, start: usize, end: usize) -> Option<IndexedLink> {
    let (target, label) = raw.split_once('|').map_or((raw, None), |(target, label)| {
        (target, Some(label.trim().to_string()))
    });
    let (target_title, target_anchor) = target
        .split_once('#')
        .map_or((target, None), |(title, anchor)| {
            (title, Some(anchor.trim().to_string()))
        });
    let target_title = target_title.trim();
    if target_title.is_empty() {
        return None;
    }
    Some(IndexedLink {
        target_title: target_title.to_string(),
        target_anchor: target_anchor.filter(|anchor| !anchor.is_empty()),
        label: label.filter(|label| !label.is_empty()),
        start,
        end,
    })
}

fn is_escaped(text: &str, byte_index: usize) -> bool {
    text[..byte_index]
        .chars()
        .rev()
        .take_while(|character| *character == '\\')
        .count()
        % 2
        == 1
}

pub fn replace_page_links(
    connection: &rusqlite::Connection,
    page_id: &str,
    links: &[IndexedLink],
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM links WHERE source_page_id=?1", [page_id])?;
    for link in links {
        let target_page_id = connection
            .query_row(
                "SELECT id FROM pages WHERE title=?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",
                [&link.target_title],
                |row| row.get::<_, String>(0),
            )
            .ok();
        connection.execute(
            "INSERT INTO links (
                source_page_id, target_title, target_page_id, target_anchor, label, source_start, source_end
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                page_id,
                link.target_title,
                target_page_id,
                link.target_anchor,
                link.label,
                link.start as i64,
                link.end as i64,
            ],
        )?;
    }
    Ok(())
}
