/**
 * Budget Setups Service
 * 
 * Provides CRUD operations for the budget_setups table in Supabase.
 * Handles budget setup pages with month, timing, and categorized data.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseBudgetSetup,
  CreateBudgetSetupInput,
  UpdateBudgetSetupInput,
} from '../types/supabase';

/**
 * Get all budget setups
 */
export const getAllBudgetSetups = async () => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      // Provide helpful context for common errors
      if (error.code === '42P01') {
        console.error('❌ Table "budget_setups" does not exist.');
        console.error('📋 Run the SQL migration: See supabase_migration.sql');
      }
      
      throw error;
    }
    return { data, error: null };
  } catch (error: any) {
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
export const getBudgetSetupsByMonthTiming = async (month: string, timing: string) => {
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
    console.error('Error fetching budget setups by month/timing:', error);
    return { data: null, error };
  }
};

/**
 * Create a new budget setup
 */
export const createBudgetSetup = async (budgetSetup: CreateBudgetSetupInput) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .insert([budgetSetup])
      .select()
      .single();

    if (error) {
      console.error('Supabase error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    return { data, error: null };
  } catch (error: any) {
    console.error('Error creating budget setup:', error);
    
    // Provide more context for common errors
    if (error.code === '42P01') {
      console.error('Table "budget_setups" does not exist. Please run the SQL migration.');
    }
    
    return { data: null, error };
  }
};

/**
 * Update an existing budget setup
 */
export const updateBudgetSetup = async (id: string, updates: UpdateBudgetSetupInput) => {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('budget_setups')
      .update(updateData)
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
 * Get budget setups by status
 */
export const getBudgetSetupsByStatus = async (status: string) => {
  try {
    const { data, error } = await supabase
      .from('budget_setups')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching budget setups by status:', error);
    return { data: null, error };
  }
};
