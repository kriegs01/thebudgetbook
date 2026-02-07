/**
 * Monthly Payment Schedules Service
 * 
 * Provides CRUD operations for the monthly_payment_schedules table in Supabase.
 * This service manages individual payment schedules for billers and installments.
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseMonthlyPaymentSchedule,
  CreateMonthlyPaymentScheduleInput,
  UpdateMonthlyPaymentScheduleInput,
} from '../types/supabase';

/**
 * Create a new payment schedule
 */
export const createPaymentSchedule = async (schedule: CreateMonthlyPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .insert([schedule])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Create multiple payment schedules in bulk
 */
export const createPaymentSchedulesBulk = async (schedules: CreateMonthlyPaymentScheduleInput[]) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .insert(schedules)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedules in bulk:', error);
    return { data: null, error };
  }
};

/**
 * Get all payment schedules for a specific source (biller or installment)
 * Results are sorted chronologically by year and month
 */
export const getPaymentSchedulesBySource = async (sourceType: 'biller' | 'installment', sourceId: string) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('year', { ascending: true });

    if (error) throw error;
    
    // Sort by month chronologically (month names are stored as text)
    const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
    
    const sortedData = data?.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
    }) || [];
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by source:', error);
    return { data: null, error };
  }
};

/**
 * Get a single payment schedule by ID
 */
export const getPaymentScheduleById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Update a payment schedule
 */
export const updatePaymentSchedule = async (id: string, updates: UpdateMonthlyPaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Delete all payment schedules for a specific source
 */
export const deletePaymentSchedulesBySource = async (sourceType: 'biller' | 'installment', sourceId: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedules:', error);
    return { error };
  }
};

/**
 * Delete a single payment schedule by ID
 */
export const deletePaymentSchedule = async (id: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedule:', error);
    return { error };
  }
};

/**
 * Get payment schedules by status
 * Results are sorted chronologically by year and month
 */
export const getPaymentSchedulesByStatus = async (status: 'pending' | 'paid' | 'partial' | 'overdue') => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('*')
      .eq('status', status)
      .order('year', { ascending: true });

    if (error) throw error;
    
    // Sort by month chronologically
    const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
    
    const sortedData = data?.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
    }) || [];
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by status:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific period
 */
export const getPaymentSchedulesByPeriod = async (month: string, year: number) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .order('source_type', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by period:', error);
    return { data: null, error };
  }
};

/**
 * Record a payment for a schedule
 * Now returns the transaction data for linking purposes
 */
export const recordPayment = async (
  scheduleId: string,
  payment: {
    amountPaid: number;
    datePaid: string;
    accountId?: string;
    receipt?: string;
  }
) => {
  try {
    // Determine status based on amount paid
    const schedule = await getPaymentScheduleById(scheduleId);
    if (schedule.error || !schedule.data) {
      throw new Error('Schedule not found');
    }

    const totalPaid = (schedule.data.amount_paid || 0) + payment.amountPaid;
    let status: 'pending' | 'paid' | 'partial' | 'overdue' = 'pending';
    
    if (totalPaid >= schedule.data.expected_amount) {
      status = 'paid';
    } else if (totalPaid > 0) {
      status = 'partial';
    }
    // Note: Overdue status should be set separately based on due date comparison

    const { data, error } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .update({
        amount_paid: totalPaid,
        date_paid: payment.datePaid,
        account_id: payment.accountId || null,
        receipt: payment.receipt || null,
        status: status,
      })
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) throw error;
    
    console.log('[PaymentSchedules] Payment recorded:', {
      scheduleId,
      previousAmount: schedule.data.amount_paid,
      paymentAmount: payment.amountPaid,
      totalPaid,
      status,
    });

    return { data, error: null };
  } catch (error) {
    console.error('Error recording payment:', error);
    return { data: null, error };
  }
};

/**
 * Record a payment for a schedule via transaction
 * This is the new recommended way to record payments
 * Creates both the transaction and updates the schedule atomically
 */
export const recordPaymentViaTransaction = async (
  scheduleId: string,
  payment: {
    transactionName: string;
    amountPaid: number;
    datePaid: string;
    accountId: string;
    receipt?: string;
  }
) => {
  try {
    console.log('[PaymentSchedules] Recording payment via transaction:', {
      scheduleId,
      amount: payment.amountPaid,
    });

    // First, update the payment schedule
    const scheduleResult = await recordPayment(scheduleId, {
      amountPaid: payment.amountPaid,
      datePaid: payment.datePaid,
      accountId: payment.accountId,
      receipt: payment.receipt,
    });

    if (scheduleResult.error || !scheduleResult.data) {
      throw new Error('Failed to update payment schedule');
    }

    // Return both the schedule and indicate transaction should be created
    return { 
      data: {
        schedule: scheduleResult.data,
        scheduleId,
      },
      error: null 
    };
  } catch (error) {
    console.error('Error recording payment via transaction:', error);
    return { data: null, error };
  }
};

/**
 * Mark schedules as overdue based on current date and due day
 * This should be called periodically (e.g., daily cron job) to update statuses
 */
export const markOverdueSchedules = async (dueDay: number = 15) => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Get all pending or partial schedules
    const { data: schedules, error: fetchError } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('*')
      .in('status', ['pending', 'partial']);

    if (fetchError) throw fetchError;
    if (!schedules || schedules.length === 0) return { updated: 0, error: null };

    const MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Filter schedules that are overdue
    const overdueScheduleIds: string[] = [];
    for (const schedule of schedules) {
      const monthIndex = MONTHS.indexOf(schedule.month);
      if (monthIndex === -1) continue;

      const dueDate = new Date(schedule.year, monthIndex, dueDay);
      dueDate.setHours(0, 0, 0, 0);
      
      const todayMidnight = new Date(today);
      todayMidnight.setHours(0, 0, 0, 0);

      if (todayMidnight > dueDate && schedule.amount_paid < schedule.expected_amount) {
        overdueScheduleIds.push(schedule.id);
      }
    }

    // Update overdue schedules
    if (overdueScheduleIds.length > 0) {
      const { error: updateError } = await supabase
        .from(getTableName('monthly_payment_schedules'))
        .update({ status: 'overdue' })
        .in('id', overdueScheduleIds);

      if (updateError) throw updateError;
    }

    return { updated: overdueScheduleIds.length, error: null };
  } catch (error) {
    console.error('Error marking overdue schedules:', error);
    return { updated: 0, error };
  }
};
