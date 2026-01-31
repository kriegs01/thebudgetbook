/**
 * Installments Adapter
 * 
 * Converts between Supabase database schema and frontend types for installments.
 */

import type { SupabaseInstallment } from '../types/supabase';
import type { Installment } from '../../types';

/**
 * Convert Supabase installment to frontend Installment type
 */
export const supabaseInstallmentToFrontend = (supabaseInstallment: SupabaseInstallment): Installment => {
  // Convert date from YYYY-MM-DD to YYYY-MM format for month input
  let startDateFormatted: string | undefined = undefined;
  if (supabaseInstallment.start_date) {
    const date = new Date(supabaseInstallment.start_date);
    startDateFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  return {
    id: supabaseInstallment.id,
    name: supabaseInstallment.name,
    totalAmount: supabaseInstallment.total_amount,
    monthlyAmount: supabaseInstallment.monthly_amount,
    termDuration: `${supabaseInstallment.term_duration} months`,
    paidAmount: supabaseInstallment.paid_amount,
    accountId: supabaseInstallment.account_id,
    startDate: startDateFormatted,
    // PROTOTYPE: Handle timing field conversion
    timing: (supabaseInstallment.timing === '1/2' || supabaseInstallment.timing === '2/2') 
      ? supabaseInstallment.timing 
      : undefined,
  };
};

/**
 * Convert frontend Installment to Supabase installment type
 */
export const frontendInstallmentToSupabase = (installment: Installment): Omit<SupabaseInstallment, 'id'> => {
  // Extract the numeric value from termDuration (e.g., "12 months" -> 12)
  const termDurationNum = parseInt(installment.termDuration.replace(/\D/g, ''), 10) || 0;
  
  // Convert YYYY-MM format to YYYY-MM-01 for PostgreSQL DATE type
  let startDateFormatted: string | null = null;
  if (installment.startDate) {
    // Add first day of the month to make it a valid date
    startDateFormatted = `${installment.startDate}-01`;
  }
  
  return {
    name: installment.name,
    total_amount: installment.totalAmount,
    monthly_amount: installment.monthlyAmount,
    term_duration: termDurationNum,
    paid_amount: installment.paidAmount,
    account_id: installment.accountId,
    start_date: startDateFormatted,
    // PROTOTYPE: Include timing field if set
    timing: installment.timing || null,
  };
};

/**
 * Convert array of Supabase installments to frontend Installments
 */
export const supabaseInstallmentsToFrontend = (supabaseInstallments: SupabaseInstallment[]): Installment[] => {
  return supabaseInstallments.map(supabaseInstallmentToFrontend);
};
