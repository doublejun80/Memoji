import React from 'react';
import { Button } from '../ui/button';
import { Save } from 'lucide-react';

interface SaveButtonProps {
  onSave: () => void;
}

export const SaveButton: React.FC<SaveButtonProps> = ({ onSave }) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSave}
      className="gap-2 text-muted-foreground hover:text-foreground"
    >
      <Save className="h-4 w-4" />
      저장
    </Button>
  );
};