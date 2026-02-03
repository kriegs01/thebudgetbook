/**
 * Installments Service
 * 
 * Provides CRUD operations for the installments table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseInstallment,
  CreateInstallmentInput,
  UpdateInstallmentInput,
} from '../types/supabase';
import { supabaseInstallmentToFrontend, supabaseInstallmentsToFrontend, frontendInstallmentToSupabase } from '../utils/installmentsAdapter';
import type { Installment } from '../../types';

/**
 * Get all installments
 */
export const getAllInstallments = async () => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installments:', error);
    return { data: null, error };
  }
};

/**
 * Get a single installment by ID
 */
export const getInstallmentById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installment:', error);
    return { data: null, error };
  }
};

/**
 * Create a new installment
 */
export const createInstallment = async (installment: CreateInstallmentInput) => {
  try {
    console.log('Creating installment with data:', installment);
    const { data, error } = await supabase
      .from('installments')
      .insert([installment])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating installment:', error);
      // PROTOTYPE: Provide helpful error message for missing timing column
      if (error.message && error.message.includes('timing') && error.code === '42703') {
        console.error('Missing timing column. Please run the database migration:');
        console.error('See HOW_TO_ADD_TIMING_COLUMN.md for instructions');
        throw new Error('Database migration required: The timing column needs to be added to the installments table. Please contact your administrator or check HOW_TO_ADD_TIMING_COLUMN.md');
      }
      throw error;
    }
    return { data, error: null };
  } catch (error) {
    console.error('Error creating installment:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing installment
 */
export const updateInstallment = async (id: string, updates: UpdateInstallmentInput) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // PROTOTYPE: Provide helpful error message for missing timing column
      if (error.message && error.message.includes('timing') && error.code === '42703') {
        console.error('Missing timing column. Please run the database migration:');
        console.error('See HOW_TO_ADD_TIMING_COLUMN.md for instructions');
        throw new Error('Database migration required: The timing column needs to be added to the installments table. Please contact your administrator or check HOW_TO_ADD_TIMING_COLUMN.md');
      }
      throw error;
    }
    return { data, error: null };
  } catch (error) {
    console.error('Error updating installment:', error);
    return { data: null, error };
  }
};

/**
 * Delete an installment
 */
export const deleteInstallment = async (id: string) => {
  try {
    const { error } = await supabase
      .from('installments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting installment:', error);
    return { error };
  }
};

/**
 * Get installments by account ID
 */
export const getInstallmentsByAccount = async (accountId: string) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('account_id', accountId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installments by account:', error);
    return { data: null, error };
  }
};

/**
 * Get active installments (where paid_amount < total_amount)
 * Note: This fetches all installments and filters in-memory since Supabase
 * doesn't support direct column-to-column comparisons in the query builder.
 */
export const getActiveInstallments = async () => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    
    // Filter in-memory to get active installments
    const activeInstallments = data?.filter(
      installment => installment.paid_amount < installment.total_amount
    ) || [];
    
    return { data: activeInstallments, error: null };
  } catch (error) {
    console.error('Error fetching active installments:', error);
    return { data: null, error };
  }
};

/**
 * Frontend-friendly functions that return Installment types (not SupabaseInstallment)
 */

/**
 * Get all installments (returns frontend Installment types)
 */
export const getAllInstallmentsFrontend = async (): Promise<{ data: Installment[] | null; error: any }> => {
  const { data, error } = await getAllInstallments();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentsToFrontend(data), error: null };
};

/**
 * Get a single installment by ID (returns frontend Installment type)
 */
export const getInstallmentByIdFrontend = async (id: string): Promise<{ data: Installment | null; error: any }> => {
  const { data, error } = await getInstallmentById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentToFrontend(data), error: null };
};

/**
 * Create a new installment (accepts frontend Installment type)
 * Automatically generates payment schedules in the new payment schedules table
 */
export const createInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await createInstallment(supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  
  const createdInstallment = supabaseInstallmentToFrontend(data);
  
  // Generate payment schedules if start_date is provided
  if (data.start_date) {
    try {
      await generatePaymentSchedulesForInstallment(data);
    } catch (schedError) {
      console.warn('Failed to generate payment schedules for new installment:', schedError);
      // Don't fail the installment creation if schedule generation fails
    }
  }
  
  return { data: createdInstallment, error: null };
};

/**
 * Helper function to generate payment schedules for an installment
 */
const generatePaymentSchedulesForInstallment = async (installment: any) => {
  if (!installment.start_date) {
    return;
  }
  
  const termMonths = parseInt(installment.term_duration.toString().replace(/\D/g, ''), 10) || 0;
  const startDate = new Date(installment.start_date);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const schedules = [];
  for (let i = 0; i < termMonths; i++) {
    const paymentDate = new Date(startDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    
    // Calculate if this payment should be marked as paid based on paid_amount
    const paymentsMade = Math.floor(installment.paid_amount / installment.monthly_amount);
    const isPaid = (i + 1) <= paymentsMade;
    
    schedules.push({
      installment_id: installment.id,
      payment_number: i + 1,
      month: monthNames[paymentDate.getMonth()],
      year: paymentDate.getFullYear().toString(),
      expected_amount: installment.monthly_amount,
      amount_paid: isPaid ? installment.monthly_amount : null,
      paid: isPaid,
      date_paid: isPaid ? paymentDate.toISOString().split('T')[0] : null,
      account_id: installment.account_id,
      due_date: paymentDate.toISOString().split('T')[0],
    });
  }
  
  if (schedules.length > 0) {
    const { error } = await supabase
      .from('installment_payment_schedules')
      .insert(schedules);
    
    if (error) {
      console.error('Error creating payment schedules:', error);
      throw error;
    }
  }
};

/**
 * Update an existing installment (accepts frontend Installment type)
 * Updates payment schedules if paid_amount changes
 */
export const updateInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await updateInstallment(installment.id, supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  
  const updatedInstallment = supabaseInstallmentToFrontend(data);
  
  // If start_date is set and no schedules exist yet, generate them
  if (data.start_date) {
    try {
      // Check if schedules exist
      const { data: existingSchedules } = await supabase
        .from('installment_payment_schedules')
        .select('id')
        .eq('installment_id', installment.id)
        .limit(1);
      
      if (!existingSchedules || existingSchedules.length === 0) {
        // No schedules exist, generate them
        await generatePaymentSchedulesForInstallment(data);
      }
    } catch (schedError) {
      console.warn('Failed to check/generate payment schedules:', schedError);
    }
  }
  
  return { data: updatedInstallment, error: null };
};

/**
 * Delete an installment
 */
export const deleteInstallmentFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteInstallment(id);
};
