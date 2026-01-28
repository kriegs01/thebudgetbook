import React, { useState } from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import { Page, Account, BudgetItem, Biller, Installment, SavingsJar, SavedBudgetSetup, BudgetCategory } from './types';
import { NAV_ITEMS, INITIAL_ACCOUNTS, INITIAL_BUDGET, INITIAL_BILLERS, INITIAL_INSTALLMENTS, INITIAL_SAVINGS, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';

// Pages
import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import Billers from './pages/Billers';
import Installments from './pages/Installments';
import Accounts from './pages/Accounts';
import Savings from './pages/Savings';
import SettingsPage from './pages/Settings';
import TrashPage from './pages/Trash';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>(INITIAL_BUDGET);
  const [billers, setBillers] = useState<Biller[]>(INITIAL_BILLERS);
  const [installments, setInstallments] = useState<Installment[]>(INITIAL_INSTALLMENTS);
  const [savings, setSavings] = useState<SavingsJar[]>(INITIAL_SAVINGS);
  const [currency, setCurrency] = useState('PHP');
  const [categories, setCategories] = useState<BudgetCategory[]>(INITIAL_CATEGORIES);
  
  // Lifted Budget Setups State
  const [budgetSetups, setBudgetSetups] = useState<SavedBudgetSetup[]>([
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
  const [trashSetups, setTrashSetups] = useState<SavedBudgetSetup[]>([]);

  const handleUpdateBiller = (updatedBiller: Biller) => {
    setBillers(prev => prev.map(b => b.id === updatedBiller.id ? updatedBiller : b));
  };

  const handleUpdateInstallment = (updatedInstallment: Installment) => {
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
      setCurrentPage(Page.DASHBOARD);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case Page.DASHBOARD: return <Dashboard accounts={accounts} budget={budgetItems} installments={installments} />;
      case Page.BUDGET: return (
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
      );
      case Page.BILLERS: return (
        <Billers 
          billers={billers} 
          onAdd={(b) => setBillers(prev => [...prev, b])} 
          accounts={accounts}
          categories={categories}
          onUpdate={handleUpdateBiller}
          onDelete={(id) => setBillers(prev => prev.filter(b => b.id !== id))}
        />
      );
      case Page.INSTALLMENTS: return (
        <Installments 
          installments={installments} 
          accounts={accounts} 
          onAdd={(i) => setInstallments(prev => [...prev, i])} 
          onUpdate={handleUpdateInstallment}
          onDelete={(id) => setInstallments(prev => prev.filter(i => i.id !== id))}
        />
      );
      case Page.ACCOUNTS: return (
        <Accounts 
          accounts={accounts} 
          onAdd={(a) => setAccounts(prev => [...prev, a])} 
          onDelete={(id) => setAccounts(prev => prev.filter(a => a.id !== id))}
        />
      );
      case Page.SAVINGS: return (
        <Savings 
          jars={savings} 
          accounts={accounts} 
          onAdd={(s) => setSavings(prev => [...prev, s])} 
          onDelete={(id) => setSavings(prev => prev.filter(s => s.id !== id))}
        />
      );
      case Page.SETTINGS: return <SettingsPage currency={currency} setCurrency={setCurrency} categories={categories} setCategories={setCategories} onResetAll={handleResetAll} />;
      case Page.TRASH: return (
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
      );
      default: return <Dashboard accounts={accounts} budget={budgetItems} installments={installments} />;
    }
  };

  return (
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
              <button key={item.id} onClick={() => setCurrentPage(item.id)} className={`w-full flex items-center p-3 rounded-xl transition-all ${currentPage === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}> 
                <div className={`${currentPage === item.id ? 'text-blue-600' : 'text-gray-400'} transition-colors`}>{item.icon}</div>
                {isSidebarOpen && <span className="ml-3 font-bold text-sm">{item.label}</span>}
              </button>
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
        <div className="p-8 w-full flex-1 overflow-auto">{renderPage()}</div>
      </main>
    </div>
  );
};

export default App;
