/**
 * Linked Account Utilities for Billers
 * 
 * ENHANCEMENT: Utilities for calculating expected amounts from linked credit accounts
 * using billing cycle-based transaction aggregation.
 * 
 * This module handles the logic for Loans-category billers that are linked to credit accounts.
 */

import type { Biller, Account, PaymentSchedule } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';
import { getCycleForMonth, aggregateTransactionsByCycle } from './billingCycles';

/**
 * Check if a biller should use linked account logic
 * 
 * @param biller - The biller to check
 * @returns True if biller is Loans category and has a linked account
 */
export const shouldUseLinkedAccount = (biller: Biller): boolean => {
  return biller.category.startsWith('Loans') && !!biller.linkedAccountId;
};

/**
 * Get the linked account for a biller
 * 
 * @param biller - The biller
 * @param accounts - All available accounts
 * @returns The linked credit account, or null if not found/invalid
 */
export const getLinkedAccount = (
  biller: Biller,
  accounts: Account[]
): Account | null => {
  if (!biller.linkedAccountId) return null;
  
  const account = accounts.find(acc => acc.id === biller.linkedAccountId);
  
  // Validate it's a credit account with billing date
  if (!account || account.type !== 'Credit' || !account.billingDate) {
    return null;
  }
  
  return account;
};

/**
 * Calculate expected amount from linked account for a specific billing period
 * 
 * ENHANCEMENT: Core function that calculates the amount from transaction history
 * using the credit account's billing cycle window (not calendar month)
 * 
 * @param biller - The biller with linked account
 * @param schedule - The payment schedule (month/year)
 * @param account - The linked credit account
 * @param transactions - All transactions for the account
 * @returns The calculated amount, or null if cannot calculate
 */
export const calculateLinkedAccountAmount = (
  biller: Biller,
  schedule: PaymentSchedule,
  account: Account,
  transactions: SupabaseTransaction[]
): number | null => {
  // Validate inputs
  if (!account.billingDate) return null;
  
  // Get the billing cycle for this month/year
  const cycle = getCycleForMonth(schedule.month, schedule.year, account.billingDate);
  if (!cycle) return null;
  
  // Filter transactions for this account in this cycle
  const accountTransactions = transactions.filter(tx => 
    tx.payment_method_id === account.id
  );
  
  // Aggregate by cycle
  const cyclesWithTx = aggregateTransactionsByCycle(
    accountTransactions,
    account.billingDate,
    24 // Generate enough cycles to cover the schedule
  );
  
  // Find the cycle matching our schedule
  const matchingCycle = cyclesWithTx.find(c => c.label === cycle.label);
  if (!matchingCycle) return null;
  
  // Return the total amount for this cycle
  return matchingCycle.totalAmount;
};

/**
 * Get display label for a schedule with cycle date range
 * 
 * ENHANCEMENT: Generates a display label showing the actual billing cycle dates
 * instead of just the month name (e.g., "Jan 12 – Feb 11, 2026" instead of "January 2026")
 * 
 * @param schedule - The payment schedule
 * @param account - The linked credit account (optional)
 * @returns Display label with cycle dates if account available, otherwise month/year
 */
export const getScheduleDisplayLabel = (
  schedule: PaymentSchedule,
  account: Account | null
): string => {
  // If no account or no billing date, fall back to simple month/year
  if (!account || !account.billingDate) {
    return `${schedule.month} ${schedule.year}`;
  }
  
  // Get the billing cycle for this schedule
  const cycle = getCycleForMonth(schedule.month, schedule.year, account.billingDate);
  if (!cycle) {
    return `${schedule.month} ${schedule.year}`;
  }
  
  // Return the cycle label (includes date range)
  return cycle.label;
};

/**
 * Calculate expected amount for a biller schedule
 * 
 * ENHANCEMENT: Main calculation function that determines whether to use
 * linked account transactions or manual expected amount
 * 
 * @param biller - The biller
 * @param schedule - The payment schedule
 * @param accounts - All available accounts
 * @param transactions - All available transactions
 * @returns Object with amount and whether it came from linked account
 */
export const getScheduleExpectedAmount = (
  biller: Biller,
  schedule: PaymentSchedule,
  accounts: Account[],
  transactions: SupabaseTransaction[]
): { amount: number; isFromLinkedAccount: boolean } => {
  // Check if we should use linked account logic
  if (!shouldUseLinkedAccount(biller)) {
    return {
      amount: schedule.expectedAmount || biller.expectedAmount,
      isFromLinkedAccount: false
    };
  }
  
  // Get the linked account
  const account = getLinkedAccount(biller, accounts);
  if (!account) {
    // Fall back to manual amount if account not found or invalid
    console.warn(`[Billers] Linked account not found or invalid for biller "${biller.name}"`);
    return {
      amount: schedule.expectedAmount || biller.expectedAmount,
      isFromLinkedAccount: false
    };
  }
  
  // Calculate from linked account
  const calculatedAmount = calculateLinkedAccountAmount(
    biller,
    schedule,
    account,
    transactions
  );
  
  if (calculatedAmount === null) {
    // Fall back to manual amount if calculation fails
    console.warn(`[Billers] Could not calculate amount from linked account for "${biller.name}" (${schedule.month} ${schedule.year})`);
    return {
      amount: schedule.expectedAmount || biller.expectedAmount,
      isFromLinkedAccount: false
    };
  }
  
  return {
    amount: calculatedAmount,
    isFromLinkedAccount: true
  };
};

// TODO: Future enhancements
// - Add caching for calculated amounts to improve performance
// - Support excluding specific transaction categories from aggregation
// - Add ability to manually override calculated amounts for specific cycles
// - Integrate with statement export feature
// - Add validation warnings when linked account has no transactions in cycle
