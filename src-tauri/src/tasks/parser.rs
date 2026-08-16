use sha2::{Digest, Sha256};

const MARKER_PREFIX: &str = "<!-- memoji-task:";
const MARKER_SUFFIX: &str = " -->";
const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTask {
    pub id: Option<String>,
    pub text: String,
    pub completed: bool,
    pub due_date: Option<String>,
    pub start_date: Option<String>,
    pub assignee: Option<String>,
    pub priority: Option<u8>,
    pub line: usize,
    pub source_start: usize,
    pub source_end: usize,
    pub source_hash: String,
}

#[derive(Debug)]
struct ParsedLine<'a> {
    prefix: &'a str,
    completed: bool,
    content: &'a str,
}

pub fn parse_tasks(markdown: &str) -> Vec<ParsedTask> {
    let mut tasks = Vec::new();
    let mut offset = 0usize;
    let mut fence: Option<char> = None;
    for (line_index, segment) in markdown.split_inclusive('\n').enumerate() {
        let line = segment.trim_end_matches(['\r', '\n']);
        if update_fence(line, &mut fence) || fence.is_some() {
            offset += segment.len();
            continue;
        }
        if let Some(parsed) = parse_task_line(line) {
            let id = marker_id(parsed.content);
            let due_date = due_date(parsed.content);
            let start_date = start_date(parsed.content);
            let assignee = annotation_value(parsed.content, "@assignee(", valid_task_assignee);
            let priority = priority(parsed.content);
            tasks.push(ParsedTask {
                id,
                text: display_text(parsed.content),
                completed: parsed.completed,
                due_date,
                start_date,
                assignee,
                priority,
                line: line_index + 1,
                source_start: offset,
                source_end: offset + line.len(),
                source_hash: source_hash(line),
            });
        }
        offset += segment.len();
    }
    tasks
}

pub fn ensure_task_markers(markdown: &str, page_id: &str) -> String {
    let mut output = String::with_capacity(markdown.len());
    let mut fence: Option<char> = None;
    for (line_index, segment) in markdown.split_inclusive('\n').enumerate() {
        let newline_len = segment.len() - segment.trim_end_matches(['\r', '\n']).len();
        let line_end = segment.len() - newline_len;
        let line = &segment[..line_end];
        if update_fence(line, &mut fence) || fence.is_some() {
            output.push_str(segment);
            continue;
        }
        if let Some(parsed) = parse_task_line(line) {
            if marker_id(parsed.content).is_none() {
                let id = stable_task_id(page_id, line_index + 1, line);
                output.push_str(line.trim_end());
                output.push(' ');
                output.push_str(MARKER_PREFIX);
                output.push_str(&id);
                output.push_str(MARKER_SUFFIX);
                output.push_str(&segment[line_end..]);
                continue;
            }
        }
        output.push_str(segment);
    }
    output
}

pub fn render_task_line(
    original: &str,
    completed: bool,
    due_date_value: Option<&str>,
    start_date_value: Option<&str>,
    assignee_value: Option<&str>,
    priority_value: Option<u8>,
) -> Option<String> {
    if due_date_value.is_some_and(|value| !valid_task_date(value))
        || start_date_value.is_some_and(|value| !valid_task_date(value))
        || assignee_value.is_some_and(|value| !valid_task_assignee(value))
        || priority_value.is_some_and(|value| !(1..=3).contains(&value))
    {
        return None;
    }
    let parsed = parse_task_line(original)?;
    let marker = marker_id(parsed.content)?;
    let mut rendered = format!("{}{}", parsed.prefix, if completed { "x] " } else { " ] " });
    rendered.push_str(&display_text(parsed.content));
    if let Some(start) = start_date_value {
        rendered.push_str(" @start(");
        rendered.push_str(start);
        rendered.push(')');
    }
    if let Some(due) = due_date_value {
        rendered.push_str(" @due(");
        rendered.push_str(due);
        rendered.push(')');
    }
    if let Some(value) = priority_value {
        rendered.push_str(" !p");
        rendered.push(char::from(b'0' + value));
    }
    if let Some(assignee) = assignee_value
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        rendered.push_str(" @assignee(");
        rendered.push_str(assignee);
        rendered.push(')');
    }
    rendered.push(' ');
    rendered.push_str(MARKER_PREFIX);
    rendered.push_str(&marker);
    rendered.push_str(MARKER_SUFFIX);
    Some(rendered)
}

fn parse_task_line(line: &str) -> Option<ParsedLine<'_>> {
    let leading = line.len() - line.trim_start().len();
    let trimmed = &line[leading..];
    if trimmed.starts_with('>') || trimmed.len() < 6 {
        return None;
    }
    let bytes = trimmed.as_bytes();
    if !matches!(bytes[0], b'-' | b'*' | b'+')
        || bytes[1] != b' '
        || bytes[2] != b'['
        || !matches!(bytes[3], b' ' | b'x' | b'X')
        || bytes[4] != b']'
        || bytes[5] != b' '
    {
        return None;
    }
    let prefix_end = leading + 3;
    Some(ParsedLine {
        prefix: &line[..prefix_end],
        completed: matches!(bytes[3], b'x' | b'X'),
        content: &trimmed[6..],
    })
}

fn update_fence(line: &str, fence: &mut Option<char>) -> bool {
    let trimmed = line.trim_start();
    let marker = if trimmed.starts_with("```") {
        Some('`')
    } else if trimmed.starts_with("~~~") {
        Some('~')
    } else {
        None
    };
    if let Some(marker) = marker {
        if *fence == Some(marker) {
            *fence = None;
        } else if fence.is_none() {
            *fence = Some(marker);
        }
        true
    } else {
        false
    }
}

fn marker_id(content: &str) -> Option<String> {
    let start = content.find(MARKER_PREFIX)? + MARKER_PREFIX.len();
    let rest = &content[start..];
    let end = rest.find(MARKER_SUFFIX)?;
    let id = &rest[..end];
    if id.len() == 26
        && id
            .bytes()
            .all(|byte| CROCKFORD.contains(&byte.to_ascii_uppercase()))
    {
        Some(id.to_ascii_uppercase())
    } else {
        None
    }
}

fn due_date(content: &str) -> Option<String> {
    annotation_value(content, "@due(", valid_task_date)
}

fn start_date(content: &str) -> Option<String> {
    annotation_value(content, "@start(", valid_task_date)
}

fn annotation_value(
    content: &str,
    prefix: &str,
    validate: impl Fn(&str) -> bool,
) -> Option<String> {
    let start = content.find(prefix)? + prefix.len();
    let value = content[start..].split(')').next()?.trim();
    validate(value).then(|| value.to_string())
}

pub fn valid_task_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

pub fn valid_task_assignee(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.chars().count() <= 80
        && !trimmed
            .chars()
            .any(|character| character.is_control() || matches!(character, '(' | ')'))
}

fn priority(content: &str) -> Option<u8> {
    content.split_whitespace().find_map(|token| match token {
        "!p1" | "!P1" => Some(1),
        "!p2" | "!P2" => Some(2),
        "!p3" | "!P3" => Some(3),
        _ => None,
    })
}

fn display_text(content: &str) -> String {
    let mut text = content.split("<!--").next().unwrap_or(content).to_string();
    for prefix in ["@due(", "@start(", "@assignee("] {
        while let Some(start) = text.find(prefix) {
            let Some(end_offset) = text[start..].find(')') else {
                break;
            };
            text.replace_range(start..=start + end_offset, "");
        }
    }
    text.split_whitespace()
        .filter(|token| !matches!(*token, "!p1" | "!P1" | "!p2" | "!P2" | "!p3" | "!P3"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn source_hash(line: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(line.as_bytes()))
}

fn stable_task_id(page_id: &str, line: usize, source: &str) -> String {
    let digest = Sha256::digest(format!("{page_id}\0{line}\0{source}").as_bytes());
    let mut value = u128::from_be_bytes(digest[..16].try_into().expect("sha256 prefix"));
    let mut encoded = [b'0'; 26];
    for index in (0..26).rev() {
        encoded[index] = CROCKFORD[(value & 31) as usize];
        value >>= 5;
    }
    String::from_utf8(encoded.to_vec()).expect("Crockford ASCII")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_checked_due_priority_and_duplicate_text_as_distinct_tasks() {
        let markdown = "- [ ] 같은 작업 @start(2026-08-18) @due(2026-08-20) @assignee(홍길동) !p1 <!-- memoji-task:01ARZ3NDEKTSV4RRFFQ69G5FAV -->\n- [x] 같은 작업 <!-- memoji-task:01ARZ3NDEKTSV4RRFFQ69G5FAW -->\n";
        let tasks = parse_tasks(markdown);
        assert_eq!(tasks.len(), 2);
        assert_ne!(tasks[0].id, tasks[1].id);
        assert!(!tasks[0].completed);
        assert_eq!(tasks[0].due_date.as_deref(), Some("2026-08-20"));
        assert_eq!(tasks[0].start_date.as_deref(), Some("2026-08-18"));
        assert_eq!(tasks[0].assignee.as_deref(), Some("홍길동"));
        assert_eq!(tasks[0].priority, Some(1));
        assert!(tasks[1].completed);
        assert_eq!(tasks[0].text, "같은 작업");
    }

    #[test]
    fn inserts_stable_markers_but_excludes_code_blocks_and_quotes() {
        let markdown = "- [ ] 실제\n> - [ ] 인용 예시\n```md\n- [ ] 코드 예시\n```\n";
        let once = ensure_task_markers(markdown, "page-1");
        let twice = ensure_task_markers(&once, "page-1");
        assert_eq!(once, twice);
        assert_eq!(parse_tasks(&once).len(), 1);
        assert!(once.lines().next().unwrap().contains(MARKER_PREFIX));
        assert!(once.contains("> - [ ] 인용 예시"));
        assert!(once.contains("- [ ] 코드 예시\n```"));
    }

    #[test]
    fn renders_status_due_and_priority_without_changing_the_marker() {
        let original =
            "  - [ ] 배포 @due(2026-08-20) !p1 <!-- memoji-task:01ARZ3NDEKTSV4RRFFQ69G5FAV -->";
        let rendered =
            render_task_line(original, true, Some("2026-08-21"), None, None, Some(2)).unwrap();
        assert_eq!(
            rendered,
            "  - [x] 배포 @due(2026-08-21) !p2 <!-- memoji-task:01ARZ3NDEKTSV4RRFFQ69G5FAV -->"
        );
    }

    #[test]
    fn rejects_impossible_dates_and_assignee_annotation_injection() {
        let original = "- [ ] 배포 <!-- memoji-task:01ARZ3NDEKTSV4RRFFQ69G5FAV -->";
        assert!(render_task_line(original, false, Some("2026-02-30"), None, None, None,).is_none());
        assert!(render_task_line(
            original,
            false,
            None,
            None,
            Some("홍길동)\n- [ ] 주입"),
            None,
        )
        .is_none());
    }
}
