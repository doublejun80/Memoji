import type { ContextHubTab } from '../app/workspaceState';
import { ContextHub } from '../context/ContextHub';
import type { Page } from '../types';

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
  onReplaceText?: (targetText: string, replacementText: string) => boolean;
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
  onReplaceText,
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
      onReplaceText={onReplaceText}
      searchPinned={searchPinned}
    />
  );
}
