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

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseBudgetSetup,
  CreateBudgetSetupInput,
  UpdateBudgetSetupInput,
} from '../types/supabase';
import type { SavedBudgetSetup } from '../../types';
import { getCachedUser } from '../utils/authCache';

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
 * Validate that a value is a plain object (not an array or null)
 */
const isPlainObject = (value: any): boolean => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

/**
 * Validate setupData structure
 * Ensures it's an object containing arrays of items, not a stringified JSON or malformed data
 */
const validateSetupData = (data: any): { valid: boolean; error?: string } => {
  // Check if data is an object
  if (!isPlainObject(data)) {
    return { 
      valid: false, 
      error: `setupData must be a plain object, got: ${typeof data} ${Array.isArray(data) ? '(array)' : ''}`
    };
  }

  // Check each category contains an array
  for (const [key, value] of Object.entries(data)) {
    // Skip special fields like _projectedSalary and _actualSalary
    if (key.startsWith('_')) {
      continue;
    }

    if (!Array.isArray(value)) {
      return { 
        valid: false, 
        error: `Category "${key}" must be an array, got: ${typeof value}`
      };
    }

    // Validate each item in the array is an object
    for (const item of value as any[]) {
      if (!isPlainObject(item)) {
        return { 
          valid: false, 
          error: `Item in category "${key}" must be an object, got: ${typeof item}`
        };
      }
    }
  }

  return { valid: true };
};

/**
 * Convert frontend budget setup to Supabase format with validation
 */
const frontendBudgetSetupToSupabase = (setup: Partial<SavedBudgetSetup>): Partial<CreateBudgetSetupInput> => {
  const supabaseSetup: Partial<CreateBudgetSetupInput> = {};
  
  if (setup.month !== undefined) supabaseSetup.month = setup.month;
  if (setup.timing !== undefined) supabaseSetup.timing = setup.timing;
  if (setup.status !== undefined) supabaseSetup.status = setup.status;
  if (setup.totalAmount !== undefined) supabaseSetup.total_amount = setup.totalAmount;
  
  // Validate and log data field
  if (setup.data !== undefined) {
    console.log('[budgetSetupsService] Converting setup data to Supabase format');
    console.log('[budgetSetupsService] Data type:', typeof setup.data);
    console.log('[budgetSetupsService] Is array:', Array.isArray(setup.data));
    console.log('[budgetSetupsService] Data keys:', Object.keys(setup.data));
    
    // Validate data structure
    const validation = validateSetupData(setup.data);
    if (!validation.valid) {
      console.error('[budgetSetupsService] Invalid setupData structure:', validation.error);
      throw new Error(`Invalid setupData structure: ${validation.error}`);
    }
    
    supabaseSetup.data = setup.data;
    console.log('[budgetSetupsService] Data validation passed');
  }
  
  return supabaseSetup;
};

/**
 * Get all budget setups for the current user
 */
export const getAllBudgetSetups = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('budget_setups'))
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setups:', error);
    return { data: null, error };
  }
};

/**
 * Get a single budget setup by ID for the current user
 */
export const getBudgetSetupById = async (id: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('budget_setups'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Get budget setups by month and timing for the current user
 */
export const getBudgetSetupsByMonthAndTiming = async (month: string, timing: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('budget_setups'))
      .select('*')
      .eq('user_id', user.id)
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
 * Create a new budget setup for the current user
 */
export const createBudgetSetup = async (setup: CreateBudgetSetupInput) => {
  try {
    const user = await getCachedUser();

    console.log('[budgetSetupsService] Creating budget setup');
    console.log('[budgetSetupsService] Setup payload:', JSON.stringify({
      month: setup.month,
      timing: setup.timing,
      status: setup.status,
      total_amount: setup.total_amount,
      data_type: typeof setup.data,
      data_keys: setup.data ? Object.keys(setup.data) : [],
    }, null, 2));
    
    const { data, error } = await supabase
      .from(getTableName('budget_setups'))
      .insert([{ ...setup, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    
    console.log('[budgetSetupsService] Budget setup created successfully');
    console.log('[budgetSetupsService] Created record:', JSON.stringify({
      id: data.id,
      month: data.month,
      timing: data.timing,
      status: data.status,
      total_amount: data.total_amount,
      data_type: typeof data.data,
      data_keys: data.data ? Object.keys(data.data) : [],
    }, null, 2));
    
    return { data, error: null };
  } catch (error) {
    console.error('[budgetSetupsService] Error creating budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing budget setup
 */
export const updateBudgetSetup = async (id: string, updates: UpdateBudgetSetupInput) => {
  try {
    console.log('[budgetSetupsService] Updating budget setup:', id);
    console.log('[budgetSetupsService] Update payload:', JSON.stringify({
      month: updates.month,
      timing: updates.timing,
      status: updates.status,
      total_amount: updates.total_amount,
      data_type: typeof updates.data,
      data_keys: updates.data ? Object.keys(updates.data) : [],
    }, null, 2));
    
    const { data, error } = await supabase
      .from(getTableName('budget_setups'))
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    console.log('[budgetSetupsService] Budget setup updated successfully');
    console.log('[budgetSetupsService] Updated record:', JSON.stringify({
      id: data.id,
      month: data.month,
      timing: data.timing,
      status: data.status,
      total_amount: data.total_amount,
      data_type: typeof data.data,
      data_keys: data.data ? Object.keys(data.data) : [],
    }, null, 2));
    
    return { data, error: null };
  } catch (error) {
    console.error('[budgetSetupsService] Error updating budget setup:', error);
    return { data: null, error };
  }
};

/**
 * Delete a budget setup
 */
export const deleteBudgetSetup = async (id: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('budget_setups'))
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
