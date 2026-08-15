import { AiAssistantPanel } from '../features/ai/AiAssistantPanel';
import type { AiProposal, AiSource } from '../features/ai/aiProposalReducer';
import type { ApplyProposalResult } from '../shared/api/proposalApi';

interface AIChatAssistantProps {
  onInsertText?: (text: string) => void;
  onApplyProposal?: (proposal: AiProposal) => boolean | Promise<boolean>;
  onProposalApplied?: (result: ApplyProposalResult) => void | Promise<void>;
  onOpenSource?: (source: AiSource) => void | Promise<void>;
  currentPageId?: string;
  currentProjectId?: string;
  currentPageRevision?: number;
  currentPageContent?: string;
}

/** Compatibility entrypoint while Context Hub owns the assistant placement. */
export default function AIChatAssistant(props: AIChatAssistantProps) {
  return <AiAssistantPanel {...props} />;
}
