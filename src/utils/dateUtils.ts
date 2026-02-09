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
 * // User selects "2026-02-08" at 14:23:45.678
 * combineDateWithCurrentTime("2026-02-08")
 * // Returns: "2026-02-08T14:23:45.678Z"
 */
export const combineDateWithCurrentTime = (dateString: string): string => {
  const selectedDate = new Date(dateString);
  const now = new Date();
  
  // Combine user's selected date with current time including milliseconds
  selectedDate.setHours(
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
