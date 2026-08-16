import type { Page } from '../types';

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

export interface DocumentMetadata {
  status?: string;
  dueDate?: string;
}

export interface EditableDocumentMetadata {
  status: string;
  dueDate: string;
  tags: string[];
}

const readMetadataField = (markdown: string, key: 'status' | 'due'): string | undefined => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1] ?? '';
  const yamlValue = frontmatter.match(new RegExp(`^${escapedKey}\\s*:\\s*["']?([^\\n"']+)["']?\\s*$`, 'im'))?.[1]?.trim();
  if (yamlValue) return yamlValue;
  return markdown.match(new RegExp(`^${escapedKey}\\s*::\\s*(.+?)\\s*$`, 'im'))?.[1]?.trim();
};

export const extractDocumentMetadata = (markdown: string): DocumentMetadata => {
  const status = readMetadataField(markdown, 'status');
  const dueDate = readMetadataField(markdown, 'due');
  return {
    ...(status ? { status } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
};

const normalizeTags = (tags: string[]) => Array.from(new Set(tags
  .map((tag) => tag.trim().replace(/^#+/, ''))
  .filter(Boolean)));

export const updateDocumentMetadata = (
  markdown: string,
  metadata: EditableDocumentMetadata,
): string => {
  const status = metadata.status.trim();
  const dueDate = metadata.dueDate.trim();
  const tags = normalizeTags(metadata.tags);
  const withoutDataview = markdown
    .replace(/^(?:status|due|tags)\s*::.*(?:\r?\n|$)/gim, '')
    .replace(/^\s*\n/, '');
  const frontmatterMatch = withoutDataview.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);

  if (frontmatterMatch) {
    const retained = frontmatterMatch[1]
      .split(/\r?\n/)
      .filter((line) => !/^(?:status|due|tags)\s*:/i.test(line.trim()));
    if (status) retained.push(`status: ${status}`);
    if (dueDate) retained.push(`due: ${dueDate}`);
    if (tags.length) retained.push(`tags: "${tags.map((tag) => `#${tag}`).join(' ')}"`);
    const body = withoutDataview.slice(frontmatterMatch[0].length).replace(/^\s*\n/, '');
    return `---\n${retained.join('\n')}\n---\n${body}`;
  }

  const propertyLines = [
    status ? `status:: ${status}` : '',
    dueDate ? `due:: ${dueDate}` : '',
    tags.length ? `tags:: ${tags.map((tag) => `#${tag}`).join(' ')}` : '',
  ].filter(Boolean);
  return propertyLines.length ? `${propertyLines.join('\n')}\n\n${withoutDataview}` : withoutDataview;
};

export const pageWithMarkdownMetadata = (page: Page, markdown: string): Page => ({
  ...page,
  content: markdown,
  tags: extractTagsFromMarkdown(markdown),
  ...extractDocumentMetadata(markdown),
  updatedAt: new Date().toISOString(),
});
