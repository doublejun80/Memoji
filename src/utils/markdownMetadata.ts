import { Page } from '../types';

const TAG_PATTERN = /#([\w가-힣\u4e00-\u9fff]+)/g;
const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;

export const stripMarkdownCode = (markdown: string): string =>
  markdown
    .replace(FENCED_CODE_BLOCK_PATTERN, ' ')
    .replace(INLINE_CODE_PATTERN, ' ');

export const extractTagsFromMarkdown = (markdown: string): string[] => {
  const searchableMarkdown = stripMarkdownCode(markdown);
  const matches = searchableMarkdown.matchAll(TAG_PATTERN);
  const tags = Array.from(matches, (match) => match[1].trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^#/, ''));

  return Array.from(new Set(tags));
};

export const pageWithMarkdownMetadata = (page: Page, markdown: string): Page => ({
  ...page,
  content: markdown,
  tags: extractTagsFromMarkdown(markdown),
  updatedAt: new Date().toISOString(),
});
