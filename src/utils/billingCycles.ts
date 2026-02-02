/**
 * Billing Cycle Utilities
 * 
 * ENHANCEMENT: Centralized utilities for calculating billing cycles and aggregating transactions
 * for credit accounts. Used by both Account Statement page and Billers with linked accounts.
 * 
 * This module provides consistent billing cycle logic across the application.
 */

import type { SupabaseTransaction } from '../types/supabase';

/**
 * Represents a billing cycle with start/end dates and a label
 */
export interface BillingCycle {
  startDate: Date;
  endDate: Date;
  label: string;
}

/**
 * Represents a billing cycle with transactions included
 */
export interface BillingCycleWithTransactions extends BillingCycle {
  transactions: SupabaseTransaction[];
  totalAmount: number;
}

/**
 * Calculate billing cycles based on billing date
 * 
 * ENHANCEMENT: Extracted from statement.tsx to enable reuse in Billers
 * 
 * @param billingDate - The billing date in "YYYY-MM-DD" format or day number (e.g., "15", "15th") - MUST be a string
 * @param numberOfCycles - Number of cycles to generate (default: 6)
 * @param onlyCurrentYear - If true, only show cycles from current year onwards (default: false)
 * @returns Array of billing cycles with start/end dates
 */
export const calculateBillingCycles = (
  billingDate: string, 
  numberOfCycles: number = 6,
  onlyCurrentYear: boolean = false
): BillingCycle[] => {
  const cycles: BillingCycle[] = [];
  
  // DEFENSIVE: Validate that billingDate is a string before using string methods
  if (typeof billingDate !== 'string') {
    console.error('[calculateBillingCycles] billingDate must be a string, received:', typeof billingDate, billingDate);
    return cycles;
  }
  
  // Parse billing date - expect format "YYYY-MM-DD"
  let billingDay: number;
  
  if (billingDate.includes('-')) {
    // Full date format like "2026-01-10"
    const date = new Date(billingDate);
    billingDay = date.getDate();
  } else {
    // DEFENSIVE: Fallback: try to extract numeric day (e.g., "15th" -> 15)
    // Check type before calling .match() to prevent "match is not a function" error
    let match: RegExpMatchArray | null = null;
    if (typeof billingDate === 'string') {
      match = billingDate.match(/\d+/);
    } else {
      console.error('[calculateBillingCycles] billingDate is not a string for regex match:', typeof billingDate, billingDate);
      return cycles;
    }
    
    if (!match) {
      console.error('[calculateBillingCycles] Invalid billing date format:', billingDate);
      return cycles; // Invalid format
    }
    billingDay = parseInt(match[0], 10);
  }
  
  // Validate billing day
  if (billingDay < 1 || billingDay > 31) return cycles;
  
  // Start from current date and generate cycles going forward and backward
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  if (onlyCurrentYear) {
    // FIX: Only show cycles from current year onwards
    // Start from January of current year or current month (whichever is later)
    const startMonth = currentMonth; // Start from current month
    
    // Calculate how many months until end of current year
    const monthsUntilYearEnd = 12 - currentMonth; // Remaining months in current year
    const cyclesToShow = Math.min(numberOfCycles, monthsUntilYearEnd + 3); // Add 3 months into next year
    
    for (let i = 0; i < cyclesToShow; i++) {
      const cycleStartDate = new Date(currentYear, currentMonth + i, billingDay);
      
      // Handle months with fewer days than billingDay (e.g., Feb 31 -> Feb 28/29)
      const daysInMonth = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, 0).getDate();
      const adjustedBillingDay = Math.min(billingDay, daysInMonth);
      cycleStartDate.setDate(adjustedBillingDay);
      
      // Calculate end date (day before next billing date)
      const cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
      cycleEndDate.setDate(cycleEndDate.getDate() - 1);
      
      cycles.push({ 
        startDate: new Date(cycleStartDate), 
        endDate: new Date(cycleEndDate),
        label: formatDateRange(cycleStartDate, cycleEndDate)
      });
    }
  } else {
    // FIX: Generate cycles covering both past and future
    // Split cycles to cover historical data and future schedules
    const cyclesBack = Math.floor(numberOfCycles / 2);
    const cyclesForward = numberOfCycles - cyclesBack;
    
    // Generate past cycles including current month (going backwards)
    for (let i = cyclesBack - 1; i >= 0; i--) {
      const cycleStartDate = new Date(currentYear, currentMonth - i, billingDay);
      
      // Handle months with fewer days than billingDay (e.g., Feb 31 -> Feb 28/29)
      const daysInMonth = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, 0).getDate();
      const adjustedBillingDay = Math.min(billingDay, daysInMonth);
      cycleStartDate.setDate(adjustedBillingDay);
      
      // Calculate end date (day before next billing date)
      const cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
      cycleEndDate.setDate(cycleEndDate.getDate() - 1);
      
      cycles.push({ 
        startDate: new Date(cycleStartDate), 
        endDate: new Date(cycleEndDate),
        label: formatDateRange(cycleStartDate, cycleEndDate)
      });
    }
    
    // Generate future cycles (starting from next month)
    for (let i = 1; i < cyclesForward; i++) {
      const cycleStartDate = new Date(currentYear, currentMonth + i, billingDay);
      
      // Handle months with fewer days than billingDay (e.g., Feb 31 -> Feb 28/29)
      const daysInMonth = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, 0).getDate();
      const adjustedBillingDay = Math.min(billingDay, daysInMonth);
      cycleStartDate.setDate(adjustedBillingDay);
      
      // Calculate end date (day before next billing date)
      const cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
      cycleEndDate.setDate(cycleEndDate.getDate() - 1);
      
      cycles.push({ 
        startDate: new Date(cycleStartDate), 
        endDate: new Date(cycleEndDate),
        label: formatDateRange(cycleStartDate, cycleEndDate)
      });
    }
  }
  
  return cycles;
};

/**
 * Format a date range for display
 * 
 * @param start - Start date
 * @param end - End date
 * @returns Formatted string like "Jan 12 – Feb 11, 2026"
 */
export const formatDateRange = (start: Date, end: Date): string => {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', options);
  return `${startStr} – ${endStr}`;
};

/**
 * Check if transaction falls within a billing cycle
 * 
 * @param transaction - Transaction to check
 * @param cycleStart - Cycle start date
 * @param cycleEnd - Cycle end date
 * @returns True if transaction is in the cycle
 */
export const isTransactionInCycle = (
  transaction: SupabaseTransaction, 
  cycleStart: Date, 
  cycleEnd: Date
): boolean => {
  const txDate = new Date(transaction.date);
  return txDate >= cycleStart && txDate <= cycleEnd;
};

/**
 * Aggregate transactions by billing cycle
 * 
 * ENHANCEMENT: Groups transactions for a specific account into billing cycles
 * 
 * @param transactions - All transactions for the account
 * @param billingDate - Billing date in "YYYY-MM-DD" format
 * @param numberOfCycles - Number of cycles to generate
 * @returns Array of billing cycles with transactions and totals
 */
export const aggregateTransactionsByCycle = (
  transactions: SupabaseTransaction[],
  billingDate: string,
  numberOfCycles: number = 6
): BillingCycleWithTransactions[] => {
  const cycles = calculateBillingCycles(billingDate, numberOfCycles);
  
  return cycles.map(cycle => {
    const cycleTxs = transactions.filter(tx => 
      isTransactionInCycle(tx, cycle.startDate, cycle.endDate)
    );
    
    const totalAmount = cycleTxs.reduce((sum, tx) => sum + tx.amount, 0);
    
    return {
      ...cycle,
      transactions: cycleTxs,
      totalAmount
    };
  });
};

/**
 * Get billing cycle for a specific month/year
 * 
 * ENHANCEMENT: Finds the billing cycle that matches the given month/year based on END DATE
 * Used to display cycle-based amounts for specific schedule rows
 * 
 * FIX: Changed from midpoint matching to END DATE matching (cutoff/statement date).
 * Each billing cycle is now assigned to the month of its END DATE (cutoff date).
 * 
 * Example: A cycle from Dec 13 – Jan 11 is assigned to "January" because the end date
 * (cutoff/statement date) is Jan 11, which falls in January.
 * 
 * This ensures credit card transaction cycles are properly bucketed by their billing cycle
 * end date (when the statement is generated), not by their start date or calendar overlap.
 * 
 * @param month - Month name (e.g., "January")
 * @param year - Year as string
 * @param billingDate - Billing date in "YYYY-MM-DD" format
 * @returns The billing cycle whose END DATE matches the month/year, or null if not found
 */
export const getCycleForMonth = (
  month: string,
  year: string,
  billingDate: string
): BillingCycle | null => {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const monthIndex = MONTHS.indexOf(month);
  if (monthIndex === -1) return null;
  
  const targetYear = parseInt(year);
  if (isNaN(targetYear)) return null;
  
  // Generate enough cycles to cover historical and future schedules (24 cycles = 2 years)
  const CYCLE_LOOKBACK_COUNT = 24;
  const cycles = calculateBillingCycles(billingDate, CYCLE_LOOKBACK_COUNT);
  
  // FIX: Map cycles based on END DATE (cutoff/statement date) instead of midpoint
  // This ensures that cycles spanning two months are assigned to the month of their
  // cutoff date (when the bill is actually generated and due)
  //
  // Example: Dec 13 - Jan 11 cycle should be treated as "January" bill
  // because the cutoff (end date) is Jan 11 which is in January
  for (const cycle of cycles) {
    const endMonth = cycle.endDate.getMonth();
    const endYear = cycle.endDate.getFullYear();
    
    // Match if the END DATE of the cycle falls in the target month/year
    if (endMonth === monthIndex && endYear === targetYear) {
      return cycle;
    }
  }
  
  // TODO: Consider edge case where multiple cycles could have same end month
  // (e.g., if billing date changes mid-year). Currently returns first match.
  return null;
};

// CHANGELOG: Billing Cycle-to-Month Mapping Fix
// - Changed getCycleForMonth() to use END DATE (cutoff/statement date) for mapping
// - Cycles spanning two months now assigned to the month of their END DATE
// - Example: Dec 13 – Jan 11 is now "January" bill (was "December" before)
// - This ensures credit card billing cycles align with actual statement generation dates

// TODO: Future enhancements
// - Add support for statement export with cycle boundaries
// - Integrate with budget sync to align billing cycles with budget periods
// - Add caching for frequently accessed billing cycles
// - Consider adding transaction categorization within cycles
// - Consider edge case handling if billing date changes mid-year (multiple cycles same end month)
