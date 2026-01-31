/**
 * Payment Synchronization Utility
 * 
 * PROTOTYPE: Centralized synchronization of payment amounts and payment status
 * across Installments, Accounts, Budget Setup, and Billers.
 * 
 * This utility ensures that transactions serve as the single source of truth
 * for payment status and amounts across all entities.
 * 
 * TODO: This is a prototype implementation. Before production:
 * 1. Add comprehensive error handling
 * 2. Add transaction validation logic
 * 3. Consider caching strategies for performance
 * 4. Add unit tests
 * 5. Integrate with existing state management (if any)
 * 6. Consider database-level computed views for better performance
 * 7. Add logging/monitoring for sync operations
 * 8. Handle edge cases (e.g., refunds, partial payments, date mismatches)
 */

import type { SupabaseTransaction } from '../types/supabase';
import type { Installment, Biller, PaymentSchedule, Account } from '../../types';

/**
 * Configuration for transaction matching
 */
export const PAYMENT_SYNC_CONFIG = {
  // Amount tolerance for matching transactions (±N pesos)
  AMOUNT_TOLERANCE: 1,
  // Minimum name length for partial matching
  MIN_NAME_LENGTH: 3,
  // How many months back to look for transaction matches
  LOOKBACK_MONTHS: 24,
};

/**
 * Represents a payment status for any entity
 */
export interface PaymentStatus {
  entityId: string;
  entityName: string;
  expectedAmount: number;
  paidAmount: number;
  isPaid: boolean;
  paymentDate?: string;
  matchingTransactionIds: string[];
  billingPeriod?: {
    month: string;
    year: string;
  };
}

/**
 * Billing period grouping for accounts
 */
export interface BillingPeriodSummary {
  accountId: string;
  accountName: string;
  period: {
    month: string;
    year: string;
  };
  transactions: SupabaseTransaction[];
  totalAmount: number;
  transactionCount: number;
}

/**
 * Loan payment information combining installments and regular transactions
 */
export interface LoanPaymentInfo {
  installmentId?: string;
  installmentName?: string;
  period: {
    month: string;
    year: string;
  };
  expectedAmount: number;
  paidAmount: number;
  isPaid: boolean;
  transactions: SupabaseTransaction[];
  accountId?: string;
}

/**
 * Core utility function to match a name and amount to transactions
 * 
 * @param entityName - Name of the entity to match (biller, installment, etc.)
 * @param expectedAmount - Expected payment amount
 * @param targetMonth - Target month name (e.g., "January")
 * @param targetYear - Target year as string or number
 * @param transactions - Array of all transactions
 * @returns Array of matching transactions
 */
export function findMatchingTransactions(
  entityName: string,
  expectedAmount: number,
  targetMonth: string,
  targetYear: string | number,
  transactions: SupabaseTransaction[]
): SupabaseTransaction[] {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const targetMonthIndex = MONTHS.indexOf(targetMonth);
  const targetYearNum = typeof targetYear === 'string' ? parseInt(targetYear) : targetYear;
  
  if (targetMonthIndex === -1) {
    console.warn(`[PaymentSync] Invalid month: ${targetMonth}`);
    return [];
  }

  return transactions.filter(tx => {
    // Name matching: partial match with minimum length
    const txNameLower = tx.name.toLowerCase();
    const entityNameLower = entityName.toLowerCase();
    
    if (txNameLower.length < PAYMENT_SYNC_CONFIG.MIN_NAME_LENGTH && 
        entityNameLower.length < PAYMENT_SYNC_CONFIG.MIN_NAME_LENGTH) {
      return false;
    }
    
    const nameMatch = txNameLower.includes(entityNameLower) || 
                     entityNameLower.includes(txNameLower);
    
    if (!nameMatch) return false;

    // Amount matching: within tolerance
    const amountMatch = Math.abs(tx.amount - expectedAmount) <= PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
    if (!amountMatch) return false;

    // Date matching: same month/year or previous year for carryover
    const txDate = new Date(tx.date);
    const txMonth = txDate.getMonth();
    const txYear = txDate.getFullYear();
    
    const dateMatch = (txMonth === targetMonthIndex) && 
                     (txYear === targetYearNum || txYear === targetYearNum - 1);
    
    return dateMatch;
  });
}

/**
 * Compute payment status for an installment
 * 
 * TODO: Consider how to handle:
 * - Multiple payments for the same installment in a month
 * - Payments that exceed the monthly amount
 * - Partial payments
 * - Payment plans with variable monthly amounts
 * 
 * @param installment - The installment entity
 * @param transactions - All available transactions
 * @returns Payment status for the installment
 */
export function computeInstallmentPaymentStatus(
  installment: Installment,
  transactions: SupabaseTransaction[]
): PaymentStatus {
  // Extract term duration number from string like "12 months"
  const termMonths = parseInt(installment.termDuration);
  
  // Find all transactions matching this installment's name and account
  const accountTransactions = transactions.filter(
    tx => tx.payment_method_id === installment.accountId
  );
  
  // Match transactions by name and monthly amount
  const matchingTransactions = accountTransactions.filter(tx => {
    const txNameLower = tx.name.toLowerCase();
    const installmentNameLower = installment.name.toLowerCase();
    
    const nameMatch = txNameLower.includes(installmentNameLower) || 
                     installmentNameLower.includes(txNameLower);
    
    const amountMatch = Math.abs(tx.amount - installment.monthlyAmount) <= 
                       PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
    
    return nameMatch && amountMatch;
  });
  
  // Calculate total paid from matching transactions
  const paidAmount = matchingTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  // Determine if fully paid
  const isPaid = paidAmount >= installment.totalAmount;
  
  // Get latest payment date
  const paymentDate = matchingTransactions.length > 0
    ? matchingTransactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0].date
    : undefined;

  return {
    entityId: installment.id,
    entityName: installment.name,
    expectedAmount: installment.totalAmount,
    paidAmount,
    isPaid,
    paymentDate,
    matchingTransactionIds: matchingTransactions.map(tx => tx.id),
  };
}

/**
 * Compute payment status for a biller's payment schedule
 * 
 * TODO: Handle edge cases:
 * - Multiple billers with similar names
 * - Billers with varying amounts month-to-month
 * - Billers paid through multiple accounts
 * 
 * @param biller - The biller entity
 * @param schedule - Specific payment schedule for a month
 * @param transactions - All available transactions
 * @returns Payment status for the schedule
 */
export function computeBillerSchedulePaymentStatus(
  biller: Biller,
  schedule: PaymentSchedule,
  transactions: SupabaseTransaction[]
): PaymentStatus {
  const matchingTransactions = findMatchingTransactions(
    biller.name,
    schedule.expectedAmount,
    schedule.month,
    schedule.year,
    transactions
  );
  
  const paidAmount = matchingTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const isPaid = paidAmount >= schedule.expectedAmount - PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
  
  const paymentDate = matchingTransactions.length > 0
    ? matchingTransactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0].date
    : undefined;

  return {
    entityId: `${biller.id}_${schedule.month}_${schedule.year}`,
    entityName: biller.name,
    expectedAmount: schedule.expectedAmount,
    paidAmount,
    isPaid,
    paymentDate,
    matchingTransactionIds: matchingTransactions.map(tx => tx.id),
    billingPeriod: {
      month: schedule.month,
      year: schedule.year,
    },
  };
}

/**
 * Group transactions by billing period for an account
 * 
 * This is useful for credit card statements and account summaries
 * 
 * TODO: Consider:
 * - Custom billing cycles (not just calendar months)
 * - Multiple billing periods per month
 * - Timezone handling for billing dates
 * 
 * @param accountId - The account ID to filter transactions
 * @param transactions - All available transactions
 * @returns Array of billing period summaries
 */
export function groupTransactionsByBillingPeriod(
  accountId: string,
  accountName: string,
  transactions: SupabaseTransaction[]
): BillingPeriodSummary[] {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // Filter transactions for this account
  const accountTransactions = transactions.filter(
    tx => tx.payment_method_id === accountId
  );
  
  // Group by month and year
  const periodMap = new Map<string, SupabaseTransaction[]>();
  
  accountTransactions.forEach(tx => {
    const date = new Date(tx.date);
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear().toString();
    const key = `${year}-${month}`;
    
    if (!periodMap.has(key)) {
      periodMap.set(key, []);
    }
    periodMap.get(key)!.push(tx);
  });
  
  // Convert to array of summaries
  const summaries: BillingPeriodSummary[] = [];
  
  periodMap.forEach((txs, key) => {
    const [year, month] = key.split('-');
    const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
    
    summaries.push({
      accountId,
      accountName,
      period: { month, year },
      transactions: txs,
      totalAmount,
      transactionCount: txs.length,
    });
  });
  
  // Sort by year and month (most recent first)
  summaries.sort((a, b) => {
    const aDate = new Date(`${a.period.year}-${MONTHS.indexOf(a.period.month) + 1}-01`);
    const bDate = new Date(`${b.period.year}-${MONTHS.indexOf(b.period.month) + 1}-01`);
    return bDate.getTime() - aDate.getTime();
  });
  
  return summaries;
}

/**
 * Build Loans section for Budget Setup by combining installment payments
 * and regular loan transactions
 * 
 * This consolidates all loan-related payments grouped by billing period
 * 
 * TODO: Clarify requirements:
 * - Should this include only active installments?
 * - How to handle installments without billerId?
 * - Should regular loan payments (non-installment) be included?
 * - How to group multiple loans to the same account?
 * 
 * @param installments - All installments
 * @param billers - All billers (for loan category)
 * @param transactions - All available transactions
 * @param targetMonth - Target month for the budget
 * @param targetYear - Target year for the budget
 * @returns Array of loan payment information
 */
export function buildLoansBudgetSection(
  installments: Installment[],
  billers: Biller[],
  transactions: SupabaseTransaction[],
  targetMonth: string,
  targetYear: string
): LoanPaymentInfo[] {
  const loanPayments: LoanPaymentInfo[] = [];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // TODO: Filter to only loan-category billers
  const loanBillers = billers.filter(b => 
    b.category === 'Loans' || b.category.startsWith('Loans -')
  );
  
  // Process each installment
  installments.forEach(installment => {
    // Skip if installment is linked to a biller (to avoid duplication)
    // TODO: Verify this logic with actual requirements
    if (installment.billerId) {
      // This will be handled by the biller's schedule
      return;
    }
    
    // Find matching transactions for this month
    const matchingTransactions = findMatchingTransactions(
      installment.name,
      installment.monthlyAmount,
      targetMonth,
      targetYear,
      transactions
    );
    
    const paidAmount = matchingTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const isPaid = paidAmount >= installment.monthlyAmount - PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
    
    loanPayments.push({
      installmentId: installment.id,
      installmentName: installment.name,
      period: { month: targetMonth, year: targetYear },
      expectedAmount: installment.monthlyAmount,
      paidAmount,
      isPaid,
      transactions: matchingTransactions,
      accountId: installment.accountId,
    });
  });
  
  // Process loan billers' schedules for target month
  loanBillers.forEach(biller => {
    const schedule = biller.schedules.find(
      s => s.month === targetMonth && s.year === targetYear
    );
    
    if (!schedule) return;
    
    const matchingTransactions = findMatchingTransactions(
      biller.name,
      schedule.expectedAmount,
      targetMonth,
      targetYear,
      transactions
    );
    
    const paidAmount = matchingTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const isPaid = paidAmount >= schedule.expectedAmount - PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
    
    // Find linked installment if any
    const linkedInstallment = installments.find(i => i.billerId === biller.id);
    
    loanPayments.push({
      installmentId: linkedInstallment?.id,
      installmentName: biller.name,
      period: { month: targetMonth, year: targetYear },
      expectedAmount: schedule.expectedAmount,
      paidAmount,
      isPaid,
      transactions: matchingTransactions,
      accountId: schedule.accountId,
    });
  });
  
  return loanPayments;
}

/**
 * Compute payment status for a budget item
 * 
 * Used in Budget Setup to determine if a categorized item has been paid
 * 
 * TODO: Consider:
 * - How to handle recurring budget items
 * - Budget items that map to multiple transactions
 * - Budget items without specific names (e.g., "Groceries")
 * 
 * @param itemName - Name of the budget item
 * @param expectedAmount - Expected amount for the item
 * @param targetMonth - Target month
 * @param targetYear - Target year
 * @param transactions - All available transactions
 * @returns Payment status for the budget item
 */
export function computeBudgetItemPaymentStatus(
  itemName: string,
  expectedAmount: number,
  targetMonth: string,
  targetYear: string,
  transactions: SupabaseTransaction[]
): PaymentStatus {
  const matchingTransactions = findMatchingTransactions(
    itemName,
    expectedAmount,
    targetMonth,
    targetYear,
    transactions
  );
  
  const paidAmount = matchingTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const isPaid = paidAmount >= expectedAmount - PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
  
  const paymentDate = matchingTransactions.length > 0
    ? matchingTransactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0].date
    : undefined;

  return {
    entityId: `budget_${itemName}_${targetMonth}_${targetYear}`,
    entityName: itemName,
    expectedAmount,
    paidAmount,
    isPaid,
    paymentDate,
    matchingTransactionIds: matchingTransactions.map(tx => tx.id),
    billingPeriod: {
      month: targetMonth,
      year: targetYear,
    },
  };
}

/**
 * Calculate account balance from transactions
 * 
 * This provides a transaction-based balance calculation that can be compared
 * to the stored balance in the accounts table
 * 
 * TODO: Important considerations:
 * - Should this include a starting balance?
 * - How to handle transfers between accounts?
 * - Should debits be positive or negative?
 * - Need to distinguish income vs expense transactions
 * 
 * @param accountId - The account ID
 * @param transactions - All available transactions
 * @param startDate - Optional start date for calculation
 * @returns Calculated balance based on transactions
 */
export function calculateAccountBalanceFromTransactions(
  accountId: string,
  transactions: SupabaseTransaction[],
  startDate?: string
): number {
  // TODO: This is a simplified calculation that assumes all transactions
  // are expenses (debits). Need to clarify:
  // 1. How to determine if a transaction is income or expense?
  // 2. Should we have a starting balance parameter?
  // 3. How to handle account types (debit vs credit)?
  
  const accountTransactions = transactions.filter(tx => {
    if (tx.payment_method_id !== accountId) return false;
    if (startDate) {
      return new Date(tx.date) >= new Date(startDate);
    }
    return true;
  });
  
  // For now, sum all transactions
  // TODO: Adjust sign based on transaction type (income vs expense)
  const balance = accountTransactions.reduce((sum, tx) => sum - tx.amount, 0);
  
  return balance;
}

/**
 * Helper function to check if an entity's payment is current
 * based on transactions vs stored values
 * 
 * This can be used to detect discrepancies between stored payment data
 * and actual transaction records
 * 
 * @param storedAmount - Amount stored in the entity (e.g., installment.paidAmount)
 * @param computedStatus - Payment status computed from transactions
 * @returns Object indicating if payment data is in sync
 */
export function checkPaymentSyncStatus(
  storedAmount: number,
  computedStatus: PaymentStatus
): {
  inSync: boolean;
  difference: number;
  recommendation: string;
} {
  const difference = Math.abs(storedAmount - computedStatus.paidAmount);
  const inSync = difference <= PAYMENT_SYNC_CONFIG.AMOUNT_TOLERANCE;
  
  let recommendation = '';
  if (!inSync) {
    if (storedAmount > computedStatus.paidAmount) {
      recommendation = 'Stored amount is higher than transaction total. Payment may not be recorded as transactions.';
    } else {
      recommendation = 'Transaction total is higher than stored amount. Entity payment data may need updating.';
    }
  }
  
  return {
    inSync,
    difference,
    recommendation,
  };
}
