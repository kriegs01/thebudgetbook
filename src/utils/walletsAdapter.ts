/**
 * Wallets Adapter
 *
 * Converts between Supabase database schema and frontend types for wallets.
 */

import type { SupabaseWallet } from '../types/supabase';
import type { Wallet } from '../../types';

/**
 * Convert Supabase wallet row to frontend Wallet type
 */
export const supabaseWalletToFrontend = (row: SupabaseWallet): Wallet => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  amount: row.amount,
  accountId: row.account_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Convert frontend Wallet to Supabase wallet shape (for insert/update)
 */
export const frontendWalletToSupabase = (wallet: Wallet): Omit<SupabaseWallet, 'id' | 'created_at' | 'updated_at' | 'user_id'> => ({
  name: wallet.name,
  amount: wallet.amount,
  account_id: wallet.accountId,
});

/**
 * Convert array of Supabase wallet rows to frontend Wallet array
 */
export const supabaseWalletsToFrontend = (rows: SupabaseWallet[]): Wallet[] =>
  rows.map(supabaseWalletToFrontend);
