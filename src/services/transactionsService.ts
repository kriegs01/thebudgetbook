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
 * Also clears payment information from related billers/installments schedules
 * Works with both new (payment_schedule_id) and old (name-based) transaction styles
 */
export const deleteTransaction = async (id: string) => {
  try {
    // First, get the full transaction details including name, date, and amount
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!transaction) {
      return { error: 'Transaction not found' };
    }

    console.log('[deleteTransaction] Deleting transaction:', {
      id: transaction.id,
      name: transaction.name,
      amount: transaction.amount,
      date: transaction.date,
      has_payment_schedule_id: !!transaction.payment_schedule_id
    });

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Clear payment schedules using TWO approaches:
    // 1. If transaction has payment_schedule_id, use it (new system)
    // 2. Otherwise, use heuristic matching on name/date/amount (old system)
    
    if (transaction.payment_schedule_id) {
      // NEW SYSTEM: Transaction linked to payment schedule
      console.log('[deleteTransaction] Clearing via payment_schedule_id');
      
      const { data: schedule } = await supabase
        .from('payment_schedules')
        .select('*')
        .eq('id', transaction.payment_schedule_id)
        .single();

      if (schedule) {
        // Clear payment_schedules table
        await supabase
          .from('payment_schedules')
          .update({
            amount_paid: null,
            date_paid: null,
            receipt: null,
            account_id: null
          })
          .eq('id', transaction.payment_schedule_id);

        // Clear biller JSON schedules
        if (schedule.biller_id) {
          await clearBillerSchedule(schedule.biller_id, schedule.schedule_month, schedule.schedule_year);
        }
      }
    } else {
      // OLD SYSTEM: Transaction not linked, use heuristic matching
      console.log('[deleteTransaction] Clearing via heuristic matching');
      
      // Parse transaction name to extract biller name and month/year
      // Format: "{BillerName} - {Month} {Year}"
      const nameMatch = transaction.name.match(/^(.+?)\s*-\s*(\w+)\s+(\d{4})$/);
      
      if (nameMatch) {
        const [, billerName, month, year] = nameMatch;
        console.log('[deleteTransaction] Parsed transaction:', { billerName, month, year });
        
        // Find matching biller by name
        const { data: billers } = await supabase
          .from('billers')
          .select('*')
          .ilike('name', billerName.trim());
        
        if (billers && billers.length > 0) {
          // Clear schedule for each matching biller (usually just one)
          for (const biller of billers) {
            console.log('[deleteTransaction] Clearing schedule for biller:', biller.name);
            await clearBillerSchedule(biller.id, month, year);
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
 * Helper function to clear a biller's schedule for a specific month/year
 */
async function clearBillerSchedule(billerId: string, month: string, year: string) {
  try {
    const { data: biller } = await supabase
      .from('billers')
      .select('schedules')
      .eq('id', billerId)
      .single();

    if (biller && biller.schedules) {
      const updatedSchedules = biller.schedules.map((s: any) => {
        if (s.month === month && s.year === year) {
          console.log('[clearBillerSchedule] Clearing schedule:', { month, year });
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

      await supabase
        .from('billers')
        .update({ schedules: updatedSchedules })
        .eq('id', billerId);
      
      console.log('[clearBillerSchedule] Schedule cleared successfully');
    }
  } catch (error) {
    console.error('[clearBillerSchedule] Error:', error);
  }
}

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
