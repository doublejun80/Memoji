use super::IndexedTag;

pub fn extract_tags(text: &str, base_offset: usize) -> Vec<IndexedTag> {
    let chars = text.char_indices().collect::<Vec<_>>();
    let mut tags = Vec::new();
    let mut index = 0usize;
    let mut inline_code = false;

    while index < chars.len() {
        let (byte_index, character) = chars[index];
        if character == '`' && !is_escaped(text, byte_index) {
            inline_code = !inline_code;
            index += 1;
            continue;
        }
        if inline_code || character != '#' || is_escaped(text, byte_index) {
            index += 1;
            continue;
        }

        let previous_is_word = index > 0 && {
            let previous = chars[index - 1].1;
            previous.is_alphanumeric() || matches!(previous, '_' | '-')
        };
        if previous_is_word {
            index += 1;
            continue;
        }

        let start_index = index + 1;
        let mut end_index = start_index;
        while end_index < chars.len() {
            let next = chars[end_index].1;
            if next.is_alphanumeric() || matches!(next, '_' | '-') {
                end_index += 1;
            } else {
                break;
            }
        }
        if end_index == start_index {
            index += 1;
            continue;
        }
        let name_start = chars[start_index].0;
        let name_end = chars
            .get(end_index)
            .map(|(offset, _)| *offset)
            .unwrap_or(text.len());
        tags.push(IndexedTag {
            name: text[name_start..name_end].to_string(),
            start: base_offset + byte_index,
            end: base_offset + name_end,
        });
        index = end_index;
    }
    tags
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

pub fn replace_page_tags(
    connection: &rusqlite::Connection,
    page_id: &str,
    tags: &[IndexedTag],
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM page_tags WHERE page_id=?1", [page_id])?;
    for tag in tags {
        connection.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            [&tag.name],
        )?;
        connection.execute(
            "INSERT INTO page_tags (page_id, tag_id)
             SELECT ?1, id FROM tags WHERE name=?2 COLLATE NOCASE
             ON CONFLICT(page_id, tag_id) DO NOTHING",
            rusqlite::params![page_id, tag.name],
        )?;
    }
    Ok(())
}
