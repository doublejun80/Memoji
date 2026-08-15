import type { ContextHubTab } from '../app/workspaceState';
import { ContextHub } from '../context/ContextHub';
import type { Page } from '../types';
import type { AiProposal } from '../features/ai/aiProposalReducer';

interface RightPanelProps {
  pages: Page[];
  onPageSelect: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  datesWithPages: string[];
  currentPage?: Page | null;
  onInsertText?: (text: string) => void;
  onApplyProposal?: (proposal: AiProposal) => boolean | Promise<boolean>;
  activeTab?: ContextHubTab;
  onTabChange?: (tab: ContextHubTab) => void;
  searchPinned?: boolean;
}

/** Compatibility boundary for the legacy App call site. */
export function RightPanel({
  pages,
  onPageSelect,
  isOpen,
  currentPage = null,
  onInsertText,
  onApplyProposal,
  activeTab = 'ai',
  onTabChange = () => undefined,
  searchPinned = false,
}: RightPanelProps) {
  if (!isOpen) return null;
  return (
    <ContextHub
      activeTab={activeTab}
      onTabChange={onTabChange}
      currentPage={currentPage}
      pages={pages}
      onPageSelect={onPageSelect}
      onInsertText={onInsertText}
      onApplyProposal={onApplyProposal}
      searchPinned={searchPinned}
    />
  );
}
