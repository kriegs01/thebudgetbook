/**
 * Installment Payment Schedules Adapter
 * 
 * Converts between Supabase database schema and frontend types for installment payment schedules.
 */

import type { SupabaseInstallmentPaymentSchedule } from '../types/supabase';
import type { InstallmentPaymentSchedule } from '../../types';

/**
 * Convert Supabase installment payment schedule to frontend type
 */
export const supabaseInstallmentPaymentScheduleToFrontend = (
  schedule: SupabaseInstallmentPaymentSchedule
): InstallmentPaymentSchedule => {
  return {
    id: schedule.id,
    installmentId: schedule.installment_id,
    paymentNumber: schedule.payment_number,
    month: schedule.month,
    year: schedule.year,
    expectedAmount: schedule.expected_amount,
    amountPaid: schedule.amount_paid || undefined,
    paid: schedule.paid,
    datePaid: schedule.date_paid || undefined,
    receipt: schedule.receipt || undefined,
    accountId: schedule.account_id || undefined,
    dueDate: schedule.due_date || undefined,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
  };
};

/**
 * Convert frontend installment payment schedule to Supabase type
 */
export const frontendInstallmentPaymentScheduleToSupabase = (
  schedule: InstallmentPaymentSchedule
): Omit<SupabaseInstallmentPaymentSchedule, 'id' | 'created_at' | 'updated_at'> => {
  return {
    installment_id: schedule.installmentId,
    payment_number: schedule.paymentNumber,
    month: schedule.month,
    year: schedule.year,
    expected_amount: schedule.expectedAmount,
    amount_paid: schedule.amountPaid || null,
    paid: schedule.paid,
    date_paid: schedule.datePaid || null,
    receipt: schedule.receipt || null,
    account_id: schedule.accountId || null,
    due_date: schedule.dueDate || null,
  };
};

/**
 * Convert array of Supabase installment payment schedules to frontend types
 */
export const supabaseInstallmentPaymentSchedulesToFrontend = (
  schedules: SupabaseInstallmentPaymentSchedule[]
): InstallmentPaymentSchedule[] => {
  return schedules.map(supabaseInstallmentPaymentScheduleToFrontend);
};
