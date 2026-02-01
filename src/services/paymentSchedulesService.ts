/**
 * Payment Schedules Service
 * 
 * Provides CRUD operations for the payment_schedules table in Supabase.
 * This service manages unique payment schedules for Billers and Installments,
 * preventing duplicate and misapplied payments.
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
 * Get payment schedules for a specific biller
 */
export const getPaymentSchedulesByBiller = async (billerId: string) => {
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
    console.error('Error fetching biller payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific installment
 */
export const getPaymentSchedulesByInstallment = async (installmentId: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('installment_id', installmentId)
      .order('schedule_year', { ascending: true })
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installment payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific month and year
 */
export const getPaymentSchedulesByMonthYear = async (month: string, year: string, timing?: string) => {
  try {
    let query = supabase
      .from('payment_schedules')
      .select('*')
      .eq('schedule_month', month)
      .eq('schedule_year', year);

    if (timing) {
      query = query.eq('timing', timing);
    }

    const { data, error } = await query;

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
      .from('payment_schedules')
      .select('*')
      .is('amount_paid', null)
      .order('schedule_year', { ascending: true })
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching unpaid payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get paid payment schedules
 */
export const getPaidPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .not('amount_paid', 'is', null)
      .order('date_paid', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching paid payment schedules:', error);
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
  scheduleId: string,
  amountPaid: number,
  datePaid: string,
  accountId: string,
  receipt?: string
) => {
  try {
    const updates: UpdatePaymentScheduleInput = {
      amount_paid: amountPaid,
      date_paid: datePaid,
      account_id: accountId,
      receipt: receipt || null,
    };

    const { data, error } = await supabase
      .from('payment_schedules')
      .update(updates)
      .eq('id', scheduleId)
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
 * Generate payment schedules for a new biller
 * Creates schedules from activation date through a specified number of months ahead
 */
export const generateBillerSchedules = async (
  billerId: string,
  activationDate: { month: string; year: string },
  expectedAmount: number,
  timing: string,
  monthsAhead: number = 12
): Promise<{ data: SupabasePaymentSchedule[] | null; error: any }> => {
  try {
    const schedules: CreatePaymentScheduleInput[] = [];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const startMonthIndex = monthNames.indexOf(activationDate.month);
    const startYear = parseInt(activationDate.year);

    if (startMonthIndex === -1) {
      throw new Error('Invalid activation month');
    }

    // Generate schedules for the specified number of months
    for (let i = 0; i < monthsAhead; i++) {
      const monthIndex = (startMonthIndex + i) % 12;
      const yearOffset = Math.floor((startMonthIndex + i) / 12);
      const scheduleYear = (startYear + yearOffset).toString();
      const scheduleMonth = monthNames[monthIndex];

      schedules.push({
        biller_id: billerId,
        installment_id: null,
        schedule_month: scheduleMonth,
        schedule_year: scheduleYear,
        expected_amount: expectedAmount,
        amount_paid: null,
        date_paid: null,
        receipt: null,
        account_id: null,
        timing: timing,
      });
    }

    return await createPaymentSchedulesBatch(schedules);
  } catch (error) {
    console.error('Error generating biller schedules:', error);
    return { data: null, error };
  }
};

/**
 * Generate payment schedules for a new installment
 * Creates schedules from start date through the term duration
 */
export const generateInstallmentSchedules = async (
  installmentId: string,
  startDate: string, // Format: YYYY-MM
  termDuration: number,
  monthlyAmount: number,
  timing?: string
): Promise<{ data: SupabasePaymentSchedule[] | null; error: any }> => {
  try {
    const schedules: CreatePaymentScheduleInput[] = [];
    const [startYear, startMonth] = startDate.split('-').map(Number);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Generate schedules for each month of the term
    for (let i = 0; i < termDuration; i++) {
      const monthIndex = (startMonth - 1 + i) % 12;
      const yearOffset = Math.floor((startMonth - 1 + i) / 12);
      const scheduleYear = (startYear + yearOffset).toString();
      const scheduleMonth = monthNames[monthIndex];

      schedules.push({
        biller_id: null,
        installment_id: installmentId,
        schedule_month: scheduleMonth,
        schedule_year: scheduleYear,
        expected_amount: monthlyAmount,
        amount_paid: null,
        date_paid: null,
        receipt: null,
        account_id: null,
        timing: timing || null,
      });
    }

    return await createPaymentSchedulesBatch(schedules);
  } catch (error) {
    console.error('Error generating installment schedules:', error);
    return { data: null, error };
  }
};
