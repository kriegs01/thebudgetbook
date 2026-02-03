/**
 * Payment Schedules Service
 * 
 * Service layer for payment_schedules table operations.
 * This is the single source of truth for payment schedules for both billers and installments.
 */

import { supabase } from '../config/supabaseClient';
import type { 
  SupabasePaymentSchedule, 
  CreatePaymentScheduleInput, 
  UpdatePaymentScheduleInput 
} from '../types/supabase';
import type { PaymentSchedule } from '../../types';

/**
 * Convert Supabase payment schedule to frontend PaymentSchedule type
 */
export const supabasePaymentScheduleToFrontend = (
  supabaseSchedule: SupabasePaymentSchedule
): PaymentSchedule => {
  return {
    id: supabaseSchedule.id,
    month: supabaseSchedule.month,
    year: supabaseSchedule.year.toString(),
    expectedAmount: supabaseSchedule.expected_amount,
    amountPaid: supabaseSchedule.amount_paid || undefined,
    receipt: supabaseSchedule.receipt || undefined,
    datePaid: supabaseSchedule.date_paid || undefined,
    accountId: supabaseSchedule.account_id || undefined,
    billerId: supabaseSchedule.biller_id || undefined,
    installmentId: supabaseSchedule.installment_id || undefined,
  };
};

/**
 * Convert frontend PaymentSchedule to Supabase payment schedule type
 */
export const frontendPaymentScheduleToSupabase = (
  schedule: Partial<PaymentSchedule>
): Partial<CreatePaymentScheduleInput> => {
  return {
    month: schedule.month,
    year: schedule.year ? parseInt(schedule.year, 10) : undefined,
    expected_amount: schedule.expectedAmount,
    amount_paid: schedule.amountPaid || 0,
    receipt: schedule.receipt || null,
    date_paid: schedule.datePaid || null,
    account_id: schedule.accountId || null,
    biller_id: schedule.billerId || null,
    installment_id: schedule.installmentId || null,
  };
};

/**
 * Get all payment schedules for a specific biller
 */
export const getPaymentSchedulesByBillerId = async (
  billerId: string
): Promise<{ data: PaymentSchedule[] | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('biller_id', billerId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? data.map(supabasePaymentScheduleToFrontend) : null,
    error: null,
  };
};

/**
 * Get all payment schedules for a specific installment
 */
export const getPaymentSchedulesByInstallmentId = async (
  installmentId: string
): Promise<{ data: PaymentSchedule[] | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('installment_id', installmentId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? data.map(supabasePaymentScheduleToFrontend) : null,
    error: null,
  };
};

/**
 * Get payment schedules for a specific month and year
 */
export const getPaymentSchedulesByMonthYear = async (
  month: string,
  year: number
): Promise<{ data: PaymentSchedule[] | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('month', month)
    .eq('year', year);

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? data.map(supabasePaymentScheduleToFrontend) : null,
    error: null,
  };
};

/**
 * Get a specific payment schedule by biller, month, and year
 */
export const getPaymentScheduleByBillerMonthYear = async (
  billerId: string,
  month: string,
  year: number
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('biller_id', billerId)
    .eq('month', month)
    .eq('year', year)
    .single();

  if (error) {
    // Return null for no data found (not an error in this context)
    if (error.code === 'PGRST116') {
      return { data: null, error: null };
    }
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? supabasePaymentScheduleToFrontend(data) : null,
    error: null,
  };
};

/**
 * Get a specific payment schedule by installment, month, and year
 */
export const getPaymentScheduleByInstallmentMonthYear = async (
  installmentId: string,
  month: string,
  year: number
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('installment_id', installmentId)
    .eq('month', month)
    .eq('year', year)
    .single();

  if (error) {
    // Return null for no data found (not an error in this context)
    if (error.code === 'PGRST116') {
      return { data: null, error: null };
    }
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? supabasePaymentScheduleToFrontend(data) : null,
    error: null,
  };
};

/**
 * Create a new payment schedule
 */
export const createPaymentSchedule = async (
  schedule: CreatePaymentScheduleInput
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .insert(schedule)
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? supabasePaymentScheduleToFrontend(data) : null,
    error: null,
  };
};

/**
 * Update an existing payment schedule
 */
export const updatePaymentSchedule = async (
  scheduleId: string,
  updates: UpdatePaymentScheduleInput
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .update(updates)
    .eq('id', scheduleId)
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? supabasePaymentScheduleToFrontend(data) : null,
    error: null,
  };
};

/**
 * Delete a payment schedule
 */
export const deletePaymentSchedule = async (
  scheduleId: string
): Promise<{ error: Error | null }> => {
  const { error } = await supabase
    .from('payment_schedules')
    .delete()
    .eq('id', scheduleId);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
};

/**
 * Create or update a payment schedule (upsert)
 * Uses month, year, and either biller_id or installment_id as unique constraint
 */
export const upsertPaymentSchedule = async (
  schedule: CreatePaymentScheduleInput
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const { data, error } = await supabase
    .from('payment_schedules')
    .upsert(schedule, {
      onConflict: schedule.biller_id 
        ? 'biller_id,month,year' 
        : 'installment_id,month,year',
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: data ? supabasePaymentScheduleToFrontend(data) : null,
    error: null,
  };
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
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const updates: UpdatePaymentScheduleInput = {
    amount_paid: amountPaid,
    date_paid: datePaid,
    account_id: accountId,
    receipt: receipt || null,
  };

  return updatePaymentSchedule(scheduleId, updates);
};

/**
 * Mark a payment schedule as unpaid (clear payment info)
 */
export const markPaymentScheduleAsUnpaid = async (
  scheduleId: string
): Promise<{ data: PaymentSchedule | null; error: Error | null }> => {
  const updates: UpdatePaymentScheduleInput = {
    amount_paid: 0,
    date_paid: null,
    account_id: null,
    receipt: null,
  };

  return updatePaymentSchedule(scheduleId, updates);
};
