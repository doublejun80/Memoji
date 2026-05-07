use super::LocalAiError;
use std::path::Path;
use tokenizers::Tokenizer;

#[derive(Debug)]
pub struct LocalTokenizer {
    inner: Tokenizer,
}

impl LocalTokenizer {
    pub fn from_file(path: &Path) -> Result<Self, LocalAiError> {
        let inner = Tokenizer::from_file(path).map_err(|error| {
            LocalAiError::LoadFailed(format!(
                "failed to load tokenizer {}: {error}",
                path.display()
            ))
        })?;

        Ok(Self { inner })
    }

    pub fn encode(&self, text: &str, add_special_tokens: bool) -> Result<Vec<u32>, LocalAiError> {
        let encoding = self
            .inner
            .encode(text, add_special_tokens)
            .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))?;
        Ok(encoding.get_ids().to_vec())
    }

    pub fn decode(
        &self,
        tokens: &[u32],
        skip_special_tokens: bool,
    ) -> Result<String, LocalAiError> {
        self.inner
            .decode(tokens, skip_special_tokens)
            .map_err(|error| LocalAiError::GenerateFailed(error.to_string()))
    }

    pub fn token_to_id(&self, token: &str) -> Option<u32> {
        self.inner.token_to_id(token)
    }

    pub fn vocab_size(&self) -> Option<usize> {
        Some(self.inner.get_vocab_size(false))
    }
}
