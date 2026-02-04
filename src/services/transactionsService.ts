/**
 * Transactions Service
 * 
 * Provides CRUD operations for the transactions table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseTransaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../types/supabase';

/**
 * Helper function to calculate new account balance after a transaction
 * @param accountType - 'Debit' or 'Credit'
 * @param currentBalance - Current account balance
 * @param transactionAmount - Transaction amount
 * @param isReversal - Whether this is reversing a transaction (for deletions)
 * @returns New calculated balance
 */
const calculateNewBalance = (
  accountType: string,
  currentBalance: number,
  transactionAmount: number,
  isReversal: boolean = false
): number => {
  if (accountType === 'Debit') {
    // For Debit accounts: spending decreases balance, reversal increases
    return isReversal 
      ? currentBalance + transactionAmount 
      : currentBalance - transactionAmount;
  } else {
    // For Credit accounts: spending increases balance (debt), reversal decreases
    return isReversal
      ? currentBalance - transactionAmount
      : currentBalance + transactionAmount;
  }
};

/**
 * Helper function to update account balance
 * Note: This operation is not atomic and may be subject to race conditions
 * in high-concurrency scenarios. For production use, consider using
 * PostgreSQL's atomic increment/decrement or RPC functions.
 */
const updateAccountBalance = async (
  accountId: string,
  transactionAmount: number,
  isReversal: boolean = false
): Promise<{ success: boolean; error?: any }> => {
  try {
    // Get the account to check its type
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('type, balance')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      console.error('[Transactions] Failed to fetch account:', accountError);
      return { success: false, error: accountError };
    }

    // Calculate new balance
    const newBalance = calculateNewBalance(
      account.type,
      account.balance,
      transactionAmount,
      isReversal
    );

    // Update the account balance
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: newBalance })
      .eq('id', accountId);

    if (updateError) {
      console.error('[Transactions] Failed to update account balance:', updateError);
      return { success: false, error: updateError };
    }

    console.log('[Transactions] Account balance updated successfully:', {
      accountId,
      oldBalance: account.balance,
      newBalance,
      isReversal,
    });

    return { success: true };
  } catch (error) {
    console.error('[Transactions] Error updating account balance:', error);
    return { success: false, error };
  }
};

/**
 * Get all transactions
 */
export const getAllTransactions = async () => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return { data: null, error };
  }
};

/**
 * Get a single transaction by ID
 */
export const getTransactionById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return { data: null, error };
  }
};

/**
 * Create a new transaction
 * Also updates the account balance based on the transaction amount
 */
export const createTransaction = async (transaction: CreateTransactionInput) => {
  try {
    // First, create the transaction
    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
      .select()
      .single();

    if (error) throw error;

    // Then update the account balance if payment_method_id is provided
    if (transaction.payment_method_id && transaction.amount) {
      console.log('[Transactions] Updating account balance for transaction:', {
        accountId: transaction.payment_method_id,
        amount: transaction.amount,
      });

      const { success, error: balanceError } = await updateAccountBalance(
        transaction.payment_method_id,
        transaction.amount,
        false
      );

      if (!success) {
        // Balance update failed - transaction exists but balance is inconsistent
        console.error('[Transactions] Transaction created but balance update failed:', {
          transactionId: data.id,
          error: balanceError,
        });
        // Return error to notify caller of partial failure
        return { 
          data, 
          error: new Error('Transaction created but account balance update failed. Please refresh the page.') 
        };
      }
    }

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
      .from('transactions')
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
      .from('transactions')
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
 * Get transactions by payment method
 */
export const getTransactionsByPaymentMethod = async (paymentMethodId: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
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
 * Get transactions within a date range
 */
export const getTransactionsByDateRange = async (startDate: string, endDate: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
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
 * Get transaction total for a specific period
 */
export const getTransactionTotal = async (startDate?: string, endDate?: string) => {
  try {
    let query = supabase.from('transactions').select('amount');
    
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
 * Create a transaction for a payment schedule payment
 * This links the transaction to a payment schedule and updates the schedule status and account balance
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
    // Create the transaction with payment_schedule_id
    const transactionData: CreateTransactionInput = {
      name: transaction.name,
      date: transaction.date,
      amount: transaction.amount,
      payment_method_id: transaction.paymentMethodId,
      payment_schedule_id: scheduleId,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select()
      .single();

    if (error) throw error;
    
    console.log('[Transactions] Created payment schedule transaction:', {
      transactionId: data.id,
      scheduleId,
      amount: transaction.amount,
    });

    // Update the account balance if payment_method_id is provided
    if (transaction.paymentMethodId && transaction.amount) {
      console.log('[Transactions] Updating account balance for payment schedule transaction:', {
        accountId: transaction.paymentMethodId,
        amount: transaction.amount,
      });

      const { success, error: balanceError } = await updateAccountBalance(
        transaction.paymentMethodId,
        transaction.amount,
        false
      );

      if (!success) {
        // Balance update failed - transaction exists but balance is inconsistent
        console.error('[Transactions] Payment schedule transaction created but balance update failed:', {
          transactionId: data.id,
          error: balanceError,
        });
        // Return error to notify caller of partial failure
        return { 
          data, 
          error: new Error('Transaction created but account balance update failed. Please refresh the page.') 
        };
      }
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule transaction:', error);
    return { data: null, error };
  }
};

/**
 * Get transactions for a specific payment schedule
 */
export const getTransactionsByPaymentSchedule = async (scheduleId: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
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
 * This is the key function that handles the requirement of reverting payment status
 */
export const deleteTransactionAndRevertSchedule = async (transactionId: string) => {
  try {
    // First, get the transaction to check if it has a payment_schedule_id
    const { data: transaction, error: fetchError } = await getTransactionById(transactionId);
    
    if (fetchError || !transaction) {
      throw new Error('Transaction not found');
    }

    // Revert account balance if payment_method_id is provided
    if (transaction.payment_method_id && transaction.amount) {
      console.log('[Transactions] Reverting account balance for transaction deletion:', {
        accountId: transaction.payment_method_id,
        amount: transaction.amount,
      });

      const { success, error: balanceError } = await updateAccountBalance(
        transaction.payment_method_id,
        transaction.amount,
        true // isReversal = true
      );

      if (!success) {
        // Balance reversion failed
        console.error('[Transactions] Failed to revert account balance:', balanceError);
        // Return error instead of silently continuing
        return { error: new Error('Failed to revert account balance. Please try again.') };
      }
    }

    // If transaction is linked to a payment schedule, we need to revert the payment
    if (transaction.payment_schedule_id) {
      console.log('[Transactions] Reverting payment schedule for transaction deletion:', {
        transactionId,
        scheduleId: transaction.payment_schedule_id,
        amount: transaction.amount,
      });

      // Import payment schedule service functions (we'll need to update this)
      // Get the current schedule
      const { data: schedule, error: scheduleError } = await supabase
        .from('monthly_payment_schedules')
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
          .from('monthly_payment_schedules')
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
