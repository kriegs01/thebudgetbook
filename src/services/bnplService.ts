// src/services/bnplService.ts
import { supabase } from '../utils/supabaseClient';
import { Transaction } from '../types';

export const convertMultipleToBNPL = async (
  transactions: Transaction[],
  status: 'pending' | 'approved',
  installmentDetails: {
    months: number;
    statementId: string;
    monthlyAmount: number;
    principalAmount?: number;
    totalAmount?: number;
    dueDate?: string;
  },
  accountId?: string
) => {

  if (transactions.length === 0) return;
  if (!installmentDetails) throw new Error('Installment details are required for BNPL conversion.');

  const txIds = transactions.map(tx => tx.id);
  const totalPrincipal = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const conversionGroupId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const selectedStartDate = installmentDetails.statementId.trim() || new Date().toISOString().slice(0, 10);
  const safeStartDate = selectedStartDate.includes('T')
    ? selectedStartDate
    : `${selectedStartDate}T12:00:00`;

  // 🟢 NEW: Get the current user to satisfy Supabase Row Level Security (RLS)
  const { data: authData } = await supabase.auth.getUser();

  // 1. Create the provisional installment record FIRST.
  const { error: instError } = await supabase
    .from('installments')
    .insert({
      name: `BNPL Converted (${transactions.length} items)`,
      principal_amount: installmentDetails.principalAmount ?? totalPrincipal,
      total_amount: installmentDetails.totalAmount ?? totalPrincipal,
      monthly_amount: installmentDetails.monthlyAmount,
      term_duration: installmentDetails.months,
      account_id: accountId || transactions[0].payment_method_id,
      paid_amount: 0,
      is_archived: false,
      conversion_group_id: conversionGroupId,
      status: status === 'pending' ? 'pending' : 'active',
      user_id: authData.user?.id,
      start_date: safeStartDate,
      due_date: installmentDetails.dueDate || '15'
    });

  if (instError) throw instError;

  // 2. Tag the raw transactions with the same group and requested status.
  const { error: txError } = await supabase
    .from('transactions')
    .update({
      conversion_status: status,
      conversion_group_id: conversionGroupId
    })
    .in('id', txIds);

  if (txError) {
    // Emergency rollback: If tagging fails, delete the installment we just made.
    await supabase.from('installments').delete().eq('conversion_group_id', conversionGroupId);
    throw txError;
  }

};
