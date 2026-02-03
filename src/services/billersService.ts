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
 * Also fetches payment schedules from the new payment schedules table
 */
export const getAllBillersFrontend = async (): Promise<{ data: Biller[] | null; error: any }> => {
  const { data, error } = await getAllBillers();
  if (error || !data) {
    return { data: null, error };
  }
  
  // Convert to frontend types
  const billers = supabaseBillersToFrontend(data);
  
  // For each biller, try to fetch payment schedules from the new table
  // If schedules exist in the new table, use them; otherwise fall back to JSONB schedules
  try {
    const { data: allSchedules } = await supabase
      .from('biller_payment_schedules')
      .select('*');
    
    if (allSchedules && allSchedules.length > 0) {
      // Group schedules by biller_id
      const schedulesByBiller = new Map<string, any[]>();
      allSchedules.forEach(schedule => {
        if (!schedulesByBiller.has(schedule.biller_id)) {
          schedulesByBiller.set(schedule.biller_id, []);
        }
        schedulesByBiller.get(schedule.biller_id)!.push({
          id: schedule.id,
          month: schedule.month,
          year: schedule.year,
          expectedAmount: schedule.expected_amount,
          amountPaid: schedule.amount_paid || undefined,
          paid: schedule.paid,
          datePaid: schedule.date_paid || undefined,
          receipt: schedule.receipt || undefined,
          accountId: schedule.account_id || undefined,
        });
      });
      
      // Merge schedules into billers
      billers.forEach(biller => {
        const newSchedules = schedulesByBiller.get(biller.id);
        if (newSchedules && newSchedules.length > 0) {
          // Use new schedules if available
          biller.schedules = newSchedules;
        }
        // Otherwise keep JSONB schedules from adapter
      });
    }
  } catch (schedError) {
    console.warn('Could not fetch payment schedules from new table, using legacy JSONB schedules:', schedError);
  }
  
  return { data: billers, error: null };
};

/**
 * Get a single biller by ID (returns frontend Biller type)
 * Also fetches payment schedules from the new payment schedules table
 */
export const getBillerByIdFrontend = async (id: string): Promise<{ data: Biller | null; error: any }> => {
  const { data, error } = await getBillerById(id);
  if (error || !data) {
    return { data: null, error };
  }
  
  // Convert to frontend type
  const biller = supabaseBillerToFrontend(data);
  
  // Try to fetch payment schedules from the new table
  try {
    const { data: schedules } = await supabase
      .from('biller_payment_schedules')
      .select('*')
      .eq('biller_id', id)
      .order('year', { ascending: true })
      .order('month', { ascending: true });
    
    if (schedules && schedules.length > 0) {
      // Use new schedules
      biller.schedules = schedules.map(schedule => ({
        id: schedule.id,
        month: schedule.month,
        year: schedule.year,
        expectedAmount: schedule.expected_amount,
        amountPaid: schedule.amount_paid || undefined,
        paid: schedule.paid,
        datePaid: schedule.date_paid || undefined,
        receipt: schedule.receipt || undefined,
        accountId: schedule.account_id || undefined,
      }));
    }
  } catch (schedError) {
    console.warn('Could not fetch payment schedules from new table, using legacy JSONB schedules:', schedError);
  }
  
  return { data: biller, error: null };
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
