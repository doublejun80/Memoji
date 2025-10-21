import React, { useState } from 'react';
import { Calendar } from './ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface CalendarWidgetProps {
  onDateSelect?: (date: Date) => void;
  selectedDate?: Date;
  datesWithPages?: string[];
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  onDateSelect,
  selectedDate: propSelectedDate,
  datesWithPages = []
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(propSelectedDate || new Date());
  const [month, setMonth] = useState<Date>(propSelectedDate || new Date());

  React.useEffect(() => {
    setSelectedDate(propSelectedDate);
    // selectedDate가 변경될 때 달력의 월도 함께 업데이트
    if (propSelectedDate) {
      setMonth(propSelectedDate);
    }
  }, [propSelectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date && onDateSelect) {
      onDateSelect(date);
    }
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const hasPages = (date: Date) => {
    return datesWithPages.includes(formatDateKey(date));
  };

  return (
    <Card className="w-full">
      <CardContent className="p-2 flex justify-center">
        <div className="w-[168px]">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            month={month}
            onMonthChange={setMonth}
            fixedWeeks={true}
            className="rounded-md border-0 p-0 w-full"
            components={{
              DayContent: ({ date, displayMonth }) => {
                const isCurrentMonth = date.getMonth() === displayMonth.getMonth();
                const hasPagesForDate = hasPages(date);
                
                return (
                  <div className="relative flex items-center justify-center w-full h-full">
                    <span className={hasPagesForDate && isCurrentMonth ? 'font-bold' : ''}>
                      {date.getDate()}
                    </span>
                    {hasPagesForDate && isCurrentMonth && (
                      <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-0.5 h-0.5 bg-primary rounded-full" />
                    )}
                  </div>
                );
              }
            }}
            classNames={{
              months: "flex flex-col space-y-1",
              month: "space-y-1 w-full",
              caption: "flex justify-center pt-1 pb-2 relative items-center w-full",
              caption_label: "text-xs font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "h-4 w-4 bg-transparent p-0 hover:bg-accent hover:text-accent-foreground",
              nav_button_previous: "absolute left-0",
              nav_button_next: "absolute right-0",
              table: "w-full border-collapse space-y-0.5",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground rounded-md w-6 font-normal text-[0.6rem] flex items-center justify-center h-4",
              row: "flex w-full mt-0.5",
              cell: "text-center text-[0.65rem] p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 flex-1",
              day: "h-6 w-6 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-sm text-[0.65rem] flex items-center justify-center",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              day_today: "",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
              day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
              day_hidden: "invisible",
            }}
            formatters={{
              formatCaption: (date) => {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[date.getMonth()]}. ${date.getFullYear()}`;
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};