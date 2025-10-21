import React, { useState, useRef, useEffect } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// ================================================================== //
// ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼ 타입 및 헬퍼 함수 정의 ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼ //
// ================================================================== //
// NOTE: These were moved from external files to fix compilation errors.

/**
 * Defines the structure for a Language Learning Model (LLM) provider.
 */
interface LLMProvider {
  id: string;
  name: string;
  apiKey: string | null;
  enabled: boolean;
  type: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lm-studio';
  apiUrl?: string;
}

/**
 * Gets the base API URL for a given LLM provider.
 * @param provider The LLMProvider object.
 * @returns The base URL for API calls.
 */
const getProviderApiUrl = (provider: LLMProvider): string => {
  if (provider.apiUrl) {
    return provider.apiUrl;
  }
  const defaultUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    ollama: 'http://localhost:11434',
    'lm-studio': 'http://localhost:1234/v1'
  };
  return defaultUrls[provider.type] || '';
};

// ================================================================== //
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ 타입 및 헬퍼 함수 정의 ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ //
// ================================================================== //

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatAssistantProps {
  onInsertText?: (text: string) => void;
  currentPageContent?: string;
}

const AIChatAssistant: React.FC<AIChatAssistantProps> = ({
  onInsertText,
  currentPageContent
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Provider 로드 및 실시간 업데이트
  useEffect(() => {
    const loadProviders = () => {
      const savedProviders = localStorage.getItem('llm-providers');
      if (savedProviders) {
        const parsed = JSON.parse(savedProviders) as LLMProvider[];
        setProviders(parsed);

        // 현재 선택된 provider가 유효한지 확인
        const currentProvider = parsed.find(p => p.id === selectedProvider);
        const isLocalLLM = currentProvider?.type === 'ollama' || currentProvider?.type === 'lm-studio';
        const needsApiKey = !isLocalLLM;

        if (!currentProvider || !currentProvider.enabled || (needsApiKey && !currentProvider.apiKey)) {
          // 활성화된 첫 번째 provider 선택
          const enabledProvider = parsed.find(p => {
            const isLocal = p.type === 'ollama' || p.type === 'lm-studio';
            return p.enabled && (isLocal || p.apiKey);
          });
          if (enabledProvider) {
            setSelectedProvider(enabledProvider.id);
          }
        }
      }
    };

    // 초기 로드
    loadProviders();

    // 1초마다 provider 목록 갱신 (설정 변경 감지)
    const interval = setInterval(loadProviders, 1000);

    return () => clearInterval(interval);
  }, [selectedProvider]);

  // 스크롤 자동 이동 (하단으로)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getCurrentProvider = (): LLMProvider | null => {
    return providers.find(p => p.id === selectedProvider) || null;
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const provider = getCurrentProvider();
    if (!provider) {
      console.error('설정에서 LLM Provider를 먼저 설정해주세요');
      return;
    }

    // 로컬 LLM (Ollama, LM Studio)은 API 키 불필요
    const isLocalLLM = provider.type === 'ollama' || provider.type === 'lm-studio';
    if (!isLocalLLM && !provider.apiKey) {
      console.error('API 키를 설정해주세요');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const apiUrl = getProviderApiUrl(provider);

      // 모델 선택
      const modelMap: Record<string, string> = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-5-sonnet-20241022',
        gemini: 'gemini-2.0-flash-exp',
        ollama: 'llama3.2',
        'lm-studio': 'local-model'
      };

      const model = modelMap[provider.type] || 'gpt-4o-mini';

      // 메시지 구성
      const systemMessage = '당신은 메모 작성을 돕는 AI 어시스턴트입니다. 사용자의 메모 작성을 도와주고, 아이디어를 정리하고, 내용을 개선하는 데 도움을 줍니다. 간결하고 명확하게 답변해주세요.';
      const contextMessage = currentPageContent ? `\n\n현재 페이지 내용:\n${currentPageContent}` : '';

      const allMessages = [
        {
          role: 'system',
          content: systemMessage + contextMessage
        },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        {
          role: 'user',
          content: userMessage.content
        }
      ];

      // Anthropic은 다른 API 형식 사용
      if (provider.type === 'anthropic') {
        console.log('🔵 Anthropic API 요청 시작');
        console.log('🔵 API URL:', `${apiUrl}/messages`);
        console.log('🔵 API Key:', provider.apiKey ? `${provider.apiKey.substring(0, 10)}...` : 'NONE');

        try {
          const requestBody = {
            model,
            max_tokens: 4096,
            messages: allMessages.filter(m => m.role !== 'system').map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content
            })),
            system: systemMessage + contextMessage
          };

          console.log('🔵 Request Body:', JSON.stringify(requestBody, null, 2));

          const response = await tauriFetch(`${apiUrl}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': provider.apiKey!,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(requestBody)
          });

          console.log('🔵 Response Status:', response.status);
          console.log('🔵 Response OK:', response.ok);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Anthropic API 오류 응답:', errorText);

            let errorMessage = response.statusText;
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.error?.message || errorData.message || errorText;
            } catch (e) {
              errorMessage = errorText;
            }

            throw new Error(`Anthropic API 요청 실패 (${response.status}): ${errorMessage}`);
          }

          const data = await response.json();
          console.log('📥 Anthropic API 응답:', data);

          if (!data.content || !data.content[0] || !data.content[0].text) {
            console.error('❌ Anthropic API 응답 구조 오류:', data);
            throw new Error('API 응답에서 텍스트를 찾을 수 없습니다.');
          }

          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.content[0].text,
            timestamp: new Date()
          };

          setMessages(prev => [...prev, assistantMessage]);
        } catch (fetchError) {
          console.error('❌ Anthropic Fetch 오류:', fetchError);
          throw fetchError;
        }
      }
      // Gemini는 다른 API 형식 사용
      else if (provider.type === 'gemini') {
        const geminiMessages = allMessages.filter(m => m.role !== 'system').map((m, index) => {
          if (index === 0 && m.role === 'user') {
            return {
              role: 'user',
              parts: [{ text: systemMessage + contextMessage + '\n\n' + m.content }]
            };
          }
          return {
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          };
        });

        const response = await tauriFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
              topK: 40,
              topP: 0.95
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error?.message || response.statusText;
          throw new Error(`API 요청 실패: ${errorMessage}`);
        }

        const data = await response.json();
        console.log('📥 Gemini API 응답:', data);

        if (!data.candidates || data.candidates.length === 0) {
          console.error("❌ Gemini API 응답 구조 오류 - candidates 없음:", data);
          throw new Error("API 응답에 candidates가 없습니다. API 키와 설정을 확인해주세요.");
        }

        const candidate = data.candidates[0];

        let text = '';
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          text = candidate.content.parts[0].text;
        } else if (candidate.text) {
          text = candidate.text;
        } else if (candidate.output) {
          text = candidate.output;
        }

        if (!text) {
          console.error("❌ Gemini API 응답 구조 오류 - 텍스트를 찾을 수 없음:", candidate);
          throw new Error("API 응답에서 텍스트를 찾을 수 없습니다.");
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: text,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
      // Ollama는 다른 API 형식 사용
      else if (provider.type === 'ollama') {
        const response = await tauriFetch(`${apiUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: allMessages.filter(m => m.role !== 'system').map(m => ({
              role: m.role,
              content: m.content
            })),
            stream: false
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API 요청 실패: ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 Ollama API 응답:', data);

        if (!data.message || !data.message.content) {
          console.error("❌ Ollama API 응답 구조 오류:", data);
          throw new Error("Ollama 응답에서 콘텐츠를 찾을 수 없습니다. Ollama가 실행 중인지 확인해주세요.");
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message.content,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
      // OpenAI 호환 API (OpenAI, LM Studio)
      else {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        // LM Studio는 API 키 불필요, OpenAI는 필요
        if (provider.type !== 'lm-studio' && provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const response = await tauriFetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: allMessages,
            temperature: 0.7,
            max_tokens: 1000
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API 요청 실패: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('📥 OpenAI API 응답:', data);

        // 응답 구조 검증
        if (!data.choices || data.choices.length === 0) {
          console.error("❌ OpenAI API 응답 구조 오류 - choices 없음:", data);
          throw new Error("API 응답에 choices가 없습니다. API 키와 설정을 확인해주세요.");
        }

        const choice = data.choices[0];
        if (!choice.message || !choice.message.content) {
          console.error("❌ OpenAI API 응답 구조 오류 - message.content 없음:", data);
          throw new Error("API 응답에서 콘텐츠를 찾을 수 없습니다.");
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: choice.message.content,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('AI 응답 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error(`AI 응답 오류: ${errorMessage}`);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ 오류가 발생했습니다: ${errorMessage}\n\n설정에서 API 키와 Provider 설정을 확인해주세요.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    console.log('대화 내역이 삭제되었습니다');
  };

  const insertToEditor = (text: string) => {
    if (onInsertText) {
      onInsertText(text);
      console.log('에디터에 삽입되었습니다');
    }
  };

  const enabledProviders = providers.filter(p => {
    const isLocalLLM = p.type === 'ollama' || p.type === 'lm-studio';
    return p.enabled && (isLocalLLM || p.apiKey);
  });

  if (enabledProviders.length === 0) {
    return (
      <div className="flex flex-col h-full p-4 gap-2 items-center justify-center">
        <p className="text-[9px] text-muted-foreground text-center">
          설정에서 LLM Provider를 먼저 설정해주세요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 입력 영역 - 최상단 고정 */}
      <div className="p-2 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span role="img" aria-label="sparkles">✨</span>
            <h3 className="text-xs font-semibold">AI 도우미</h3>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 대화 지우기 버튼 */}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-5 w-5 p-0 text-[8px]"
                title="대화 지우기"
              >
                🗑️
              </button>
            )}

            {/* Provider 선택 */}
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-6 text-[10px] w-[100px] rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Provider</option>
              {enabledProviders.map((provider) => (
                <option key={provider.id} value={provider.id} className="text-[10px]">
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-1.5 items-end">
          <textarea
            ref={inputRef as any}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요..."
            className="text-[9px] placeholder:text-[8px] flex-1 px-2 rounded-md border border-input bg-background resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ height: '48px', lineHeight: '1.4', fontSize: '9px', paddingTop: '6px', paddingBottom: '4px' }}
            rows={3}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-8 p-0 flex-shrink-0"
          >
            <span role="img" aria-label="send">➤</span>
          </button>
        </div>
      </div>

      {/* 메시지 영역 - 최대 60% 높이, 스크롤 가능 */}
      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef} style={{ maxHeight: '60vh' }}>
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-[10px] px-2 leading-tight py-4">
            <p className="mb-0.5 text-[10px]">AI에게 메모 작성 도움을 요청하세요</p>
            <p className="text-[10px]">예: "이 내용을 요약해줘"</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex flex-col gap-0.5 ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                } ${index > 0 && messages[index - 1].role === 'assistant' && message.role === 'user' ? 'mt-4' : ''}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-2 py-1.5 text-[10px] relative group ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => insertToEditor(message.content)}
                      className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded text-[8px] hover:bg-accent/50 w-4 h-4 p-0"
                      title="에디터에 저장"
                    >
                      💾
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start gap-1 mt-4">
                <div className="bg-muted rounded-lg px-2 py-1.5 text-[10px]">
                  <div className="flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce delay-100">●</span>
                    <span className="animate-bounce delay-200">●</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIChatAssistant;

