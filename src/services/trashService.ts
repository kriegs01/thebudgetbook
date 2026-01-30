/**
 * Trash Service
 * 
 * Provides CRUD operations for the trash table in Supabase.
 * Handles soft-deleted items from various tables.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseTrash,
  CreateTrashInput,
} from '../types/supabase';

/**
 * Get all trash items
 */
export const getAllTrash = async () => {
  try {
    const { data, error } = await supabase
      .from('trash')
      .select('*')
      .order('deleted_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching trash items:', error);
    return { data: null, error };
  }
};

/**
 * Get trash items by type
 */
export const getTrashByType = async (type: string) => {
  try {
    const { data, error } = await supabase
      .from('trash')
      .select('*')
      .eq('type', type)
      .order('deleted_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching trash items by type:', error);
    return { data: null, error };
  }
};

/**
 * Get a single trash item by ID
 */
export const getTrashById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('trash')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching trash item:', error);
    return { data: null, error };
  }
};

/**
 * Move an item to trash (soft delete)
 */
export const moveToTrash = async (trashItem: CreateTrashInput) => {
  try {
    const { data, error } = await supabase
      .from('trash')
      .insert([trashItem])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error moving item to trash:', error);
    return { data: null, error };
  }
};

/**
 * Permanently delete an item from trash
 */
export const permanentlyDeleteFromTrash = async (id: string) => {
  try {
    const { error } = await supabase
      .from('trash')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error permanently deleting from trash:', error);
    return { error };
  }
};

/**
 * Restore an item from trash
 * This retrieves the trash record but doesn't delete it or restore to original table.
 * The caller should handle the restoration logic and then call permanentlyDeleteFromTrash.
 */
export const getTrashItemForRestore = async (id: string) => {
  return getTrashById(id);
};

/**
 * Delete trash items older than specified days
 */
export const deleteOldTrash = async (daysOld: number = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { error } = await supabase
      .from('trash')
      .delete()
      .lt('deleted_at', cutoffDate.toISOString());

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting old trash:', error);
    return { error };
  }
};
