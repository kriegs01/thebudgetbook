/**
 * Installments Service
 * 
 * Provides CRUD operations for the installments table in Supabase.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabaseInstallment,
  CreateInstallmentInput,
  UpdateInstallmentInput,
} from '../types/supabase';
import { supabaseInstallmentToFrontend, supabaseInstallmentsToFrontend, frontendInstallmentToSupabase } from '../utils/installmentsAdapter';
import type { Installment } from '../../types';

/**
 * Get all installments
 */
export const getAllInstallments = async () => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installments:', error);
    return { data: null, error };
  }
};

/**
 * Get a single installment by ID
 */
export const getInstallmentById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installment:', error);
    return { data: null, error };
  }
};

/**
 * Create a new installment
 */
export const createInstallment = async (installment: CreateInstallmentInput) => {
  try {
    console.log('Creating installment with data:', installment);
    const { data, error } = await supabase
      .from('installments')
      .insert([installment])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating installment:', error);
      throw error;
    }
    return { data, error: null };
  } catch (error) {
    console.error('Error creating installment:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing installment
 */
export const updateInstallment = async (id: string, updates: UpdateInstallmentInput) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating installment:', error);
    return { data: null, error };
  }
};

/**
 * Delete an installment
 */
export const deleteInstallment = async (id: string) => {
  try {
    const { error } = await supabase
      .from('installments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting installment:', error);
    return { error };
  }
};

/**
 * Get installments by account ID
 */
export const getInstallmentsByAccount = async (accountId: string) => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .eq('account_id', accountId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching installments by account:', error);
    return { data: null, error };
  }
};

/**
 * Get active installments (where paid_amount < total_amount)
 * Note: This fetches all installments and filters in-memory since Supabase
 * doesn't support direct column-to-column comparisons in the query builder.
 */
export const getActiveInstallments = async () => {
  try {
    const { data, error } = await supabase
      .from('installments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    
    // Filter in-memory to get active installments
    const activeInstallments = data?.filter(
      installment => installment.paid_amount < installment.total_amount
    ) || [];
    
    return { data: activeInstallments, error: null };
  } catch (error) {
    console.error('Error fetching active installments:', error);
    return { data: null, error };
  }
};

/**
 * Frontend-friendly functions that return Installment types (not SupabaseInstallment)
 */

/**
 * Get all installments (returns frontend Installment types)
 */
export const getAllInstallmentsFrontend = async (): Promise<{ data: Installment[] | null; error: any }> => {
  const { data, error } = await getAllInstallments();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentsToFrontend(data), error: null };
};

/**
 * Get a single installment by ID (returns frontend Installment type)
 */
export const getInstallmentByIdFrontend = async (id: string): Promise<{ data: Installment | null; error: any }> => {
  const { data, error } = await getInstallmentById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentToFrontend(data), error: null };
};

/**
 * Create a new installment (accepts frontend Installment type)
 */
export const createInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await createInstallment(supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentToFrontend(data), error: null };
};

/**
 * Update an existing installment (accepts frontend Installment type)
 */
export const updateInstallmentFrontend = async (installment: Installment): Promise<{ data: Installment | null; error: any }> => {
  const supabaseInstallment = frontendInstallmentToSupabase(installment);
  const { data, error } = await updateInstallment(installment.id, supabaseInstallment);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseInstallmentToFrontend(data), error: null };
};

/**
 * Delete an installment
 */
export const deleteInstallmentFrontend = async (id: string): Promise<{ error: any }> => {
  return await deleteInstallment(id);
};
