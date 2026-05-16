export const highlightSearchQuery = (text: string, query: string): string => {
  if (!query.trim() || !text) return text;
  
  // Clean up query - remove special prefixes and tags for highlighting
  let cleanQuery = query.toLowerCase()
    .replace(/^(title|content):\s*/, '')
    .replace(/#[\w가-힣\u4e00-\u9fff]+/g, '')
    .trim();
  
  if (!cleanQuery) {
    // If only tags, highlight the tags themselves
    const tags: string[] = query.match(/#[\w가-힣\u4e00-\u9fff]+/g) ?? [];
    let highlightedText = text;
    tags.forEach(tag => {
      const regex = new RegExp(`(${escapeRegExp(tag.slice(1))})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded">$1</mark>');
    });
    return highlightedText;
  }
  
  // First highlight any tags in the original query
  const originalTags: string[] = query.match(/#[\w가-힣\u4e00-\u9fff]+/g) ?? [];
  let highlightedText = text;
  
  originalTags.forEach(tag => {
    const regex = new RegExp(`(${escapeRegExp(tag)})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded">$1</mark>');
  });
  
  // Then highlight other words
  if (cleanQuery) {
    const words = cleanQuery.split(/\s+/).filter(word => word.length > 0);
    words.forEach(word => {
      const regex = new RegExp(`(${escapeRegExp(word)})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded">$1</mark>');
    });
  }
  
  return highlightedText;
};

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const stripHtmlTags = (html: string): string => {
  return html.replace(/<[^>]*>/g, '');
};
