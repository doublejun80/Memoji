import React from 'react';
import { Button } from '../ui/button';

interface CalendarGridProps {
  currentDate: Date;
  selectedDate: Date;
  datesWithPages: string[];
  onDateSelect: (date: Date) => void;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentDate,
  selectedDate,
  datesWithPages,
  onDateSelect
}) => {
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDate = firstDay.getDay();

    const days: (number | null)[] = [];
    
    // 이전 달의 빈 칸들
    for (let i = 0; i < startDate; i++) {
      days.push(null);
    }
    
    // 현재 달의 날짜들
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isSelectedDate = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return formatDateKey(date) === formatDateKey(selectedDate);
  };

  const isToday = (day: number) => {
    const today = new Date();
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return formatDateKey(date) === formatDateKey(today);
  };

  const hasPages = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return datesWithPages.includes(formatDateKey(date));
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onDateSelect(date);
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div className="space-y-2">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center">
        {['일', '월', '화', '수', '목', '금', '토'].map(day => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="relative">
            {day ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDateClick(day)}
                className={`h-8 w-8 p-0 text-xs relative ${
                  isSelectedDate(day)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : isToday(day)
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'hover:bg-sidebar-accent'
                } ${
                  hasPages(day) ? 'font-semibold' : ''
                }`}
              >
                {day}
                {hasPages(day) && (
                  <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-current rounded-full" />
                )}
              </Button>
            ) : (
              <div className="h-8 w-8" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};