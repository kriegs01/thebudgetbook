import React, { useState } from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { NAV_ITEMS, INITIAL_ACCOUNTS, INITIAL_BUDGET, INITIAL_BILLERS, INITIAL_INSTALLMENTS, INITIAL_SAVINGS, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';
import { createAccount } from './src/services/accountsService';
import { createBiller } from './src/services/billersService';
import { createInstallment } from './src/services/installmentsService';
import { createSavings } from './src/services/savingsService';
import type { Account, Biller, Installment, SavingsJar } from './types';

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

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [budgetItems, setBudgetItems] = useState(INITIAL_BUDGET);
  const [billers, setBillers] = useState(INITIAL_BILLERS);
  const [installments, setInstallments] = useState(INITIAL_INSTALLMENTS);
  const [savings, setSavings] = useState(INITIAL_SAVINGS);
  const [currency, setCurrency] = useState('PHP');
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  
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

  // Handler for adding accounts with Supabase
  const handleAddAccount = async (account: Account) => {
    try {
      const supabaseAccount = accountToSupabase(account);
      const { data, error } = await createAccount(supabaseAccount);
      
      if (error) {
        console.error('Error creating account:', error);
        alert('Failed to create account. Please try again.');
        return;
      }
      
      if (data) {
        // Add the new account with the ID from Supabase
        setAccounts(prev => [...prev, supabaseToAccount(data)]);
      }
    } catch (err) {
      console.error('Unexpected error creating account:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // Handler for adding billers with Supabase
  const handleAddBiller = async (biller: Biller) => {
    try {
      const supabaseBiller = billerToSupabase(biller);
      const { data, error } = await createBiller(supabaseBiller);
      
      if (error) {
        console.error('Error creating biller:', error);
        alert('Failed to create biller. Please try again.');
        return;
      }
      
      if (data) {
        // Add the new biller with the ID from Supabase
        setBillers(prev => [...prev, supabaseToBiller(data)]);
      }
    } catch (err) {
      console.error('Unexpected error creating biller:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // Handler for adding installments with Supabase
  const handleAddInstallment = async (installment: Installment) => {
    try {
      const supabaseInstallment = installmentToSupabase(installment);
      const { data, error } = await createInstallment(supabaseInstallment);
      
      if (error) {
        console.error('Error creating installment:', error);
        alert('Failed to create installment. Please try again.');
        return;
      }
      
      if (data) {
        // Add the new installment with the ID from Supabase
        setInstallments(prev => [...prev, supabaseToInstallment(data)]);
      }
    } catch (err) {
      console.error('Unexpected error creating installment:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // Handler for adding savings with Supabase
  const handleAddSavings = async (savingsJar: SavingsJar) => {
    try {
      const supabaseSavings = savingsToSupabase(savingsJar);
      const { data, error } = await createSavings(supabaseSavings);
      
      if (error) {
        console.error('Error creating savings jar:', error);
        alert('Failed to create savings jar. Please try again.');
        return;
      }
      
      if (data) {
        // Add the new savings jar with the ID from Supabase
        setSavings(prev => [...prev, supabaseToSavings(data)]);
      }
    } catch (err) {
      console.error('Unexpected error creating savings jar:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  const handleUpdateBiller = (updatedBiller) => {
    setBillers(prev => prev.map(b => b.id === updatedBiller.id ? updatedBiller : b));
  };

  const handleUpdateInstallment = (updatedInstallment) => {
    setInstallments(prev => prev.map(i => i.id === updatedInstallment.id ? updatedInstallment : i));
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
                  onDelete={(id) => setBillers(prev => prev.filter(b => b.id !== id))}
                />
              } />
              <Route path="/installments" element={
                <Installments
                  installments={installments}
                  accounts={accounts}
                  billers={billers}
                  onAdd={handleAddInstallment}
                  onUpdate={handleUpdateInstallment}
                  onDelete={(id) => setInstallments(prev => prev.filter(i => i.id !== id))}
                />
              } />
              <Route path="/accounts" element={
                <Accounts
                  accounts={accounts}
                  onAdd={handleAddAccount}
                  onEdit={(a) => setAccounts(prev => prev.map(acc => acc.id === a.id ? a : acc))}
                  onDelete={(id) => setAccounts(prev => prev.filter(a => a.id !== id))}
                  onDeactivate={(id, when) => {
                    // For now, just mark as inactive or remove - can be enhanced later
                    if (when === 'now') {
                      setAccounts(prev => prev.filter(a => a.id !== id));
                    }
                  }}
                />
              } />
              <Route path="/accounts/view" element={<AccountFilteredTransactions accounts={accounts} />} />
              <Route path="/accounts/statement" element={<StatementPage accounts={accounts} />} />
              <Route path="/savings" element={
                <Savings
                  jars={savings}
                  accounts={accounts}
                  onAdd={handleAddSavings}
                  onDelete={(id) => setSavings(prev => prev.filter(s => s.id !== id))}
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
              <Route path="/trash" element={
                <TrashPage
                  items={trashSetups}
                  onRestore={(setup) => {
                    setTrashSetups(prev => prev.filter(s => s.id !== setup.id));
                    setBudgetSetups(prev => [setup, ...prev]);
                  }}
                  onDeletePermanently={(id) => {
                    setTrashSetups(prev => prev.filter(s => s.id !== id));
                  }}
                />
              } />
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
