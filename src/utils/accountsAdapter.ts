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
    type: supabaseAccount.type as 'Debit' | 'Credit',
    creditLimit: supabaseAccount.credit_limit ?? undefined,
    billingDate: supabaseAccount.billing_date ?? undefined,
    dueDate: supabaseAccount.due_date ?? undefined,
    status: (supabaseAccount.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    deactivationDate: supabaseAccount.deactivation_date ?? undefined,
  };
};

/**
 * Convert frontend Account to Supabase account type.
 *
 * `deactivation_date` is intentionally omitted when it has no value so that
 * routine create/edit operations never reference a column that may not yet
 * exist in the database schema (avoids PGRST204 schema-cache errors when the
 * add_status_to_accounts migration has not been applied yet).
 * Explicit deactivation / reactivation flows set `deactivation_date` directly
 * through their own update payloads.
 */
export const frontendAccountToSupabase = (account: Account): Omit<SupabaseAccount, 'id' | 'created_at' | 'user_id'> => {
  const base: Omit<SupabaseAccount, 'id' | 'created_at' | 'user_id' | 'deactivation_date'> = {
    bank: account.bank,
    classification: account.classification,
    balance: account.balance,
    type: account.type,
    credit_limit: account.creditLimit ?? null,
    billing_date: account.billingDate ?? null,
    due_date: account.dueDate ?? null,
    status: account.status ?? 'active',
  };
  if (account.deactivationDate != null) {
    return { ...base, deactivation_date: account.deactivationDate };
  }
  return base as Omit<SupabaseAccount, 'id' | 'created_at' | 'user_id'>;
};

/**
 * Convert array of Supabase accounts to frontend Accounts
 */
export const supabaseAccountsToFrontend = (supabaseAccounts: SupabaseAccount[]): Account[] => {
  return supabaseAccounts.map(supabaseAccountToFrontend);
};
