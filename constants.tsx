import { LayoutDashboard, Wallet, Receipt, CreditCard, Landmark, PiggyBank, Settings, Trash2, FileText } from 'lucide-react';
import { Page, Account, BudgetItem, Biller, Installment, SavingsJar, BudgetCategory, PaymentSchedule, CategorizedSetupItem } from './types';

export const NAV_ITEMS = [
  { id: Page.DASHBOARD, label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, path: "/" },
  { id: Page.BUDGET, label: 'Budget', icon: <Wallet className="w-5 h-5" />, path: "/budget" },
  { id: Page.TRANSACTIONS, label: "Transactions", icon: <FileText className="w-5 h-5" />, path: "/transactions" },
  { id: Page.BILLERS, label: 'Billers', icon: <Receipt className="w-5 h-5" />, path: "/billers" },
  { id: Page.INSTALLMENTS, label: 'Installments', icon: <CreditCard className="w-5 h-5" />, path: "/installments" },
  { id: Page.ACCOUNTS, label: 'Accounts', icon: <Landmark className="w-5 h-5" />, path: "/accounts" },
  { id: Page.SAVINGS, label: 'Savings', icon: <PiggyBank className="w-5 h-5" />, path: "/savings" },
  { id: Page.SETTINGS, label: 'Settings', icon: <Settings className="w-5 h-5" />, path: "/settings" },
  { id: Page.TRASH, label: 'Trash', icon: <Trash2 className="w-5 h-5" />, path: "/trash" },
];

export const INITIAL_CATEGORIES: BudgetCategory[] = [
  { id: 'cat1', name: 'Fixed', subcategories: ['Allowance', 'Savings', 'Share'] },
  { id: 'cat2', name: 'Utilities', subcategories: ['Electric', 'Water', 'Internet'] },
  { id: 'cat3', name: 'Loans', subcategories: ['Bank Loan', 'Personal Loan'] },
  { id: 'cat4', name: 'Subscriptions', subcategories: ['Netflix', 'Spotify', 'Prime'] },
  { id: 'cat5', name: 'Purchases', subcategories: ['Groceries', 'Personal Care'] },
];

export const INITIAL_ACCOUNTS: Account[] = [
  { id: '1', bank: 'EastWest VISA Privilege', classification: 'Credit Card', balance: 5240.50, type: 'Credit', creditLimit: 50000, billingDate: '2026-01-10', dueDate: '2026-01-25' },
  { id: '2', bank: 'Amex', classification: 'Credit Card', balance: 1200.00, type: 'Credit', creditLimit: 10000, billingDate: '2026-01-15', dueDate: '2026-02-01' },
  { id: '3', bank: 'Ally', classification: 'Savings', balance: 15000.00, type: 'Debit' },
];

export const INITIAL_BUDGET: BudgetItem[] = [
  { id: 'b1', name: 'Groceries', amount: 450, category: 'Food', date: '2024-05-01', accountId: '1' },
  { id: 'b2', name: 'Netflix', amount: 15.99, category: 'Entertainment', date: '2024-05-05', accountId: '2' },
];

export const DEFAULT_SETUP: { [key: string]: CategorizedSetupItem[] } = {
  Fixed: [
    { id: 'f1', name: 'Allowance', amount: '1000', included: true, status: 'Unallocated' },
    { id: 'f2', name: 'Savings', amount: '1000', included: true, status: 'Unallocated' },
    { id: 'f3', name: 'Share', amount: '1000', included: true, status: 'Unallocated' },
  ],
  Utilities: [],
  Loans: [],
  Subscriptions: [],
  Purchases: [
    { id: 'p1', name: 'Groceries', amount: '0', included: false, timing: '1/2' },
  ],
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const generateSchedules = (expectedAmount: number, year: string): PaymentSchedule[] => {
  return MONTHS.map(month => ({
    month,
    year,
    expectedAmount
  }));
};

export const INITIAL_BILLERS: Biller[] = [
  {
    id: 'bl1',
    name: 'Electric Co',
    category: 'Utilities',
    dueDate: '20th',
    expectedAmount: 120,
    timing: '1/2',
    activationDate: { month: 'January', year: '2026' },
    status: 'active',
    schedules: generateSchedules(120, '2026')
  },
  {
    id: 'bl2',
    name: 'Internet Sub',
    category: 'Subscriptions',
    dueDate: '5th',
    expectedAmount: 50,
    timing: '1/2',
    activationDate: { month: 'January', year: '2025' },
    deactivationDate: { month: 'December', year: '2025' },
    status: 'inactive',
    schedules: generateSchedules(50, '2026')
  },
  {
    id: 'bl3',
    name: 'Water Service',
    category: 'Utilities',
    dueDate: '25th',
    expectedAmount: 80,
    timing: '2/2',
    activationDate: { month: 'January', year: '2026' },
    status: 'active',
    schedules: generateSchedules(80, '2026')
  }
];

export const INITIAL_INSTALLMENTS: Installment[] = [
  { id: 'i1', name: 'iPhone 15 Pro', totalAmount: 1200, monthlyAmount: 50, termDuration: '24 months', paidAmount: 300, accountId: '2', startDate: '2025-01' },
  { id: 'i2', name: 'MacBook Air', totalAmount: 1500, monthlyAmount: 125, termDuration: '12 months', paidAmount: 1500, accountId: '1', startDate: '2024-12' },
];

export const INITIAL_SAVINGS: SavingsJar[] = [
  { id: 's1', name: 'Emergency Fund', accountId: '3', currentBalance: 10000 },
  { id: 's2', name: 'New Car', accountId: '3', currentBalance: 5000 },
];
