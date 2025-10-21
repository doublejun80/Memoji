export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lm-studio';
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export const DEFAULT_PROVIDERS: LLMProvider[] = [
  { id: 'openai', name: 'OpenAI', type: 'openai', enabled: false },
  { id: 'anthropic', name: 'Anthropic Claude', type: 'anthropic', enabled: false },
  { id: 'gemini', name: 'Google Gemini', type: 'gemini', enabled: false },
  { id: 'ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', enabled: false },
  { id: 'lm-studio', name: 'LM Studio', type: 'lm-studio', baseUrl: 'http://localhost:1234', enabled: false },
];

export const getProviderApiUrl = (provider: LLMProvider): string => {
  if (provider.baseUrl) {
    return provider.baseUrl;
  }

  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1',
    ollama: 'http://localhost:11434',
    'lm-studio': 'http://localhost:1234/v1',
  };

  return urls[provider.type] || '';
};

