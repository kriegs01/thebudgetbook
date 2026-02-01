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
 */
export const getAllPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .order('schedule_year', { ascending: true })
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific biller
 */
export const getPaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .order('schedule_year', { ascending: true })
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
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
 * Generate payment schedules for a biller from activation month forward
 * Used when creating or updating a biller
 */
export const generateSchedulesForBiller = (
  billerId: string,
  activationDate: { month: string; year: string },
  deactivationDate: { month: string; year: string } | undefined,
  expectedAmount: number,
  monthsForward: number = 24 // Generate 24 months forward by default
): CreatePaymentScheduleInput[] => {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const schedules: CreatePaymentScheduleInput[] = [];
  
  const activationMonthIndex = MONTHS.indexOf(activationDate.month);
  const activationYear = parseInt(activationDate.year);
  
  // Calculate deactivation if provided
  let deactivationMonthIndex = -1;
  let deactivationYear = -1;
  if (deactivationDate) {
    deactivationMonthIndex = MONTHS.indexOf(deactivationDate.month);
    deactivationYear = parseInt(deactivationDate.year);
  }

  // Generate schedules from activation month forward
  let currentMonthIndex = activationMonthIndex;
  let currentYear = activationYear;
  
  for (let i = 0; i < monthsForward; i++) {
    // Check if we've reached deactivation date
    if (deactivationDate) {
      if (currentYear > deactivationYear || 
          (currentYear === deactivationYear && currentMonthIndex > deactivationMonthIndex)) {
        break;
      }
    }

    schedules.push({
      biller_id: billerId,
      schedule_month: MONTHS[currentMonthIndex],
      schedule_year: currentYear.toString(),
      expected_amount: expectedAmount,
      amount_paid: null,
      receipt: null,
      date_paid: null,
      account_id: null,
    });

    // Move to next month
    currentMonthIndex++;
    if (currentMonthIndex >= 12) {
      currentMonthIndex = 0;
      currentYear++;
    }
  }

  return schedules;
};
