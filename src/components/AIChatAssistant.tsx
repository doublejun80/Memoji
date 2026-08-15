import { AiAssistantPanel } from '../features/ai/AiAssistantPanel';

interface AIChatAssistantProps {
  onInsertText?: (text: string) => void;
  onReplaceText?: (targetText: string, replacementText: string) => boolean;
  currentPageContent?: string;
}

/** Compatibility entrypoint while Context Hub owns the assistant placement. */
export default function AIChatAssistant(props: AIChatAssistantProps) {
  return <AiAssistantPanel {...props} />;
}
