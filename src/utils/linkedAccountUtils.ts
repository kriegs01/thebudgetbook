/**
 * Linked Account Utilities for Billers
 * 
 * ENHANCEMENT: Utilities for calculating expected amounts from linked credit accounts
 * using billing cycle-based transaction aggregation.
 * 
 * This module handles the logic for Loans-category billers that are linked to credit accounts.
 */

import type { Biller, Account, PaymentSchedule } from '../../types';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule, CreateMonthlyPaymentScheduleInput } from '../types/supabase';
import { getCycleForMonth, aggregateTransactionsByCycle, getDueDayForMonth } from './billingCycles';

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
 * Cycles are mapped by START DATE so that "January" = the billing period that
 * began in January (e.g., Jan 11 – Feb 10).  Purchases made during January are
 * therefore included in the "January" expected-amount calculation, matching what
 * users see when they open the Account Statement and browse to the current cycle.
 * 
 * @param biller - The biller with linked account
 * @param schedule - The payment schedule (month/year) - refers to the cycle-start month
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
  
  // Payment/credit transaction types that should not be counted as charges
  const PAYMENT_TYPES = new Set(['payment', 'cash_in', 'loan_payment']);

  // Filter transactions for this account to only charge-type transactions.
  // Exclude payment-type transactions and negative amounts so that bill payments
  // do not reduce the displayed charge amount (only purchases/charges are summed).
  const accountTransactions = transactions.filter(tx =>
    tx.payment_method_id === account.id &&
    !PAYMENT_TYPES.has(tx.transaction_type ?? '') &&
    tx.amount > 0
  );

  // If no charge transactions have ever been recorded on this credit account,
  // return null so the caller falls back to the manually set expected amount.
  // This prevents the schedule from displaying ₱0 when only payment transactions
  // exist (i.e. the user hasn't recorded any credit card purchases separately).
  if (accountTransactions.length === 0) return null;

  // Aggregate by cycle
  // Generate enough cycles to cover historical and future schedules (24 cycles = 2 years)
  const CYCLE_LOOKBACK_COUNT = 24;
  const cyclesWithTx = aggregateTransactionsByCycle(
    accountTransactions,
    account.billingDate,
    CYCLE_LOOKBACK_COUNT
  );
  
  // Find the cycle matching our schedule
  const matchingCycle = cyclesWithTx.find(c => c.label === cycle.label);
  if (!matchingCycle) return null;
  
  // If the matching cycle is empty (e.g. open/future billing period with no charges yet),
  // fall back to the most recent past cycle that has transactions.  This gives the user
  // a sensible "last known amount" rather than ₱0 / their manual expected amount.
  if (matchingCycle.transactions.length === 0) {
    const matchingIndex = cyclesWithTx.indexOf(matchingCycle);
    // cyclesWithTx preserves the chronological order from calculateBillingCycles:
    // oldest cycle at index 0, newest (most future) cycle at the last index.
    // Searching backwards from matchingIndex finds the most-recent past cycle
    // with recorded charges without creating a reversed copy of the array.
    for (let i = matchingIndex - 1; i >= 0; i--) {
      if (cyclesWithTx[i].transactions.length > 0) return cyclesWithTx[i].totalAmount;
    }
    return null;
  }
  
  return matchingCycle.totalAmount;
};

/**
 * Get display label for a schedule with cycle date range
 * 
 * ENHANCEMENT: Generates a display label showing the actual billing cycle dates
 * instead of just the month name (e.g., "Mar 11 – Apr 10, 2026" instead of "March 2026")
 * 
 * The cycle is determined by START DATE mapping. For example, if schedule.month
 * is "March", this returns the cycle whose START DATE is in March (e.g., "Mar 11 – Apr 10, 2026").
 * This clearly shows which transactions (from Mar 11 to Apr 10) are included in the
 * "March" billing period.
 * 
 * @param schedule - The payment schedule (month refers to the billing cycle start month)
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

/**
 * Get the computed due day for a biller's linked credit account in a given month/year.
 * Returns null if the biller has no linked account or the account has no billing config.
 *
 * @param biller - The Loans-category biller with linkedAccountId
 * @param accounts - All available accounts
 * @param month - 0-indexed month (e.g. 0 = January)
 * @param year - Year (e.g. 2026)
 * @returns Due day number (e.g. 2) or null
 */
export const getLinkedAccountDueDay = (
  biller: Biller,
  accounts: Account[],
  month: number,
  year: number
): number | null => {
  const linkedAccount = getLinkedAccount(biller, accounts);
  if (!linkedAccount) return null;
  return getDueDayForMonth(linkedAccount, month, year);
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Compute which payment schedule rows need to be created or updated so that every
 * billing cycle that has CC charge transactions has a corresponding row in
 * `monthly_payment_schedules` with the correct `expected_amount`.
 *
 * This is used by the Billers page to keep the DB in sync with the credit account's
 * transaction history, addressing the case where:
 *  - Schedules were never created for older billing cycles, OR
 *  - Schedules exist but `expected_amount` is 0 (created before the linked account was set).
 *
 * Paid schedules are never updated — their amount_paid / status are the source of truth.
 *
 * @param biller - The Loans-category biller with linkedAccountId
 * @param account - The linked credit account (must have billingDate)
 * @param transactions - All SupabaseTransactions for the user
 * @param existingSchedules - Rows already in monthly_payment_schedules for this biller
 * @returns Lists of rows to create and rows to update
 */
export const computeLinkedBillerScheduleSync = (
  biller: Biller,
  account: Account,
  transactions: SupabaseTransaction[],
  existingSchedules: SupabaseMonthlyPaymentSchedule[]
): {
  toCreate: CreateMonthlyPaymentScheduleInput[];
  toUpdate: { id: string; expectedAmount: number }[];
} => {
  if (!account.billingDate) return { toCreate: [], toUpdate: [] };

  const PAYMENT_TYPES = new Set(['payment', 'cash_in', 'loan_payment']);

  // Only charge-type positive-amount transactions count toward the CC balance
  const chargeTransactions = transactions.filter(
    tx =>
      tx.payment_method_id === account.id &&
      !PAYMENT_TYPES.has(tx.transaction_type ?? '') &&
      tx.amount > 0
  );

  if (chargeTransactions.length === 0) return { toCreate: [], toUpdate: [] };

  const CYCLE_LOOKBACK_COUNT = 24;
  const cyclesWithTx = aggregateTransactionsByCycle(
    chargeTransactions,
    account.billingDate,
    CYCLE_LOOKBACK_COUNT
  );

  const toCreate: CreateMonthlyPaymentScheduleInput[] = [];
  const toUpdate: { id: string; expectedAmount: number }[] = [];

  for (const cycle of cyclesWithTx) {
    if (cycle.transactions.length === 0) continue;

    const cycleMonth = MONTH_NAMES[cycle.startDate.getMonth()];
    const cycleYear = cycle.startDate.getFullYear();
    const cycleTotal = cycle.totalAmount;

    const existing = existingSchedules.find(
      s => s.month === cycleMonth && s.year === cycleYear
    );

    if (!existing) {
      // Missing schedule row — create it with the correct expected_amount
      toCreate.push({
        source_type: 'biller',
        source_id: biller.id,
        month: cycleMonth,
        year: cycleYear,
        payment_number: null,
        expected_amount: cycleTotal,
        amount_paid: 0,
        receipt: null,
        date_paid: null,
        account_id: null,
        status: 'pending',
      });
    } else if (
      existing.status !== 'paid' &&
      existing.expected_amount !== cycleTotal
    ) {
      // Row exists but expected_amount is stale (e.g. was 0 because biller had no manual amount)
      toUpdate.push({ id: existing.id, expectedAmount: cycleTotal });
    }
  }

  return { toCreate, toUpdate };
};
