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

const deriveFallbackProfileNames = async () => {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  const metadata = authUser?.user_metadata || {};
  const emailPrefix = authUser?.email?.split('@')[0]?.trim() || '';

  const firstName =
    metadata.first_name ||
    metadata.given_name ||
    metadata.name?.split(' ')[0] ||
    emailPrefix ||
    'User';

  const lastName =
    metadata.last_name ||
    metadata.family_name ||
    metadata.name?.split(' ').slice(1).join(' ') ||
    '';

  return {
    first_name: String(firstName).trim() || 'User',
    last_name: String(lastName).trim(),
  };
};

/**
 * Update user profile
 * If profile doesn't exist, this will create it (for existing users who signed up before profile feature)
 */
export const updateUserProfile = async (userId: string, updates: UpdateUserProfileInput) => {
  try {
    // Validate that we have the required fields
    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided');
    }

    // Check whether the profile already exists so we can avoid accidental
    // insert/upsert fallbacks that can trip RLS on existing rows.
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    if (!existingProfile) {
      console.log('[UserProfile] No profile found, creating profile for user:', userId);

      const fallbackNames = await deriveFallbackProfileNames();
      return await createUserProfile({
        user_id: userId,
        first_name: updates.first_name || fallbackNames.first_name,
        last_name: updates.last_name || fallbackNames.last_name,
        ...updates,
      });
    }

    // Update the existing profile.
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
