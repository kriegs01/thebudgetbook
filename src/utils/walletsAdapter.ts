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
  // 🟢 NEW: Map the timing property (defaulting to 'split' just in case)
  timing: row.timing || 'split', 
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
  // 🟢 NEW: Pass the timing property back to the database
  timing: wallet.timing, 
});

/**
 * Convert array of Supabase wallet rows to frontend Wallet array
 */
export const supabaseWalletsToFrontend = (rows: SupabaseWallet[]): Wallet[] =>
  rows.map(supabaseWalletToFrontend);
