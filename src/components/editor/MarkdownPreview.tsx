import React from 'react';

interface MarkdownPreviewProps {
  content: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  // 간단한 마크다운 파싱
  const parseMarkdown = (text: string) => {
    return text
      // 헤딩
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      // 볼드
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // 이탤릭
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // 인라인 코드
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
      // 링크
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-primary underline">$1</a>')
      // 체크박스
      .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-2 my-1"><input type="checkbox" disabled> <span>$1</span></div>')
      .replace(/^- \[x\] (.+)$/gm, '<div class="flex items-center gap-2 my-1"><input type="checkbox" checked disabled> <span class="line-through text-muted-foreground">$1</span></div>')
      // 일반 리스트
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
      // 번호 리스트
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ol class="list-decimal list-inside space-y-1 my-2">$1</ol>')
      // 코드 블록
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-muted p-4 rounded-md overflow-x-auto"><code>$2</code></pre>')
      // 인용
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary pl-4 my-2 text-muted-foreground italic">$1</blockquote>')
      // 수평선
      .replace(/^---$/gm, '<hr class="my-4 border-border">')
      // 줄바꿈
      .replace(/\n\n/g, '</p><p class="mb-4">')
      .replace(/\n/g, '<br>');
  };

  const htmlContent = parseMarkdown(content || '');

  return (
    <div className="flex-1 overflow-auto custom-scrollbar bg-background">
      <div className="max-w-none p-6">
        {content ? (
          <div 
            className="prose prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{ 
              __html: `<p class="mb-4">${htmlContent}</p>` 
            }} 
          />
        ) : (
          <div className="text-muted-foreground text-center py-12">
            <p>내용을 입력하면 여기에 미리보기가 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
};