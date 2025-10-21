import React from 'react';
import { Button } from '../ui/button';
import { Eye, Edit3 } from 'lucide-react';

interface EditorToolbarProps {
  isPreview: boolean;
  onTogglePreview: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isPreview,
  onTogglePreview
}) => {
  return (
    <div className="border-b border-border bg-card px-6 py-2 h-[52px] flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Button
          variant={!isPreview ? "default" : "ghost"}
          size="sm"
          onClick={() => !isPreview || onTogglePreview()}
          className="gap-2"
        >
          <Edit3 className="h-4 w-4" />
          편집
        </Button>
        <Button
          variant={isPreview ? "default" : "ghost"}
          size="sm"
          onClick={() => isPreview || onTogglePreview()}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          미리보기
        </Button>
      </div>
    </div>
  );
};