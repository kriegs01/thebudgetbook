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
 * Automatically generates payment schedules for the biller
 */
export const createBiller = async (biller: CreateBillerInput) => {
  try {
    const { data, error } = await supabase
      .from('billers')
      .insert([biller])
      .select()
      .single();

    if (error) throw error;
    
    // Auto-generate payment schedules for this biller (12 months ahead)
    if (data) {
      try {
        const { generateBillerSchedules } = await import('./paymentSchedulesService');
        await generateBillerSchedules(
          data.id,
          biller.activation_date,
          biller.expected_amount,
          biller.timing,
          12 // Generate 12 months of schedules
        );
      } catch (scheduleError) {
        // Log but don't fail - schedules can be generated later
        console.warn('Failed to auto-generate payment schedules for biller:', scheduleError);
      }
    }
    
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
 */
export const createBillerFrontend = async (biller: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await createBiller(supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Update an existing biller (accepts frontend Biller type)
 */
export const updateBillerFrontend = async (biller: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await updateBiller(biller.id, supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Delete a biller
 */
export const deleteBillerFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteBiller(id);
};
