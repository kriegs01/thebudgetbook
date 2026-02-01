/**
 * Payment Schedules Service
 * 
 * Provides CRUD operations for the payment_schedules table in Supabase.
 * This service replaces the legacy JSONB schedules array in the billers table.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabasePaymentSchedule,
  CreatePaymentScheduleInput,
  UpdatePaymentScheduleInput,
} from '../types/supabase';

/**
 * Get all payment schedules
 * Note: Schedules are sorted client-side by year and month order, not by database
 */
export const getAllPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .order('schedule_year', { ascending: true });

    if (error) throw error;
    
    // Sort client-side by month order (not alphabetically)
    const sortedData = data ? sortSchedulesChronologically(data) : null;
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific biller
 * Note: Schedules are sorted client-side by year and month order, not by database
 */
export const getPaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .order('schedule_year', { ascending: true });

    if (error) throw error;
    
    // Sort client-side by month order (not alphabetically)
    const sortedData = data ? sortSchedulesChronologically(data) : null;
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules for biller:', error);
    return { data: null, error };
  }
};

/**
 * Get a single payment schedule by ID
 */
export const getPaymentScheduleById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific month and year
 */
export const getPaymentSchedulesByMonthYear = async (month: string, year: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('schedule_month', month)
      .eq('schedule_year', year);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by month/year:', error);
    return { data: null, error };
  }
};

/**
 * Get a specific payment schedule for a biller by month and year
 */
export const getPaymentScheduleByBillerMonthYear = async (
  billerId: string,
  month: string,
  year: string
) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .eq('schedule_month', month)
      .eq('schedule_year', year)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule by biller/month/year:', error);
    return { data: null, error };
  }
};

/**
 * Create a new payment schedule
 */
export const createPaymentSchedule = async (schedule: CreatePaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .insert([schedule])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Create multiple payment schedules in batch
 */
export const createPaymentSchedulesBatch = async (schedules: CreatePaymentScheduleInput[]) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .insert(schedules)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedules batch:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing payment schedule
 */
export const updatePaymentSchedule = async (id: string, updates: UpdatePaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Mark a payment schedule as paid
 */
export const markPaymentScheduleAsPaid = async (
  id: string,
  amountPaid: number,
  datePaid: string,
  accountId?: string,
  receipt?: string
) => {
  try {
    const updates: UpdatePaymentScheduleInput = {
      amount_paid: amountPaid,
      date_paid: datePaid,
      account_id: accountId || null,
      receipt: receipt || null,
    };

    const { data, error } = await supabase
      .from('payment_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error marking payment schedule as paid:', error);
    return { data: null, error };
  }
};

/**
 * Delete a payment schedule
 */
export const deletePaymentSchedule = async (id: string) => {
  try {
    const { error } = await supabase
      .from('payment_schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedule:', error);
    return { error };
  }
};

/**
 * Delete all payment schedules for a biller
 */
export const deletePaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { error } = await supabase
      .from('payment_schedules')
      .delete()
      .eq('biller_id', billerId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedules for biller:', error);
    return { error };
  }
};

/**
 * Month order for proper chronological sorting
 */
const MONTHS_ORDERED = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Sort payment schedules by year then month in chronological order
 */
export const sortSchedulesChronologically = (schedules: SupabasePaymentSchedule[]): SupabasePaymentSchedule[] => {
  return schedules.sort((a, b) => {
    // First sort by year
    if (a.schedule_year !== b.schedule_year) {
      return Number(a.schedule_year) - Number(b.schedule_year);
    }
    // Then sort by month order (not alphabetically)
    return MONTHS_ORDERED.indexOf(a.schedule_month) - MONTHS_ORDERED.indexOf(b.schedule_month);
  });
};

/**
 * Generate payment schedules for a biller from activation month through end of activation year
 * Used when creating or updating a biller
 */
export const generateSchedulesForBiller = (
  billerId: string,
  activationDate: { month: string; year: string },
  deactivationDate: { month: string; year: string } | undefined,
  expectedAmount: number
): CreatePaymentScheduleInput[] => {
  const schedules: CreatePaymentScheduleInput[] = [];
  
  const activationMonthIndex = MONTHS_ORDERED.indexOf(activationDate.month);
  const activationYear = parseInt(activationDate.year);
  
  if (activationMonthIndex === -1) {
    console.error(`Invalid activation month: ${activationDate.month}`);
    return schedules;
  }
  
  // Calculate deactivation if provided
  let deactivationMonthIndex = -1;
  let deactivationYear = -1;
  if (deactivationDate) {
    deactivationMonthIndex = MONTHS_ORDERED.indexOf(deactivationDate.month);
    deactivationYear = parseInt(deactivationDate.year);
  }

  // Generate schedules from activation month through December of activation year
  // This creates schedules only for the current year, in calendar order
  for (let monthIndex = activationMonthIndex; monthIndex < 12; monthIndex++) {
    // Check if we've reached deactivation date in the same year
    if (deactivationDate && 
        activationYear === deactivationYear && 
        monthIndex > deactivationMonthIndex) {
      break;
    }

    schedules.push({
      biller_id: billerId,
      schedule_month: MONTHS_ORDERED[monthIndex],
      schedule_year: activationYear.toString(),
      expected_amount: expectedAmount,
      amount_paid: null,
      receipt: null,
      date_paid: null,
      account_id: null,
    });
  }

  return schedules;
};
