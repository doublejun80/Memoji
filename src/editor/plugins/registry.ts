export type BuiltInPluginId =
  | 'gfmTables'
  | 'wikiLinks'
  | 'tags'
  | 'tasks'
  | 'localAi'
  | 'calendarNotes'
  | 'searchIndex';

export interface BuiltInPluginDefinition {
  id: BuiltInPluginId;
  name: string;
  description: string;
  defaultEnabled: boolean;
  status: 'active' | 'planned';
}

export interface BuiltInPluginState extends BuiltInPluginDefinition {
  enabled: boolean;
}

const BUILT_IN_PLUGIN_SETTINGS_KEY = 'memoji-built-in-plugin-settings';

export const builtInPlugins: BuiltInPluginDefinition[] = [
  {
    id: 'gfmTables',
    name: 'GFM 표',
    description: 'Milkdown table-block 기반 표 작성, 행/열 편집, Markdown table 저장',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'wikiLinks',
    name: '위키링크',
    description: '[[페이지]] 문법을 내부 페이지 연결로 처리',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'tags',
    name: '태그',
    description: '#태그 문법을 검색/분류 메타데이터로 자동 추출',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'tasks',
    name: '할 일',
    description: '- [ ] / - [x] task list 작성과 Markdown 저장',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'localAi',
    name: '로컬 AI',
    description: 'Gemma 4 E2B GGUF 기반 문서 요약, 정리, 삽입 지원',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'calendarNotes',
    name: '달력 노트',
    description: '날짜별 페이지 필터링과 달력 기반 이동',
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'searchIndex',
    name: '검색 인덱스',
    description: '제목, 본문, 태그를 통합 검색하고 안전하게 하이라이트',
    defaultEnabled: true,
    status: 'active',
  },
];

const readStoredPluginSettings = (): Partial<Record<BuiltInPluginId, boolean>> => {
  try {
    return JSON.parse(localStorage.getItem(BUILT_IN_PLUGIN_SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
};

export const getBuiltInPlugins = (): BuiltInPluginState[] => {
  const storedSettings = readStoredPluginSettings();
  return builtInPlugins.map((plugin) => ({
    ...plugin,
    enabled: storedSettings[plugin.id] ?? plugin.defaultEnabled,
  }));
};

export const setBuiltInPluginEnabled = (id: BuiltInPluginId, enabled: boolean): BuiltInPluginState[] => {
  const storedSettings = readStoredPluginSettings();
  localStorage.setItem(
    BUILT_IN_PLUGIN_SETTINGS_KEY,
    JSON.stringify({ ...storedSettings, [id]: enabled })
  );
  return getBuiltInPlugins();
};
