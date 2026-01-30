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
}

export interface SupabaseSavings {
  id: string; // uuid
  name: string;
  account_id: string; // uuid
  current_balance: number; // numeric
}

export interface SupabaseTransaction {
  id: string; // uuid
  name: string;
  date: string; // timestamp
  amount: number; // numeric
  payment_method_id: string; // uuid
}

export interface SupabaseTrash {
  id: string; // uuid
  type: string; // 'transaction', 'account', 'biller', 'installment', 'savings', 'budget'
  original_id: string; // uuid
  data: any; // jsonb - full record as JSON
  deleted_at: string; // timestamptz
}

export interface SupabaseCategory {
  id: string; // uuid
  name: string;
  subcategories: string[]; // jsonb stored as array
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

// Input types for creating new records (without id and timestamps)

export type CreateAccountInput = Omit<SupabaseAccount, 'id' | 'created_at'>;
export type UpdateAccountInput = Partial<CreateAccountInput>;

export type CreateBillerInput = Omit<SupabaseBiller, 'id'>;
export type UpdateBillerInput = Partial<CreateBillerInput>;

export type CreateInstallmentInput = Omit<SupabaseInstallment, 'id'>;
export type UpdateInstallmentInput = Partial<CreateInstallmentInput>;

export type CreateSavingsInput = Omit<SupabaseSavings, 'id'>;
export type UpdateSavingsInput = Partial<CreateSavingsInput>;

export type CreateTransactionInput = Omit<SupabaseTransaction, 'id'>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export type CreateTrashInput = Omit<SupabaseTrash, 'id' | 'deleted_at'>;
export type UpdateTrashInput = Partial<CreateTrashInput>;

export type CreateCategoryInput = Omit<SupabaseCategory, 'id' | 'created_at' | 'updated_at'>;
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

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
