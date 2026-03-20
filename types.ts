export type AccountClassification = 'Checking' | 'Savings' | 'Credit Card' | 'Loan' | 'Investment';

export interface Account {
  id: string;
  bank: string;
  classification: AccountClassification;
  balance: number;
  openingBalance?: number; // Immutable calculation seed — maps to the DB `opening_balance` column (DEFAULT 0). Set once on account creation; NEVER overwritten by recalculation results.
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

  // Lifecycle config — default: active (treat missing `active` as true)
  active?: boolean;          // false = deactivated category
  deactivatedAt?: string;    // ISO date, e.g. '2026-03-01' — first month where category is HIDDEN
  reactivatedFrom?: string;  // ISO date, e.g. '2026-09-01' — first month where category is VISIBLE again (inclusive)
  legacyFrom?: string;       // ISO date — if set, "Legacy" label shown only for months >= this date (before deactivation)

  // Behavior config — default: data + manual (treat missing `flexiMode` as true)
  flexiMode?: boolean;       // true = data + manual "Add Item"; false = data-only (no Add Item button)
}

export interface PaymentSchedule {
  id: string; // Unique identifier for the schedule
  month: string;
  year: string;
  expectedAmount: number;
  amountPaid?: number;
  receipt?: string;
  datePaid?: string;
  accountId?: string;
}

export interface BillerAmountIncrease {
  effectiveDate: string; // 'YYYY-MM-DD'
  amount: number;        // new amount from this date onward
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
  linkedAccountId?: string; // ENHANCEMENT: Links Loans-category billers to credit accounts for dynamic amount calculation
  scheduledIncreases?: BillerAmountIncrease[]; // Scheduled future amount changes (Fixed/Utilities/Subscriptions only)
}

export interface Installment {
  id: string;
  name: string;
  totalAmount: number;
  monthlyAmount: number;
  termDuration: string; // e.g., "12 months"
  paidAmount: number;
  accountId: string;
  startDate?: string; // Format: YYYY-MM
  billerId?: string; // Link to Biller for Loans category
  timing?: '1/2' | '2/2'; // PROTOTYPE: Payment timing within the month
}

export interface SavingsJar {
  id: string;
  name: string;
  accountId: string;
  currentBalance: number;
}

export interface Transaction {
  id: string;
  name: string;
  date: string;
  amount: number;
  paymentMethodId: string;
}

export interface CategorizedSetupItem {
  id: string;
  name: string;
  amount: string;
  included: boolean;
  status?: 'Allocated' | 'Unallocated';
  timing?: '1/2' | '2/2';
  isBiller?: boolean;
  accountId?: string;
  settled?: boolean;
}

export interface SavedBudgetSetup {
  id: string;
  month: string;
  timing: string;
  status: string;
  totalAmount: number;
  data: { [key: string]: CategorizedSetupItem[] } & {
    _projectedSalary?: string;
    _actualSalary?: string;
    _excludedInstallmentIds?: string[];
  };
  isArchived: boolean;
  closedAt: string | null;
  reopenedAt: string | null;
}

export type ViewMode = 'card' | 'list';

export interface Wallet {
  id: string;
  userId: string;
  name: string;
  amount: number;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export enum Page {
  DASHBOARD = 'DASHBOARD',
  BUDGET = 'BUDGET',
  TRANSACTIONS = 'TRANSACTIONS',
  BILLERS = 'BILLERS',
  INSTALLMENTS = 'INSTALLMENTS',
  ACCOUNTS = 'ACCOUNTS',
  SAVINGS = 'SAVINGS',
  WALLET = 'WALLET',
  SETTINGS = 'SETTINGS',
  TRASH = 'TRASH',
}
