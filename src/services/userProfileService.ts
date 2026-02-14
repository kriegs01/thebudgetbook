/**
 * User Profiles Service
 * 
 * Provides CRUD operations for the user_profiles table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseUserProfile,
  CreateUserProfileInput,
  UpdateUserProfileInput,
} from '../types/supabase';

/**
 * Get the current user's profile
 */
export const getUserProfile = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return { data: null, error };
  }
};

/**
 * Create a new user profile
 */
export const createUserProfile = async (profile: CreateUserProfileInput) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert([profile])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating user profile:', error);
    return { data: null, error };
  }
};

/**
 * Update user profile
 * If profile doesn't exist, this will create it (for existing users who signed up before profile feature)
 */
export const updateUserProfile = async (userId: string, updates: UpdateUserProfileInput) => {
  try {
    // Validate that we have the required fields
    if (!updates.first_name && !updates.last_name) {
      throw new Error('At least first_name or last_name is required');
    }

    // First, try to update the existing profile
    const { data, error, count } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select();

    // If update failed with an error, throw it
    if (error) throw error;

    // If no rows were updated (profile doesn't exist), create it
    if (!data || data.length === 0) {
      console.log('[UserProfile] No profile found, creating new profile for user:', userId);
      
      // Create a new profile with the updates
      // Use provided values or empty strings as fallback
      const createResult = await createUserProfile({
        user_id: userId,
        first_name: updates.first_name || '',
        last_name: updates.last_name || '',
      });

      return createResult;
    }

    // Return the first (and should be only) updated record
    return { data: data[0], error: null };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return { data: null, error };
  }
};

/**
 * Update user email (Supabase Auth)
 */
export const updateUserEmail = async (newEmail: string) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating email:', error);
    return { data: null, error };
  }
};

/**
 * Update user password (Supabase Auth)
 */
export const updateUserPassword = async (newPassword: string) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating password:', error);
    return { data: null, error };
  }
};
