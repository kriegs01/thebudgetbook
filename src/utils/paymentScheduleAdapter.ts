/**
 * Payment Schedule Integration Helper
 * 
 * Provides utility functions to integrate the new payment_schedules system
 * with existing UI components that use the old JSON-based schedule format.
 * 
 * This maintains backward compatibility while enabling the new features.
 */

import type { SupabasePaymentSchedule } from '../types/supabase';
import type { PaymentSchedule } from '../../types';

/**
 * Convert a Supabase payment schedule to the frontend PaymentSchedule format
 * This allows existing UI components to work with the new database structure
 */
export function supabasePaymentScheduleToFrontend(
  schedule: SupabasePaymentSchedule
): PaymentSchedule {
  return {
    id: schedule.id,
    month: schedule.schedule_month,
    year: schedule.schedule_year,
    expectedAmount: schedule.expected_amount,
    amountPaid: schedule.amount_paid !== null ? schedule.amount_paid : undefined,
    receipt: schedule.receipt || undefined,
    datePaid: schedule.date_paid || undefined,
    accountId: schedule.account_id || undefined,
  };
}

/**
 * Convert an array of Supabase payment schedules to frontend format
 */
export function supabasePaymentSchedulesToFrontend(
  schedules: SupabasePaymentSchedule[]
): PaymentSchedule[] {
  return schedules.map(supabasePaymentScheduleToFrontend);
}

/**
 * Check if a payment schedule is paid
 */
export function isSchedulePaid(schedule: SupabasePaymentSchedule | PaymentSchedule): boolean {
  if ('amount_paid' in schedule) {
    return schedule.amount_paid !== null;
  } else {
    return schedule.amountPaid !== undefined;
  }
}

/**
 * Get the display amount for a schedule
 */
export function getScheduleDisplayAmount(schedule: SupabasePaymentSchedule | PaymentSchedule): number {
  if ('expected_amount' in schedule) {
    return schedule.expected_amount;
  } else {
    return schedule.expectedAmount;
  }
}

/**
 * Get the paid amount for a schedule
 */
export function getSchedulePaidAmount(schedule: SupabasePaymentSchedule | PaymentSchedule): number | undefined {
  if ('amount_paid' in schedule) {
    return schedule.amount_paid || undefined;
  } else {
    return schedule.amountPaid;
  }
}
