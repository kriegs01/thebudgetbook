/**
 * Billers Service
 * 
 * Provides CRUD operations for the billers table in Supabase.
 * Also manages monthly payment schedules for billers.
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseBiller,
  CreateBillerInput,
  UpdateBillerInput,
} from '../types/supabase';
import { supabaseBillerToFrontend, supabaseBillersToFrontend, frontendBillerToSupabase } from '../utils/billersAdapter';
import type { Biller } from '../../types';
import { generateBillerPaymentSchedules } from '../utils/paymentSchedulesGenerator';
import { createPaymentSchedulesBulk, deletePaymentSchedulesBySource, deletePaymentSchedule, getPaymentSchedulesBySource } from './paymentSchedulesService';
import { getCachedUser } from '../utils/authCache';

/**
 * Get all billers for the current user
 */
export const getAllBillers = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('billers'))
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching billers:', error);
    return { data: null, error };
  }
};

/**
 * Get a single biller by ID for the current user
 */
export const getBillerById = async (id: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('billers'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching biller:', error);
    return { data: null, error };
  }
};

/**
 * Create a new biller for the current user
 */
export const createBiller = async (biller: CreateBillerInput) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('billers'))
      .insert([{ ...biller, user_id: user.id }])
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
      .from(getTableName('billers'))
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
      .from(getTableName('billers'))
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
 * Get billers by status (active/inactive) for the current user
 */
export const getBillersByStatus = async (status: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('billers'))
      .select('*')
      .eq('user_id', user.id)
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
 * Get billers by category for the current user
 */
export const getBillersByCategory = async (category: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('billers'))
      .select('*')
      .eq('user_id', user.id)
      .eq('category', category)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching billers by category:', error);
    return { data: null, error };
  }
};

/**
 * Frontend-friendly functions that return Biller types (not SupabaseBiller)
 */

/**
 * Get all billers (returns frontend Biller types)
 */
export const getAllBillersFrontend = async (): Promise<{ data: Biller[] | null; error: any }> => {
  const { data, error } = await getAllBillers();
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillersToFrontend(data), error: null };
};

/**
 * Get a single biller by ID (returns frontend Biller type)
 */
export const getBillerByIdFrontend = async (id: string): Promise<{ data: Biller | null; error: any }> => {
  const { data, error } = await getBillerById(id);
  if (error || !data) {
    return { data: null, error };
  }
  return { data: supabaseBillerToFrontend(data), error: null };
};

/**
 * Create a new biller (accepts frontend Biller type)
 * Also creates monthly payment schedules in the payment schedules table
 */
export const createBillerFrontend = async (biller: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await createBiller(supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }
  
  // Generate and create payment schedules for the biller
  const convertedBiller = supabaseBillerToFrontend(data);
  const schedules = generateBillerPaymentSchedules(convertedBiller, 2026);
  
  if (schedules.length > 0) {
    const { error: schedulesError } = await createPaymentSchedulesBulk(schedules);
    if (schedulesError) {
      console.error('Error creating payment schedules for biller:', schedulesError);
      // Don't fail the entire operation, just log the error
    }
  }
  
  return { data: convertedBiller, error: null };
};

/**
 * Update an existing biller (accepts frontend Biller type).
 * When previousBiller is supplied the service also reconciles payment schedules:
 *  - Reactivation (inactive → active): creates new schedules from the new activation month
 *    without touching existing paid/partial records.
 *  - Regular edit with date/amount changes: deletes only pending schedules and recreates
 *    them, preserving all paid or partial entries.
 */
export const updateBillerFrontend = async (biller: Biller, previousBiller?: Biller): Promise<{ data: Biller | null; error: any }> => {
  const supabaseBiller = frontendBillerToSupabase(biller);
  const { data, error } = await updateBiller(biller.id, supabaseBiller);
  if (error || !data) {
    return { data: null, error };
  }

  const updatedBiller = supabaseBillerToFrontend(data);

  if (previousBiller) {
    const isReactivating = previousBiller.status === 'inactive' && updatedBiller.status === 'active';
    const targetYear = parseInt(updatedBiller.activationDate.year) || 2026;

    if (isReactivating) {
      // Reactivation: preserve existing paid/partial schedules; only add missing ones
      const { data: existingSchedules } = await getPaymentSchedulesBySource('biller', biller.id);
      const existingMonthYears = new Set(
        (existingSchedules || []).map(s => `${s.month}-${s.year}`)
      );

      const newSchedules = generateBillerPaymentSchedules(updatedBiller, targetYear);
      const schedulesToCreate = newSchedules.filter(
        s => !existingMonthYears.has(`${s.month}-${s.year}`)
      );

      if (schedulesToCreate.length > 0) {
        const { error: schedulesError } = await createPaymentSchedulesBulk(schedulesToCreate);
        if (schedulesError) {
          console.error('Error creating reactivation schedules:', schedulesError);
        }
      }
    } else {
      // Regular update: regenerate schedules only when key properties changed
      const activationChanged =
        previousBiller.activationDate.month !== updatedBiller.activationDate.month ||
        previousBiller.activationDate.year !== updatedBiller.activationDate.year;
      const deactivationChanged =
        JSON.stringify(previousBiller.deactivationDate) !== JSON.stringify(updatedBiller.deactivationDate);
      const amountChanged = previousBiller.expectedAmount !== updatedBiller.expectedAmount;

      if (activationChanged || deactivationChanged || amountChanged) {
        const { data: existingSchedules } = await getPaymentSchedulesBySource('biller', biller.id);
        const schedules = existingSchedules || [];

        // Delete only pending schedules — preserve paid/partial history
        const pendingIds = schedules.filter(s => s.status === 'pending').map(s => s.id);
        for (const id of pendingIds) {
          await deletePaymentSchedule(id);
        }

        // Re-create schedules for months not already covered by paid/partial records
        const coveredMonthYears = new Set(
          schedules.filter(s => s.status !== 'pending').map(s => `${s.month}-${s.year}`)
        );

        const newSchedules = generateBillerPaymentSchedules(updatedBiller, targetYear);
        const toCreate = newSchedules.filter(s => !coveredMonthYears.has(`${s.month}-${s.year}`));

        if (toCreate.length > 0) {
          const { error: schedulesError } = await createPaymentSchedulesBulk(toCreate);
          if (schedulesError) {
            console.error('Error creating updated schedules for biller:', schedulesError);
          }
        }
      }
    }
  }

  return { data: updatedBiller, error: null };
};

/**
 * Delete a biller and its payment schedules
 */
export const deleteBillerFrontend = async (id: string): Promise<{ error: any }> => {
  // First, delete all payment schedules for this biller
  const { error: schedulesError } = await deletePaymentSchedulesBySource('biller', id);
  if (schedulesError) {
    console.error('Error deleting payment schedules for biller:', schedulesError);
    // Continue with deleting the biller anyway
  }
  
  return await deleteBiller(id);
};
