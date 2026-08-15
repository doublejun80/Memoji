use crate::ai::retrieval::RetrievalSource;

pub const DEFAULT_SYSTEM_PROMPT: &str = "You are Memoji's local workspace assistant. Answer from the supplied workspace evidence. Distinguish evidence from inference and cite sources as [S1], [S2].";
pub const DEFAULT_OUTPUT_SCHEMA: &str = "Return concise Korean Markdown. Do not claim that a document was changed. When suggesting an edit, describe it as a proposal requiring user review.";
pub const DEFAULT_GENERATION_PREFIX: &str = "한국어로 답변합니다.\n";

#[derive(Debug, Clone)]
pub struct PromptBuildRequest<'a> {
    pub system: &'a str,
    pub schema: &'a str,
    pub current_page: Option<&'a str>,
    pub sources: &'a [RetrievalSource],
    pub user: &'a str,
    pub generation_prefix: &'a str,
    pub max_chars: usize,
}

pub fn build_prompt(request: &PromptBuildRequest<'_>) -> String {
    let source_text = request
        .sources
        .iter()
        .enumerate()
        .map(|(index, source)| {
            let heading = if source.heading_path.is_empty() {
                String::new()
            } else {
                format!(" / {}", source.heading_path.join(" > "))
            };
            format!(
                "[S{}] {}{} (page:{})\n{}",
                index + 1,
                source.title,
                heading,
                source.page_id,
                source.snippet
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let protected = format!(
        "<SYSTEM>\n{}\n</SYSTEM>\n<SCHEMA>\n{}\n</SCHEMA>\n<USER>\n{}\n</USER>\n<ASSISTANT>\n{}",
        request.system, request.schema, request.user, request.generation_prefix,
    );
    let section_overhead = "\n<CURRENT_PAGE>\n\n</CURRENT_PAGE>\n<SOURCES>\n\n</SOURCES>\n".len();
    let context_budget = request
        .max_chars
        .saturating_sub(protected.chars().count() + section_overhead);
    let current_budget = context_budget.saturating_mul(2) / 5;
    let source_budget = context_budget.saturating_sub(current_budget);
    let current_page = trim_chars(request.current_page.unwrap_or_default(), current_budget);
    let sources = trim_chars(&source_text, source_budget);

    format!(
        "<SYSTEM>\n{}\n</SYSTEM>\n<SCHEMA>\n{}\n</SCHEMA>\n<CURRENT_PAGE>\n{}\n</CURRENT_PAGE>\n<SOURCES>\n{}\n</SOURCES>\n<USER>\n{}\n</USER>\n<ASSISTANT>\n{}",
        request.system,
        request.schema,
        current_page,
        sources,
        request.user,
        request.generation_prefix,
    )
}

fn trim_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    if max_chars <= 1 {
        return String::new();
    }
    let mut trimmed = value.chars().take(max_chars - 1).collect::<String>();
    trimmed.push('…');
    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trimming_never_removes_system_schema_or_generation_prefix() {
        let source = RetrievalSource {
            page_id: "source".to_string(),
            title: "근거".to_string(),
            anchor: None,
            heading_path: vec!["출시".to_string()],
            snippet: "근거 ".repeat(1_000),
            score: 1.0,
            start: None,
            end: None,
            text_hash: None,
        };
        let prompt = build_prompt(&PromptBuildRequest {
            system: "SYSTEM_LOCK",
            schema: "SCHEMA_LOCK",
            current_page: Some(&"현재 ".repeat(1_000)),
            sources: &[source],
            user: "질문",
            generation_prefix: "GENERATION_LOCK",
            max_chars: 320,
        });

        assert!(prompt.contains("<SYSTEM>\nSYSTEM_LOCK\n</SYSTEM>"));
        assert!(prompt.contains("<SCHEMA>\nSCHEMA_LOCK\n</SCHEMA>"));
        assert!(prompt.ends_with("<ASSISTANT>\nGENERATION_LOCK"));
        assert!(prompt.contains("<CURRENT_PAGE>\n"));
        assert!(prompt.contains("<SOURCES>\n"));
    }
}
