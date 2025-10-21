import React from 'react';
import { Page } from '../types';
import { Badge } from './ui/badge';

interface WikiLinkRendererProps {
  text: string;
  pages: Page[];
  onPageSelect: (page: Page) => void;
  onPageCreate: (title: string) => void;
}

export const WikiLinkRenderer: React.FC<WikiLinkRendererProps> = ({
  text,
  pages,
  onPageSelect,
  onPageCreate
}) => {
  // [[페이지 제목]] 형태의 위키 링크를 찾는 정규식
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;

  const renderTextWithWikiLinks = (inputText: string) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = wikiLinkRegex.exec(inputText)) !== null) {
      // 링크 이전의 일반 텍스트 추가
      if (match.index > lastIndex) {
        parts.push(inputText.slice(lastIndex, match.index));
      }

      const linkTitle = match[1].trim();
      const existingPage = pages.find(page => 
        page.title.toLowerCase() === linkTitle.toLowerCase()
      );

      // 위키 링크 렌더링 - 태그(Badge) 스타일과 통일
      parts.push(
        <Badge
          key={match.index}
          variant="secondary"
          className={`inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground ${
            existingPage ? '' : 'border border-dashed border-red-500 text-red-400'
          }`}
          onClick={() => {
            if (existingPage) {
              onPageSelect(existingPage);
            } else {
              const shouldCreate = window.confirm(
                `"${linkTitle}" 페이지가 존재하지 않습니다. 새로 만드시겠습니까?`
              );
              if (shouldCreate) {
                onPageCreate(linkTitle);
              }
            }
          }}
          title={existingPage ? `"${linkTitle}" 페이지로 이동` : `"${linkTitle}" 페이지 생성`}
        >
          🔗 {linkTitle}
          {!existingPage && <span className="text-[10px] opacity-70">(생성)</span>}
        </Badge>
      );

      lastIndex = match.index + match[0].length;
    }

    // 마지막 부분의 일반 텍스트 추가
    if (lastIndex < inputText.length) {
      parts.push(inputText.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [inputText];
  };

  return (
    <span>
      {renderTextWithWikiLinks(text)}
    </span>
  );
};
