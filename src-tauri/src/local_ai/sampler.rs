use super::LocalAiGenerateRequest;

#[derive(Debug, Clone, Copy)]
pub struct SamplingConfig {
    pub max_new_tokens: usize,
    pub temperature: f32,
    pub top_p: f32,
}

impl SamplingConfig {
    pub fn from_request(request: &LocalAiGenerateRequest) -> Self {
        Self {
            max_new_tokens: request.max_new_tokens.unwrap_or(192).clamp(1, 2048),
            temperature: request.temperature.unwrap_or(0.9).clamp(0.0, 2.0),
            top_p: request.top_p.unwrap_or(0.95).clamp(0.05, 1.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn max_new_tokens_allows_2048_token_responses() {
        let request = LocalAiGenerateRequest {
            prompt: "길게 설명해줘".to_string(),
            page_context: None,
            max_new_tokens: Some(2048),
            temperature: None,
            top_p: None,
        };

        let sampling = SamplingConfig::from_request(&request);

        assert_eq!(sampling.max_new_tokens, 2048);
    }
}
