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
