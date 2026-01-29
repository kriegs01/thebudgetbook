import React, { useState } from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { NAV_ITEMS, INITIAL_ACCOUNTS, INITIAL_BUDGET, INITIAL_BILLERS, INITIAL_INSTALLMENTS, INITIAL_SAVINGS, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';

import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import TransactionsPage from './pages/transactions';
import Billers from './pages/Billers';
import Installments from './pages/Installments';
import Accounts from './pages/Accounts';
import Savings from './pages/Savings';
import SettingsPage from './pages/Settings';
import TrashPage from './pages/Trash';
import AccountFilteredTransactions from './pages/accounts/view';

function Sidebar({ isSidebarOpen, setIsSidebarOpen }: { isSidebarOpen: boolean, setIsSidebarOpen: (o: boolean) => void }) {
  const location = useLocation();

  return (
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
              to={item.path || '/'} // You must add a `path` property to each NAV_ITEMS entry!
              className={({ isActive }) =>
                `w-full flex items-center p-3 rounded-xl transition-all ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
              end={item.path === '/'} // Only exact match for "/"
            >
              <div className={`${location.pathname === (item.path || '/') ? 'text-blue-600' : 'text-gray-400'} transition-colors`}>
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
  );
}

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // You may need to lift state (accounts, budgetItems, etc.) to context if other pages edit them!
  //
