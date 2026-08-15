use super::anchors::unique_heading_slug;
use super::links::extract_wiki_links;
use super::tags::extract_tags;
use super::{IndexedChunk, IndexedHeading, IndexedTaskMarker, ParsedMarkdown};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
enum MarkdownBlock {
    Heading { level: usize, text: String },
    Task { checked: bool, text: String },
    Text(String),
    Code,
}

pub fn parse_markdown(markdown: &str) -> ParsedMarkdown {
    let mut parsed = ParsedMarkdown::default();
    let mut seen_slugs = HashMap::new();
    let mut seen_tags = HashSet::new();
    let mut in_fence: Option<char> = None;
    let mut byte_offset = 0usize;
    let mut current_anchor: Option<String> = None;
    let mut current_chunk = Vec::new();

    for (line_index, line) in markdown.split_inclusive('\n').enumerate() {
        let line_without_newline = line.trim_end_matches(['\r', '\n']);
        let block = classify_line(line_without_newline, &mut in_fence);
        match &block {
            MarkdownBlock::Code => {}
            MarkdownBlock::Heading { level, text } => {
                flush_chunk(
                    &mut parsed.chunks,
                    &mut current_chunk,
                    current_anchor.clone(),
                );
                let slug = unique_heading_slug(text, &mut seen_slugs);
                current_anchor = Some(slug.clone());
                parsed.headings.push(IndexedHeading {
                    slug,
                    text: text.clone(),
                    level: *level,
                    line: line_index + 1,
                });
                current_chunk.push(text.clone());
                collect_inline(
                    &mut parsed,
                    line_without_newline,
                    byte_offset,
                    &mut seen_tags,
                );
            }
            MarkdownBlock::Task { checked, text } => {
                parsed.tasks.push(IndexedTaskMarker {
                    checked: *checked,
                    text: text.clone(),
                    line: line_index + 1,
                });
                current_chunk.push(line_without_newline.to_string());
                collect_inline(
                    &mut parsed,
                    line_without_newline,
                    byte_offset,
                    &mut seen_tags,
                );
            }
            MarkdownBlock::Text(text) => {
                if !text.trim().is_empty() {
                    current_chunk.push(text.clone());
                    collect_inline(
                        &mut parsed,
                        line_without_newline,
                        byte_offset,
                        &mut seen_tags,
                    );
                }
            }
        }
        if current_chunk.iter().map(String::len).sum::<usize>() > 1_200 {
            flush_chunk(
                &mut parsed.chunks,
                &mut current_chunk,
                current_anchor.clone(),
            );
        }
        byte_offset += line.len();
    }
    flush_chunk(&mut parsed.chunks, &mut current_chunk, current_anchor);
    parsed
}

fn classify_line(line: &str, in_fence: &mut Option<char>) -> MarkdownBlock {
    let trimmed = line.trim_start();
    let fence = if trimmed.starts_with("```") {
        Some('`')
    } else if trimmed.starts_with("~~~") {
        Some('~')
    } else {
        None
    };
    if let Some(marker) = fence {
        if *in_fence == Some(marker) {
            *in_fence = None;
        } else if in_fence.is_none() {
            *in_fence = Some(marker);
        }
        return MarkdownBlock::Code;
    }
    if in_fence.is_some() {
        return MarkdownBlock::Code;
    }

    let level = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if (1..=6).contains(&level) && trimmed.chars().nth(level) == Some(' ') {
        let text = trimmed[level + 1..]
            .trim()
            .trim_end_matches('#')
            .trim()
            .to_string();
        return MarkdownBlock::Heading { level, text };
    }
    for (marker, checked) in [("- [ ] ", false), ("- [x] ", true), ("- [X] ", true)] {
        if let Some(text) = trimmed.strip_prefix(marker) {
            return MarkdownBlock::Task {
                checked,
                text: text.trim().to_string(),
            };
        }
    }
    MarkdownBlock::Text(line.to_string())
}

fn collect_inline(
    parsed: &mut ParsedMarkdown,
    line: &str,
    byte_offset: usize,
    seen_tags: &mut HashSet<String>,
) {
    for tag in extract_tags(line, byte_offset) {
        let normalized = tag.name.to_lowercase();
        if seen_tags.insert(normalized) {
            parsed.tags.push(tag);
        }
    }
    parsed.links.extend(extract_wiki_links(line, byte_offset));
}

fn flush_chunk(chunks: &mut Vec<IndexedChunk>, lines: &mut Vec<String>, anchor: Option<String>) {
    if lines.is_empty() {
        return;
    }
    let text = lines.join("\n").trim().to_string();
    lines.clear();
    if !text.is_empty() {
        chunks.push(IndexedChunk { anchor, text });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_korean_tags_links_repeated_headings_tasks_and_tables() {
        let markdown = "# 출시 계획\n#한국어 #GA-출시\n[[관련 문서#결정|결정 보기]]\n## 반복\n- [ ] 배포 @due(2026-08-20)\n| 항목 | 값 |\n| --- | --- |\n| 상태 | 준비 |\n## 반복\n";
        let parsed = parse_markdown(markdown);

        assert_eq!(
            parsed
                .tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["한국어", "GA-출시"]
        );
        assert_eq!(parsed.links[0].target_title, "관련 문서");
        assert_eq!(parsed.links[0].target_anchor.as_deref(), Some("결정"));
        assert_eq!(
            parsed
                .headings
                .iter()
                .map(|heading| heading.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["출시-계획", "반복", "반복-2"]
        );
        assert_eq!(parsed.tasks[0].text, "배포 @due(2026-08-20)");
        assert!(parsed
            .chunks
            .iter()
            .any(|chunk| chunk.text.contains("| 상태 | 준비 |")));
    }

    #[test]
    fn excludes_code_fences_inline_code_and_escaped_markers() {
        let markdown = "\\#이스케이프 `#인라인 [[가짜]]`\n```md\n#코드 [[가짜 링크]]\n- [ ] 가짜 작업\n```\n#실제 [[진짜]]\n";
        let parsed = parse_markdown(markdown);

        assert_eq!(
            parsed
                .tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["실제"]
        );
        assert_eq!(parsed.links.len(), 1);
        assert_eq!(parsed.links[0].target_title, "진짜");
        assert!(parsed.tasks.is_empty());
    }

    #[test]
    fn retains_unresolved_links_for_later_resolution() {
        let parsed = parse_markdown("[[아직 없는 문서]]");
        assert_eq!(parsed.links[0].target_title, "아직 없는 문서");
    }
}
