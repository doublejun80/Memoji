use super::LocalAiGenerateRequest;

pub const DEFAULT_MAX_NEW_TOKENS: usize = 256;

#[derive(Debug, Clone, Copy)]
pub struct SamplingConfig {
    pub max_new_tokens: usize,
    pub temperature: f32,
    pub top_p: f32,
}

impl SamplingConfig {
    pub fn from_request(request: &LocalAiGenerateRequest) -> Self {
        Self {
            max_new_tokens: request
                .max_new_tokens
                .unwrap_or(DEFAULT_MAX_NEW_TOKENS)
                .clamp(1, 2048),
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

    #[test]
    fn default_response_budget_is_vdi_friendly() {
        let request = LocalAiGenerateRequest {
            prompt: "요약해줘".to_string(),
            page_context: None,
            max_new_tokens: None,
            temperature: None,
            top_p: None,
        };

        assert_eq!(
            SamplingConfig::from_request(&request).max_new_tokens,
            DEFAULT_MAX_NEW_TOKENS
        );
        assert_eq!(DEFAULT_MAX_NEW_TOKENS, 256);
    }
}
