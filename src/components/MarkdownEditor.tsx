import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Page } from '../types';
import { Button } from './ui/button';
import { Eye, Edit3, Save } from 'lucide-react';
import { TagRenderer } from './TagRenderer';
import { WikiLinkRenderer } from './WikiLinkRenderer';
import { toLocalISOString } from '../utils/dateUtils';
import { open } from '@tauri-apps/plugin-shell';

interface MarkdownEditorProps {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void;
  pages?: Page[];
  onPageSelect?: (page: Page) => void;
  onPageCreate?: (title: string) => void;
  onSaveRequest?: number; // TopBar 저장 버튼 트리거 (카운터)
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  currentPage,
  onPageUpdate,
  pages = [],
  onPageSelect = () => {},
  onPageCreate = () => {},
  onSaveRequest
}) => {
  const [content, setContent] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(true); // 기본값을 true로 변경
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const previousPageIdRef = useRef<string | null>(null);
  const savedContentRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false); // 클로저 문제 해결용 ref

  // hasUnsavedChanges를 ref에 동기화 (클로저 문제 해결)
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // 페이지가 변경될 때 콘텐츠 로드 및 미리보기 모드로 전환
  useEffect(() => {
    if (currentPage) {
      // 페이지 ID가 실제로 변경되었을 때만 미리보기 모드로 전환
      if (previousPageIdRef.current !== currentPage.id) {
        setIsPreviewMode(true);
        previousPageIdRef.current = currentPage.id;
      }
      const pageContent = currentPage.content || '';
      setContent(pageContent);
      savedContentRef.current = pageContent;
      setHasUnsavedChanges(false);
    } else {
      setContent('');
      savedContentRef.current = '';
      previousPageIdRef.current = null;
      setHasUnsavedChanges(false);
    }
  }, [currentPage]);

  // textarea 자동 높이 조절 제거 - 스크롤 문제 해결을 위해

  // 모드 전환 시 스크롤 위치 복원
  useEffect(() => {
    if (isPreviewMode && previewRef.current) {
      previewRef.current.scrollTop = scrollPositionRef.current;
    } else if (!isPreviewMode && textareaRef.current) {
      textareaRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [isPreviewMode]);

  // 미리보기 모드에서 태그 및 링크 클릭 이벤트 처리
  useEffect(() => {
    const handleClick = async (event: Event) => {
      const target = event.target as HTMLElement;

      // 링크 클릭 처리 (Tauri shell API 사용)
      if (target.tagName === 'A') {
        const href = target.getAttribute('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          event.preventDefault();
          try {
            await open(href);
            console.log('✅ 링크 열기 성공:', href);
          } catch (error) {
            console.error('❌ 링크 열기 실패:', error);
          }
        }
        return;
      }

      // 태그 클릭 처리
      const tagData = target.getAttribute('data-tag');
      if (tagData) {
        event.preventDefault();
        // 태그 클릭 시 아무 동작 안함 (검색 기능 제거됨)
      }
    };

    if (isPreviewMode && previewRef.current) {
      previewRef.current.addEventListener('click', handleClick);
      return () => {
        previewRef.current?.removeEventListener('click', handleClick);
      };
    }
  }, [isPreviewMode]);

  // 전역 키보드 단축키 처리 (미리보기 모드에서도 작동)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 단축키 무시
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // localStorage에서 단축키 설정 불러오기
      const getShortcutKey = (id: string, defaultKey: string): string => {
        const savedShortcuts = localStorage.getItem('keyboardShortcuts');
        if (savedShortcuts) {
          const shortcuts = JSON.parse(savedShortcuts);
          const shortcut = shortcuts.find((s: any) => s.id === id);
          return shortcut?.currentKey || defaultKey;
        }
        return defaultKey;
      };

      // 단축키 문자열을 파싱하는 함수
      const matchesShortcut = (shortcutKey: string): boolean => {
        const parts = shortcutKey.split('+').map(p => p.trim());
        const hasCtrl = parts.includes('Ctrl');
        const hasAlt = parts.includes('Alt');
        const hasShift = parts.includes('Shift');
        const key = parts.find(p => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(p));

        return (
          e.ctrlKey === hasCtrl &&
          e.altKey === hasAlt &&
          e.shiftKey === hasShift &&
          e.key.toLowerCase() === key?.toLowerCase()
        );
      };

      // Ctrl+E 미리보기 전환
      const previewKey = getShortcutKey('preview', 'Ctrl+E');
      if (matchesShortcut(previewKey)) {
        e.preventDefault();
        setIsPreviewMode(prev => !prev);
        return;
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // 수동 저장
  const handleSave = useCallback(() => {
    if (currentPage && hasUnsavedChanges) {
      const updatedPage: Page = {
        ...currentPage,
        content: content,
        updatedAt: toLocalISOString(new Date())
      };
      // onPageUpdate를 통해 tauriStorage에 저장 (중복 저장 방지)
      onPageUpdate(updatedPage);
      savedContentRef.current = content;
      setHasUnsavedChanges(false);
    }
  }, [currentPage, content, hasUnsavedChanges, onPageUpdate]);

  // 콘텐츠에서 태그 추출 함수
  const extractTagsFromContent = (content: string): string[] => {
    const tagRegex = /#([\w가-힣\u4e00-\u9fff]+)/g;
    const matches = content.matchAll(tagRegex);
    const tags = Array.from(matches, match => match[1]);
    // 중복 제거
    return Array.from(new Set(tags));
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasUnsavedChanges(newContent !== savedContentRef.current);
  };

  // 디바운스 자동 저장 (2초)
  useEffect(() => {
    if (!currentPage || !hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      // 콘텐츠에서 태그 추출
      const extractedTags = extractTagsFromContent(content);
      console.log('🏷️ 자동 저장 시 태그 추출:', extractedTags);

      const updatedPage: Page = {
        ...currentPage, // 최신 currentPage 사용 (제목 변경 반영)
        content: content,
        tags: extractedTags, // 추출된 태그 저장
        updatedAt: toLocalISOString(new Date())
      };
      onPageUpdate(updatedPage);
      savedContentRef.current = content;
      setHasUnsavedChanges(false);
      console.log('✅ 자동 저장 완료:', currentPage.title);
    }, 2000); // 2초 후 자동 저장

    return () => clearTimeout(timer);
  }, [content, hasUnsavedChanges, currentPage, onPageUpdate]);

  // 페이지 전환 시 즉시 저장 (이전 페이지 정보 추적)
  const saveOnPageChangeRef = useRef<{page: Page, content: string} | null>(null);

  useEffect(() => {
    // 현재 페이지 정보를 저장
    if (currentPage) {
      saveOnPageChangeRef.current = { page: currentPage, content: content };
    }
  }, [currentPage, content]);

  useEffect(() => {
    // 페이지 ID가 변경될 때 이전 페이지 저장
    return () => {
      console.log('🔍 페이지 전환 cleanup 실행');
      console.log('  - saveOnPageChangeRef:', saveOnPageChangeRef.current);
      console.log('  - hasUnsavedChangesRef:', hasUnsavedChangesRef.current);

      if (saveOnPageChangeRef.current && hasUnsavedChangesRef.current) { // ← ref 사용!
        const { page, content: savedContent } = saveOnPageChangeRef.current;

        // 콘텐츠에서 태그 추출
        const extractedTags = extractTagsFromContent(savedContent);
        console.log('🏷️ 페이지 전환 시 태그 추출:', extractedTags);

        const updatedPage: Page = {
          ...page,
          content: savedContent,
          tags: extractedTags, // 추출된 태그 저장
          updatedAt: toLocalISOString(new Date())
        };
        onPageUpdate(updatedPage);
        console.log('✅ 페이지 전환 시 즉시 저장:', page.title);
        console.log('  - 저장된 내용:', savedContent.substring(0, 50) + '...');
      } else {
        console.log('❌ 저장 조건 불만족');
      }
    };
  }, [currentPage?.id, onPageUpdate]);

  // 브라우저 닫기/새로고침 시 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // TopBar 저장 버튼 연결
  useEffect(() => {
    if (onSaveRequest && onSaveRequest > 0) {
      handleSave();
    }
  }, [onSaveRequest]);

  // localStorage에서 단축키 설정 불러오기
  const getShortcutKey = (id: string, defaultKey: string): string => {
    const savedShortcuts = localStorage.getItem('keyboardShortcuts');
    if (savedShortcuts) {
      const shortcuts = JSON.parse(savedShortcuts);
      const shortcut = shortcuts.find((s: any) => s.id === id);
      return shortcut?.currentKey || defaultKey;
    }
    return defaultKey;
  };

  // 단축키 문자열을 파싱하는 함수
  const matchesShortcut = (e: React.KeyboardEvent, shortcutKey: string): boolean => {
    const parts = shortcutKey.split('+').map(p => p.trim());
    const hasCtrl = parts.includes('Ctrl');
    const hasAlt = parts.includes('Alt');
    const hasShift = parts.includes('Shift');
    const key = parts.find(p => !['Ctrl', 'Alt', 'Shift', 'Cmd'].includes(p));

    return (
      e.ctrlKey === hasCtrl &&
      e.altKey === hasAlt &&
      e.shiftKey === hasShift &&
      e.key.toLowerCase() === key?.toLowerCase()
    );
  };

  // 선택된 텍스트를 감싸는 함수
  const wrapSelectedText = (prefix: string, suffix: string = prefix) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const newContent =
      content.substring(0, start) +
      prefix + selectedText + suffix +
      content.substring(end);

    setContent(newContent);
    setHasUnsavedChanges(true);

    // 커서 위치 조정
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
      textarea.focus();
    }, 0);
  };

  // Tab 키 및 단축키 처리
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S 저장
    const saveKey = getShortcutKey('save', 'Ctrl+S');
    if (matchesShortcut(e, saveKey)) {
      e.preventDefault();
      handleSave();
      return;
    }

    // Ctrl+B 굵게
    const boldKey = getShortcutKey('bold', 'Ctrl+B');
    if (matchesShortcut(e, boldKey)) {
      e.preventDefault();
      wrapSelectedText('**');
      return;
    }

    // Ctrl+I 기울임
    const italicKey = getShortcutKey('italic', 'Ctrl+I');
    if (matchesShortcut(e, italicKey)) {
      e.preventDefault();
      wrapSelectedText('*');
      return;
    }

    // Ctrl+E 미리보기 전환
    const previewKey = getShortcutKey('preview', 'Ctrl+E');
    if (matchesShortcut(e, previewKey)) {
      e.preventDefault();
      setIsPreviewMode(!isPreviewMode);
      return;
    }

    // Tab 들여쓰기
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newContent);
      setHasUnsavedChanges(true);

      // 커서 위치 조정
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  // 할일 체크박스 토글 핸들러
  const toggleTodo = (lineIndex: number) => {
    const lines = content.split('\n');
    const line = lines[lineIndex];

    if (line.match(/^(\s*)- \[ \] (.+)/)) {
      // 체크되지 않은 할일을 체크함
      lines[lineIndex] = line.replace(/^(\s*)- \[ \] (.+)/, '$1- [x] $2');
    } else if (line.match(/^(\s*)- \[x\] (.+)/)) {
      // 체크된 할일을 체크 해제
      lines[lineIndex] = line.replace(/^(\s*)- \[x\] (.+)/, '$1- [ ] $2');
    }

    const newContent = lines.join('\n');
    setContent(newContent);
    setHasUnsavedChanges(true);
  };

  // 인라인 마크다운 처리 함수
  const processInlineMarkdown = (text: string) => {
    // Check if text contains wiki links
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    if (wikiLinkRegex.test(text)) {
      return (
        <WikiLinkRenderer
          text={text}
          pages={pages}
          onPageSelect={onPageSelect}
          onPageCreate={onPageCreate}
        />
      );
    }

    // Check if text contains tags
    const tagRegex = /#[\w가-힣\u4e00-\u9fff]+/g;
    if (tagRegex.test(text)) {
      return <TagRenderer text={text} onTagClick={() => {}} />;
    }
    
    let processedText = text;
    
    // 아이콘 및 특수기호 처리
    const iconMap: { [key: string]: string } = {
      ':one:': '1️⃣',
      ':two:': '2️⃣',
      ':three:': '3️⃣',
      ':four:': '4️⃣',
      ':five:': '5️⃣',
      ':six:': '6️⃣',
      ':seven:': '7️⃣',
      ':eight:': '8️⃣',
      ':nine:': '9️⃣',
      ':ten:': '🔟',
      ':check:': '✅',
      ':x:': '❌',
      ':heart:': '❤️',
      ':star:': '⭐',
      ':fire:': '🔥',
      ':thumbsup:': '👍',
      ':thumbsdown:': '👎',
      ':smile:': '😊',
      ':sad:': '😢',
      ':angry:': '😠',
      ':surprised:': '😲',
      ':thinking:': '🤔',
      ':bulb:': '💡',
      ':warning:': '⚠️',
      ':info:': 'ℹ️',
      ':question:': '❓',
      ':exclamation:': '❗',
      ':arrow_right:': '→',
      ':arrow_left:': '←',
      ':arrow_up:': '↑',
      ':arrow_down:': '↓',
      ':note:': '📝',
      ':calendar:': '📅',
      ':clock:': '🕐',
      ':home:': '🏠',
      ':work:': '💼',
      ':book:': '📖',
      ':computer:': '💻',
      ':phone:': '📱',
      ':email:': '📧',
      ':link:': '🔗',
      ':lock:': '🔒',
      ':unlock:': '🔓',
      ':key:': '🗝️',
      ':search:': '🔍',
      ':plus:': '➕',
      ':minus:': '➖',
      ':multiply:': '✖️',
      ':divide:': '➗',
      ':equals:': '🟰'
    };
    
    // 아이콘 교체
    Object.entries(iconMap).forEach(([code, icon]) => {
      const regex = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      processedText = processedText.replace(regex, icon);
    });

    // 각주 처리 ([^1])
    processedText = processedText.replace(/\[\^(\d+)\]/g, '<sup class="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">[$1]</sup>');

    // 인라인 코드 처리 (`코드`) - 먼저 처리하여 다른 마크다운과 충돌 방지
    processedText = processedText.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>');

    // 이미지 처리 (![alt](url "title"))
    processedText = processedText.replace(/!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)/g,
      (match, alt, url, title) => {
        const titleAttr = title ? `title="${title}"` : '';
        return `<img src="${url}" alt="${alt}" ${titleAttr} class="max-w-full h-auto rounded my-2" style="display: inline-block;" />`;
      }
    );

    // 링크 처리 ([text](url "title"))
    processedText = processedText.replace(/\[([^\]]+)\]\(([^)"]+)(?:\s+"([^"]*)")?\)/g,
      (match, text, url, title) => {
        const titleAttr = title ? `title="${title}"` : '';
        return `<a href="${url}" ${titleAttr} class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    );

    // 자동 링크 처리 (<url>)
    processedText = processedText.replace(/<(https?:\/\/[^\s>]+)>/g,
      (match, url) => {
        return `<a href="${url}" class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    );

    // ***굵게 기울임*** 처리 (먼저 처리)
    processedText = processedText.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processedText = processedText.replace(/___([^_]+?)___/g, '<strong><em>$1</em></strong>');

    // **굵은 글씨** 또는 __굵은 글씨__ 처리
    processedText = processedText.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    processedText = processedText.replace(/__([^_]+?)__/g, '<strong>$1</strong>');

    // *기울임* 또는 _기울임_ 처리
    processedText = processedText.replace(/(?<!\*)\*([^*\s][^*]*?[^*\s]|\S)\*(?!\*)/g, '<em>$1</em>');
    processedText = processedText.replace(/(?<!_)_([^_\s][^_]*?[^_\s]|\S)_(?!_)/g, '<em>$1</em>');

    // ~~취소선~~ 처리
    processedText = processedText.replace(/~~([^~]+?)~~/g, '<del>$1</del>');

    // ==하이라이트== 처리
    processedText = processedText.replace(/==([^=]+?)==/g, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
    
    // 태그 처리 (#태그)
    processedText = processedText.replace(/#([\w가-힣\u4e00-\u9fff]+)/g,
      '<span class="inline-flex items-center bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded text-sm mx-0.5 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/40" data-tag="#$1">🏷️$1</span>'
    );

    return <span dangerouslySetInnerHTML={{ __html: processedText }} />;
  };

  // 향상된 마크다운 렌더링 함수
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const result: JSX.Element[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';

    lines.forEach((line, index) => {
        // 코드 블록 처리
        if (line.trim().startsWith('```')) {
          if (inCodeBlock) {
            // 코드 블록 종료
            result.push(
              <div key={`code-${index}`} className="bg-muted p-4 rounded-md my-2 font-mono text-sm overflow-x-auto">
                {codeBlockLanguage && (
                  <div className="text-xs text-muted-foreground mb-2">{codeBlockLanguage}</div>
                )}
                <pre className="whitespace-pre-wrap">{codeBlockContent.join('\n')}</pre>
              </div>
            );
            inCodeBlock = false;
            codeBlockContent = [];
            codeBlockLanguage = '';
          } else {
            // 코드 블록 시작
            inCodeBlock = true;
            codeBlockLanguage = line.trim().substring(3).trim();
          }
          return;
        }

        if (inCodeBlock) {
          codeBlockContent.push(line);
          return;
        }

        // 들여쓰기 감지
        const indentMatch = line.match(/^(\s*)/);
        const indentLevel = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;
        const indentStyle = { paddingLeft: `${indentLevel * 20}px` };
        
        // 헤딩 (6단계까지 지원)
        if (line.trim().startsWith('###### ')) {
          result.push(<h6 key={index} style={indentStyle} className="text-xs font-medium mt-2 mb-1">{processInlineMarkdown(line.trim().substring(7))}</h6>);
          return;
        }
        if (line.trim().startsWith('##### ')) {
          result.push(<h5 key={index} style={indentStyle} className="text-sm font-medium mt-2 mb-1">{processInlineMarkdown(line.trim().substring(6))}</h5>);
          return;
        }
        if (line.trim().startsWith('#### ')) {
          result.push(<h4 key={index} style={indentStyle} className="text-base font-medium mt-3 mb-2">{processInlineMarkdown(line.trim().substring(5))}</h4>);
          return;
        }
        if (line.trim().startsWith('### ')) {
          result.push(<h3 key={index} style={indentStyle} className="text-lg font-medium mt-4 mb-2">{processInlineMarkdown(line.trim().substring(4))}</h3>);
          return;
        }
        if (line.trim().startsWith('## ')) {
          result.push(<h2 key={index} style={indentStyle} className="text-xl font-medium mt-6 mb-3">{processInlineMarkdown(line.trim().substring(3))}</h2>);
          return;
        }
        if (line.trim().startsWith('# ')) {
          result.push(<h1 key={index} style={indentStyle} className="text-2xl font-medium mt-8 mb-4">{processInlineMarkdown(line.trim().substring(2))}</h1>);
          return;
        }
        
        // 할일 리스트 (인터랙티브)
        const todoCheckedMatch = line.match(/^(\s*)- \[x\] (.+)/);
        if (todoCheckedMatch) {
          result.push(
            <div key={index} style={indentStyle} className="flex items-start gap-2 my-1">
              <input
                type="checkbox"
                checked
                onChange={() => toggleTodo(index)}
                className="mt-1 w-4 h-4 border border-muted-foreground rounded bg-transparent checked:bg-transparent checked:border-primary cursor-pointer relative"
                style={{
                  background: 'transparent',
                  appearance: 'none',
                  WebkitAppearance: 'none'
                }}
              />
              <span className="line-through text-muted-foreground">{processInlineMarkdown(todoCheckedMatch[2])}</span>
            </div>
          );
          return;
        }

        const todoUncheckedMatch = line.match(/^(\s*)- \[ \] (.+)/);
        if (todoUncheckedMatch) {
          result.push(
            <div key={index} style={indentStyle} className="flex items-start gap-2 my-1">
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleTodo(index)}
                className="mt-1 w-4 h-4 border border-muted-foreground rounded bg-transparent cursor-pointer"
                style={{
                  background: 'transparent',
                  appearance: 'none',
                  WebkitAppearance: 'none'
                }}
              />
              <span>{processInlineMarkdown(todoUncheckedMatch[2])}</span>
            </div>
          );
          return;
        }
        
        // 불릿 포인트 (- 또는 * 뒤에 공백과 내용이 있을 때만)
        // 할일 체크박스가 아닌 경우만 처리
        const bulletMatch = line.match(/^(\s*)([-*])\s+(.+)/);
        const isCheckbox = line.match(/^(\s*)[-*]\s*\[[ x]\]/);

        if (bulletMatch && !isCheckbox) {
          result.push(
            <div key={index} style={indentStyle} className="flex items-start gap-2 my-1">
              <span className="text-muted-foreground mt-1.5 text-xs">•</span>
              <span>{processInlineMarkdown(bulletMatch[3])}</span>
            </div>
          );
          return;
        }
        
        // 번호 목록
        const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.+)/);
        if (numberedMatch) {
          result.push(
            <div key={index} style={indentStyle} className="flex items-start gap-2 my-1">
              <span className="text-muted-foreground mt-0.5 text-sm">{numberedMatch[2]}.</span>
              <span>{processInlineMarkdown(numberedMatch[3])}</span>
            </div>
          );
          return;
        }
        
        // 경고/알림 박스 (Alerts)
        const alertMatch = line.match(/^(\s*)> \[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/);
        if (alertMatch) {
          const alertType = alertMatch[2];
          const alertColors: { [key: string]: string } = {
            'NOTE': 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200',
            'TIP': 'border-green-500 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200',
            'WARNING': 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-900 dark:text-yellow-200',
            'IMPORTANT': 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200',
            'CAUTION': 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200'
          };
          const alertIcons: { [key: string]: string } = {
            'NOTE': 'ℹ️',
            'TIP': '💡',
            'WARNING': '⚠️',
            'IMPORTANT': '❗',
            'CAUTION': '🚨'
          };
          const restOfLine = line.substring(alertMatch[0].length).trim();
          result.push(
            <div key={index} style={indentStyle} className={`border-l-4 rounded p-3 my-2 ${alertColors[alertType]}`}>
              <div className="flex items-start gap-2">
                <span className="text-lg">{alertIcons[alertType]}</span>
                <div>
                  <div className="font-semibold text-sm mb-1">{alertType}</div>
                  {restOfLine && <div>{processInlineMarkdown(restOfLine)}</div>}
                </div>
              </div>
            </div>
          );
          return;
        }

        // 일반 인용문
        const quoteMatch = line.match(/^(\s*)> (.+)/);
        if (quoteMatch) {
          result.push(
            <blockquote key={index} style={indentStyle} className="border-l-2 border-muted pl-4 my-2 text-muted-foreground italic">
              {processInlineMarkdown(quoteMatch[2])}
            </blockquote>
          );
          return;
        }

        // 구분선 (---, ***, ___)
        if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
          result.push(<hr key={index} className="my-4 border-t border-muted" />);
          return;
        }

        // 각주 정의 ([^1]: 내용)
        const footnoteDefMatch = line.match(/^(\s*)\[\^(\d+)\]:\s*(.+)/);
        if (footnoteDefMatch) {
          result.push(
            <div key={index} style={indentStyle} className="text-xs text-muted-foreground border-t border-muted pt-2 mt-4">
              <sup className="text-blue-600 dark:text-blue-400">[{footnoteDefMatch[2]}]</sup> {processInlineMarkdown(footnoteDefMatch[3])}
            </div>
          );
          return;
        }

        // 빈 줄
        if (line.trim() === '') {
          result.push(<div key={index} className="h-4"></div>);
          return;
        }

        // 일반 텍스트 (줄바꿈 처리: 스페이스 2개 또는 <br>)
        let textLine = line.trim();

        // 줄 끝 스페이스 2개를 <br/>로 변환
        if (textLine.endsWith('  ')) {
          textLine = textLine.slice(0, -2) + '<br/>';
        }

        // <br> 태그 정규화
        textLine = textLine.replace(/<br>/gi, '<br/>');

        result.push(
          <div key={index} style={indentStyle} className="my-1">
            {processInlineMarkdown(textLine)}
          </div>
        );
      });

      return result;
  };

  if (!currentPage) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h3 className="text-lg mb-2">페이지를 선택하세요</h3>
          <p className="text-sm">사이드바에서 페이지를 선택하거나 새 페이지를 만들어보세요.</p>
        </div>
      </div>
    );
  }

  // 폴더 타입인 경우 편집 불가 메시지 표시
  if (currentPage.type === 'folder') {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-4xl mb-4">📁</div>
          <h3 className="text-lg mb-2">{currentPage.title}</h3>
          <p className="text-sm">폴더는 편집할 수 없습니다. 하위 페이지를 생성하거나 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="px-6 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium">{currentPage.title}</h1>
          {hasUnsavedChanges && (
            <span className="text-xs text-orange-500">● 저장되지 않음</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // 현재 스크롤 위치 저장
            if (isPreviewMode && previewRef.current) {
              scrollPositionRef.current = previewRef.current.scrollTop;
            } else if (!isPreviewMode && textareaRef.current) {
              scrollPositionRef.current = textareaRef.current.scrollTop;
            }
            setIsPreviewMode(!isPreviewMode);
          }}
          className="flex items-center gap-2"
        >
        {isPreviewMode ? (
          <>
            <Edit3 className="w-4 h-4" />
            편집
          </>
        ) : (
          <>
            <Eye className="w-4 h-4" />
            미리보기
          </>
        )}
      </Button>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 relative">
        {isPreviewMode ? (
          // 미리보기 모드
          <div ref={previewRef} className="absolute inset-0 overflow-y-auto p-6 custom-scrollbar">
            {content ? (
              <div className="prose prose-gray max-w-none">
                {renderMarkdown(content)}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                아직 작성된 내용이 없습니다. 편집 모드로 전환해서 내용을 작성해보세요.
              </div>
            )}
          </div>
        ) : (
          // 편집 모드
          <div className="absolute inset-0 p-6">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              className="w-full h-full resize-none border-none outline-none bg-transparent font-mono text-sm leading-6 custom-scrollbar"
              placeholder={`마크다운으로 작성해보세요...

# 제목 1
## 제목 2
### 제목 3

**굵은 글씨** *기울임글씨* ~~취소선~~ ==하이라이트==

- 불릿 포인트
  - 들여쓰기된 항목
    - 더 깊은 들여쓰기

1. 번호 목록
  1. 들여쓰기된 번호

- [ ] 할일 항목 (클릭 가능!)
- [x] 완료된 할일

> 인용문입니다
  > 들여쓰기된 인용문

아이콘: :check: :x: :heart: :star: :fire: :thumbsup: :smile: :bulb: :warning: :note: :arrow_right:

태그: #할일 #아이디어 #중요 #회의 (클릭 가능!)

\`인라인 코드\`

\`\`\`
코드 블록
여러 줄 코드
\`\`\``}
              rows={1}
            />
            {/* 편집 모드에서는 태그 오버레이 비활성화 */}
          </div>
        )}
      </div>
    </div>
  );
};

// 디바운스 유틸리티 함수
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}