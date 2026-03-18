/**
 * Date Utilities
 * 
 * Helper functions for handling dates in the application.
 */

/**
 * Combines a user-selected date (from a date picker) with the current time including milliseconds.
 * This ensures that transactions created on the same day have unique timestamps for proper sorting.
 * 
 * @param dateString - Date string from a date picker (e.g., "2026-02-08" or full ISO string)
 * @returns ISO 8601 timestamp with millisecond precision
 * 
 * @example
 * // User selects "2026-02-08" at 14:23:45.678 local time
 * combineDateWithCurrentTime("2026-02-08")
 * // Returns: "2026-02-08T14:23:45.678Z" (adjusted to UTC)
 */
export const combineDateWithCurrentTime = (dateString: string): string => {
  const now = new Date();
  
  // Parse the date string in local timezone to avoid UTC midnight issues
  // Extract year, month, day from the date string (YYYY-MM-DD format)
  const dateParts = dateString.split('T')[0].split('-'); // Handle both "YYYY-MM-DD" and full ISO strings
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
  const day = parseInt(dateParts[2], 10);
  
  // Create date in local timezone with current time
  const selectedDate = new Date(
    year,
    month,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  
  return selectedDate.toISOString();
};

/**
 * Gets today's date in ISO format (YYYY-MM-DD)
 * Useful for initializing date picker fields
 */
export const getTodayIso = (): string => {
  return new Date().toISOString().slice(0, 10);
};

/**
 * Gets the first day of the current month in ISO format (YYYY-MM-01)
 * Useful for initializing filter start-date defaults
 */
export const getFirstDayOfCurrentMonthIso = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

/**
 * Gets the first day of the current year in ISO format (YYYY-01-01)
 * Useful for initializing filter start-date defaults that need to cover the full year,
 * e.g. so stash top-up transactions dated in past months of the current year remain visible.
 */
export const getFirstDayOfCurrentYearIso = (): string => {
  const year = new Date().getFullYear();
  return `${year}-01-01`;
};
