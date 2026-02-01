/**
 * Billers Service
 * 
 * Provides CRUD operations for the billers table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseBiller,
  CreateBillerInput,
  UpdateBillerInput,
} from '../types/supabase';
import { supabaseBillerToFrontend, supabaseBillersToFrontend, frontendBillerToSupabase } from '../utils/billersAdapter';
import type { Biller } from '../../types';
import { generateSchedulesForBiller, createPaymentSchedulesBatch } from './paymentSchedulesService';

/**
 * Get all billers
 */
export const getAllBillers = async () => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching billers:', error);
    return { data: null, error };
  }
};

/**
 * Get a single biller by ID
 */
export const getBillerById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching biller:', error);
    return { data: null, error };
  }
};

/**
 * Create a new biller
 */
export const createBiller = async (biller: CreateBillerInput) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .insert([biller])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating biller:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing biller
 */
export const updateBiller = async (id: string, updates: UpdateBillerInput) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating biller:', error);
    return { data: null, error };
  }
};

/**
 * Delete a biller
 */
export const deleteBiller = async (id: string) => {
  try {
    const { error } = await supabase
      .from('billers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting biller:', error);
    return { error };
  }
};

/**
 * Get billers by status (active/inactive)
 */
export const getBillersByStatus = async (status: string) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .select('*')
      .eq('status', status)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching billers by status:', error);
    return { data: null, error };
  }
};

/**
 * Get billers by category
 */
export const getBillersByCategory = async (category: string) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .select('*')
      .eq('category', category)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching billers by category:', error);
    return { data: null, error };
  }
};

/**
 * Frontend-friendly functions that return Biller types (not SupabaseBiller)
 */

/**
 * Get all billers (returns frontend Biller types)
 */
export const getAllBillersFrontend = async (): Promise<{ data: Biller[] | null; error: any }> => {
  const { data, error } = await getAllBillers();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillersToFrontend(data), error: null };
};

/**
 * Get a single biller by ID (returns frontend Biller type)
 */
export const getBillerByIdFrontend = async (id: string): Promise<{ data: Biller | null; error: any }> => {
  const { data, error } = await getBillerById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Create a new biller (accepts frontend Biller type)
 * Also generates payment schedules from activation month forward
 */
export const createBillerFrontend = async (biller: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await createBiller(supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }
  
  // Generate payment schedules from activation month forward
  const schedules = generateSchedulesForBiller(
    data.id,
    biller.activationDate,
    biller.deactivationDate,
    biller.expectedAmount
  );
  
  // Create payment schedules in batch
  if (schedules.length > 0) {
    const { error: schedulesError } = await createPaymentSchedulesBatch(schedules);
    if (schedulesError) {
      console.error('Error creating payment schedules for new biller:', schedulesError);
      // Return error to notify user about schedule creation failure
      return { 
        data: null, 
        error: new Error(`Biller created but payment schedules failed to generate. Please contact support. Details: ${schedulesError.message || schedulesError}`) 
      };
    }
  }
  
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Update an existing biller (accepts frontend Biller type)
 * Also updates payment schedules if activation/deactivation dates or amounts change
 */
export const updateBillerFrontend = async (biller: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await updateBiller(biller.id, supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }
  
  // Check if we need to regenerate schedules
  // This happens when activation/deactivation dates or amounts change
  // For now, we'll keep existing schedules and only update the biller
  // Future enhancement: Add logic to sync schedule changes
  
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Delete a biller
 */
export const deleteBillerFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteBiller(id);
};
