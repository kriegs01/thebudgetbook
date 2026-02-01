/**
 * Date and Schedule Utilities
 * 
 * Shared utilities for date formatting and schedule calculations
 */

/**
 * Month names constant for consistent use across the application
 */
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

/**
 * Format a date into schedule month format (YYYY-MM)
 * @param year - Full year (e.g., 2026)
 * @param month - Month as 1-indexed number (1 = January, 12 = December)
 * @returns Formatted schedule month string (e.g., '2026-03')
 */
export const formatScheduleMonth = (year: number, month: number): string => {
  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * Format a Date object into schedule month format (YYYY-MM)
 * @param date - JavaScript Date object
 * @returns Formatted schedule month string (e.g., '2026-03')
 */
export const formatScheduleMonthFromDate = (date: Date): string => {
  return formatScheduleMonth(date.getFullYear(), date.getMonth() + 1);
};

/**
 * Convert month name and year to schedule month format
 * @param monthName - Full month name (e.g., "January")
 * @param year - Full year (e.g., 2026)
 * @returns Formatted schedule month string (e.g., '2026-01') or null if invalid month name
 */
export const monthNameToScheduleMonth = (monthName: string, year: string | number): string | null => {
  const monthIndex = MONTH_NAMES.indexOf(monthName as any);
  if (monthIndex === -1) return null;
  
  const yearNum = typeof year === 'string' ? parseInt(year) : year;
  return formatScheduleMonth(yearNum, monthIndex + 1);
};

/**
 * Parse schedule month format into year and month components
 * @param scheduleMonth - Schedule month string (e.g., '2026-03')
 * @returns Object with year and month (1-indexed), or null if invalid format
 */
export const parseScheduleMonth = (scheduleMonth: string): { year: number; month: number } | null => {
  const parts = scheduleMonth.split('-');
  if (parts.length !== 2) return null;
  
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  
  return { year, month };
};

/**
 * Add months to a schedule month string
 * @param scheduleMonth - Starting schedule month (e.g., '2026-01')
 * @param monthsToAdd - Number of months to add (can be negative)
 * @returns New schedule month string
 */
export const addMonthsToScheduleMonth = (scheduleMonth: string, monthsToAdd: number): string => {
  const parsed = parseScheduleMonth(scheduleMonth);
  if (!parsed) throw new Error(`Invalid schedule month format: ${scheduleMonth}`);
  
  const date = new Date(parsed.year, parsed.month - 1, 1);
  date.setMonth(date.getMonth() + monthsToAdd);
  
  return formatScheduleMonthFromDate(date);
};

/**
 * Get current schedule month (YYYY-MM format for current month)
 * @returns Current schedule month string
 */
export const getCurrentScheduleMonth = (): string => {
  return formatScheduleMonthFromDate(new Date());
};
