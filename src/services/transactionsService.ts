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
 * Check if a transaction already exists for a payment schedule
 * Returns true if a transaction exists, false otherwise
 */
export const checkTransactionExistsForSchedule = async (paymentScheduleId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id')
      .eq('payment_schedule_id', paymentScheduleId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  } catch (error) {
    console.error('Error checking transaction for schedule:', error);
    return false;
  }
};

/**
 * Get transaction for a specific payment schedule
 */
export const getTransactionByPaymentSchedule = async (paymentScheduleId: string) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('payment_schedule_id', paymentScheduleId)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transaction by payment schedule:', error);
    return { data: null, error };
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
 * Checks for duplicate payment schedules before creating
 */
export const createTransaction = async (transaction: CreateTransactionInput) => {
  try {
    // If payment_schedule_id is provided, check for duplicates
    if (transaction.payment_schedule_id) {
      const exists = await checkTransactionExistsForSchedule(transaction.payment_schedule_id);
      if (exists) {
        const error = new Error('A transaction already exists for this payment schedule. Duplicate payments are not allowed.');
        console.error('Duplicate transaction prevented:', error);
        return { data: null, error };
      }
    }

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
