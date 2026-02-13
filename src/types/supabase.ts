/**
 * Supabase Database Types
 * 
 * These types represent the actual database schema in Supabase.
 * They should match the tables as defined in your Postgres instance.
 */

// Database Tables Types

export interface SupabaseAccount {
  id: string; // uuid
  bank: string;
  classification: string;
  balance: number; // numeric
  type: string;
  credit_limit: number | null; // numeric, nullable
  billing_date: string | null; // date, nullable
  due_date: string | null; // date, nullable
  created_at: string; // timestamptz, default now()
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseBiller {
  id: string; // uuid
  name: string;
  category: string;
  due_date: string; // date
  expected_amount: number; // numeric
  timing: string;
  activation_date: any; // jsonb
  deactivation_c: any | null; // jsonb, nullable (note: field name is 'deactivation_c')
  status: string;
  schedules: any; // jsonb
  linked_account_id: string | null; // uuid, nullable - ENHANCEMENT: Links Loans-category billers to credit accounts
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseInstallment {
  id: string; // uuid
  name: string;
  total_amount: number; // numeric
  monthly_amount: number; // numeric
  term_duration: number; // int
  paid_amount: number; // numeric
  account_id: string; // uuid
  start_date: string | null; // date, nullable
  timing: string | null; // PROTOTYPE: '1/2' or '2/2' - payment timing within month
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseSavings {
  id: string; // uuid
  name: string;
  account_id: string; // uuid
  current_balance: number; // numeric
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseTransaction {
  id: string; // uuid
  name: string;
  date: string; // timestamp
  amount: number; // numeric
  payment_method_id: string; // uuid
  payment_schedule_id: string | null; // uuid, nullable - links to monthly_payment_schedules
  transaction_type: 'payment' | 'withdraw' | 'transfer' | 'loan' | 'cash_in' | 'loan_payment'; // NEW
  notes: string | null; // NEW
  related_transaction_id: string | null; // NEW - links transfer pairs and loan payments
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseBudgetSetup {
  id: string; // uuid
  month: string;
  timing: string;
  status: string;
  total_amount: number; // numeric
  data: Record<string, any> & { // jsonb - stores categorized items and salary data
    _projectedSalary?: string;
    _actualSalary?: string;
  };
  created_at: string; // timestamptz
  user_id: string | null; // uuid, references auth.users(id)
}

export interface SupabaseMonthlyPaymentSchedule {
  id: string; // uuid
  source_type: 'biller' | 'installment';
  source_id: string; // uuid
  month: string;
  year: number;
  payment_number: number | null;
  expected_amount: number; // numeric
  amount_paid: number; // numeric
  receipt: string | null;
  date_paid: string | null; // date
  account_id: string | null; // uuid
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
  user_id: string | null; // uuid, references auth.users(id)
}

// Input types for creating new records (without id, timestamps, and user_id)

export type CreateAccountInput = Omit<SupabaseAccount, 'id' | 'created_at' | 'user_id'>;
export type UpdateAccountInput = Partial<CreateAccountInput>;

export type CreateBillerInput = Omit<SupabaseBiller, 'id' | 'user_id'>;
export type UpdateBillerInput = Partial<CreateBillerInput>;

export type CreateInstallmentInput = Omit<SupabaseInstallment, 'id' | 'user_id'>;
export type UpdateInstallmentInput = Partial<CreateInstallmentInput>;

export type CreateSavingsInput = Omit<SupabaseSavings, 'id' | 'user_id'>;
export type UpdateSavingsInput = Partial<CreateSavingsInput>;

export type CreateTransactionInput = Omit<SupabaseTransaction, 'id' | 'user_id'>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export type CreateBudgetSetupInput = Omit<SupabaseBudgetSetup, 'id' | 'created_at' | 'user_id'>;
export type UpdateBudgetSetupInput = Partial<CreateBudgetSetupInput>;

export type CreateMonthlyPaymentScheduleInput = Omit<SupabaseMonthlyPaymentSchedule, 'id' | 'created_at' | 'updated_at' | 'user_id'>;
export type UpdateMonthlyPaymentScheduleInput = Partial<CreateMonthlyPaymentScheduleInput>;

// Database Response Types (for better type safety with Supabase responses)

export interface SupabaseResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface SupabaseListResponse<T> {
  data: T[] | null;
  error: Error | null;
  count?: number | null;
}
