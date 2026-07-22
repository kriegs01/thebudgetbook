import { supabase } from '../utils/supabaseClient';

export interface PayScheduleRule {
  id?: string;
  user_id?: string;
  effectiveFromDate: string; // 'YYYY-MM-DD'
  frequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'; // Added 'monthly' if you need it!
  firstPaycheckDate: string; // 'YYYY-MM-DD'
  customIntervalDays?: number;
  
  // 👇 The 3 new reference fields 👇
  pay_date_1?: number | null;
  pay_date_2?: number | null;
  day_of_week?: number | null;
}


const TABLE_NAME = 'pay_schedule_rules';

/**
 * Fetch all pay schedule rules for the current user, sorted chronologically.
 */
export const getPayScheduleRules = async (): Promise<{ data: PayScheduleRule[] | null; error: any }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('User not authenticated') };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', user.id)
    .order('effective_from_date', { ascending: true });

  if (error) return { data: null, error };

  // Map snake_case database columns to camelCase types
  const rules: PayScheduleRule[] = (data || []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    effectiveFromDate: row.effective_from_date,
    frequency: row.frequency,
    firstPaycheckDate: row.first_paycheck_date,
    customIntervalDays: row.custom_interval_days
  }));

  return { data: rules, error: null };
};

/**
 * Save or create a new pay schedule rule (supports future-dating).
 */
export const savePayScheduleRule = async (rule: PayScheduleRule): Promise<{ data: any; error: any }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('User not authenticated') };

  const payload = {
    user_id: rule.user_id,
    effective_from_date: rule.effectiveFromDate,
    frequency: rule.frequency,
    first_paycheck_date: rule.firstPaycheckDate,
    custom_interval_days: rule.customIntervalDays,
    // 👇 ADD THESE TO YOUR SAVE PAYLOAD 👇
    pay_date_1: rule.pay_date_1,
    pay_date_2: rule.pay_date_2,
    day_of_week: rule.day_of_week
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([payload])
    .select()
    .single();

  return { data, error };
};
