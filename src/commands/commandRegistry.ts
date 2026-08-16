import type { AppCommand, CommandContext } from './types';

export const REQUIRED_GA_COMMAND_IDS = [
  'page.new.daily',
  'capture.quick',
  'view.today',
  'view.tasks',
  'view.calendar',
  'ai.open',
  'ai.summarize.current',
  'document.save',
  'document.export',
  'settings.open',
  'focus.toggle',
  'panel.left.toggle',
  'panel.right.toggle',
] as const;

const always = () => true;
const hasPage = (context: CommandContext) => context.hasCurrentPage;
const canUseAiForPage = (context: CommandContext) => context.hasCurrentPage && context.canUseAi;

export function createCommandRegistry(): AppCommand[] {
  return [
    {
      id: 'command.palette.open',
      label: '명령 또는 검색',
      description: '페이지, 작업, 명령을 한곳에서 찾습니다.',
      keywords: ['검색', '명령', 'search', 'command'],
      category: 'navigation',
      shortcut: 'Ctrl+K',
      global: true,
      enabled: always,
      run: (context) => context.openCommandPalette?.(),
    },
    {
      id: 'page.new.daily',
      label: '오늘 페이지 만들기',
      keywords: ['새 페이지', 'daily', 'today'],
      category: 'create',
      shortcut: 'Ctrl+N',
      enabled: always,
      run: (context) => context.createDailyPage(),
    },
    {
      id: 'capture.quick',
      label: '빠른 메모',
      keywords: ['capture', 'inbox', '메모'],
      category: 'create',
      shortcut: 'Ctrl+Shift+N',
      enabled: always,
      run: (context) => context.quickCapture(),
    },
    ...navigationCommands(),
    {
      id: 'view.search',
      label: '전체 검색 보기',
      description: 'SQLite FTS 결과를 중앙 검색 공간에서 엽니다.',
      keywords: ['검색', 'search', 'fts', 'workspace'],
      category: 'navigation',
      enabled: always,
      run: (context) => context.setWorkspaceView('search'),
    },
    {
      id: 'ai.open',
      label: 'AI 열기',
      keywords: ['assistant', '도우미', 'ai'],
      category: 'ai',
      shortcut: 'Ctrl+Shift+A',
      global: true,
      enabled: always,
      run: (context) => context.openAi(),
    },
    {
      id: 'ai.summarize.current',
      label: '현재 문서 요약',
      keywords: ['summary', '요약', '현재 페이지'],
      category: 'ai',
      enabled: canUseAiForPage,
      run: (context) => context.summarizeCurrentPage(),
    },
    {
      id: 'document.save',
      label: '문서 저장',
      keywords: ['save', '저장'],
      category: 'document',
      shortcut: 'Ctrl+S',
      global: true,
      enabled: always,
      run: (context) => context.saveDocument(),
    },
    {
      id: 'document.export',
      label: 'Markdown 내보내기',
      keywords: ['export', '다운로드', 'markdown'],
      category: 'document',
      enabled: hasPage,
      run: (context) => context.exportDocument(),
    },
    {
      id: 'settings.open',
      label: '설정 열기',
      keywords: ['settings', '환경설정'],
      category: 'settings',
      enabled: always,
      run: (context) => context.openSettings(),
    },
    {
      id: 'focus.toggle',
      label: '집중 모드 전환',
      keywords: ['focus', '집중'],
      category: 'view',
      shortcut: 'F11',
      global: true,
      enabled: always,
      run: (context) => context.toggleFocus(),
    },
    {
      id: 'panel.left.toggle',
      label: '왼쪽 패널 전환',
      keywords: ['sidebar', 'navigation', '왼쪽'],
      category: 'view',
      enabled: always,
      run: (context) => context.togglePanel('left'),
    },
    {
      id: 'panel.right.toggle',
      label: '오른쪽 패널 전환',
      keywords: ['context', 'assistant', '오른쪽'],
      category: 'view',
      enabled: always,
      run: (context) => context.togglePanel('right'),
    },
  ];
}

function navigationCommands(): AppCommand[] {
  const definitions: Array<{
    id: string;
    label: string;
    leftView: Parameters<CommandContext['setLeftView']>[0];
    workspaceView: Parameters<CommandContext['setWorkspaceView']>[0];
    shortcut: string;
  }> = [
    { id: 'view.today', label: '오늘', leftView: 'today', workspaceView: 'editor', shortcut: 'Alt+1' },
    { id: 'view.daily', label: '데일리', leftView: 'daily', workspaceView: 'editor', shortcut: 'Alt+2' },
    { id: 'view.projects', label: '프로젝트', leftView: 'projects', workspaceView: 'editor', shortcut: 'Alt+3' },
    { id: 'view.tasks', label: '작업', leftView: 'tasks', workspaceView: 'tasks', shortcut: 'Alt+4' },
    { id: 'view.calendar', label: '캘린더', leftView: 'calendar', workspaceView: 'calendar', shortcut: 'Alt+5' },
    { id: 'view.knowledge', label: '지식', leftView: 'knowledge', workspaceView: 'knowledge', shortcut: 'Alt+6' },
  ];

  return definitions.map((definition) => ({
    id: definition.id,
    label: `${definition.label} 보기`,
    keywords: [definition.label, 'view', 'workspace'],
    category: 'navigation',
    shortcut: definition.shortcut,
    global: true,
    enabled: always,
    run: (context) => {
      context.setLeftView(definition.leftView);
      context.setWorkspaceView(definition.workspaceView);
    },
  }));
}
