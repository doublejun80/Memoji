const SPAN_TAG_PATTERN = /<\/?span\b[^>]*>/gi;

const isLegacyHeadingSpan = (tag: string) => (
  /^<span\b/i.test(tag) && /\bdata-memoji-heading-level=(["'])[1-6]\1/i.test(tag)
);

const isClosingSpan = (tag: string) => /^<\/span\b/i.test(tag);

export const normalizeLegacyHeadingMarkdown = (markdown: string) => {
  const stack: Array<'legacy-heading' | 'span'> = [];

  return markdown.replace(SPAN_TAG_PATTERN, (tag) => {
    if (isLegacyHeadingSpan(tag)) {
      stack.push('legacy-heading');
      return '';
    }

    if (!isClosingSpan(tag)) {
      stack.push('span');
      return tag;
    }

    const openSpan = stack.pop();
    return openSpan === 'legacy-heading' ? '' : tag;
  });
};
