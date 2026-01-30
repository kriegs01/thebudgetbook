/**
 * Budget Setups Service
 * 
 * Provides CRUD operations for the budget_setups table in Supabase.
 * This service manages persistent storage of budget configurations,
 * replacing the previous localStorage-based approach.
 * 
 * PERSISTENCE WORKFLOW:
 * 1. Budget setups are loaded from Supabase when the application starts
 * 2. When a user saves a budget setup, it's created or updated in Supabase
 * 3. The setup data includes categorized items plus salary information (_projectedSalary, _actualSalary)
 * 4. When a user loads a setup, it's retrieved from Supabase and applied to the current view
 * 5. When a user deletes a setup, it's removed from Supabase
 * 
 * This provides data persistence across sessions and devices, ensuring budget configurations
 * are not lost when the browser is closed or cleared.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseBudgetSetup,
  CreateBudgetSetupInput,
  UpdateBudgetSetupInput,
} from '../types/supabase';
import type { SavedBudgetSetup } from '../../types';

/**
 * Convert Supabase budget setup to frontend format
 */
const supabaseBudgetSetupToFrontend = (setup: SupabaseBudgetSetup): SavedBudgetSetup => {
  return {
    id: setup.id,
    month: setup.month,
    timing: setup.timing,
    status: setup.status,
    totalAmount: setup.total_amount,
    data: setup.data,
  };
};

/**
 * Convert frontend budget setup to Supabase format
 */
const frontendBudgetSetupToSupabase = (setup: Partial<SavedBudgetSetup>): Partial<CreateBudgetSetupInput> => {
  const supabaseSetup: Partial<CreateBudgetSetupInput> = {};
  
  if (setup.month !== undefined) supabaseSetup.month = setup.month;
  if (setup.timing !== undefined) supabaseSetup.timing = setup.timing;
  if (setup.status !== undefined) supabaseSetup.status = setup.status;
  if (setup.totalAmount !== undefined) supabaseSetup.total_amount = setup.totalAmount;
  if (setup.data !== undefined) supabaseSetup.data = setup.data;
  
  return supabaseSetup;
};

/**
 * Get all budget setups
 */
export const getAllBudgetSetups = async () => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setups:', error);
    return { data: null, error };
  }
};

/**
 * Get a single budget setup by ID
 */
export const getBudgetSetupById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Get budget setups by month and timing
 */
export const getBudgetSetupsByMonthAndTiming = async (month: string, timing: string) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .select('*')
      .eq('month', month)
      .eq('timing', timing)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setups by month and timing:', error);
    return { data: null, error };
  }
};

/**
 * Create a new budget setup
 */
export const createBudgetSetup = async (setup: CreateBudgetSetupInput) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .insert([setup])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing budget setup
 */
export const updateBudgetSetup = async (id: string, updates: UpdateBudgetSetupInput) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Delete a budget setup
 */
export const deleteBudgetSetup = async (id: string) => {
  try {
    const { error } = await supabase
      .from('budget_setups')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting budget setup:', error);
    return { error };
  }
};

/**
 * Frontend-friendly functions that return SavedBudgetSetup types
 */

/**
 * Get all budget setups (returns frontend SavedBudgetSetup types)
 */
export const getAllBudgetSetupsFrontend = async (): Promise<{ data: SavedBudgetSetup[] | null; error: any }> => {
  const { data, error } = await getAllBudgetSetups();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: data.map(supabaseBudgetSetupToFrontend), error: null };
};

/**
 * Get a single budget setup by ID (returns frontend SavedBudgetSetup type)
 */
export const getBudgetSetupByIdFrontend = async (id: string): Promise<{ data: SavedBudgetSetup | null; error: any }> => {
  const { data, error } = await getBudgetSetupById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBudgetSetupToFrontend(data), error: null };
};

/**
 * Get budget setups by month and timing (returns frontend SavedBudgetSetup types)
 */
export const getBudgetSetupsByMonthAndTimingFrontend = async (month: string, timing: string): Promise<{ data: SavedBudgetSetup[] | null; error: any }> => {
  const { data, error } = await getBudgetSetupsByMonthAndTiming(month, timing);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: data.map(supabaseBudgetSetupToFrontend), error: null };
};

/**
 * Create a new budget setup (accepts frontend SavedBudgetSetup type)
 */
export const createBudgetSetupFrontend = async (setup: Omit<SavedBudgetSetup, 'id'>): Promise<{ data: SavedBudgetSetup | null; error: any }> => {
  const supabaseSetup = frontendBudgetSetupToSupabase(setup) as CreateBudgetSetupInput;
  const { data, error } = await createBudgetSetup(supabaseSetup);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBudgetSetupToFrontend(data), error: null };
};

/**
 * Update an existing budget setup (accepts frontend SavedBudgetSetup type)
 */
export const updateBudgetSetupFrontend = async (setup: SavedBudgetSetup): Promise<{ data: SavedBudgetSetup | null; error: any }> => {
  const supabaseSetup = frontendBudgetSetupToSupabase(setup);
  const { data, error } = await updateBudgetSetup(setup.id, supabaseSetup);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBudgetSetupToFrontend(data), error: null };
};

/**
 * Delete a budget setup
 */
export const deleteBudgetSetupFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteBudgetSetup(id);
};
