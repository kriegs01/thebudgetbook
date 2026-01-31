/**
 * Payment Synchronization Hook
 * 
 * PROTOTYPE: React hook for centralized payment synchronization.
 * Wraps the payment sync utility functions with React state management
 * and memoization for performance.
 * 
 * TODO: Before production:
 * 1. Add error boundaries for hook usage
 * 2. Consider moving to a Context provider for app-wide state
 * 3. Add loading states for async operations
 * 4. Add refresh/invalidation logic
 * 5. Integrate with React Query or similar for caching
 * 6. Add TypeScript strict mode compatibility
 * 7. Consider performance optimization for large datasets
 */

import { useMemo } from 'react';
import type { SupabaseTransaction } from '../types/supabase';
import type { Installment, Biller, Account } from '../../types';
import {
  computeInstallmentPaymentStatus,
  computeBillerSchedulePaymentStatus,
  groupTransactionsByBillingPeriod,
  buildLoansBudgetSection,
  computeBudgetItemPaymentStatus,
  checkPaymentSyncStatus,
  type PaymentStatus,
  type BillingPeriodSummary,
  type LoanPaymentInfo,
} from './paymentSync';

/**
 * Hook for computing installment payment status from transactions
 * 
 * @param installments - Array of installments
 * @param transactions - Array of all transactions
 * @returns Map of installment ID to payment status
 */
export function useInstallmentPaymentStatus(
  installments: Installment[],
  transactions: SupabaseTransaction[]
): Map<string, PaymentStatus> {
  return useMemo(() => {
    const statusMap = new Map<string, PaymentStatus>();
    
    installments.forEach(installment => {
      const status = computeInstallmentPaymentStatus(installment, transactions);
      statusMap.set(installment.id, status);
    });
    
    return statusMap;
  }, [installments, transactions]);
}

/**
 * Hook for computing biller payment status from transactions
 * 
 * Returns a nested map: billerId -> scheduleKey -> PaymentStatus
 * where scheduleKey is `${month}_${year}`
 * 
 * @param billers - Array of billers
 * @param transactions - Array of all transactions
 * @returns Nested map of biller and schedule to payment status
 */
export function useBillerPaymentStatus(
  billers: Biller[],
  transactions: SupabaseTransaction[]
): Map<string, Map<string, PaymentStatus>> {
  return useMemo(() => {
    const statusMap = new Map<string, Map<string, PaymentStatus>>();
    
    billers.forEach(biller => {
      const billerSchedules = new Map<string, PaymentStatus>();
      
      biller.schedules.forEach(schedule => {
        const scheduleKey = `${schedule.month}_${schedule.year}`;
        const status = computeBillerSchedulePaymentStatus(biller, schedule, transactions);
        billerSchedules.set(scheduleKey, status);
      });
      
      statusMap.set(biller.id, billerSchedules);
    });
    
    return statusMap;
  }, [billers, transactions]);
}

/**
 * Hook for grouping account transactions by billing period
 * 
 * @param accounts - Array of accounts
 * @param transactions - Array of all transactions
 * @returns Map of account ID to array of billing period summaries
 */
export function useAccountBillingPeriods(
  accounts: Account[],
  transactions: SupabaseTransaction[]
): Map<string, BillingPeriodSummary[]> {
  return useMemo(() => {
    const periodMap = new Map<string, BillingPeriodSummary[]>();
    
    accounts.forEach(account => {
      const periods = groupTransactionsByBillingPeriod(
        account.id,
        account.bank,
        transactions
      );
      periodMap.set(account.id, periods);
    });
    
    return periodMap;
  }, [accounts, transactions]);
}

/**
 * Hook for building loans budget section
 * 
 * @param installments - Array of installments
 * @param billers - Array of billers
 * @param transactions - Array of all transactions
 * @param targetMonth - Target month for the budget
 * @param targetYear - Target year for the budget
 * @returns Array of loan payment information
 */
export function useLoansBudgetSection(
  installments: Installment[],
  billers: Biller[],
  transactions: SupabaseTransaction[],
  targetMonth: string,
  targetYear: string
): LoanPaymentInfo[] {
  return useMemo(() => {
    return buildLoansBudgetSection(
      installments,
      billers,
      transactions,
      targetMonth,
      targetYear
    );
  }, [installments, billers, transactions, targetMonth, targetYear]);
}

/**
 * Hook for checking payment sync status between stored and computed values
 * 
 * Useful for detecting discrepancies and showing warnings in the UI
 * 
 * @param installments - Array of installments
 * @param transactions - Array of all transactions
 * @returns Map of installment ID to sync status
 */
export function usePaymentSyncStatus(
  installments: Installment[],
  transactions: SupabaseTransaction[]
): Map<string, ReturnType<typeof checkPaymentSyncStatus>> {
  return useMemo(() => {
    const syncStatusMap = new Map<string, ReturnType<typeof checkPaymentSyncStatus>>();
    
    installments.forEach(installment => {
      const computedStatus = computeInstallmentPaymentStatus(installment, transactions);
      const syncStatus = checkPaymentSyncStatus(installment.paidAmount, computedStatus);
      syncStatusMap.set(installment.id, syncStatus);
    });
    
    return syncStatusMap;
  }, [installments, transactions]);
}

/**
 * Composite hook that provides all payment sync data for a given context
 * 
 * This is the main hook to use in components that need comprehensive payment sync data.
 * 
 * TODO: Consider splitting this into a Context provider to avoid prop drilling
 * 
 * @param params - All entities and transactions needed for sync
 * @returns All computed payment sync data
 */
export function usePaymentSync(params: {
  installments: Installment[];
  billers: Biller[];
  accounts: Account[];
  transactions: SupabaseTransaction[];
  targetMonth?: string;
  targetYear?: string;
}) {
  const {
    installments,
    billers,
    accounts,
    transactions,
    targetMonth = new Date().toLocaleString('en-US', { month: 'long' }),
    targetYear = new Date().getFullYear().toString(),
  } = params;

  const installmentStatus = useInstallmentPaymentStatus(installments, transactions);
  const billerStatus = useBillerPaymentStatus(billers, transactions);
  const accountBillingPeriods = useAccountBillingPeriods(accounts, transactions);
  const loansBudget = useLoansBudgetSection(installments, billers, transactions, targetMonth, targetYear);
  const syncStatus = usePaymentSyncStatus(installments, transactions);

  /**
   * Helper function to compute budget item payment status
   * This is wrapped in the hook to use the current month/year context
   */
  const computeBudgetItemStatus = useMemo(() => {
    return (itemName: string, expectedAmount: number, month?: string, year?: string) => {
      return computeBudgetItemPaymentStatus(
        itemName,
        expectedAmount,
        month || targetMonth,
        year || targetYear,
        transactions
      );
    };
  }, [transactions, targetMonth, targetYear]);

  return {
    // Payment status maps
    installmentStatus,
    billerStatus,
    accountBillingPeriods,
    loansBudget,
    syncStatus,
    
    // Helper functions
    computeBudgetItemStatus,
    
    // Context info
    targetMonth,
    targetYear,
    
    // Stats
    stats: {
      totalInstallments: installments.length,
      paidInstallments: Array.from(installmentStatus.values()).filter(s => s.isPaid).length,
      totalBillers: billers.length,
      activeAccounts: accounts.length,
      totalTransactions: transactions.length,
    },
  };
}

/**
 * Hook for simple budget item payment check
 * 
 * Convenience hook for checking if a single budget item is paid
 * 
 * @param itemName - Name of the budget item
 * @param expectedAmount - Expected amount
 * @param transactions - All transactions
 * @param month - Target month
 * @param year - Target year
 * @returns Payment status for the item
 */
export function useBudgetItemPaymentStatus(
  itemName: string,
  expectedAmount: number,
  transactions: SupabaseTransaction[],
  month?: string,
  year?: string
): PaymentStatus {
  const targetMonth = month || new Date().toLocaleString('en-US', { month: 'long' });
  const targetYear = year || new Date().getFullYear().toString();
  
  return useMemo(() => {
    return computeBudgetItemPaymentStatus(
      itemName,
      expectedAmount,
      targetMonth,
      targetYear,
      transactions
    );
  }, [itemName, expectedAmount, transactions, targetMonth, targetYear]);
}
