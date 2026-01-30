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
