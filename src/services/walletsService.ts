/**
 * Wallets Service
 *
 * Provides CRUD operations for the wallets table in Supabase.
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type { SupabaseWallet, CreateWalletInput, UpdateWalletInput } from '../types/supabase';
import { supabaseWalletToFrontend, supabaseWalletsToFrontend, frontendWalletToSupabase } from '../utils/walletsAdapter';
import type { Wallet } from '../../types';
import { getCachedUser } from '../utils/authCache';

/**
 * Get all wallets for the current user
 */
export const getWalletsForCurrentUser = async (): Promise<{ data: Wallet[] | null; error: any }> => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('wallets'))
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: supabaseWalletsToFrontend(data as SupabaseWallet[]), error: null };
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return { data: null, error };
  }
};

/**
 * Get a single wallet by ID for the current user
 */
export const getWalletById = async (id: string): Promise<{ data: Wallet | null; error: any }> => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('wallets'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data: supabaseWalletToFrontend(data as SupabaseWallet), error: null };
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return { data: null, error };
  }
};

/**
 * Create a new wallet for the current user
 */
export const createWallet = async (payload: CreateWalletInput): Promise<{ data: Wallet | null; error: any }> => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('wallets'))
      .insert([{ ...payload, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    return { data: supabaseWalletToFrontend(data as SupabaseWallet), error: null };
  } catch (error) {
    console.error('Error creating wallet:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing wallet
 */
export const updateWallet = async (id: string, updates: UpdateWalletInput): Promise<{ data: Wallet | null; error: any }> => {
  try {
    const user = await getCachedUser();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from(getTableName('wallets'))
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data: supabaseWalletToFrontend(data as SupabaseWallet), error: null };
  } catch (error) {
    console.error('Error updating wallet:', error);
    return { data: null, error };
  }
};

/**
 * Delete a wallet
 */
export const deleteWallet = async (id: string): Promise<{ error: any }> => {
  try {
    const user = await getCachedUser();

    const { error } = await supabase
      .from(getTableName('wallets'))
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting wallet:', error);
    return { error };
  }
};
