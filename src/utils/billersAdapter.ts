/**
 * Billers Adapter
 * 
 * Converts between Supabase database schema and frontend types for billers.
 */

import type { SupabaseBiller } from '../types/supabase';
import type { Biller } from '../../types';

/**
 * Generate a unique ID for a payment schedule
 * Uses month and year for deterministic prefix to aid debugging
 */
export const generateScheduleId = (month: string, year: string): string => {
  const randomPart = Math.random().toString(36).substr(2, 9);
  const timestamp = Date.now().toString(36);
  return `${month.substr(0, 3).toLowerCase()}-${year}-${randomPart}-${timestamp}`;
};

/**
 * Convert Supabase biller to frontend Biller type
 * Ensures all schedules have unique IDs for payment tracking
 * Note: schedules are now stored in payment_schedules table, but kept for backwards compatibility
 */
export const supabaseBillerToFrontend = (supabaseBiller: SupabaseBiller): Biller => {
  // Ensure all schedules have IDs (migration for existing data)
  // This is kept for backwards compatibility with legacy data
  const schedules = (supabaseBiller.schedules || []).map(schedule => {
    if (!schedule.id) {
      // Generate ID for schedules that don't have one
      return {
        ...schedule,
        id: generateScheduleId(schedule.month, schedule.year)
      };
    }
    return schedule;
  });
  
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
    schedules: schedules, // Kept for backwards compatibility, but should use payment_schedules table
    linkedAccountId: supabaseBiller.linked_account_id || undefined // ENHANCEMENT: Support linked credit accounts
  };
};

/**
 * Convert frontend Biller to Supabase biller type
 * Note: schedules are now stored in payment_schedules table, but kept for backwards compatibility
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
    schedules: biller.schedules || [], // Empty array if not provided, schedules are in payment_schedules table
    linked_account_id: biller.linkedAccountId || null // ENHANCEMENT: Support linked credit accounts
  };
};

/**
 * Convert array of Supabase billers to frontend Billers
 */
export const supabaseBillersToFrontend = (supabaseBillers: SupabaseBiller[]): Biller[] => {
  return supabaseBillers.map(supabaseBillerToFrontend);
};
