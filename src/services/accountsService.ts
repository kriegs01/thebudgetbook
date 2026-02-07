/**
 * Accounts Service
 * 
 * Provides CRUD operations for the accounts table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseAccount,
  CreateAccountInput,
  UpdateAccountInput,
} from '../types/supabase';
import { supabaseAccountToFrontend, supabaseAccountsToFrontend, frontendAccountToSupabase } from '../utils/accountsAdapter';
import { calculateAccountBalance } from '../utils/accountBalanceCalculator';
import { getAllTransactions } from './transactionsService';
import type { Account } from '../../types';

/**
 * Get all accounts
 */
export const getAllAccounts = async () => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return { data: null, error };
  }
};

/**
 * Get a single account by ID
 */
export const getAccountById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching account:', error);
    return { data: null, error };
  }
};

/**
 * Create a new account
 */
export const createAccount = async (account: CreateAccountInput) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .insert([account])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating account:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing account
 */
export const updateAccount = async (id: string, updates: UpdateAccountInput) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating account:', error);
    return { data: null, error };
  }
};

/**
 * Delete an account
 */
export const deleteAccount = async (id: string) => {
  try {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting account:', error);
    return { error };
  }
};

/**
 * Get accounts by type (Debit/Credit)
 */
export const getAccountsByType = async (type: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts by type:', error);
    return { data: null, error };
  }
};

/**
 * Get accounts by classification
 */
export const getAccountsByClassification = async (classification: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('classification', classification)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts by classification:', error);
    return { data: null, error };
  }
};

/**
 * Frontend-friendly functions that return Account types (not SupabaseAccount)
 */

/**
 * Get all accounts (returns frontend Account types)
 */
export const getAllAccountsFrontend = async (): Promise<{ data: Account[] | null; error: any }> => {
  const { data, error } = await getAllAccounts();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseAccountsToFrontend(data), error: null };
};

/**
 * Get a single account by ID (returns frontend Account type)
 */
export const getAccountByIdFrontend = async (id: string): Promise<{ data: Account | null; error: any }> => {
  const { data, error } = await getAccountById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseAccountToFrontend(data), error: null };
};

/**
 * Create a new account (accepts frontend Account type)
 */
export const createAccountFrontend = async (account: Account): Promise<{ data: Account | null; error: any }> => {
  const supabaseAccount = frontendAccountToSupabase(account);
  const { data, error } = await createAccount(supabaseAccount);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseAccountToFrontend(data), error: null };
};

/**
 * Update an existing account (accepts frontend Account type)
 */
export const updateAccountFrontend = async (account: Account): Promise<{ data: Account | null; error: any }> => {
  const supabaseAccount = frontendAccountToSupabase(account);
  const { data, error } = await updateAccount(account.id, supabaseAccount);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseAccountToFrontend(data), error: null };
};

/**
 * Delete an account
 */
export const deleteAccountFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteAccount(id);
};

/**
 * Get all accounts with calculated balances from transactions
 * This function fetches accounts and transactions, then calculates the current balance
 * for each account based on its initial balance and all transactions
 * 
 * @returns Accounts with calculated balances
 */
export const getAllAccountsWithCalculatedBalances = async (): Promise<{ data: Account[] | null; error: any }> => {
  try {
    // Fetch accounts and transactions in parallel
    const [accountsResult, transactionsResult] = await Promise.all([
      getAllAccountsFrontend(),
      getAllTransactions()
    ]);

    if (accountsResult.error) {
      return { data: null, error: accountsResult.error };
    }

    if (transactionsResult.error) {
      console.error('[Accounts] Failed to fetch transactions for balance calculation:', transactionsResult.error);
      // Return accounts with their stored balance if transactions can't be fetched
      return accountsResult;
    }

    const accounts = accountsResult.data || [];
    const transactions = transactionsResult.data || [];

    // Optimize: Group transactions by account_id first (O(n) instead of O(n*m))
    const transactionsByAccount = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      if (tx.payment_method_id) {
        if (!transactionsByAccount.has(tx.payment_method_id)) {
          transactionsByAccount.set(tx.payment_method_id, []);
        }
        transactionsByAccount.get(tx.payment_method_id)!.push(tx);
      }
    }

    // Calculate balances for each account using pre-grouped transactions
    const accountsWithCalculatedBalances = accounts.map(account => {
      const accountTransactions = transactionsByAccount.get(account.id) || [];
      
      // Sort transactions by date (oldest first)
      const sortedTransactions = [...accountTransactions].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Calculate balance based on account type
      let calculatedBalance = account.balance; // Start with initial balance
      
      if (account.type === 'Debit') {
        // For debit accounts: subtract transaction amounts
        calculatedBalance = sortedTransactions.reduce(
          (balance, tx) => balance - tx.amount,
          account.balance
        );
      } else if (account.type === 'Credit') {
        // For credit accounts: add transaction amounts (increases usage/debt)
        calculatedBalance = sortedTransactions.reduce(
          (balance, tx) => balance + tx.amount,
          account.balance
        );
      }
      
      return {
        ...account,
        balance: calculatedBalance
      };
    });

    return { data: accountsWithCalculatedBalances, error: null };
  } catch (error) {
    console.error('[Accounts] Error calculating account balances:', error);
    // Fallback to regular accounts if calculation fails
    return await getAllAccountsFrontend();
  }
};
