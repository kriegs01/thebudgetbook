export type AccountClassification = 'Checking' | 'Savings' | 'Credit Card' | 'Loan' | 'Investment';

export interface Account {
  id: string;
  bank: string;
  classification: AccountClassification;
  balance: number;
  type: 'Debit' | 'Credit';
  creditLimit?: number;
  billingDate?: string;
  dueDate?: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  accountId: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  subcategories: string[];
}

export interface PaymentSchedule {
  month: string;
  year: string;
  expectedAmount: number;
  amountPaid?: number;
  receipt?: string;
  datePaid?: string;
  accountId?: string;
}

export interface Biller {
  id: string;
  name: string;
  category: string;
  dueDate: string;
  expectedAmount: number;
  timing: '1/2' | '2/2';
  activationDate: {
    month: string;
    day?: string;
    year: string;
  };
  deactivationDate?: {
    month: string;
    year: string;
  };
  status: 'active' | 'inactive';
  schedules: PaymentSchedule[];
}

export interface Installment {
  id: string;
  name: string;
  totalAmount: number;
  monthlyAmount: number;
  termDuration: string; // e.g., "12 months"
  paidAmount: number;
  accountId: string;
}

export interface SavingsJar {
  id: string;
  name: string;
  accountId: string;
  currentBalance: number;
}

export interface CategorizedSetupItem {
  id: string;
  name: string;
  amount: string;
  included: boolean;
  status?: 'Allocated' | 'Unallocated';
  timing?: '1/2' | '2/2';
  isBiller?: boolean;
}

export interface SavedBudgetSetup {
  id: string;
  month: string;
  timing: string;
  status: string;
  totalAmount: number;
  data: { [key: string]: CategorizedSetupItem[] };
}

export type ViewMode = 'card' | 'list';

export enum Page {
  DASHBOARD = 'DASHBOARD',
  BUDGET = 'BUDGET',
  BILLERS = 'BILLERS',
  INSTALLMENTS = 'INSTALLMENTS',
  ACCOUNTS = 'ACCOUNTS',
  SAVINGS = 'SAVINGS',
  SETTINGS = 'SETTINGS',
  TRASH = 'TRASH',
}