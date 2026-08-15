use std::collections::HashMap;

pub fn slugify_heading(value: &str) -> String {
    let mut slug = String::new();
    let mut pending_separator = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            if pending_separator && !slug.is_empty() {
                slug.push('-');
            }
            pending_separator = false;
            slug.push(character);
        } else {
            pending_separator = true;
        }
    }
    if slug.is_empty() {
        "heading".to_string()
    } else {
        slug
    }
}

pub fn unique_heading_slug(value: &str, seen: &mut HashMap<String, usize>) -> String {
    let base = slugify_heading(value);
    let occurrence = seen.entry(base.clone()).or_insert(0);
    *occurrence += 1;
    if *occurrence == 1 {
        base
    } else {
        format!("{base}-{}", *occurrence)
    }
}

pub fn replace_page_anchors(
    connection: &rusqlite::Connection,
    page_id: &str,
    headings: &[super::IndexedHeading],
) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM anchors WHERE page_id=?1", [page_id])?;
    for heading in headings {
        connection.execute(
            "INSERT INTO anchors (page_id, slug, heading, level, line)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                page_id,
                heading.slug,
                heading.text,
                heading.level as i64,
                heading.line as i64,
            ],
        )?;
    }
    Ok(())
}
