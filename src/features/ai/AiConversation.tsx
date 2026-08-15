import { useEffect, useRef } from 'react';
import type { AiMessage } from './aiTypes';

interface AiConversationProps {
  messages: AiMessage[];
  isGenerating: boolean;
  onInsertText?: (text: string) => void;
  onInsertBlock?: (text: string) => void;
  onReplaceText?: (target: string, replacement: string) => void;
}

export function AiConversation({
  messages,
  isGenerating,
  onInsertText,
  onInsertBlock,
  onReplaceText,
}: AiConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [isGenerating, messages]);

  return (
    <div className="memoji-ai-conversation" ref={scrollRef} aria-live="polite">
      {messages.length === 0 ? (
        <div className="memoji-ai-empty">
          <strong>로컬 AI 메모 도우미</strong>
          <span>현재 문서를 요약하거나 다음 문장을 함께 작성해보세요.</span>
        </div>
      ) : messages.map((message) => (
        <article key={message.id} className="memoji-ai-message" data-role={message.role}>
          <p>{message.content || (message.role === 'assistant' && isGenerating ? '생성 중…' : '')}</p>
          {message.role === 'assistant' && message.content && (
            <div className="memoji-ai-message-actions">
              {message.replaceTarget && onReplaceText && (
                <button type="button" onClick={() => onReplaceText(message.replaceTarget!, message.content)}>
                  치환
                </button>
              )}
              {onInsertBlock && <button type="button" onClick={() => onInsertBlock(message.content)}>블록</button>}
              {onInsertText && <button type="button" onClick={() => onInsertText(message.content)}>삽입</button>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

