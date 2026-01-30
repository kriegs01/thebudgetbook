/**
 * Savings Adapter
 * 
 * Converts between Supabase database schema and frontend types for savings.
 */

import type { SupabaseSavings } from '../types/supabase';
import type { SavingsJar } from '../../types';

/**
 * Convert Supabase savings to frontend SavingsJar type
 */
export const supabaseSavingsToFrontend = (supabaseSavings: SupabaseSavings): SavingsJar => {
  return {
    id: supabaseSavings.id,
    name: supabaseSavings.name,
    accountId: supabaseSavings.account_id,
    currentBalance: supabaseSavings.current_balance,
  };
};

/**
 * Convert frontend SavingsJar to Supabase savings type
 */
export const frontendSavingsToSupabase = (savingsJar: SavingsJar): Omit<SupabaseSavings, 'id'> => {
  return {
    name: savingsJar.name,
    account_id: savingsJar.accountId,
    current_balance: savingsJar.currentBalance,
  };
};

/**
 * Convert array of Supabase savings to frontend SavingsJars
 */
export const supabaseSavingsArrayToFrontend = (supabaseSavingsArray: SupabaseSavings[]): SavingsJar[] => {
  return supabaseSavingsArray.map(supabaseSavingsToFrontend);
};
