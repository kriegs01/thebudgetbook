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
    // We only process the collection! No schedule or installment updates here.
    const formattedAmount = payload.transactionType === 'cash_in' 
      ? -Math.abs(payload.amount) 
      : Math.abs(payload.amount);

    const bankTx = await createTransaction({
      name: payload.description,
      date: payload.date,
      amount: formattedAmount,
      payment_method_id: payload.accountId,
      transaction_type: payload.transactionType,
      payment_schedule_id: payload.scheduleId || undefined,
      notes: `Budee Transfer with ${payload.budeeName}`,
      person_name: payload.budeeName 
    } as any);

    if (bankTx.error || !bankTx.data) {
      throw bankTx.error || new Error("Failed to create bank transaction");
    }

    // Step 2 and 3 were removed. The payment application will now be handled exclusively by the Step 2 UI.
    return { success: true, transaction: bankTx.data };

  } catch (error) {
    console.error("Error processing Budee transaction:", error);
    return { success: false, error };
  }
};

