/**
 * Accounts Service
 * 
 * Provides CRUD operations for the accounts table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseAccount,
  CreateAccountInput,
  UpdateAccountInput,
} from '../types/supabase';

/**
 * Get all accounts
 */
export const getAllAccounts = async () => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return { data: null, error };
  }
};

/**
 * Get a single account by ID
 */
export const getAccountById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching account:', error);
    return { data: null, error };
  }
};

/**
 * Create a new account
 */
export const createAccount = async (account: CreateAccountInput) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .insert([account])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating account:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing account
 */
export const updateAccount = async (id: string, updates: UpdateAccountInput) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating account:', error);
    return { data: null, error };
  }
};

/**
 * Delete an account
 */
export const deleteAccount = async (id: string) => {
  try {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting account:', error);
    return { error };
  }
};

/**
 * Get accounts by type (Debit/Credit)
 */
export const getAccountsByType = async (type: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts by type:', error);
    return { data: null, error };
  }
};

/**
 * Get accounts by classification
 */
export const getAccountsByClassification = async (classification: string) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('classification', classification)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching accounts by classification:', error);
    return { data: null, error };
  }
};
