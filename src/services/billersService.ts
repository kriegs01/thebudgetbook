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
import { generateBillerSchedules } from './paymentSchedulesService';
import { MONTH_NAMES } from '../utils/dateUtils';

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
 * Also generates payment schedules for the next 24 months
 */
export const createBiller = async (biller: CreateBillerInput) => {
  try {
    console.log('[billersService] Creating biller:', biller.name);
    const { data, error } = await supabase
      .from('billers')
      .insert([biller])
      .select()
      .single();

    if (error) {
      console.error('[billersService] Error creating biller:', error);
      throw error;
    }
    
    console.log('[billersService] Biller created successfully:', data.id);
    
    // Generate payment schedules for the next 24 months
    if (data && data.id) {
      console.log('[billersService] Starting payment schedule generation');
      // Determine start month from activation date
      const activationDate = biller.activation_date;
      let startMonth: string;
      
      if (activationDate && activationDate.month && activationDate.year) {
        // Convert month name to number (e.g., "January" -> "01")
        const monthIndex = MONTH_NAMES.indexOf(activationDate.month);
        const monthNum = monthIndex >= 0 ? monthIndex + 1 : new Date().getMonth() + 1;
        startMonth = `${activationDate.year}-${String(monthNum).padStart(2, '0')}`;
        console.log('[billersService] Using activation date for start month:', startMonth);
      } else {
        // Default to current month if no activation date
        const now = new Date();
        startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        console.log('[billersService] Using current month for start month:', startMonth);
      }
      
      console.log('[billersService] Calling generateBillerSchedules with:', {
        billerId: data.id,
        expectedAmount: biller.expected_amount,
        startMonth,
        numberOfMonths: 24
      });
      
      // Generate 24 months of schedules
      const scheduleResult = await generateBillerSchedules(
        data.id,
        biller.expected_amount,
        startMonth,
        24
      );
      
      if (scheduleResult.error) {
        console.error('[billersService] Failed to generate payment schedules:', scheduleResult.error);
        // Don't fail the biller creation if schedule generation fails
      } else {
        console.log('[billersService] Generated payment schedules successfully:', scheduleResult.data?.length, 'schedules');
      }
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('[billersService] Error creating biller:', error);
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
