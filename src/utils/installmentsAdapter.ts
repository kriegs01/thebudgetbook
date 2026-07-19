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
    due_date: supabaseInstallment.due_date,
    
    isMigrated: !!supabaseInstallment.is_migrated, 
    isArchived: !!supabaseInstallment.is_archived
  };
};

/**
 * Convert frontend Installment to Supabase installment type
 */
export const frontendInstallmentToSupabase = (installment: Installment): Omit<SupabaseInstallment, 'id'> => {
  const termDurationNum = parseInt(installment.termDuration.replace(/\D/g, ''), 10) || 0;
  
  let startDateFormatted: string | null = null;
  if (installment.startDate) {
    startDateFormatted = `${installment.startDate}-01`;
  }
  
  if (!installment.accountId || installment.accountId.trim() === '') {
    throw new Error('Account ID is required.');
  }
  
  return {
    name: installment.name,
    total_amount: installment.totalAmount,
    monthly_amount: installment.monthlyAmount,
    term_duration: termDurationNum,
    paid_amount: installment.paidAmount,
    account_id: installment.accountId,
    start_date: startDateFormatted,
    timing: installment.timing || null,
    
    // Correct mapping to match your types.ts and formData
    due_date: installment.due_date || null,
    is_migrated: !!(installment.is_migrated || installment.isMigrated), 
    is_archived: !!installment.isArchived,
  };
};

/**
 * Convert array of Supabase installments to frontend Installments
 */
export const supabaseInstallmentsToFrontend = (supabaseInstallments: SupabaseInstallment[]): Installment[] => {
  return supabaseInstallments.map(supabaseInstallmentToFrontend);
};
