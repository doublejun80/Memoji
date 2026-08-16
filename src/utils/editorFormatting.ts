export const PARAGRAPH_INDENT_UNIT = '\u00a0\u00a0';

export const normalizeEditorLinkHref = (value: string): string => {
  const href = value.trim();
  if (!href) return '';
  if (/^(?:javascript|vbscript|data):/i.test(href)) return '';
  if (href.startsWith('//')) return `https:${href}`;
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/|\.\/|\.\.\/)/i.test(href)) return href;
  if (/^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(href)) {
    return `https://${href}`;
  }
  return href;
};

export const paragraphIndentEdit = (
  text: string,
  direction: 'increase' | 'decrease',
): { insert: string; remove: number } => {
  if (direction === 'increase') return { insert: PARAGRAPH_INDENT_UNIT, remove: 0 };
  if (text.startsWith(PARAGRAPH_INDENT_UNIT)) return { insert: '', remove: PARAGRAPH_INDENT_UNIT.length };
  if (text.startsWith('\u00a0') || text.startsWith(' ')) return { insert: '', remove: 1 };
  return { insert: '', remove: 0 };
};
