/**
 * People Service
 * 
 * Provides CRUD operations for the people table in Supabase.
 * Used for tracking individuals associated with loans and shared expenses.
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type { SupabasePerson, CreatePersonInput, UpdatePersonInput } from '../types/supabase';
import { getCachedUser } from '../utils/authCache';

/**
 * Get all people for the current user
 */
export const getAllPeople = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('people'))
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching people:', error);
    return { data: null, error };
  }
};

/**
 * Add a new person to the tracking list
 */
export const createPerson = async (person: CreatePersonInput) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('people'))
      .insert([{ ...person, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating person:', error);
    return { data: null, error };
  }
};

/**
 * Delete a person from the tracking list
 */
export const deletePerson = async (id: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('people'))
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting person:', error);
    return { error };
  }
};