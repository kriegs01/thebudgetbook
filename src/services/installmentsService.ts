/**
 * Installments Service
 * 
 * Provides CRUD operations for the installments table in Supabase.
 * Also manages monthly payment schedules for installments.
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseInstallment,
  CreateInstallmentInput,
  UpdateInstallmentInput,
} from '../types/supabase';
import { supabaseInstallmentToFrontend, supabaseInstallmentsToFrontend, frontendInstallmentToSupabase } from '../utils/installmentsAdapter';
import type { Installment } from '../../types';
import { generateInstallmentPaymentSchedules } from '../utils/paymentSchedulesGenerator';
import { createPaymentSchedulesBulk, deletePaymentSchedulesBySource } from './paymentSchedulesService';
import { getCachedUser } from '../utils/authCache';

/**
 * Get all installments for the current user
 */
export const getAllInstallments = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('installments'))
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installments:', error);
    return { data: null, error };
  }
};

/**
 * Get a single installment by ID for the current user
 */
export const getInstallmentById = async (id: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('installments'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installment:', error);
    return { data: null, error };
  }
};

/**
 * Create a new installment for the current user
 */
export const createInstallment = async (installment: CreateInstallmentInput) => {
  try {
    const user = await getCachedUser();

    console.log('Creating installment with data:', installment);
    
    // Validate required fields before sending to Supabase
    if (!installment.name || installment.name.trim() === '') {
      throw new Error('Installment name is required');
    }
    if (!installment.account_id || installment.account_id.trim() === '') {
      throw new Error('Account ID is required');
    }
    if (installment.total_amount <= 0) {
      throw new Error('Total amount must be greater than 0');
    }
    if (installment.monthly_amount <= 0) {
      throw new Error('Monthly amount must be greater than 0');
    }
    if (installment.term_duration <= 0) {
      throw new Error('Term duration must be greater than 0');
    }
    
    const { data, error } = await supabase
      .from(getTableName('installments'))
      .insert([{ ...installment, user_id: user.id }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating installment:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Handle missing start_date column (PGRST204 error)
      if (error.code === 'PGRST204' && error.message && error.message.includes('start_date')) {
        console.warn('start_date column not found in database. Retrying without start_date...');
        // Retry without start_date column
        const { start_date, ...installmentWithoutStartDate } = installment as any;
        const { data: retryData, error: retryError } = await supabase
          .from(getTableName('installments'))
          .insert([{ ...installmentWithoutStartDate, user_id: user.id }])
          .select()
          .single();
        
        if (retryError) {
          console.error('Retry failed:', retryError);
          throw new Error('Database migration required: The start_date column needs to be added to the installments table. Please run the migration in ADD_START_DATE_COLUMN.sql or see TROUBLESHOOTING_INSTALLMENTS.md for instructions.');
        }
        
        console.log('✓ Installment created successfully (without start_date). Consider running the database migration to enable start date functionality.');
        return { data: retryData, error: null };
      }
      
      // Handle missing timing column
      if (error.code === 'PGRST204' && error.message && error.message.includes('timing')) {
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
      .from(getTableName('installments'))
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating installment:', error);
      
      // Handle missing start_date column (PGRST204 error)
      if (error.code === 'PGRST204' && error.message && error.message.includes('start_date')) {
        console.warn('start_date column not found in database. Retrying without start_date...');
        // Retry without start_date column
        const { start_date, ...updatesWithoutStartDate } = updates as any;
        const { data: retryData, error: retryError } = await supabase
          .from(getTableName('installments'))
          .update(updatesWithoutStartDate)
          .eq('id', id)
          .select()
          .single();
        
        if (retryError) {
          console.error('Retry failed:', retryError);
          throw new Error('Database migration required: The start_date column needs to be added to the installments table. Please run the migration in ADD_START_DATE_COLUMN.sql or see TROUBLESHOOTING_INSTALLMENTS.md for instructions.');
        }
        
        console.log('✓ Installment updated successfully (without start_date). Consider running the database migration to enable start date functionality.');
        return { data: retryData, error: null };
      }
      
      // Handle missing timing column (PGRST204 error)
      if (error.code === 'PGRST204' && error.message && error.message.includes('timing')) {
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
      .from(getTableName('installments'))
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
 * Get installments by account ID for the current user
 */
export const getInstallmentsByAccount = async (accountId: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('installments'))
      .select('*')
      .eq('user_id', user.id)
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
 * Get active installments for the current user (where paid_amount < total_amount)
 * Note: This fetches all installments and filters in-memory since Supabase
 * doesn't support direct column-to-column comparisons in the query builder.
 */
export const getActiveInstallments = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('installments'))
      .select('*')
      .eq('user_id', user.id)
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
 * Also creates monthly payment schedules in the payment schedules table
 */
export const createInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await createInstallment(supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  
  // Generate and create payment schedules for the installment
  const convertedInstallment = supabaseInstallmentToFrontend(data);
  const schedules = generateInstallmentPaymentSchedules(convertedInstallment);
  
  if (schedules.length > 0) {
    const { error: schedulesError } = await createPaymentSchedulesBulk(schedules);
    if (schedulesError) {
      console.error('Error creating payment schedules for installment:', schedulesError);
      // Don't fail the entire operation, just log the error
    }
  }
  
  return { data: convertedInstallment, error: null };
};

/**
 * Update an existing installment (accepts frontend Installment type)
 */
export const updateInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await updateInstallment(installment.id, supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentToFrontend(data), error: null };
};

/**
 * Delete an installment and its payment schedules
 */
export const deleteInstallmentFrontend = async (id: string): Promise<{ error: any }> => {
  // First, delete all payment schedules for this installment
  const { error: schedulesError } = await deletePaymentSchedulesBySource('installment', id);
  if (schedulesError) {
    console.error('Error deleting payment schedules for installment:', schedulesError);
    // Continue with deleting the installment anyway
  }
  
  return await deleteInstallment(id);
};
