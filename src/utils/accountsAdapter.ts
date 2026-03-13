/**
 * Accounts Adapter
 * 
 * Converts between Supabase database schema and frontend types for accounts.
 */

import type { SupabaseAccount } from '../types/supabase';
import type { Account } from '../../types';

/**
 * Convert Supabase account to frontend Account type
 */
export const supabaseAccountToFrontend = (supabaseAccount: SupabaseAccount): Account => {
  return {
    id: supabaseAccount.id,
    bank: supabaseAccount.bank,
    classification: supabaseAccount.classification as any,
    balance: supabaseAccount.balance,
    // openingBalance comes from the dedicated DB column, NOT from `balance`.
    // Defaults to 0 if the column is absent (pre-migration) or NULL so that
    // the balance calculator starts from a clean 0 baseline in all cases.
    openingBalance: supabaseAccount.opening_balance ?? 0,
    type: supabaseAccount.type as 'Debit' | 'Credit',
    creditLimit: supabaseAccount.credit_limit ?? undefined,
    billingDate: supabaseAccount.billing_date ?? undefined,
    dueDate: supabaseAccount.due_date ?? undefined,
  };
};

/**
 * Convert frontend Account to Supabase account type
 */
export const frontendAccountToSupabase = (account: Account): Omit<SupabaseAccount, 'id' | 'created_at'> => {
  return {
    bank: account.bank,
    classification: account.classification,
    balance: account.balance,
    opening_balance: account.openingBalance ?? 0, // Write to the dedicated opening_balance column
    type: account.type,
    credit_limit: account.creditLimit ?? null,
    billing_date: account.billingDate ?? null,
    due_date: account.dueDate ?? null,
  };
};

/**
 * Convert array of Supabase accounts to frontend Accounts
 */
export const supabaseAccountsToFrontend = (supabaseAccounts: SupabaseAccount[]): Account[] => {
  return supabaseAccounts.map(supabaseAccountToFrontend);
};
