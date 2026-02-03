/**
 * Biller Payment Schedules Adapter
 * 
 * Converts between Supabase database schema and frontend types for biller payment schedules.
 */

import type { SupabaseBillerPaymentSchedule } from '../types/supabase';
import type { BillerPaymentSchedule } from '../../types';

/**
 * Convert Supabase biller payment schedule to frontend type
 */
export const supabaseBillerPaymentScheduleToFrontend = (
  schedule: SupabaseBillerPaymentSchedule
): BillerPaymentSchedule => {
  return {
    id: schedule.id,
    billerId: schedule.biller_id,
    month: schedule.month,
    year: schedule.year,
    expectedAmount: schedule.expected_amount,
    amountPaid: schedule.amount_paid || undefined,
    paid: schedule.paid,
    datePaid: schedule.date_paid || undefined,
    receipt: schedule.receipt || undefined,
    accountId: schedule.account_id || undefined,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
  };
};

/**
 * Convert frontend biller payment schedule to Supabase type
 */
export const frontendBillerPaymentScheduleToSupabase = (
  schedule: BillerPaymentSchedule
): Omit<SupabaseBillerPaymentSchedule, 'id' | 'created_at' | 'updated_at'> => {
  return {
    biller_id: schedule.billerId,
    month: schedule.month,
    year: schedule.year,
    expected_amount: schedule.expectedAmount,
    amount_paid: schedule.amountPaid || null,
    paid: schedule.paid,
    date_paid: schedule.datePaid || null,
    receipt: schedule.receipt || null,
    account_id: schedule.accountId || null,
  };
};

/**
 * Convert array of Supabase biller payment schedules to frontend types
 */
export const supabaseBillerPaymentSchedulesToFrontend = (
  schedules: SupabaseBillerPaymentSchedule[]
): BillerPaymentSchedule[] => {
  return schedules.map(supabaseBillerPaymentScheduleToFrontend);
};
