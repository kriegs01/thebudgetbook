/**
 * Billers Adapter
 * 
 * Converts between Supabase database schema and frontend types for billers.
 */

import type { SupabaseBiller } from '../types/supabase';
import type { Biller } from '../../types';

/**
 * Convert Supabase biller to frontend Biller type
 */
export const supabaseBillerToFrontend = (supabaseBiller: SupabaseBiller): Biller => {
  return {
    id: supabaseBiller.id,
    name: supabaseBiller.name,
    category: supabaseBiller.category,
    dueDate: supabaseBiller.due_date,
    expectedAmount: supabaseBiller.expected_amount,
    timing: supabaseBiller.timing as '1/2' | '2/2',
    activationDate: supabaseBiller.activation_date,
    deactivationDate: supabaseBiller.deactivation_c || undefined,
    status: supabaseBiller.status as 'active' | 'inactive',
    schedules: supabaseBiller.schedules || [],
    linkedAccountId: supabaseBiller.linked_account_id || undefined
  };
};

/**
 * Convert frontend Biller to Supabase biller type
 */
export const frontendBillerToSupabase = (biller: Biller): Omit<SupabaseBiller, 'id'> => {
  return {
    name: biller.name,
    category: biller.category,
    due_date: biller.dueDate,
    expected_amount: biller.expectedAmount,
    timing: biller.timing,
    activation_date: biller.activationDate,
    deactivation_c: biller.deactivationDate || null,
    status: biller.status,
    schedules: biller.schedules,
    linked_account_id: biller.linkedAccountId || null
  };
};

/**
 * Convert array of Supabase billers to frontend Billers
 */
export const supabaseBillersToFrontend = (supabaseBillers: SupabaseBiller[]): Biller[] => {
  return supabaseBillers.map(supabaseBillerToFrontend);
};
