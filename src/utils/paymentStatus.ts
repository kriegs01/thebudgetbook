/**
 * PROTOTYPE: Unified Payment Status Utility
 * 
 * Provides centralized logic for payment status and amount synchronization
 * across the app. This utility serves as the single source of truth for:
 * - Payment status checking (installments, billers, regular credit card purchases)
 * - Transaction matching and verification
 * - Credit card purchase aggregation by billing cycle
 * 
 * TODO: Full integration requires:
 * - Real-time transaction updates
 * - Enhanced error handling
 * - Performance optimization for large datasets
 * - User-configurable matching rules
 */

import type { SupabaseTransaction } from '../types/supabase';
import type { Installment, Account } from '../../types';

// Configuration constants for transaction matching
export const TRANSACTION_AMOUNT_TOLERANCE = 1; // ±1 peso tolerance for rounding differences
export const TRANSACTION_MIN_NAME_LENGTH = 3; // Minimum length for partial name matching

/**
 * PROTOTYPE: Transaction matching result
 */
export interface TransactionMatch {
  matched: boolean;
  transaction?: SupabaseTransaction;
  reason?: string;
}

/**
 * PROTOTYPE: Credit card purchase summary for a billing cycle
 */
export interface CreditCardCycleSummary {
  accountId: string;
  accountName: string;
  cycleStart: Date;
  cycleEnd: Date;
  cycleLabel: string;
  totalAmount: number;
  transactionCount: number;
  transactions: SupabaseTransaction[];
}

/**
 * PROTOTYPE: Check if an item is paid based on transaction matching
 * 
 * This is the core payment verification logic used across the app.
 * It matches items to transactions based on name, amount, and date.
 * 
 * @param itemName - Name of the item (biller, installment, etc.)
 * @param itemAmount - Expected payment amount
 * @param month - Month name (e.g., "January")
 * @param year - Year (e.g., 2026)
 * @param transactions - Array of all transactions to search
 * @param monthNames - Array of month names for date matching
 * @returns TransactionMatch object with matched status and details
 */
export const checkPaymentStatus = (
  itemName: string,
  itemAmount: number | string,
  month: string,
  year: number,
  transactions: SupabaseTransaction[],
  monthNames: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
): TransactionMatch => {
  const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
  
  if (isNaN(amount) || amount <= 0) {
    return { matched: false, reason: 'Invalid amount' };
  }

  // Get month index (0-11) for date comparison
  const monthIndex = monthNames.indexOf(month);
  if (monthIndex === -1) {
    return { matched: false, reason: 'Invalid month name' };
  }

  // Find matching transaction
  const matchingTransaction = transactions.find(tx => {
    // Check name match with minimum length requirement to avoid false positives
    const itemNameLower = itemName.toLowerCase();
    const txNameLower = tx.name.toLowerCase();
    
    const nameMatch = (
      (txNameLower.includes(itemNameLower) && itemNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
      (itemNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
    );
    
    if (!nameMatch) return false;
    
    // Check amount match (within tolerance)
    const amountMatch = Math.abs(tx.amount - amount) <= TRANSACTION_AMOUNT_TOLERANCE;
    if (!amountMatch) return false;
    
    // Check date match (same month and year, or previous year for year-end carryover)
    const txDate = new Date(tx.date);
    const txMonth = txDate.getMonth();
    const txYear = txDate.getFullYear();
    
    // Allow previous year matching only for January looking at December transactions
    const dateMatch = (txMonth === monthIndex && txYear === year) ||
                     (monthIndex === 0 && txMonth === 11 && txYear === year - 1); // Jan looking at Dec of prev year

    return dateMatch;
  });

  if (matchingTransaction) {
    return {
      matched: true,
      transaction: matchingTransaction,
      reason: 'Transaction matched'
    };
  }

  return { matched: false, reason: 'No matching transaction found' };
};

/**
 * PROTOTYPE: Calculate billing cycles for a credit card account
 * 
 * Generates billing cycle date ranges based on the account's billing date.
 * Used for grouping credit card transactions by statement period.
 * 
 * @param billingDate - Billing date string (YYYY-MM-DD format)
 * @param numberOfCycles - Number of cycles to generate (default: 6)
 * @returns Array of billing cycle objects with start/end dates
 */
export const calculateBillingCycles = (
  billingDate: string,
  numberOfCycles: number = 6
): { startDate: Date; endDate: Date; label: string }[] => {
  const cycles: { startDate: Date; endDate: Date; label: string }[] = [];
  
  // Parse billing date
  let billingDay: number;
  
  if (billingDate.includes('-')) {
    const date = new Date(billingDate);
    billingDay = date.getDate();
  } else {
    const match = billingDate.match(/\d+/);
    if (!match) return cycles;
    billingDay = parseInt(match[0], 10);
  }
  
  if (billingDay < 1 || billingDay > 31) return cycles;
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  // Generate cycles from past to present
  for (let i = numberOfCycles - 1; i >= 0; i--) {
    const cycleStartDate = new Date(currentYear, currentMonth - i, billingDay);
    
    const daysInMonth = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, 0).getDate();
    const adjustedBillingDay = Math.min(billingDay, daysInMonth);
    cycleStartDate.setDate(adjustedBillingDay);
    
    const cycleEndDate = new Date(cycleStartDate);
    cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    cycleEndDate.setDate(cycleEndDate.getDate() - 1);
    
    const label = formatDateRange(cycleStartDate, cycleEndDate);
    
    cycles.push({ 
      startDate: new Date(cycleStartDate), 
      endDate: new Date(cycleEndDate),
      label
    });
  }
  
  return cycles;
};

/**
 * Helper function to format date range for display
 */
const formatDateRange = (start: Date, end: Date): string => {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} – ${end.toLocaleDateString('en-US', options)}`;
};

/**
 * PROTOTYPE: Aggregate regular credit card purchases by billing cycle
 * 
 * Filters transactions for a credit card account and groups them by billing cycle.
 * Excludes installment-related transactions to show only regular purchases.
 * 
 * @param account - Credit card account
 * @param transactions - All transactions
 * @param installments - All installments (to exclude installment payments)
 * @returns Array of cycle summaries with transaction totals
 */
export const aggregateCreditCardPurchases = (
  account: Account,
  transactions: SupabaseTransaction[],
  installments: Installment[] = []
): CreditCardCycleSummary[] => {
  if (account.classification !== 'Credit Card' || !account.billingDate) {
    return [];
  }

  // Calculate billing cycles
  const cycles = calculateBillingCycles(account.billingDate, 6);
  
  // Get all transactions for this account
  const accountTransactions = transactions.filter(tx => tx.payment_method_id === account.id);
  
  // Create set of installment names for exclusion (case-insensitive)
  const installmentNames = new Set(
    installments
      .filter(inst => inst.accountId === account.id)
      .map(inst => inst.name.toLowerCase())
  );
  
  // Group transactions by cycle, excluding installments
  const summaries: CreditCardCycleSummary[] = cycles.map(cycle => {
    const cycleTxs = accountTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      const inCycle = txDate >= cycle.startDate && txDate <= cycle.endDate;
      
      // Exclude if transaction name matches any installment (case-insensitive)
      const isInstallment = installmentNames.has(tx.name.toLowerCase());
      
      return inCycle && !isInstallment;
    });
    
    const totalAmount = cycleTxs.reduce((sum, tx) => sum + tx.amount, 0);
    
    return {
      accountId: account.id,
      accountName: account.bank,
      cycleStart: cycle.startDate,
      cycleEnd: cycle.endDate,
      cycleLabel: cycle.label,
      totalAmount,
      transactionCount: cycleTxs.length,
      transactions: cycleTxs
    };
  });
  
  return summaries;
};

/**
 * PROTOTYPE: Check if a specific installment payment is paid for a given month
 * 
 * Checks if an installment payment has been made for a specific month
 * by looking for matching transactions.
 * 
 * @param installment - The installment to check
 * @param month - Month name
 * @param year - Year
 * @param paymentNumber - Which payment in the sequence (1-based)
 * @param transactions - All transactions
 * @returns TransactionMatch result
 */
export const checkInstallmentPaymentStatus = (
  installment: Installment,
  month: string,
  year: number,
  paymentNumber: number,
  transactions: SupabaseTransaction[]
): TransactionMatch => {
  // Build a search name that includes payment number for better matching
  const searchName = `${installment.name}`;
  
  return checkPaymentStatus(
    searchName,
    installment.monthlyAmount,
    month,
    year,
    transactions
  );
};

/**
 * PROTOTYPE: Get installment payment schedule
 * 
 * Generates a payment schedule for an installment based on start date and term duration.
 * Returns array of payment periods with status.
 * 
 * @param installment - The installment
 * @returns Array of payment schedule items
 */
export interface InstallmentPaymentSchedule {
  paymentNumber: number;
  month: string;
  year: number;
  amount: number;
  dueDate?: Date;
}

export const getInstallmentPaymentSchedule = (
  installment: Installment
): InstallmentPaymentSchedule[] => {
  const schedule: InstallmentPaymentSchedule[] = [];
  
  if (!installment.startDate) {
    return schedule;
  }
  
  // Parse start date (YYYY-MM format)
  const [yearStr, monthStr] = installment.startDate.split('-');
  const startYear = parseInt(yearStr, 10);
  const startMonth = parseInt(monthStr, 10) - 1; // 0-based month
  
  // Extract term duration number
  const termMonths = parseInt(installment.termDuration.replace(/\D/g, ''), 10) || 0;
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Generate schedule for each month
  for (let i = 0; i < termMonths; i++) {
    const date = new Date(startYear, startMonth + i, 1);
    schedule.push({
      paymentNumber: i + 1,
      month: monthNames[date.getMonth()],
      year: date.getFullYear(),
      amount: installment.monthlyAmount,
      dueDate: date
    });
  }
  
  return schedule;
};
