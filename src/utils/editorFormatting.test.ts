import { describe, expect, it } from 'vitest';
import { normalizeEditorLinkHref, paragraphIndentEdit, PARAGRAPH_INDENT_UNIT } from './editorFormatting';

describe('normalizeEditorLinkHref', () => {
  it('turns bare external domains into absolute HTTPS links', () => {
    expect(normalizeEditorLinkHref('naver.com')).toBe('https://naver.com');
    expect(normalizeEditorLinkHref('www.naver.com/search?q=memoji')).toBe('https://www.naver.com/search?q=memoji');
  });

  it('preserves explicit and document-local link schemes', () => {
    expect(normalizeEditorLinkHref('https://example.com')).toBe('https://example.com');
    expect(normalizeEditorLinkHref('mailto:test@example.com')).toBe('mailto:test@example.com');
    expect(normalizeEditorLinkHref('#section')).toBe('#section');
    expect(normalizeEditorLinkHref('/workspace/page')).toBe('/workspace/page');
    expect(normalizeEditorLinkHref('javascript:alert(1)')).toBe('');
  });
});

describe('paragraphIndentEdit', () => {
  it('adds and removes a persistent two-space visual indent for ordinary paragraphs', () => {
    expect(paragraphIndentEdit('문단', 'increase')).toEqual({ insert: PARAGRAPH_INDENT_UNIT, remove: 0 });
    expect(paragraphIndentEdit(`${PARAGRAPH_INDENT_UNIT}문단`, 'decrease')).toEqual({ insert: '', remove: 2 });
    expect(paragraphIndentEdit('문단', 'decrease')).toEqual({ insert: '', remove: 0 });
  });
});
