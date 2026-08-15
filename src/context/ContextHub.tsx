import * as Tabs from '@radix-ui/react-tabs';
import { Bot, ListTree, Link2, ListChecks, Search, SlidersHorizontal } from 'lucide-react';
import type { ContextHubTab } from '../app/workspaceState';
import AIChatAssistant from '../components/AIChatAssistant';
import type { Page } from '../types';
import { DocumentTasksPanel, parseMarkdownTasks } from './DocumentTasksPanel';
import { LinksPanel } from './LinksPanel';
import { OutlinePanel } from './OutlinePanel';
import { PropertiesPanel } from './PropertiesPanel';
import { SearchPinPanel } from './SearchPinPanel';
import type { AiProposal } from '../features/ai/aiProposalReducer';

interface ContextHubProps {
  activeTab: ContextHubTab;
  onTabChange: (tab: ContextHubTab) => void;
  currentPage: Page | null;
  pages: Page[];
  searchPinned?: boolean;
  onPageSelect?: (page: Page) => void;
  onInsertText?: (text: string) => void;
  onApplyProposal?: (proposal: AiProposal) => boolean | Promise<boolean>;
}

const TAB_ITEMS = [
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'outline', label: '개요', icon: ListTree },
  { id: 'links', label: '링크', icon: Link2 },
  { id: 'tasks', label: '작업', icon: ListChecks },
  { id: 'properties', label: '속성', icon: SlidersHorizontal },
] satisfies Array<{ id: ContextHubTab; label: string; icon: typeof Bot }>;

export function ContextHub({
  activeTab,
  onTabChange,
  currentPage,
  pages,
  searchPinned = false,
  onPageSelect,
  onInsertText,
  onApplyProposal,
}: ContextHubProps) {
  const resolvedTab = activeTab === 'search' && !searchPinned ? 'ai' : activeTab;
  const taskCount = parseMarkdownTasks(currentPage?.content ?? '').filter((task) => !task.done).length;
  const tabs = searchPinned
    ? [...TAB_ITEMS, { id: 'search' as const, label: '검색', icon: Search }]
    : TAB_ITEMS;

  return (
    <Tabs.Root
      className="context-hub"
      value={resolvedTab}
      onValueChange={(value) => onTabChange(value as ContextHubTab)}
      orientation="horizontal"
    >
      <div className="context-hub-header">
        <span>CONTEXT</span>
        <Tabs.List className="context-hub-tabs" aria-label="Context Hub">
          {tabs.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger key={id} value={id} aria-label={label} title={label}>
              <Icon aria-hidden="true" />
              {id === 'tasks' && taskCount > 0 ? <span className="context-tab-badge">{taskCount}</span> : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>

      <Tabs.Content value="ai" className="context-hub-panel" data-context-panel data-fill-height="true">
        <AIChatAssistant
          onInsertText={onInsertText}
          onApplyProposal={onApplyProposal}
          currentPageId={currentPage?.id}
          currentPageRevision={currentPage?.revision ?? 0}
          currentPageContent={currentPage?.content}
        />
      </Tabs.Content>
      <Tabs.Content value="outline" className="context-hub-panel" data-context-panel>
        <OutlinePanel page={currentPage} />
      </Tabs.Content>
      <Tabs.Content value="links" className="context-hub-panel" data-context-panel>
        <LinksPanel page={currentPage} pages={pages} onPageSelect={onPageSelect} />
      </Tabs.Content>
      <Tabs.Content value="tasks" className="context-hub-panel" data-context-panel>
        <DocumentTasksPanel page={currentPage} />
      </Tabs.Content>
      <Tabs.Content value="properties" className="context-hub-panel" data-context-panel>
        <PropertiesPanel page={currentPage} />
      </Tabs.Content>
      {searchPinned ? (
        <Tabs.Content value="search" className="context-hub-panel" data-context-panel>
          <SearchPinPanel pages={pages} onPageSelect={onPageSelect} />
        </Tabs.Content>
      ) : null}
    </Tabs.Root>
  );
}
