/**
 * Transactions Service
 * 
 * Provides CRUD operations for the transactions table in Supabase.
 * 
 * IMPORTANT: Account Balance Calculation
 * ---------------------------------------
 * Account balances are NOT updated when transactions are created or deleted.
 * Instead, balances are calculated dynamically from the transactions table.
 * 
 * Implementation:
 * - The balance field in the accounts table represents the INITIAL balance
 * - Current balance = initial balance ± all transactions for that account
 * - Use accountBalanceCalculator utility to calculate current balances
 * 
 * Benefits:
 * - No race conditions - balance is calculated, not stored
 * - No partial failure issues - transactions are source of truth
 * - Always consistent - balance is derived from transactions
 * - Easy to audit and recalculate
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseTransaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../types/supabase';
import { getCachedUser } from '../utils/authCache';

/**
 * Get all transactions for the current user
 */
export const getAllTransactions = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('id', { ascending: false }); // Secondary sort for deterministic ordering

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return { data: null, error };
  }
};

/**
 * Get a single transaction by ID for the current user
 */
export const getTransactionById = async (id: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return { data: null, error };
  }
};

/**
 * Create a new transaction for the current user
 * Note: Account balances are calculated dynamically from transactions, not updated here
 */
export const createTransaction = async (transaction: CreateTransactionInput) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .insert([{ ...transaction, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating transaction:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing transaction
 */
export const updateTransaction = async (id: string, updates: UpdateTransactionInput) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating transaction:', error);
    return { data: null, error };
  }
};

/**
 * Delete a transaction
 */
export const deleteTransaction = async (id: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('transactions'))
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return { error };
  }
};

/**
 * Get transactions by payment method for the current user
 */
export const getTransactionsByPaymentMethod = async (paymentMethodId: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_method_id', paymentMethodId)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by payment method:', error);
    return { data: null, error };
  }
};

/**
 * Get transactions within a date range for the current user
 */
export const getTransactionsByDateRange = async (startDate: string, endDate: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by date range:', error);
    return { data: null, error };
  }
};

/**
 * Get transaction total for a specific period for the current user
 */
export const getTransactionTotal = async (startDate?: string, endDate?: string) => {
  try {
    const user = await getCachedUser();

    let query = supabase.from(getTableName('transactions')).select('amount')
      .eq('user_id', user.id);
    
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    const total = data?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    return { data: total, error: null };
  } catch (error) {
    console.error('Error calculating transaction total:', error);
    return { data: null, error };
  }
};

/**
 * Create a transaction for a payment schedule payment for the current user
 * This links the transaction to a payment schedule
 * Note: Account balances are calculated dynamically from transactions, not updated here
 */
export const createPaymentScheduleTransaction = async (
  scheduleId: string,
  transaction: {
    name: string;
    date: string;
    amount: number;
    paymentMethodId: string;
  }
) => {
  try {
    const user = await getCachedUser();

    // Create the transaction with payment_schedule_id
    const transactionData: CreateTransactionInput = {
      name: transaction.name,
      date: transaction.date,
      amount: transaction.amount,
      payment_method_id: transaction.paymentMethodId,
      payment_schedule_id: scheduleId,
    };

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .insert([{ ...transactionData, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    
    console.log('[Transactions] Created payment schedule transaction:', {
      transactionId: data.id,
      scheduleId,
      amount: transaction.amount,
    });

    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule transaction:', error);
    return { data: null, error };
  }
};

/**
 * Get transactions for a specific payment schedule for the current user
 */
export const getTransactionsByPaymentSchedule = async (scheduleId: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_schedule_id', scheduleId)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Delete a transaction and revert payment schedule status if linked
 * Note: Account balances are calculated dynamically from transactions, so no balance reversion needed
 */
export const deleteTransactionAndRevertSchedule = async (transactionId: string) => {
  try {
    // First, get the transaction to check if it has a payment_schedule_id
    const { data: transaction, error: fetchError } = await getTransactionById(transactionId);
    
    if (fetchError || !transaction) {
      throw new Error('Transaction not found');
    }

    // If transaction is linked to a payment schedule, we need to revert the payment
    if (transaction.payment_schedule_id) {
      console.log('[Transactions] Reverting payment schedule for transaction deletion:', {
        transactionId,
        scheduleId: transaction.payment_schedule_id,
        amount: transaction.amount,
      });

      // Get the current schedule
      const { data: schedule, error: scheduleError } = await supabase
        .from(getTableName('monthly_payment_schedules'))
        .select('*')
        .eq('id', transaction.payment_schedule_id)
        .single();

      if (!scheduleError && schedule) {
        // Calculate new amount_paid after removing this transaction
        const newAmountPaid = Math.max(0, (schedule.amount_paid || 0) - transaction.amount);
        
        // Determine new status
        let newStatus: 'pending' | 'paid' | 'partial' | 'overdue' = 'pending';
        if (newAmountPaid >= schedule.expected_amount) {
          newStatus = 'paid';
        } else if (newAmountPaid > 0) {
          newStatus = 'partial';
        }

        // Update the payment schedule
        await supabase
          .from(getTableName('monthly_payment_schedules'))
          .update({
            amount_paid: newAmountPaid,
            status: newStatus,
            // If amount is now 0, clear payment details
            ...(newAmountPaid === 0 ? {
              date_paid: null,
              receipt: null,
              account_id: null,
            } : {}),
          })
          .eq('id', transaction.payment_schedule_id);

        console.log('[Transactions] Payment schedule reverted:', {
          scheduleId: transaction.payment_schedule_id,
          oldAmount: schedule.amount_paid,
          newAmount: newAmountPaid,
          newStatus,
        });
      }
    }

    // Now delete the transaction
    const { error: deleteError } = await deleteTransaction(transactionId);
    
    if (deleteError) throw deleteError;

    console.log('[Transactions] Transaction deleted successfully:', transactionId);
    return { error: null };
  } catch (error) {
    console.error('Error deleting transaction and reverting schedule:', error);
    return { error };
  }
};

/**
 * Create a transfer between two accounts
 * Creates two linked transactions: positive on source (out), negative on destination (in)
 */
export const createTransfer = async (
  sourceAccountId: string,
  destinationAccountId: string,
  amount: number,
  date: string
) => {
  try {
    // Create the outgoing transaction (positive - money leaving)
    const { data: outgoingTx, error: outgoingError } = await supabase
      .from(getTableName('transactions'))
      .insert([{
        name: 'Transfer Out',
        date,
        amount: Math.abs(amount), // Positive for source account (money out)
        payment_method_id: sourceAccountId,
        transaction_type: 'transfer',
        notes: `Transfer to another account`
      }])
      .select()
      .single();

    if (outgoingError) throw outgoingError;

    // Create the incoming transaction (negative - money arriving)
    const { data: incomingTx, error: incomingError } = await supabase
      .from(getTableName('transactions'))
      .insert([{
        name: 'Transfer In',
        date,
        amount: -Math.abs(amount), // Negative for receiving account (money in)
        payment_method_id: destinationAccountId,
        transaction_type: 'transfer',
        notes: `Transfer from another account`,
        related_transaction_id: outgoingTx.id
      }])
      .select()
      .single();

    if (incomingError) throw incomingError;

    // Link the outgoing transaction to the incoming one
    await supabase
      .from(getTableName('transactions'))
      .update({ related_transaction_id: incomingTx.id })
      .eq('id', outgoingTx.id);

    return { data: { outgoing: outgoingTx, incoming: incomingTx }, error: null };
  } catch (error) {
    console.error('Error creating transfer:', error);
    return { data: null, error };
  }
};

/**
 * Get loan transactions with their payment history for the current user
 */
export const getLoanTransactionsWithPayments = async (accountId: string) => {
  try {
    const user = await getCachedUser();

    // Get all loan transactions for this account
    const { data: loans, error: loansError } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_method_id', accountId)
      .eq('transaction_type', 'loan')
      .order('date', { ascending: false });

    if (loansError) throw loansError;

    // Early return if no loans
    if (!loans || loans.length === 0) {
      return { data: [], error: null };
    }

    // Batch-fetch ALL payments for all loans in a single query (avoids N+1)
    const loanIds = loans.map(l => l.id);
    const { data: allPayments, error: paymentsError } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .in('related_transaction_id', loanIds)
      .eq('transaction_type', 'loan_payment')
      .order('date', { ascending: true });

    if (paymentsError) {
      console.error('Error fetching loan payments:', paymentsError);
    }

    // Group payments by their parent loan id
    const paymentsByLoanId = new Map<string, any[]>();
    for (const payment of (allPayments || [])) {
      if (payment.related_transaction_id) {
        const existing = paymentsByLoanId.get(payment.related_transaction_id);
        if (existing) {
          existing.push(payment);
        } else {
          paymentsByLoanId.set(payment.related_transaction_id, [payment]);
        }
      }
    }

    const loansWithPayments = loans.map(loan => {
      const payments = paymentsByLoanId.get(loan.id) || [];
      // Loan payments are stored as negative amounts (they increase balance)
      // Use Math.abs to get the actual payment amount
      const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
      const remainingBalance = Math.abs(loan.amount) - totalPaid;
      return { ...loan, payments, totalPaid, remainingBalance };
    });

    return { data: loansWithPayments, error: null };
  } catch (error) {
    console.error('Error fetching loan transactions:', error);
    return { data: null, error };
  }
};
