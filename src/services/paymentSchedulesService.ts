/**
 * Payment Schedules Service
 * 
 * Provides CRUD operations for the payment_schedules table in Supabase.
 * This service replaces the legacy JSONB schedules array in the billers table.
 */

import { supabase } from '../utils/supabaseClient';
import type {
  SupabasePaymentSchedule,
  CreatePaymentScheduleInput,
  UpdatePaymentScheduleInput,
} from '../types/supabase';

/**
 * Payment schedule with joined biller and installment data for Budget display
 */
export interface PaymentScheduleWithDetails extends SupabasePaymentSchedule {
  biller?: {
    id: string;
    name: string;
    category: string;
    timing: string;
  } | null;
  installment?: {
    id: string;
    name: string;
    timing: string;
  } | null;
}

/**
 * Get all payment schedules
 * Note: Schedules are sorted client-side by year and month order, not by database
 */
export const getAllPaymentSchedules = async () => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .order('schedule_year', { ascending: true });

    if (error) throw error;
    
    // Sort client-side by month order (not alphabetically)
    const sortedData = data ? sortSchedulesChronologically(data) : null;
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific biller
 * Note: Schedules are sorted client-side by year and month order, not by database
 */
export const getPaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .order('schedule_year', { ascending: true });

    if (error) throw error;
    
    // Sort client-side by month order (not alphabetically)
    const sortedData = data ? sortSchedulesChronologically(data) : null;
    
    return { data: sortedData, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules for biller:', error);
    return { data: null, error };
  }
};

/**
 * Get a single payment schedule by ID
 */
export const getPaymentScheduleById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for a specific month and year
 */
export const getPaymentSchedulesByMonthYear = async (month: string, year: string) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('schedule_month', month)
      .eq('schedule_year', year);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules by month/year:', error);
    return { data: null, error };
  }
};

/**
 * Get a specific payment schedule for a biller by month and year
 */
export const getPaymentScheduleByBillerMonthYear = async (
  billerId: string,
  month: string,
  year: string
) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .select('*')
      .eq('biller_id', billerId)
      .eq('schedule_month', month)
      .eq('schedule_year', year)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching payment schedule by biller/month/year:', error);
    return { data: null, error };
  }
};

/**
 * Get payment schedules for Budget page with joined biller and installment data
 * Filters by month, year, and optionally by timing (1/2 or 2/2)
 */
export const getPaymentSchedulesForBudget = async (
  month: string,
  year: string,
  timing?: '1/2' | '2/2'
): Promise<{ data: PaymentScheduleWithDetails[] | null; error: any }> => {
  try {
    let query = supabase
      .from('payment_schedules')
      .select(`
        *,
        billers:biller_id (id, name, category, timing),
        installments:installment_id (id, name, timing)
      `)
      .eq('schedule_month', month)
      .eq('schedule_year', year);

    // If timing is specified, filter by it
    // Note: We need to filter on the joined tables' timing field
    // This will be done client-side after fetching
    
    const { data, error } = await query;

    if (error) throw error;

    // Cast the data to the correct type
    let schedules = data as unknown as PaymentScheduleWithDetails[];

    // Filter by timing if specified (client-side filtering)
    if (timing && schedules) {
      schedules = schedules.filter(schedule => {
        // Check biller timing
        if (schedule.biller && schedule.biller.timing === timing) {
          return true;
        }
        // Check installment timing
        if (schedule.installment && schedule.installment.timing === timing) {
          return true;
        }
        return false;
      });
    }

    return { data: schedules, error: null };
  } catch (error) {
    console.error('Error fetching payment schedules for budget:', error);
    return { data: null, error };
  }
};

/**
 * Create a new payment schedule
 */
export const createPaymentSchedule = async (schedule: CreatePaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .insert([schedule])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Create multiple payment schedules in batch
 */
export const createPaymentSchedulesBatch = async (schedules: CreatePaymentScheduleInput[]) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .insert(schedules)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedules batch:', error);
    return { data: null, error };
  }
};

/**
 * Update an existing payment schedule
 */
export const updatePaymentSchedule = async (id: string, updates: UpdatePaymentScheduleInput) => {
  try {
    const { data, error } = await supabase
      .from('payment_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Mark a payment schedule as paid
 */
export const markPaymentScheduleAsPaid = async (
  id: string,
  amountPaid: number,
  datePaid: string,
  accountId?: string,
  receipt?: string
) => {
  try {
    const updates: UpdatePaymentScheduleInput = {
      amount_paid: amountPaid,
      date_paid: datePaid,
      account_id: accountId || null,
      receipt: receipt || null,
    };

    const { data, error } = await supabase
      .from('payment_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error marking payment schedule as paid:', error);
    return { data: null, error };
  }
};

/**
 * Delete a payment schedule
 */
export const deletePaymentSchedule = async (id: string) => {
  try {
    const { error } = await supabase
      .from('payment_schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedule:', error);
    return { error };
  }
};

/**
 * Delete all payment schedules for a biller
 */
export const deletePaymentSchedulesByBillerId = async (billerId: string) => {
  try {
    const { error } = await supabase
      .from('payment_schedules')
      .delete()
      .eq('biller_id', billerId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting payment schedules for biller:', error);
    return { error };
  }
};

/**
 * Month order for proper chronological sorting
 * Exported for use in other services
 */
export const MONTHS_ORDERED = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Sort payment schedules by year then month in chronological order
 */
export const sortSchedulesChronologically = (schedules: SupabasePaymentSchedule[]): SupabasePaymentSchedule[] => {
  return schedules.sort((a, b) => {
    // First sort by year
    if (a.schedule_year !== b.schedule_year) {
      return Number(a.schedule_year) - Number(b.schedule_year);
    }
    // Then sort by month order (not alphabetically)
    return MONTHS_ORDERED.indexOf(a.schedule_month) - MONTHS_ORDERED.indexOf(b.schedule_month);
  });
};

/**
 * Generate payment schedules for a biller from activation month through end of activation year
 * Used when creating or updating a biller
 */
export const generateSchedulesForBiller = (
  billerId: string,
  activationDate: { month: string; year: string },
  deactivationDate: { month: string; year: string } | undefined,
  expectedAmount: number
): CreatePaymentScheduleInput[] => {
  const schedules: CreatePaymentScheduleInput[] = [];
  
  const activationMonthIndex = MONTHS_ORDERED.indexOf(activationDate.month);
  const activationYear = parseInt(activationDate.year);
  
  if (activationMonthIndex === -1) {
    console.error(`Invalid activation month: ${activationDate.month}`);
    return schedules;
  }
  
  // Calculate deactivation if provided
  let deactivationMonthIndex = -1;
  let deactivationYear = -1;
  if (deactivationDate) {
    deactivationMonthIndex = MONTHS_ORDERED.indexOf(deactivationDate.month);
    deactivationYear = parseInt(deactivationDate.year);
  }

  // Generate schedules from activation month through December of activation year
  // This creates schedules only for the current year, in calendar order
  for (let monthIndex = activationMonthIndex; monthIndex < 12; monthIndex++) {
    // Check if we've reached deactivation date in the same year
    if (deactivationDate && 
        activationYear === deactivationYear && 
        monthIndex > deactivationMonthIndex) {
      break;
    }

    schedules.push({
      biller_id: billerId,
      installment_id: null, // Schedules for billers have no installment_id
      schedule_month: MONTHS_ORDERED[monthIndex],
      schedule_year: activationYear.toString(),
      expected_amount: expectedAmount,
      amount_paid: null,
      receipt: null,
      date_paid: null,
      account_id: null,
    });
  }

  return schedules;
};

/**
 * Generate payment schedules for an installment based on start date and term duration
 * Used when creating an installment
 * 
 * @param installmentId - The ID of the installment
 * @param startDate - Start date in format "YYYY-MM" (e.g., "2026-03")
 * @param termDuration - Term duration as number (e.g., 12) or string (e.g., "12 months", "12")
 * @param monthlyAmount - Monthly payment amount
 * @returns Array of payment schedule objects ready for batch insert
 * 
 * @example
 * // With number (database format)
 * generateSchedulesForInstallment('id', '2026-03', 12, 500)
 * 
 * @example
 * // With string
 * generateSchedulesForInstallment('id', '2026-03', '12 months', 500)
 */
export const generateSchedulesForInstallment = (
  installmentId: string,
  startDate: string,
  termDuration: string | number,
  monthlyAmount: number
): CreatePaymentScheduleInput[] => {
  const schedules: CreatePaymentScheduleInput[] = [];
  
  // DEFENSIVE: Validate that startDate is a string before using string methods
  if (typeof startDate !== 'string') {
    console.error('[generateSchedulesForInstallment] startDate must be a string, received:', typeof startDate, startDate);
    return schedules;
  }
  
  // Parse start date (format: "YYYY-MM")
  const [yearStr, monthStr] = startDate.split('-');
  const startYear = parseInt(yearStr);
  const startMonthNumber = parseInt(monthStr); // 1-12
  
  if (!startYear || !startMonthNumber || startMonthNumber < 1 || startMonthNumber > 12) {
    console.error(`[generateSchedulesForInstallment] Invalid start date format: ${startDate}. Expected format: YYYY-MM`);
    return schedules;
  }
  
  const startMonthIndex = startMonthNumber - 1; // Convert to 0-11 for array indexing
  
  // DEFENSIVE: Convert termDuration to number, handling both string and number inputs
  // Accepts:
  //   - number: 12 (from database)
  //   - string: "12" or "12 months" (from forms or legacy code)
  let term: number;
  
  if (typeof termDuration === 'number') {
    // Direct number input (database format)
    term = termDuration;
    console.log(`[generateSchedulesForInstallment] Using term duration as number: ${term}`);
  } else if (typeof termDuration === 'string') {
    // String input - extract number (e.g., "12 months" -> 12, "12" -> 12)
    const termMatch = termDuration.match(/(\d+)/);
    if (!termMatch) {
      console.error(`[generateSchedulesForInstallment] Invalid term duration format: ${termDuration}. Expected number or string like "12 months"`);
      return schedules;
    }
    term = parseInt(termMatch[1], 10);
    console.log(`[generateSchedulesForInstallment] Parsed term duration from string "${termDuration}": ${term}`);
  } else {
    console.error('[generateSchedulesForInstallment] termDuration must be a number or string, received:', typeof termDuration, termDuration);
    return schedules;
  }
  
  // Validate the parsed term is a positive integer
  if (isNaN(term) || term <= 0 || !Number.isInteger(term)) {
    console.error(`[generateSchedulesForInstallment] Invalid term duration value: ${term}. Must be a positive integer.`);
    return schedules;
  }
  
  // Generate monthly schedules for the full term
  let currentMonthIndex = startMonthIndex;
  let currentYear = startYear;
  
  for (let i = 0; i < term; i++) {
    schedules.push({
      biller_id: null, // Schedules for installments have no biller_id
      installment_id: installmentId,
      schedule_month: MONTHS_ORDERED[currentMonthIndex],
      schedule_year: currentYear.toString(),
      expected_amount: monthlyAmount,
      amount_paid: null,
      receipt: null,
      date_paid: null,
      account_id: null,
    });
    
    // Move to next month
    currentMonthIndex++;
    if (currentMonthIndex >= 12) {
      currentMonthIndex = 0;
      currentYear++;
    }
  }
  
  return schedules;
};
