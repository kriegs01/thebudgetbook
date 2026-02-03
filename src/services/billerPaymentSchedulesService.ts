/**
 * Biller Payment Schedules Service
 * 
 * Provides CRUD operations for the biller_payment_schedules table in Supabase.
 * Each payment schedule is linked to a parent biller and has an explicit paid status.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseBillerPaymentSchedule,
  CreateBillerPaymentScheduleInput,
  UpdateBillerPaymentScheduleInput,
} from '../types/supabase';

/**
 * Get all payment schedules for a specific biller
 */
export const getPaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .order('year', { ascending: true })
      .order('month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching biller payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get a single payment schedule by ID
 */
export const getPaymentScheduleById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
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
 * Create a new payment schedule
 */
export const createPaymentSchedule = async (schedule: CreateBillerPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
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
 * Update an existing payment schedule
 */
export const updatePaymentSchedule = async (id: string, updates: UpdateBillerPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
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
 * Delete a payment schedule
 */
export const deletePaymentSchedule = async (id: string) => {
  try {
    const { error } = await supabase
      .from('biller_payment_schedules')
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
    const updates: UpdateBillerPaymentScheduleInput = {
      paid: true,
      amount_paid: amountPaid,
      date_paid: datePaid,
      account_id: accountId || null,
      receipt: receipt || null,
    };

    const { data, error } = await supabase
      .from('biller_payment_schedules')
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
 * Get payment schedules by month and year
 */
export const getPaymentSchedulesByMonthYear = async (month: string, year: string) => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
      .select('*, billers(*)')
      .eq('month', month)
      .eq('year', year);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by month/year:', error);
    return { data: null, error };
  }
};

/**
 * Get unpaid payment schedules
 */
export const getUnpaidPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('biller_payment_schedules')
      .select('*, billers(*)')
      .eq('paid', false)
      .order('year', { ascending: true })
      .order('month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching unpaid payment schedules:', error);
    return { data: null, error };
  }
};
