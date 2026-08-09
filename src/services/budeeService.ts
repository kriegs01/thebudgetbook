import { supabase, getTableName } from '../utils/supabaseClient';
import { createTransaction } from './transactionsService';

export interface BudeePaymentPayload {
  installmentId: string;
  scheduleId?: string;
  budeeId: string;
  budeeName: string;
  accountId: string;
  amount: number;
  date: string;
  transactionType: 'payment' | 'cash_in'; 
  description: string;
}

export const processBudeeTransaction = async (payload: BudeePaymentPayload) => {
  try {
    // ==========================================
    // STEP 1: Process the standard Bank Transaction
    // ==========================================
    // In your system, money leaving (payment) is positive, money arriving (cash_in) is negative[span_2](start_span)[span_2](end_span).
    const formattedAmount = payload.transactionType === 'cash_in' 
      ? -Math.abs(payload.amount) 
      : Math.abs(payload.amount);

    // Pass directly to your existing service so JuiceBox parses it perfectly
    const bankTx = await createTransaction({
      name: payload.description,
      date: payload.date,
      amount: formattedAmount,
      payment_method_id: payload.accountId,
      transaction_type: payload.transactionType,
      payment_schedule_id: payload.scheduleId || undefined,
      notes: `Budee Transfer with ${payload.budeeName}`,
      // Your backend gracefully drops borrower_name if not supported, but expects person_name[span_3](start_span)[span_3](end_span)
      person_name: payload.budeeName 
    } as any);

    if (bankTx.error || !bankTx.data) {
      throw bankTx.error || new Error("Failed to create bank transaction");
    }

    // ==========================================
    // STEP 2: Update the Monthly Payment Schedule
    // ==========================================
    if (payload.scheduleId) {
      // Fetch current schedule to dynamically calculate partial vs paid statuses
      const { data: schedule, error: fetchSchedErr } = await supabase
        .from(getTableName('monthly_payment_schedules'))
        .select('amount_paid, expected_amount')
        .eq('id', payload.scheduleId)
        .single();

      if (fetchSchedErr) throw fetchSchedErr;

      const newAmountPaid = (schedule.amount_paid || 0) + Math.abs(payload.amount);
      
      let newStatus = 'pending';
      if (newAmountPaid >= schedule.expected_amount) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0) {
        newStatus = 'partial';
      }

      const { error: scheduleError } = await supabase
        .from(getTableName('monthly_payment_schedules'))
        .update({ 
          status: newStatus, 
          amount_paid: newAmountPaid,
          payment_date: payload.date
        })
        .eq('id', payload.scheduleId);

      if (scheduleError) throw scheduleError;
    }

    // ==========================================
    // STEP 3: Sync the Master Installment Balance
    // ==========================================
    // Fetch the current installment to get the existing paid_amount
    const { data: installment, error: fetchInstErr } = await supabase
      .from(getTableName('installments'))
      .select('paid_amount')
      .eq('id', payload.installmentId)
      .single();

    if (fetchInstErr) throw fetchInstErr;

    // Add the new payment to the total paid amount
    const newPaidAmount = (installment.paid_amount || 0) + Math.abs(payload.amount);

    const { error: updateInstErr } = await supabase
      .from(getTableName('installments'))
      .update({ paid_amount: newPaidAmount })
      .eq('id', payload.installmentId);

    if (updateInstErr) throw updateInstErr;

    return { success: true, transaction: bankTx.data };

  } catch (error) {
    console.error("Error processing Budee transaction:", error);
    return { success: false, error };
  }
};
