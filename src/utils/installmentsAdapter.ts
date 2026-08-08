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
    // 🟢 Use supabaseInstallment, not item!
    id: supabaseInstallment.id,
    name: supabaseInstallment.name,
    totalAmount: supabaseInstallment.total_amount,
    principalAmount: supabaseInstallment.principal_amount,
    monthlyAmount: supabaseInstallment.monthly_amount,
    termDuration: supabaseInstallment.term_duration?.toString() || '',
    paidAmount: supabaseInstallment.paid_amount || 0,
    accountId: supabaseInstallment.account_id || '',
    
    // 🟢 Use the formatted date variable you already calculated
    startDate: startDateFormatted || '',
    
    timing: supabaseInstallment.timing,
    due_date: supabaseInstallment.due_date,
    isMigrated: supabaseInstallment.is_migrated,
    isArchived: supabaseInstallment.is_archived,
    
    // 🟢 Safely map the Budee/IOU fields
    funding_friend_id: supabaseInstallment.funding_friend_id || '',
    debtor_friend_id: supabaseInstallment.debtor_friend_id || '',
    expected_account_id: supabaseInstallment.expected_account_id || '',
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
  
  try {
    return {
      name: installment.name,
      principal_amount: installment.principalAmount || 0,
      total_amount: installment.totalAmount,
      monthly_amount: installment.monthlyAmount,
      term_duration: termDurationNum,
      paid_amount: installment.paidAmount,
      
      // 🟢 Safely allow null or empty account IDs for Budee proxy pays
      account_id: installment.accountId && installment.accountId.trim() !== '' ? installment.accountId : null,
      
      start_date: startDateFormatted,
      timing: installment.timing || null,
      due_date: installment.due_date || null,
      is_migrated: !!(installment.is_migrated || installment.isMigrated), 
      is_archived: !!installment.isArchived,
      
      funding_friend_id: installment.funding_friend_id && installment.funding_friend_id.trim() !== '' ? installment.funding_friend_id : null,
      debtor_friend_id: installment.debtor_friend_id && installment.debtor_friend_id.trim() !== '' ? installment.debtor_friend_id : null,
      expected_account_id: installment.expected_account_id && installment.expected_account_id.trim() !== '' ? installment.expected_account_id : null,
    };
  } catch (err) {
    console.error("CRASH in frontendInstallmentToSupabase with object:", installment, err);
    throw err;
  }
};


/**
 * Convert array of Supabase installments to frontend Installments
 */
export const supabaseInstallmentsToFrontend = (supabaseInstallments: SupabaseInstallment[]): Installment[] => {
  return supabaseInstallments.map(supabaseInstallmentToFrontend);
};
