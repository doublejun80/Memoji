import { AiAssistantPanel } from '../features/ai/AiAssistantPanel';
import type { AiProposal } from '../features/ai/aiProposalReducer';

interface AIChatAssistantProps {
  onInsertText?: (text: string) => void;
  onApplyProposal?: (proposal: AiProposal) => boolean | Promise<boolean>;
  currentPageId?: string;
  currentPageRevision?: number;
  currentPageContent?: string;
}

/** Compatibility entrypoint while Context Hub owns the assistant placement. */
export default function AIChatAssistant(props: AIChatAssistantProps) {
  return <AiAssistantPanel {...props} />;
}
