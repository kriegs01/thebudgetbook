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
 * @param billingDate - The billing date in "YYYY-MM-DD" format or day number (e.g., "15", "15th")
 * @param numberOfCycles - Number of cycles to generate (default: 6)
 * @returns Array of billing cycles with start/end dates
 */
export const calculateBillingCycles = (
  billingDate: string, 
  numberOfCycles: number = 6
): BillingCycle[] => {
  const cycles: BillingCycle[] = [];
  
  // Parse billing date - expect format "YYYY-MM-DD"
  let billingDay: number;
  
  if (billingDate.includes('-')) {
    // Full date format like "2026-01-10"
    const date = new Date(billingDate);
    billingDay = date.getDate();
  } else {
    // Fallback: try to extract numeric day (e.g., "15th" -> 15)
    const match = billingDate.match(/\d+/);
    if (!match) return cycles; // Invalid format
    billingDay = parseInt(match[0], 10);
  }
  
  // Validate billing day
  if (billingDay < 1 || billingDay > 31) return cycles;
  
  // Start from current date and generate cycles going forward and backward
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  // Generate cycles starting from (numberOfCycles - 1) months ago to current month
  for (let i = numberOfCycles - 1; i >= 0; i--) {
    // Calculate month/year for this cycle using Date methods to handle boundaries
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
 * ENHANCEMENT: Finds the billing cycle that contains the given month/year
 * Used to display cycle-based amounts for specific schedule rows
 * 
 * @param month - Month name (e.g., "January")
 * @param year - Year as string
 * @param billingDate - Billing date in "YYYY-MM-DD" format
 * @returns The billing cycle containing that month, or null if not found
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
  
  // Find the cycle that best represents this month/year
  // We look for a cycle whose start or end date falls in the target month
  const MONTH_MIDPOINT = 15; // Middle of the month for comparison
  const targetDate = new Date(targetYear, monthIndex, MONTH_MIDPOINT);
  
  for (const cycle of cycles) {
    if (targetDate >= cycle.startDate && targetDate <= cycle.endDate) {
      return cycle;
    }
  }
  
  return null;
};

// TODO: Future enhancements
// - Add support for statement export with cycle boundaries
// - Integrate with budget sync to align billing cycles with budget periods
// - Add caching for frequently accessed billing cycles
// - Consider adding transaction categorization within cycles
