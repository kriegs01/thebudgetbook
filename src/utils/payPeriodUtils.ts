import type { PayScheduleRule } from '../services/payScheduleService';

export interface PayPeriod {
  periodIndex: number; // 1-indexed (e.g. 1st paycheck, 2nd paycheck of the month)
  label: string;       // e.g. "Paycheck 1 (Jul 1 - Jul 14)"
  startDate: Date;
  endDate: Date;
  payDate: Date;
}

/**
 * Find the active pay schedule rule for a specific year and month index (0-11).
 */
export const getActiveRuleForMonth = (
  year: number,
  monthIndex: number,
  rules: PayScheduleRule[]
): PayScheduleRule | null => {
  if (!rules || rules.length === 0) return null;

  const targetDate = new Date(year, monthIndex, 1);

  // Filter rules that take effect on or before the target month and find the latest one
  const activeRule = rules
    .filter(rule => new Date(rule.effectiveFromDate) <= targetDate)
    .sort((a, b) => new Date(b.effectiveFromDate).getTime() - new Date(a.effectiveFromDate).getTime())[0];

  // If target date is older than the oldest rule, fall back to the earliest rule available
  return activeRule || rules[0];
};

export const getPayPeriodLabel = (index: number, totalPeriods: number): string => {
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  const ordinalName = ordinals[index] || `Period ${index + 1}`;
  return `${ordinalName} Pay`; // Renders "First Pay", "Second Pay", etc.
};

/**
 * Generate all pay periods that fall within a given month based on the active rule.
 */
export const generatePayPeriodsForMonth = (
  year: number,
  monthIndex: number,
  rule: PayScheduleRule | null | undefined
): any[] => {
  // 🛡️ THE NEW SAFETY GUARD
  if (!rule || !rule.firstPaycheckDate || !rule.frequency) {
    return []; 
  }

  const periods = [];
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  const anchorDate = new Date(rule.firstPaycheckDate);
  anchorDate.setHours(0, 0, 0, 0);

  const frequency = rule.frequency;

  if (frequency === 'monthly') {
    periods.push({
      periodIndex: 1,
      label: `Monthly Paycheck (${monthStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
      startDate: new Date(year, monthIndex, 1),
      endDate: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
      payDate: new Date(anchorDate)
    });
  } else if (frequency === 'semi-monthly') {
    // Standard semi-monthly splits (e.g., 1st-15th and 16th-End)
    periods.push(
      {
        periodIndex: 1,
        label: 'Paycheck 1 (1st half)',
        startDate: new Date(year, monthIndex, 1, 0, 0, 0, 0),
        endDate: new Date(year, monthIndex, 15, 23, 59, 59, 999),
        payDate: new Date(year, monthIndex, 15)
      },
      {
        periodIndex: 2,
        label: 'Paycheck 2 (2nd half)',
        startDate: new Date(year, monthIndex, 16, 0, 0, 0, 0),
        endDate: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
        payDate: new Date(year, monthIndex + 1, 0)
      }
    );
  } else if (frequency === 'bi-weekly' || frequency === 'weekly') {
    const intervalDays = frequency === 'weekly' ? 7 : 14;

    // Step forward or backward from anchor date to align with target month
    let currentPayDate = new Date(anchorDate);
    
    // Fast-forward or rewind to get close to the target month
    const diffTime = monthStart.getTime() - currentPayDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const cyclesToShift = Math.floor(diffDays / intervalDays);
    currentPayDate.setDate(currentPayDate.getDate() + (cyclesToShift * intervalDays));

    // Ensure we start checking slightly before the month begins to catch overlapping periods
    currentPayDate.setDate(currentPayDate.getDate() - intervalDays * 2);

    let periodCounter = 1;
    while (true) {
      const payDateObj = new Date(currentPayDate);
      const periodStart = new Date(payDateObj);
      periodStart.setDate(periodStart.getDate() - intervalDays + 1);
      periodStart.setHours(0, 0, 0, 0);

      const periodEnd = new Date(payDateObj);
      periodEnd.setHours(23, 59, 59, 999);

      // Check if this pay period overlaps with the target month
      if (periodEnd >= monthStart && periodStart <= monthEnd) {
        periods.push({
          periodIndex: periodCounter++,
          label: `Paycheck ${periods.length + 1} (${payDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
          startDate: periodStart > monthStart ? periodStart : new Date(monthStart),
          endDate: periodEnd < monthEnd ? periodEnd : new Date(monthEnd),
          payDate: payDateObj
        });
      }

      // Stop if we've moved past the target month
      if (periodStart > monthEnd) break;

      currentPayDate.setDate(currentPayDate.getDate() + intervalDays);
    }
  }

  return periods;
};

/**
 * Determine which pay period a specific due day or due date belongs to in a given month.
 */
export const findPayPeriodForDueDate = (
  dueDay: number,
  year: number,
  monthIndex: number,
  periods: PayPeriod[]
): PayPeriod | null => {
  if (!periods || periods.length === 0) return null;

  // Build full date of the due item for this month
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, dueDay), daysInMonth);
  const dueDate = new Date(year, monthIndex, safeDay);

  // Find the period whose window contains this due date
  const matchedPeriod = periods.find(p => dueDate >= p.startDate && dueDate <= p.endDate);

  // Fallback: If it doesn't cleanly land in a window, return the closest period by date
  if (!matchedPeriod) {
    return periods.reduce((prev, curr) => {
      return Math.abs(curr.payDate.getTime() - dueDate.getTime()) < Math.abs(prev.payDate.getTime() - dueDate.getTime()) ? curr : prev;
    }, periods[0]);
  }

  return matchedPeriod;
};
