/**
 * Payment Schedules Service
 * 
 * Provides CRUD operations for the payment_schedules table in Supabase.
 * Manages monthly payment schedules for Billers and Installments.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabasePaymentSchedule,
  CreatePaymentScheduleInput,
  UpdatePaymentScheduleInput,
} from '../types/supabase';
import { formatScheduleMonthFromDate } from '../utils/dateUtils';

/**
 * Get all payment schedules
 */
export const getAllPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
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
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules for biller:', error);
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
      .order('schedule_month', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules for installment:', error);
    return { data: null, error };
  }
};

/**
 * Get a payment schedule for a specific biller and month
 */
export const getPaymentScheduleByBillerAndMonth = async (billerId: string, scheduleMonth: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .eq('schedule_month', scheduleMonth)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule by biller and month:', error);
    return { data: null, error };
  }
};

/**
 * Get a payment schedule for a specific installment and month
 */
export const getPaymentScheduleByInstallmentAndMonth = async (installmentId: string, scheduleMonth: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('installment_id', installmentId)
      .eq('schedule_month', scheduleMonth)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule by installment and month:', error);
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
 * Create multiple payment schedules (bulk insert)
 */
export const createPaymentSchedules = async (schedules: CreatePaymentScheduleInput[]) => {
  try {
    console.log('[paymentSchedulesService] Creating', schedules.length, 'payment schedules');
    console.log('[paymentSchedulesService] First schedule:', schedules[0]);
    
    const { data, error } = await supabase
      .from('payment_schedules')
      .insert(schedules)
      .select();

    if (error) {
      console.error('[paymentSchedulesService] Error creating schedules:', error);
      throw error;
    }
    
    console.log('[paymentSchedulesService] Successfully created', data?.length, 'schedules');
    return { data, error: null };
  } catch (error) {
    console.error('[paymentSchedulesService] Error creating payment schedules:', error);
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
export const deletePaymentSchedulesByBiller = async (billerId: string) => {
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
 * Delete all payment schedules for an installment
 */
export const deletePaymentSchedulesByInstallment = async (installmentId: string) => {
  try {
    const { error } = await supabase
      .from('payment_schedules')
      .delete()
      .eq('installment_id', installmentId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedules for installment:', error);
    return { error };
  }
};

/**
 * Generate payment schedules for a biller
 * Creates schedules for a range of months
 */
export const generateBillerSchedules = async (
  billerId: string,
  expectedAmount: number,
  startMonth: string,
  numberOfMonths: number = 12
): Promise<{ data: SupabasePaymentSchedule[] | null; error: any }> => {
  try {
    // Parse start month (format: YYYY-MM)
    const [year, month] = startMonth.split('-').map(Number);
    const schedules: CreatePaymentScheduleInput[] = [];
    
    // Generate schedules for the specified number of months
    for (let i = 0; i < numberOfMonths; i++) {
      const date = new Date(year, month - 1 + i, 1);
      const scheduleMonth = formatScheduleMonthFromDate(date);
      
      schedules.push({
        biller_id: billerId,
        installment_id: null,
        schedule_month: scheduleMonth,
        expected_amount: expectedAmount,
      });
    }
    
    return await createPaymentSchedules(schedules);
  } catch (error) {
    console.error('Error generating biller schedules:', error);
    return { data: null, error };
  }
};

/**
 * Generate payment schedules for an installment
 * Creates schedules based on start date and term duration
 */
export const generateInstallmentSchedules = async (
  installmentId: string,
  monthlyAmount: number,
  startDate: string,
  termDuration: number
): Promise<{ data: SupabasePaymentSchedule[] | null; error: any }> => {
  try {
    // Parse start date (format: YYYY-MM-DD or YYYY-MM)
    const dateParts = startDate.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const schedules: CreatePaymentScheduleInput[] = [];
    
    // Generate schedules for the term duration (in months)
    for (let i = 0; i < termDuration; i++) {
      const date = new Date(year, month - 1 + i, 1);
      const scheduleMonth = formatScheduleMonthFromDate(date);
      
      schedules.push({
        biller_id: null,
        installment_id: installmentId,
        schedule_month: scheduleMonth,
        expected_amount: monthlyAmount,
      });
    }
    
    return await createPaymentSchedules(schedules);
  } catch (error) {
    console.error('Error generating installment schedules:', error);
    return { data: null, error };
  }
};
