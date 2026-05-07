import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Keyboard, RotateCcw } from 'lucide-react';

interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  currentKey: string;
  category: string;
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultShortcuts: KeyboardShortcut[] = [
  {
    id: 'search',
    name: '검색',
    description: '전체 검색 열기',
    defaultKey: 'Ctrl+K',
    currentKey: 'Ctrl+K',
    category: '일반'
  },
  {
    id: 'save',
    name: '저장',
    description: '현재 페이지 저장',
    defaultKey: 'Ctrl+S',
    currentKey: 'Ctrl+S',
    category: '편집'
  },
  {
    id: 'newPage',
    name: '새 페이지',
    description: '새 페이지 생성',
    defaultKey: 'Ctrl+N',
    currentKey: 'Ctrl+N',
    category: '페이지'
  },
  {
    id: 'focusMode',
    name: '집중 모드',
    description: '집중 모드 토글',
    defaultKey: 'F11',
    currentKey: 'F11',
    category: '보기'
  },
  {
    id: 'bold',
    name: '굵게',
    description: '선택한 텍스트를 굵게',
    defaultKey: 'Ctrl+B',
    currentKey: 'Ctrl+B',
    category: '편집'
  },
  {
    id: 'italic',
    name: '기울임',
    description: '선택한 텍스트를 기울임',
    defaultKey: 'Ctrl+I',
    currentKey: 'Ctrl+I',
    category: '편집'
  },
  {
    id: 'sourceMode',
    name: '원문 모드',
    description: '즉시 편집/Markdown 원문 전환',
    defaultKey: 'Ctrl+E',
    currentKey: 'Ctrl+E',
    category: '편집'
  }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempKey, setTempKey] = useState('');

  // 저장된 단축키 불러오기
  useEffect(() => {
    const savedShortcuts = localStorage.getItem('keyboardShortcuts');
    if (savedShortcuts) {
      try {
        const parsedShortcuts = JSON.parse(savedShortcuts);
        setShortcuts(Array.isArray(parsedShortcuts) ? parsedShortcuts : defaultShortcuts);
      } catch (error) {
        console.error('Failed to parse keyboard shortcuts:', error);
        setShortcuts(defaultShortcuts);
      }
    } else {
      setShortcuts(defaultShortcuts);
    }
  }, []);

  // 단축키 저장
  const saveShortcuts = (newShortcuts: KeyboardShortcut[]) => {
    setShortcuts(newShortcuts);
    localStorage.setItem('keyboardShortcuts', JSON.stringify(newShortcuts));
  };

  // 단축키 편집 시작
  const startEditing = (id: string) => {
    const shortcut = shortcuts.find(s => s.id === id);
    if (shortcut) {
      setEditingId(id);
      setTempKey(shortcut.currentKey);
    }
  };

  // 단축키 편집 완료
  const finishEditing = () => {
    if (editingId && tempKey.trim()) {
      const newShortcuts = shortcuts.map(shortcut =>
        shortcut.id === editingId
          ? { ...shortcut, currentKey: tempKey.trim() }
          : shortcut
      );
      saveShortcuts(newShortcuts);
    }
    setEditingId(null);
    setTempKey('');
  };

  // 단축키 편집 취소
  const cancelEditing = () => {
    setEditingId(null);
    setTempKey('');
  };

  // 기본값으로 복원
  const resetToDefault = (id: string) => {
    const newShortcuts = shortcuts.map(shortcut =>
      shortcut.id === id
        ? { ...shortcut, currentKey: shortcut.defaultKey }
        : shortcut
    );
    saveShortcuts(newShortcuts);
  };

  // 모든 단축키 기본값으로 복원
  const resetAllToDefault = () => {
    const confirmed = window.confirm('모든 단축키를 기본값으로 복원하시겠습니까?');
    if (confirmed) {
      saveShortcuts(defaultShortcuts);
    }
  };

  // 키 입력 감지
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editingId) {
      e.preventDefault();
      
      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      if (e.metaKey) keys.push('Cmd');
      
      if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Meta') {
        keys.push(e.key === ' ' ? 'Space' : e.key);
      }
      
      if (keys.length > 0) {
        setTempKey(keys.join('+'));
      }
    }
  };

  // 카테고리별로 그룹화
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            키보드 단축키 설정
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              단축키를 클릭하여 편집하거나, 기본값으로 복원할 수 있습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAllToDefault}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              모두 초기화
            </Button>
          </div>

          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{shortcut.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {shortcut.description}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {editingId === shortcut.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={tempKey}
                            onChange={(e) => setTempKey(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="키를 눌러주세요..."
                            className="w-32 text-center"
                            autoFocus
                          />
                          <Button size="sm" onClick={finishEditing}>
                            저장
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEditing}>
                            취소
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(shortcut.id)}
                            className="font-mono"
                          >
                            {shortcut.currentKey}
                          </Button>
                          {shortcut.currentKey !== shortcut.defaultKey && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resetToDefault(shortcut.id)}
                              title="기본값으로 복원"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
