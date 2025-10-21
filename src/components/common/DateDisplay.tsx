import React from 'react';

interface DateDisplayProps {
  selectedDate: Date;
}

export const DateDisplay: React.FC<DateDisplayProps> = ({ selectedDate }) => {
  const formatDate = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    
    if (targetDate.getTime() === today.getTime()) {
      return '오늘';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (targetDate.getTime() === yesterday.getTime()) {
      return '어제';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (targetDate.getTime() === tomorrow.getTime()) {
      return '내일';
    }
    
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (Math.abs(diffDays) <= 7) {
      if (diffDays > 0) {
        return `${diffDays}일 후`;
      } else {
        return `${Math.abs(diffDays)}일 전`;
      }
    }
    
    return selectedDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <h1 className="text-lg font-medium text-foreground">
      {formatDate()}
    </h1>
  );
};