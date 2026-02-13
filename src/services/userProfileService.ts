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
 */
export const updateUserProfile = async (userId: string, updates: UpdateUserProfileInput) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
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
