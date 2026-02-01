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
 */
export const createTransaction = async (transaction: CreateTransactionInput) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
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
 * If the transaction is linked to a payment schedule, also clears the payment information from that schedule
 * AND updates the old JSON-based schedules field in billers/installments table
 */
export const deleteTransaction = async (id: string) => {
  try {
    // First, get the transaction to check if it has a payment_schedule_id
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('payment_schedule_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // If the transaction was linked to a payment schedule, clear the payment information
    if (transaction?.payment_schedule_id) {
      // Fetch the payment schedule to get biller/installment details
      const { data: schedule, error: scheduleError } = await supabase
        .from('payment_schedules')
        .select('*')
        .eq('id', transaction.payment_schedule_id)
        .single();

      if (scheduleError) {
        console.error('Error fetching payment schedule:', scheduleError);
      } else if (schedule) {
        // Clear payment schedule in database
        const { error: updateError } = await supabase
          .from('payment_schedules')
          .update({
            amount_paid: null,
            date_paid: null,
            receipt: null,
            account_id: null
          })
          .eq('id', transaction.payment_schedule_id);

        if (updateError) {
          console.error('Error clearing payment schedule:', updateError);
        }

        // Also clear old JSON-based schedules field for existing billers
        if (schedule.biller_id) {
          const { data: biller, error: billerError } = await supabase
            .from('billers')
            .select('schedules')
            .eq('id', schedule.biller_id)
            .single();

          if (billerError) {
            console.error('Error fetching biller:', billerError);
          } else if (biller && biller.schedules) {
            // Update the schedules array to clear payment info for matching month/year
            const updatedSchedules = biller.schedules.map((s: any) => {
              if (s.month === schedule.schedule_month && s.year === schedule.schedule_year) {
                // Clear payment fields
                return {
                  ...s,
                  amountPaid: undefined,
                  datePaid: undefined,
                  receipt: undefined,
                  accountId: undefined
                };
              }
              return s;
            });

            // Update biller with cleared schedules
            const { error: updateBillerError } = await supabase
              .from('billers')
              .update({ schedules: updatedSchedules })
              .eq('id', schedule.biller_id);

            if (updateBillerError) {
              console.error('Error updating biller schedules:', updateBillerError);
            }
          }
        }

        // Similar logic for installments
        if (schedule.installment_id) {
          const { data: installment, error: installmentError } = await supabase
            .from('installments')
            .select('*')
            .eq('id', schedule.installment_id)
            .single();

          if (installmentError) {
            console.error('Error fetching installment:', installmentError);
          } else if (installment) {
            // Installments might have similar schedule tracking - handle if needed
            // For now, just log that we found the installment
            console.log('Found installment for payment schedule:', installment);
          }
        }
      }
    }

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
