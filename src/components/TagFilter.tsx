import React from 'react';
import { Button } from './ui/button';
import { X } from 'lucide-react';

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onTagSelect: (tag: string) => void;
  onTagDeselect: (tag: string) => void;
  onClearAll: () => void;
  className?: string;
}

export const TagFilter: React.FC<TagFilterProps> = ({
  allTags,
  selectedTags,
  onTagSelect,
  onTagDeselect,
  onClearAll,
  className = ""
}) => {
  if (allTags.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">태그 필터</h4>
        {selectedTags.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClearAll}
          >
            <X className="h-3 w-3 mr-1" />
            전체 해제
          </Button>
        )}
      </div>
      
      <div className="flex flex-wrap gap-1">
        {allTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <Button
              key={tag}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className={`h-6 px-2 text-xs ${
                isSelected 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-accent"
              }`}
              onClick={() => {
                if (isSelected) {
                  onTagDeselect(tag);
                } else {
                  onTagSelect(tag);
                }
              }}
            >
              #{tag}
            </Button>
          );
        })}
      </div>
      
      {selectedTags.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {selectedTags.length}개 태그 선택됨
        </div>
      )}
    </div>
  );
};
