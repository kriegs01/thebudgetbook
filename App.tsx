import React, { useState, useEffect } from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { NAV_ITEMS, INITIAL_BUDGET, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';
import { getAllBillersFrontend, createBillerFrontend, updateBillerFrontend, deleteBillerFrontend } from './src/services/billersService';
import { getAllAccountsFrontend, createAccountFrontend, updateAccountFrontend, deleteAccountFrontend } from './src/services/accountsService';
import { getAllInstallmentsFrontend, createInstallmentFrontend, updateInstallmentFrontend, deleteInstallmentFrontend } from './src/services/installmentsService';
import { getAllSavingsFrontend, createSavingsFrontend, updateSavingsFrontend, deleteSavingsFrontend } from './src/services/savingsService';
import { getAllCategories, createCategory, updateCategory, deleteCategory } from './src/services/categoriesService';
import type { Biller, Account, Installment, SavingsJar, BudgetCategory } from './types';
import type { SupabaseCategory } from './src/types/supabase';

// Pages
import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import TransactionsPage from './pages/transactions';
import Billers from './pages/Billers';
import Installments from './pages/Installments';
import Accounts from './pages/Accounts';
import AccountFilteredTransactions from './pages/accounts/view';
import StatementPage from './pages/accounts/statement';
import Savings from './pages/Savings';
import SettingsPage from './pages/Settings';
import TrashPage from './pages/Trash';
import TrashPageNew from './pages/TrashNew';
import SupabaseDemo from './pages/SupabaseDemo';

// Helper function to convert UI Account to Supabase format
const accountToSupabase = (account: Account) => ({
  bank: account.bank,
  classification: account.classification,
  balance: account.balance,
  type: account.type,
  credit_limit: account.creditLimit ?? null,
  billing_date: account.billingDate ?? null,
  due_date: account.dueDate ?? null,
});

// Helper function to convert Supabase Account to UI format
const supabaseToAccount = (supabaseAccount: any): Account => ({
  id: supabaseAccount.id,
  bank: supabaseAccount.bank,
  classification: supabaseAccount.classification,
  balance: supabaseAccount.balance,
  type: supabaseAccount.type,
  creditLimit: supabaseAccount.credit_limit,
  billingDate: supabaseAccount.billing_date,
  dueDate: supabaseAccount.due_date,
});

// Helper function to convert UI Biller to Supabase format
const billerToSupabase = (biller: Biller) => ({
  name: biller.name,
  category: biller.category,
  due_date: biller.dueDate,
  expected_amount: biller.expectedAmount,
  timing: biller.timing,
  activation_date: biller.activationDate,
  deactivation_c: biller.deactivationDate ?? null,
  status: biller.status,
  schedules: biller.schedules,
});

// Helper function to convert Supabase Biller to UI format
const supabaseToBiller = (supabaseBiller: any): Biller => ({
  id: supabaseBiller.id,
  name: supabaseBiller.name,
  category: supabaseBiller.category,
  dueDate: supabaseBiller.due_date,
  expectedAmount: supabaseBiller.expected_amount,
  timing: supabaseBiller.timing,
  activationDate: supabaseBiller.activation_date,
  deactivationDate: supabaseBiller.deactivation_c,
  status: supabaseBiller.status,
  schedules: supabaseBiller.schedules,
});

// Helper function to convert UI Installment to Supabase format
const installmentToSupabase = (installment: Installment) => {
  // Extract numeric value from termDuration string (e.g., "12 months" -> 12)
  let termDurationNum = 0;
  if (installment.termDuration) {
    const match = installment.termDuration.match(/\d+/);
    if (match) {
      termDurationNum = parseInt(match[0], 10);
    }
  }
  // Default to 12 if no valid number found
  if (termDurationNum <= 0) {
    termDurationNum = 12;
  }
  
  return {
    name: installment.name,
    total_amount: installment.totalAmount,
    monthly_amount: installment.monthlyAmount,
    term_duration: termDurationNum,
    paid_amount: installment.paidAmount,
    account_id: installment.accountId,
  };
};

// Helper function to convert Supabase Installment to UI format
const supabaseToInstallment = (supabaseInstallment: any): Installment => ({
  id: supabaseInstallment.id,
  name: supabaseInstallment.name,
  totalAmount: supabaseInstallment.total_amount,
  monthlyAmount: supabaseInstallment.monthly_amount,
  termDuration: `${supabaseInstallment.term_duration} months`,
  paidAmount: supabaseInstallment.paid_amount,
  accountId: supabaseInstallment.account_id,
});

// Helper function to convert UI SavingsJar to Supabase format
const savingsToSupabase = (savings: SavingsJar) => ({
  name: savings.name,
  account_id: savings.accountId,
  current_balance: savings.currentBalance,
});

// Helper function to convert Supabase Savings to UI format
const supabaseToSavings = (supabaseSavings: any): SavingsJar => ({
  id: supabaseSavings.id,
  name: supabaseSavings.name,
  accountId: supabaseSavings.account_id,
  currentBalance: supabaseSavings.current_balance,
});

// Helper function to convert Supabase Category to UI format
const supabaseToCategory = (supabaseCategory: SupabaseCategory): BudgetCategory => ({
  id: supabaseCategory.id,
  name: supabaseCategory.name,
  subcategories: supabaseCategory.subcategories,
});

// Helper function to convert UI Category to Supabase format
const categoryToSupabase = (category: BudgetCategory) => ({
  name: category.name,
  subcategories: category.subcategories,
});

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [budgetItems, setBudgetItems] = useState(INITIAL_BUDGET);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [billersLoading, setBillersLoading] = useState(true);
  const [billersError, setBillersError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(true);
  const [installmentsError, setInstallmentsError] = useState<string | null>(null);
  const [savings, setSavings] = useState<SavingsJar[]>([]);
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('PHP');
  const [categories, setCategories] = useState<BudgetCategory[]>(INITIAL_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  
  // Lifted Budget Setups State
  const [budgetSetups, setBudgetSetups] = useState([
    { 
      id: '1', 
      month: 'January', 
      timing: '1/2', 
      status: 'Active', 
      totalAmount: 3000,
      data: JSON.parse(JSON.stringify(DEFAULT_SETUP))
    },
  ]);

  // Shared Trash State
  const [trashSetups, setTrashSetups] = useState([]);

  // Load all data from Supabase on component mount
  useEffect(() => {
    const fetchBillers = async () => {
      setBillersLoading(true);
      setBillersError(null);
      
      const { data, error } = await getAllBillersFrontend();
      
      if (error) {
        console.error('Error loading billers:', error);
        setBillersError('Failed to load billers from database');
        setBillers([]);
      } else {
        setBillers(data || []);
      }
      
      setBillersLoading(false);
    };

    const fetchAccounts = async () => {
      setAccountsLoading(true);
      setAccountsError(null);
      
      const { data, error } = await getAllAccountsFrontend();
      
      if (error) {
        console.error('Error loading accounts:', error);
        setAccountsError('Failed to load accounts from database');
        setAccounts([]);
      } else {
        setAccounts(data || []);
      }
      
      setAccountsLoading(false);
    };

    const fetchInstallments = async () => {
      setInstallmentsLoading(true);
      setInstallmentsError(null);
      
      const { data, error } = await getAllInstallmentsFrontend();
      
      if (error) {
        console.error('Error loading installments:', error);
        setInstallmentsError('Failed to load installments from database');
        setInstallments([]);
      } else {
        setInstallments(data || []);
      }
      
      setInstallmentsLoading(false);
    };

    const fetchSavings = async () => {
      setSavingsLoading(true);
      setSavingsError(null);
      
      const { data, error } = await getAllSavingsFrontend();
      
      if (error) {
        console.error('Error loading savings:', error);
        setSavingsError('Failed to load savings from database');
        setSavings([]);
      } else {
        setSavings(data || []);
      }
      
      setSavingsLoading(false);
    };

    const fetchCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      
      const { data, error } = await getAllCategories();
      
      if (error) {
        console.error('Error loading categories:', error);
        setCategoriesError('Failed to load categories from database');
        // Fallback to initial categories if database fetch fails
        setCategories(INITIAL_CATEGORIES);
      } else if (data && data.length > 0) {
        // Convert Supabase categories to UI format
        setCategories(data.map(supabaseToCategory));
      } else {
        // If no categories in database, use initial categories as fallback
        setCategories(INITIAL_CATEGORIES);
      }
      
      setCategoriesLoading(false);
    };
    
    fetchBillers();
    fetchAccounts();
    fetchInstallments();
    fetchSavings();
    fetchCategories();
  }, []);

  // Reload functions for each entity
  const reloadBillers = async () => {
    const { data, error } = await getAllBillersFrontend();
    if (error) {
      console.error('Error reloading billers:', error);
      setBillersError('Failed to reload billers from database');
    } else {
      setBillers(data || []);
      setBillersError(null);
    }
  };

  const reloadAccounts = async () => {
    const { data, error } = await getAllAccountsFrontend();
    if (error) {
      console.error('Error reloading accounts:', error);
      setAccountsError('Failed to reload accounts from database');
    } else {
      setAccounts(data || []);
      setAccountsError(null);
    }
  };

  const reloadInstallments = async () => {
    const { data, error } = await getAllInstallmentsFrontend();
    if (error) {
      console.error('Error reloading installments:', error);
      setInstallmentsError('Failed to reload installments from database');
    } else {
      setInstallments(data || []);
      setInstallmentsError(null);
    }
  };

  const reloadSavings = async () => {
    const { data, error } = await getAllSavingsFrontend();
    if (error) {
      console.error('Error reloading savings:', error);
      setSavingsError('Failed to reload savings from database');
    } else {
      setSavings(data || []);
      setSavingsError(null);
    }
  };

  const handleAddBiller = async (newBiller: Biller) => {
    const { data, error } = await createBillerFrontend(newBiller);
    if (error) {
      console.error('Error creating biller:', error);
      alert('Failed to create biller. Please try again.');
    } else {
      // Reload billers to get fresh data from Supabase
      await reloadBillers();
    }
  };

  const handleUpdateBiller = async (updatedBiller: Biller) => {
    const { data, error } = await updateBillerFrontend(updatedBiller);
    if (error) {
      console.error('Error updating biller:', error);
      alert('Failed to update biller. Please try again.');
    } else {
      // Reload billers to get fresh data from Supabase
      await reloadBillers();
    }
  };

  const handleDeleteBiller = async (id: string) => {
    const { error } = await deleteBillerFrontend(id);
    if (error) {
      console.error('Error deleting biller:', error);
      alert('Failed to delete biller. Please try again.');
    } else {
      // Reload billers to get fresh data from Supabase
      await reloadBillers();
    }
  };

  // Account handlers
  const handleAddAccount = async (newAccount: Account) => {
    const { data, error } = await createAccountFrontend(newAccount);
    if (error) {
      console.error('Error creating account:', error);
      alert('Failed to create account. Please try again.');
    } else {
      await reloadAccounts();
    }
  };

  const handleEditAccount = async (updatedAccount: Account) => {
    const { data, error } = await updateAccountFrontend(updatedAccount);
    if (error) {
      console.error('Error updating account:', error);
      alert('Failed to update account. Please try again.');
    } else {
      await reloadAccounts();
    }
  };

  const handleDeleteAccount = async (id: string) => {
    const { error } = await deleteAccountFrontend(id);
    if (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please try again.');
    } else {
      await reloadAccounts();
    }
  };

  // Installment handlers
  const handleAddInstallment = async (newInstallment: Installment) => {
    const { data, error } = await createInstallmentFrontend(newInstallment);
    if (error) {
      console.error('Error creating installment:', error);
      alert('Failed to create installment. Please try again.');
    } else {
      await reloadInstallments();
    }
  };

  const handleUpdateInstallment = async (updatedInstallment: Installment) => {
    const { data, error } = await updateInstallmentFrontend(updatedInstallment);
    if (error) {
      console.error('Error updating installment:', error);
      alert('Failed to update installment. Please try again.');
    } else {
      await reloadInstallments();
    }
  };

  const handleDeleteInstallment = async (id: string) => {
    const { error } = await deleteInstallmentFrontend(id);
    if (error) {
      console.error('Error deleting installment:', error);
      alert('Failed to delete installment. Please try again.');
    } else {
      await reloadInstallments();
    }
  };

  // Savings handlers
  const handleAddSavings = async (newSavings: SavingsJar) => {
    const { data, error } = await createSavingsFrontend(newSavings);
    if (error) {
      console.error('Error creating savings jar:', error);
      alert('Failed to create savings jar. Please try again.');
    } else {
      await reloadSavings();
    }
  };

  const handleDeleteSavings = async (id: string) => {
    const { error } = await deleteSavingsFrontend(id);
    if (error) {
      console.error('Error deleting savings jar:', error);
      alert('Failed to delete savings jar. Please try again.');
    } else {
      await reloadSavings();
    }
  };

  const handleResetAll = () => {
    const confirmation = window.confirm(
      "WARNING: This will permanently clear all your accounts, budget history, billers, installments, savings jars, and trash. This action cannot be undone. Do you want to proceed?"
    );
    if (confirmation) {
      setAccounts([]);
      setBudgetItems([]);
      setBillers([]);
      setInstallments([]);
      setSavings([]);
      setTrashSetups([]);
      setBudgetSetups([]);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50 w-full">
        <aside className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-20'}`}> 
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
              {isSidebarOpen && <span className="text-xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Budget Book</span>}
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  className={({ isActive }) =>
                    `w-full flex items-center p-3 rounded-xl transition-all ${
                      isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                  end={item.path === '/'}
                >
                  <div className={`${isSidebarOpen ? '' : 'mx-auto'} ${window.location.pathname === item.path ? 'text-blue-600' : 'text-gray-400'} transition-colors`}>
                    {item.icon}
                  </div>
                  {isSidebarOpen && <span className="ml-3 font-bold text-sm">{item.label}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="p-4 border-t border-gray-100">
              {isSidebarOpen ? (
                <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">JD</div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold text-gray-900 truncate">John Doe</p>
                    <p className="text-xs text-gray-500 truncate">john@budgetbook.com</p>
                  </div>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mx-auto">JD</div>
              )}
            </div>
          </div>
        </aside>
        <main className={`flex-1 bg-gray-50 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-64' : 'ml-20'} min-h-screen flex flex-col`}> 
          <div className="p-8 w-full flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard accounts={accounts} budget={budgetItems} installments={installments} />} />
              <Route path="/budget" element={
                <Budget
                  items={budgetItems} 
                  accounts={accounts} 
                  billers={billers}
                  categories={categories}
                  savedSetups={budgetSetups}
                  setSavedSetups={setBudgetSetups}
                  onAdd={(item) => setBudgetItems(prev => [...prev, item])}
                  onUpdateBiller={handleUpdateBiller}
                  onMoveToTrash={(setup) => {
                    setBudgetSetups(prev => prev.filter(s => s.id !== setup.id));
                    setTrashSetups(prev => [...prev, setup]);
                  }}
                />
              } />
              <Route path="/billers" element={
                <Billers
                  billers={billers}
                  installments={installments}
                  onAdd={handleAddBiller}
                  accounts={accounts}
                  categories={categories}
                  onUpdate={handleUpdateBiller}
                  onDelete={handleDeleteBiller}
                  loading={billersLoading}
                  error={billersError}
                />
              } />
              <Route path="/installments" element={
                <Installments
                  installments={installments}
                  accounts={accounts}
                  billers={billers}
                  onAdd={handleAddInstallment}
                  onUpdate={handleUpdateInstallment}
                  onDelete={handleDeleteInstallment}
                  loading={installmentsLoading}
                  error={installmentsError}
                />
              } />
              <Route path="/accounts" element={
                <Accounts
                  accounts={accounts}
                  onAdd={handleAddAccount}
                  onEdit={handleEditAccount}
                  onDelete={handleDeleteAccount}
                  onDeactivate={async (id, when) => {
                    // For now, just mark as inactive or remove - can be enhanced later
                    if (when === 'now') {
                      await handleDeleteAccount(id);
                    }
                  }}
                  loading={accountsLoading}
                  error={accountsError}
                />
              } />
              <Route path="/accounts/view" element={<AccountFilteredTransactions accounts={accounts} />} />
              <Route path="/accounts/statement" element={<StatementPage accounts={accounts} />} />
              <Route path="/savings" element={
                <Savings
                  jars={savings}
                  accounts={accounts}
                  onAdd={handleAddSavings}
                  onDelete={handleDeleteSavings}
                  loading={savingsLoading}
                  error={savingsError}
                />
              } />
              <Route path="/settings" element={
                <SettingsPage 
                  currency={currency}
                  setCurrency={setCurrency}
                  categories={categories}
                  setCategories={setCategories}
                  onResetAll={handleResetAll}
                />
              } />
              <Route path="/trash" element={<TrashPageNew />} />
              <Route path="/transactions" element={
                <TransactionsPage />
              } />
              <Route path="/supabase-demo" element={
                <SupabaseDemo />
              } />
              {/* Add additional routes/pages as needed */}
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
