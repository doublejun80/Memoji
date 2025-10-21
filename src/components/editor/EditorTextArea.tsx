import React, { useRef, useEffect } from 'react';
import { Page } from '../../types';

interface EditorTextAreaProps {
  currentPage: Page;
  onPageUpdate: (page: Page) => void;
}

export const EditorTextArea: React.FC<EditorTextAreaProps> = ({
  currentPage,
  onPageUpdate
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [currentPage?.content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const updatedPage = {
      ...currentPage,
      content: e.target.value,
      updatedAt: new Date().toISOString()
    };
    onPageUpdate(updatedPage);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      if (e.shiftKey) {
        // Shift+Tab: 들여쓰기 제거
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const line = value.substring(lineStart, value.indexOf('\n', lineStart));
        if (line.startsWith('  ')) {
          const newValue = value.substring(0, lineStart) + line.substring(2) + value.substring(lineStart + line.length);
          const updatedPage = {
            ...currentPage,
            content: newValue,
            updatedAt: new Date().toISOString()
          };
          onPageUpdate(updatedPage);
          
          setTimeout(() => {
            textarea.selectionStart = start - 2;
            textarea.selectionEnd = end - 2;
          }, 0);
        }
      } else {
        // Tab: 들여쓰기 추가
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        const updatedPage = {
          ...currentPage,
          content: newValue,
          updatedAt: new Date().toISOString()
        };
        onPageUpdate(updatedPage);
        
        setTimeout(() => {
          textarea.selectionStart = start + 2;
          textarea.selectionEnd = end + 2;
        }, 0);
      }
    }
  };

  return (
    <div className="flex-1 overflow-hidden bg-background">
      <textarea
        ref={textareaRef}
        value={currentPage?.content || ''}
        onChange={handleContentChange}
        onKeyDown={handleKeyDown}
        placeholder="내용을 입력하세요..."
        className="w-full h-full p-6 bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
        style={{
          minHeight: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
        }}
      />
    </div>
  );
};