/**
 * Savings Service
 * 
 * Provides CRUD operations for the savings table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseSavings,
  CreateSavingsInput,
  UpdateSavingsInput,
} from '../types/supabase';

/**
 * Get all savings jars
 */
export const getAllSavings = async () => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching savings:', error);
    return { data: null, error };
  }
};

/**
 * Get a single savings jar by ID
 */
export const getSavingsById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching savings:', error);
    return { data: null, error };
  }
};

/**
 * Create a new savings jar
 */
export const createSavings = async (savings: CreateSavingsInput) => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .insert([savings])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating savings:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing savings jar
 */
export const updateSavings = async (id: string, updates: UpdateSavingsInput) => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating savings:', error);
    return { data: null, error };
  }
};

/**
 * Delete a savings jar
 */
export const deleteSavings = async (id: string) => {
  try {
    const { error } = await supabase
      .from('savings')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting savings:', error);
    return { error };
  }
};

/**
 * Get savings jars by account ID
 */
export const getSavingsByAccount = async (accountId: string) => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .select('*')
      .eq('account_id', accountId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching savings by account:', error);
    return { data: null, error };
  }
};

/**
 * Get total savings balance across all jars
 */
export const getTotalSavingsBalance = async () => {
  try {
    const { data, error } = await supabase
      .from('savings')
      .select('current_balance');

    if (error) throw error;
    
    const total = data?.reduce((sum, item) => sum + (item.current_balance || 0), 0) || 0;
    return { data: total, error: null };
  } catch (error) {
    console.error('Error calculating total savings:', error);
    return { data: null, error };
  }
};
