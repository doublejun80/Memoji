/**
 * Date utility functions for the memo application
 */

/**
 * Format a date to YYYY-MM-DD string format
 * @param date - The date to format
 * @returns Formatted date string
 */
export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get the current date in YYYY-MM-DD format
 * @returns Current date string
 */
export const getCurrentDateKey = (): string => {
  return formatDateKey(new Date());
};

/**
 * Parse a date key back to a Date object
 * @param dateKey - Date string in YYYY-MM-DD format
 * @returns Date object
 */
export const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Check if two dates are the same day
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if same day
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
  return formatDateKey(date1) === formatDateKey(date2);
};

/**
 * Get a human-readable date string in Korean format
 * @param date - The date to format
 * @returns Formatted date string (e.g., "9월 30일(화)")
 */
export const formatDisplayDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  };
  
  return date.toLocaleDateString('ko-KR', options);
};

/**
 * Get the start of the week for a given date
 * @param date - The date
 * @returns Date object representing the start of the week (Sunday)
 */
export const getWeekStart = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day;
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**
 * Get the end of the week for a given date
 * @param date - The date
 * @returns Date object representing the end of the week (Saturday)
 */
export const getWeekEnd = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() + (6 - day);
  result.setDate(diff);
  result.setHours(23, 59, 59, 999);
  return result;
};

/**
 * Get an array of dates for a given month
 * @param year - The year
 * @param month - The month (0-11)
 * @returns Array of Date objects for each day in the month
 */
export const getMonthDates = (year: number, month: number): Date[] => {
  const dates: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(new Date(year, month, day));
  }
  
  return dates;
};

/**
 * Calculate the difference in days between two dates
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days difference
 */
export const daysDifference = (date1: Date, date2: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const firstDate = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const secondDate = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  
  return Math.round((firstDate.getTime() - secondDate.getTime()) / oneDay);
};

/**
 * Check if a date is today
 * @param date - The date to check
 * @returns True if the date is today
 */
export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

/**
 * Check if a date is yesterday
 * @param date - The date to check
 * @returns True if the date is yesterday
 */
export const isYesterday = (date: Date): boolean => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};

/**
 * Get a relative date string (e.g., "오늘", "어제", "2일 전")
 * @param date - The date
 * @returns Relative date string in Korean
 */
export const getRelativeDateString = (date: Date): string => {
  if (isToday(date)) {
    return '오늘';
  }

  if (isYesterday(date)) {
    return '어제';
  }

  const days = daysDifference(new Date(), date);

  if (days > 0 && days <= 7) {
    return `${days}일 전`;
  }

  if (days < 0 && days >= -7) {
    return `${Math.abs(days)}일 후`;
  }

  // For dates more than a week away, return formatted date
  return formatDisplayDate(date);
};

/**
 * Convert a Date to ISO string in local timezone (not UTC)
 * This prevents timezone issues when storing dates
 * @param date - The date to convert
 * @returns ISO string in local timezone (YYYY-MM-DDTHH:mm:ss.sss)
 */
export const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
};

/**
 * Parse an ISO date string as local time (not UTC)
 * This prevents timezone conversion issues
 * @param isoString - ISO date string
 * @returns Date object in local timezone
 */
export const parseLocalISOString = (isoString: string): Date => {
  // ISO 문자열에서 날짜와 시간 부분 추출
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?)?/);

  if (!match) {
    // 파싱 실패 시 기본 Date 생성자 사용
    return new Date(isoString);
  }

  const [, year, month, day, hours = '0', minutes = '0', seconds = '0', milliseconds = '0'] = match;

  // 로컬 타임존으로 Date 객체 생성
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds),
    parseInt(milliseconds)
  );
};
