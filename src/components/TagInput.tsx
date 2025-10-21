import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onTagsChange,
  placeholder = "태그 추가...",
  className = ""
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isInputVisible, setIsInputVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInputVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInputVisible]);

  const handleAddTag = () => {
    let trimmedValue = inputValue.trim();
    console.log('🏷️ TagInput - 태그 추가 시도');
    console.log('  - 입력값:', inputValue);
    console.log('  - trimmedValue:', trimmedValue);

    // # 기호 자동 제거 (일관성 유지)
    if (trimmedValue.startsWith('#')) {
      trimmedValue = trimmedValue.slice(1);
      console.log('  - # 제거 후:', trimmedValue);
    }

    if (trimmedValue && !tags.includes(trimmedValue)) {
      const newTags = [...tags, trimmedValue];
      console.log('  - 새 태그 배열:', newTags);
      onTagsChange(newTags);
    } else {
      console.log('  - 태그 추가 실패 (중복 또는 빈 값)');
    }

    setInputValue('');
    setIsInputVisible(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setIsInputVisible(false);
    }
  };

  const handleInputBlur = () => {
    if (inputValue.trim()) {
      handleAddTag();
    } else {
      setIsInputVisible(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {/* 기존 태그들 */}
      {tags.map((tag, index) => (
        <div
          key={index}
          className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs"
        >
          <span>🏷️ {tag}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-3 w-3 p-0 hover:bg-primary/20"
            onClick={() => handleRemoveTag(tag)}
          >
            <X className="h-2 w-2" />
          </Button>
        </div>
      ))}

      {/* 태그 입력 */}
      {isInputVisible ? (
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="h-6 w-20 text-xs border-dashed"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60"
          onClick={() => setIsInputVisible(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          태그
        </Button>
      )}
    </div>
  );
};
