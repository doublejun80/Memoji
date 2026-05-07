export type EditorFontFamily = 'system' | 'sans' | 'serif' | 'mono';

export interface EditorPreferences {
  fontFamily: EditorFontFamily;
}

export const EDITOR_PREFERENCES_STORAGE_KEY = 'memoji.editor.preferences';
export const EDITOR_PREFERENCES_CHANGED_EVENT = 'memoji-editor-preferences-changed';

export const EDITOR_FONT_FAMILY_LABELS: Record<EditorFontFamily, string> = {
  system: '시스템 기본',
  sans: '고딕',
  serif: '명조',
  mono: '고정폭',
};

export const EDITOR_FONT_FAMILY_VALUES: Record<EditorFontFamily, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  sans: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif',
  serif: '"Noto Serif KR", "AppleMyungjo", "Batang", serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
};

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  fontFamily: 'system',
};

export const readEditorPreferences = (): EditorPreferences => {
  try {
    const stored = JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY) || '{}') || {};
    const fontFamily = stored.fontFamily in EDITOR_FONT_FAMILY_VALUES
      ? stored.fontFamily
      : DEFAULT_EDITOR_PREFERENCES.fontFamily;

    return {
      fontFamily,
    };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
};

export const writeEditorPreferences = (preferences: Partial<EditorPreferences>): EditorPreferences => {
  const nextPreferences = {
    ...readEditorPreferences(),
    ...preferences,
  };

  localStorage.setItem(EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));
  window.dispatchEvent(new CustomEvent(EDITOR_PREFERENCES_CHANGED_EVENT));
  return nextPreferences;
};
