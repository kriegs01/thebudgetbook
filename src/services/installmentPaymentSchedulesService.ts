/**
 * Installment Payment Schedules Service
 * 
 * Provides CRUD operations for the installment_payment_schedules table in Supabase.
 * Each payment schedule is linked to a parent installment and has an explicit paid status.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseInstallmentPaymentSchedule,
  CreateInstallmentPaymentScheduleInput,
  UpdateInstallmentPaymentScheduleInput,
} from '../types/supabase';

/**
 * Get all payment schedules for a specific installment
 */
export const getPaymentSchedulesByInstallmentId = async (installmentId: string) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
      .select('*')
      .eq('installment_id', installmentId)
      .order('payment_number', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installment payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get a single payment schedule by ID
 */
export const getPaymentScheduleById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
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
export const createPaymentSchedule = async (schedule: CreateInstallmentPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
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
 * Bulk create payment schedules for an installment
 */
export const createPaymentSchedules = async (schedules: CreateInstallmentPaymentScheduleInput[]) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
      .insert(schedules)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing payment schedule
 */
export const updatePaymentSchedule = async (id: string, updates: UpdateInstallmentPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
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
      .from('installment_payment_schedules')
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
    const updates: UpdateInstallmentPaymentScheduleInput = {
      paid: true,
      amount_paid: amountPaid,
      date_paid: datePaid,
      account_id: accountId || null,
      receipt: receipt || null,
    };

    const { data, error } = await supabase
      .from('installment_payment_schedules')
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
      .from('installment_payment_schedules')
      .select('*, installments(*)')
      .eq('month', month)
      .eq('year', year)
      .order('payment_number', { ascending: true });

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
      .from('installment_payment_schedules')
      .select('*, installments(*)')
      .eq('paid', false)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching unpaid payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get next unpaid payment for an installment
 */
export const getNextUnpaidPayment = async (installmentId: string) => {
  try {
    const { data, error } = await supabase
      .from('installment_payment_schedules')
      .select('*')
      .eq('installment_id', installmentId)
      .eq('paid', false)
      .order('payment_number', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching next unpaid payment:', error);
    return { data: null, error };
  }
};
