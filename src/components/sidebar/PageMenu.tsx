import React from 'react';
import { Page } from '../../types';
import { Button } from '../ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { Edit2, Trash2, ChevronUp, ChevronDown, Plus, FolderPlus } from 'lucide-react';

interface PageMenuProps {
  page: Page;
  onStartEdit: (page: Page) => void;
  onDelete: (pageId: string) => void;
  onMove: (pageId: string, direction: 'up' | 'down') => void;
  onCreateChild: (title: string, parentId: string) => void;
  onCreateChildFolder: (title: string, parentId: string) => void;
  onClose: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export const PageMenu: React.FC<PageMenuProps> = ({
  page,
  onStartEdit,
  onDelete,
  onMove,
  onCreateChild,
  onCreateChildFolder,
  onClose,
  canMoveUp,
  canMoveDown
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg p-2 z-50 flex items-center gap-1">
      {/* 수정 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={() => handleAction(() => onStartEdit(page))}
        title="수정"
      >
        <Edit2 className="h-4 w-4" />
      </Button>

      {/* 페이지 추가 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={() => handleAction(() => onCreateChild('하위 페이지', page.id))}
        title="하위 페이지 추가"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {/* 폴더 추가 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground transition-colors"
        onClick={() => handleAction(() => onCreateChildFolder('하위 폴더', page.id))}
        title="하위 폴더 추가"
      >
        <FolderPlus className="h-4 w-4" />
      </Button>

      {/* 구분선 */}
      <div className="h-6 w-px bg-border mx-1" />

      {/* 위로 이동 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 transition-colors ${
          canMoveUp
            ? 'hover:bg-accent hover:text-accent-foreground'
            : 'opacity-30 cursor-not-allowed'
        }`}
        onClick={() => canMoveUp && handleAction(() => onMove(page.id, 'up'))}
        disabled={!canMoveUp}
        title="위로 이동"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>

      {/* 아래로 이동 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 w-8 p-0 transition-colors ${
          canMoveDown
            ? 'hover:bg-accent hover:text-accent-foreground'
            : 'opacity-30 cursor-not-allowed'
        }`}
        onClick={() => canMoveDown && handleAction(() => onMove(page.id, 'down'))}
        disabled={!canMoveDown}
        title="아래로 이동"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      {/* 구분선 */}
      <div className="h-6 w-px bg-border mx-1" />

      {/* 삭제 버튼 */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="삭제"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>페이지 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{page.title}" 페이지를 삭제하시겠습니까? 하위 페이지도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onClose}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction(() => onDelete(page.id))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};