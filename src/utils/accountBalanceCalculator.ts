/**
 * Account Balance Calculator
 * 
 * QA: Utility for recalculating account balances from raw transactions
 * Fix for Issue #5: Implement account balance recalculation
 * 
 * This ensures perfect sync between transactions and account balances by:
 * 1. Starting with an initial balance (could be from account creation or a baseline)
 * 2. Processing all transactions chronologically
 * 3. Calculating the current balance based on transaction flow
 * 
 * For Debit accounts: Balance decreases when transactions are posted
 * For Credit accounts: Balance increases (usage) when transactions are posted, 
 *                      decreases when payments are made
 */

import type { Account } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';

/**
 * Calculate account balance from transactions
 * 
 * @param account - The account to calculate balance for
 * @param transactions - All transactions for this account
 * @param initialBalance - Starting balance (optional, defaults to account's current balance)
 * @returns Calculated current balance
 */
export const calculateAccountBalance = (
  account: Account,
  transactions: SupabaseTransaction[],
  initialBalance?: number
): number => {
  // Use provided initial balance or account's current balance as baseline
  const baseline = initialBalance ?? account.balance;
  
  // Filter transactions for this account
  const accountTransactions = transactions.filter(
    tx => tx.payment_method_id === account.id
  );
  
  // Sort transactions by date (oldest first)
  const sortedTransactions = [...accountTransactions].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Calculate balance based on account type
  if (account.type === 'Debit') {
    // For debit accounts: subtract transaction amounts from balance
    return sortedTransactions.reduce(
      (balance, tx) => balance - tx.amount,
      baseline
    );
  } else if (account.type === 'Credit') {
    // For credit accounts: add transaction amounts (increases usage)
    // The balance represents how much is owed/used
    return sortedTransactions.reduce(
      (balance, tx) => balance + tx.amount,
      baseline
    );
  }
  
  return baseline;
};

/**
 * Calculate available balance for an account
 * 
 * For Debit accounts: Returns the current balance (same as regular balance)
 * For Credit accounts: Returns credit limit minus used amount
 * 
 * @param account - The account to calculate available balance for
 * @param currentBalance - Current balance (usage for credit cards)
 * @returns Available balance
 */
export const calculateAvailableBalance = (
  account: Account,
  currentBalance: number
): number => {
  if (account.type === 'Credit' && account.creditLimit) {
    // For credit accounts: available = limit - used
    return account.creditLimit - currentBalance;
  }
  
  // For debit accounts: available balance is the current balance
  return currentBalance;
};

/**
 * Recalculate all account balances from transactions
 * 
 * @param accounts - All accounts to recalculate
 * @param transactions - All transactions
 * @returns Updated accounts with recalculated balances
 */
export const recalculateAllAccountBalances = (
  accounts: Account[],
  transactions: SupabaseTransaction[]
): Account[] => {
  return accounts.map(account => {
    const newBalance = calculateAccountBalance(account, transactions);
    return {
      ...account,
      balance: newBalance
    };
  });
};

/**
 * Get balance change from a transaction
 * 
 * @param account - The account the transaction is for
 * @param transaction - The transaction
 * @returns The balance change amount (positive = decrease for debit, increase for credit)
 */
export const getTransactionBalanceImpact = (
  account: Account,
  transaction: SupabaseTransaction
): number => {
  if (account.type === 'Debit') {
    // Debit: transaction reduces balance
    return -transaction.amount;
  } else if (account.type === 'Credit') {
    // Credit: transaction increases usage (balance)
    return transaction.amount;
  }
  
  return 0;
};
