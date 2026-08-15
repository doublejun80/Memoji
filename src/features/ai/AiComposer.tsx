import { useRef } from 'react';
import { SendHorizontal, Square } from 'lucide-react';

interface AiComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value?: string) => void;
  onCancel: () => void;
  canGenerate: boolean;
  isGenerating: boolean;
}

export function AiComposer({
  value,
  onChange,
  onSend,
  onCancel,
  canGenerate,
  isGenerating,
}: AiComposerProps) {
  const composingRef = useRef(false);

  return (
    <div className="memoji-ai-composer">
      <textarea
        id="memoji-ai-message"
        name="ai-message"
        aria-label="AI 메시지"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          if (composingRef.current || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onSend(event.currentTarget.value);
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        placeholder={canGenerate ? '메시지를 입력하세요' : '모델 준비가 필요합니다'}
        rows={3}
        disabled={!canGenerate && !isGenerating}
      />
      {isGenerating ? (
        <button type="button" onClick={onCancel} aria-label="생성 취소" title="생성 취소">
          <Square aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onSend()}
          disabled={!canGenerate || !value.trim()}
          aria-label="전송"
          title="전송"
        >
          <SendHorizontal aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

