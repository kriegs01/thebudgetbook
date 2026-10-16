import { supabase } from '../utils/supabaseClient';
import { Transaction } from '../types';
import { createPaymentSchedulesBulk } from './paymentSchedulesService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ItemOverride {
  monthly?: number;
  startCycle?: string; // e.g. "2026-08" or "2026-09"
}

export const convertMultipleToBNPL = async (
  transactions: Transaction[],
  status: 'pending' | 'approved',
  installmentDetails: {
    months: number;
    statementId: string; // fallback base start date/cycle
    monthlyAmount: number;
    principalAmount?: number;
    totalAmount?: number;
    dueDate?: string;
    itemOverrides?: Record<string, ItemOverride>;
  },
  accountId?: string
) => {
  if (transactions.length === 0) return;
  if (!installmentDetails) throw new Error('Installment details are required for BNPL conversion.');

  const txIds = transactions.map(tx => tx.id);
  const totalPrincipal = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const conversionGroupId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 1. Calculate dynamic schedule curve across all items
  const baseStart = installmentDetails.statementId.substring(0, 7); // e.g. "2026-08"
  const scheduleCurve: Record<string, number> = {};

  transactions.forEach(tx => {
    const override = installmentDetails.itemOverrides?.[tx.id];
    const itemCycle = override?.startCycle || baseStart;
    const itemMonthly = override?.monthly !== undefined && override.monthly > 0
      ? override.monthly
      : Math.abs(tx.amount) / installmentDetails.months;

    const [startYear, startMonth] = itemCycle.split('-').map(Number);

    for (let i = 0; i < installmentDetails.months; i++) {
      const targetDate = new Date(startYear, startMonth - 1 + i, 1);
      const cycleKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      scheduleCurve[cycleKey] = (scheduleCurve[cycleKey] || 0) + itemMonthly;
    }
  });

  const sortedCycles = Object.keys(scheduleCurve).sort();
  const earliestCycle = sortedCycles[0] || baseStart;
  const initialMonthlyAmount = scheduleCurve[earliestCycle] || installmentDetails.monthlyAmount;
  const computedTotalAmount = Object.values(scheduleCurve).reduce((sum, amt) => sum + amt, 0);

  const safeStartDate = `${earliestCycle}-01T12:00:00`;
  const { data: authData } = await supabase.auth.getUser();

  // 2. Create the consolidated parent installment contract
  const { data: installmentData, error: instError } = await supabase
    .from('installments')
    .insert({
      name: `BNPL Converted (${transactions.length} items)`,
      principal_amount: installmentDetails.principalAmount ?? totalPrincipal,
      total_amount: computedTotalAmount > 0 ? computedTotalAmount : (installmentDetails.totalAmount ?? totalPrincipal),
      monthly_amount: initialMonthlyAmount,
      term_duration: sortedCycles.length || installmentDetails.months,
      account_id: accountId || transactions[0].payment_method_id,
      paid_amount: 0,
      is_archived: false,
      conversion_group_id: conversionGroupId,
      status: status === 'pending' ? 'pending' : 'active',
      user_id: authData.user?.id,
      start_date: safeStartDate,
      due_date: installmentDetails.dueDate || '15'
    })
    .select()
    .single();

  if (instError) throw instError;

  // 3. Tag the raw transactions
  const { error: txError } = await supabase
    .from('transactions')
    .update({
      conversion_status: status,
      conversion_group_id: conversionGroupId
    })
    .in('id', txIds);

  if (txError) {
    await supabase.from('installments').delete().eq('conversion_group_id', conversionGroupId);
    throw txError;
  }

   // 4. Generate dynamic payment schedules plotted to the curve ONLY when approved
   if (status === 'approved') {
    try {
      const schedulesToInsert = sortedCycles.map(cycleKey => {
        const [yearStr, monthStr] = cycleKey.split('-');
        const monthIndex = parseInt(monthStr, 10) - 1;
        const expectedAmount = scheduleCurve[cycleKey];

        return {
          source_type: 'installment',
          source_id: installmentData.id,
          month: MONTH_NAMES[monthIndex],
          year: parseInt(yearStr, 10),
          expected_amount: Number(expectedAmount.toFixed(2)),
          amount_paid: 0,
          status: 'unpaid',
          account_id: installmentData.account_id,
          user_id: authData.user?.id
        };
      });

      if (schedulesToInsert.length > 0) {
        const { error: schedulesError } = await createPaymentSchedulesBulk(schedulesToInsert as any);
        if (schedulesError) {
          console.error('Failed to create payment schedules bulk:', schedulesError);
          await supabase.from('installments').delete().eq('id', installmentData.id);
          await supabase.from('transactions').update({ conversion_group_id: null, conversion_status: null }).in('id', txIds);
          throw schedulesError;
        }
      }
    } catch (error) {
      console.error('Error during schedule creation:', error);
      await supabase.from('installments').delete().eq('id', installmentData.id);
      await supabase.from('transactions').update({ conversion_group_id: null, conversion_status: null }).in('id', txIds);
      throw error;
    }
  }
};

