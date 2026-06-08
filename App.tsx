
import React, { useState, useEffect, useRef } from 'react';
import { Menu, ChevronLeft, SlidersHorizontal, ArrowUp, ArrowDown, Eye, EyeOff, X, ChevronDown, LogOut, Lock, Users, Bell, MessageCircle, AlertCircle } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate, Outlet } from 'react-router-dom';
import { FloatingHUD } from './FloatingHUD';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { NAV_ITEMS, INITIAL_BUDGET, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';
import { getAllBillersFrontend, createBillerFrontend, updateBillerFrontend, deleteBillerFrontend } from './src/services/billersService';
import { getAllAccountsFrontend, createAccountFrontend, updateAccountFrontend, deleteAccountFrontend } from './src/services/accountsService';
import { getAllInstallmentsFrontend, createInstallmentFrontend, updateInstallmentFrontend, deleteInstallmentFrontend } from './src/services/installmentsService';
import { getAllBudgetSetupsFrontend, deleteBudgetSetupFrontend, archiveBudgetSetup, reopenBudgetSetup } from './src/services/budgetSetupsService';
import { getPaymentSchedulesBySource } from './src/services/paymentSchedulesService';
import { getAllTransactions, createTransaction, createPaymentScheduleTransaction, uploadTransactionReceipt, updateTransaction, getPendingTransactions, resolvePendingTransaction } from './src/services/transactionsService';
import { recordPayment } from './src/services/paymentSchedulesService';
import { supabase } from './src/utils/supabaseClient';
import { combineDateWithCurrentTime } from './src/utils/dateUtils';
import { recalculateAllAccountBalances } from './src/utils/accountBalanceCalculator';
import { updateUserProfile } from './src/services/userProfileService';
import { acceptFriendRequest, removeFriendship } from './src/services/friendshipsService';
import { getAllPeople, createPerson } from './src/services/peopleService';
import type { Biller, Account, Installment, Transaction } from './types';
import type { SupabaseTransaction } from './src/types/supabase';

// Context
import { TestEnvironmentProvider, useTestEnvironment } from './src/contexts/TestEnvironmentContext';
import { PinProtectionProvider, usePinProtection } from './src/contexts/PinProtectionContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { TestModeBanner } from './src/components/TestModeBanner';

// Pages
import Dashboard from './pages/Dashboard';
import Budget from './pages/Budget';
import TransactionsPage from './pages/transactions';
import Billers from './pages/Billers';
import Installments from './pages/Installments';
import Accounts from './pages/Accounts';
import AccountFilteredTransactions from './pages/accounts/view';
import StatementPage from './pages/accounts/statement';
import WalletsPage from './pages/Wallets';
import WalletView from './pages/wallets/view';
import PeoplePage from './pages/People';
import SettingsPage from './pages/Settings';
import SupabaseDemo from './pages/SupabaseDemo';
import Auth from './pages/Auth';
import UpdatePassword from './pages/update-password';
import AuthConfirm from './pages/AuthConfirm';
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useIncomingRequests, useUnreadMessagesCount, socialKeys } from './src/hooks/useBudies';
import { SetupWizard } from './src/components/SetupWizard';
import { Logo } from './src/components/Logo';
import useMediaQuery from './src/hooks/useMediaQuery';
import { MessagesInbox } from './src/components/MessagesInbox';

const queryClient = new QueryClient();

const AuthErrorPage: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
    <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
    <h1 className="text-2xl font-semibold text-red-800">{title}</h1>
    <p className="text-gray-600 mt-2">{message}</p>
  </div>
);

// This component is the guard.
const ProtectedRoute: React.FC = () => {
  const { user, loading: authLoading, isPasswordRecovery } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-gray-50 to-purple-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isPasswordRecovery && location.pathname !== '/update-password') {
      return <Navigate to="/update-password" replace />;
  }

  return (
    <PinProtectionProvider>
        <Outlet />
    </PinProtectionProvider>
  );
};


const MainApp: React.FC = () => {
    const { user, userProfile, signOut } = useAuth();
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
    const [budgetItems, setBudgetItems] = useState<any[]>(INITIAL_BUDGET);
    const [categories, setCategories] = useState<any[]>(INITIAL_CATEGORIES);
    const [billers, setBillers] = useState<Biller[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [budgetSetups, setBudgetSetups] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const location = useLocation();


    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-800 font-sans transition-colors duration-300">
            <main 
                ref={scrollContainerRef}
                className="flex-1 flex flex-col overflow-auto"
            >
                <div 
                    className="w-full flex-1 overflow-auto pt-0 px-4 pb-4 md:px-8 md:pb-6" 
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <Routes>
                        <Route path="/" element={<Dashboard accounts={accounts} budget={budgetItems} installments={installments} transactions={transactions} budgetSetups={budgetSetups} userProfile={userProfile} />} />
                        <Route path="/budget" element={
                            <Budget
                                items={budgetItems} 
                                userProfile={userProfile}
                                accounts={accounts} 
                                billers={billers}
                                categories={categories}
                                savedSetups={budgetSetups}
                                setSavedSetups={setBudgetSetups}
                                onAdd={(item) => setBudgetItems(prev => [...prev, item])}
                                onUpdateBiller={() => {}}
                                onUpdateInstallment={() => {}}
                                installments={installments}
                                onMoveToTrash={async (setup) => {
                                    const { error } = await deleteBudgetSetupFrontend(setup.id);
                                    if (error) {
                                        alert('Failed to delete budget setup.');
                                    } else {
                                        setBudgetSetups(prev => prev.filter(s => s.id !== setup.id));
                                    }
                                }}
                                onReloadSetups={() => {}}
                                onReloadBillers={() => {}}
                                onTransactionCreated={() => {}}
                                onTransactionDeleted={() => {}}
                                onArchiveBudget={async (setup) => {
                                    const { data, error } = await archiveBudgetSetup(setup.id);
                                    if (error) throw error;
                                    if (data) setBudgetSetups(prev => prev.map(s => s.id === data.id ? data : s));
                                }}
                                onReopenBudget={async (setup) => {
                                    const { data, error } = await reopenBudgetSetup(setup.id);
                                    if (error) throw error;
                                    if (data) setBudgetSetups(prev => prev.map(s => s.id === data.id ? data : s));
                                }}
                            />
                        } />
                        <Route path="/transactions" element={<TransactionsPage transactions={transactions} setTransactions={setTransactions} accounts={accounts} billers={billers} />} />
                        <Route path="/billers" element={<Billers billers={billers} setBillers={setBillers} onUpdate={setBillers} />} />
                        <Route path="/installments" element={<Installments installments={installments} setInstallments={setInstallments} />} />
                        <Route path="/accounts" element={<Accounts accounts={accounts} setAccounts={setAccounts} />} />
                        <Route path="/accounts/:id" element={<AccountFilteredTransactions allTransactions={transactions} />} />
                        <Route path="/accounts/statement/:id" element={<StatementPage />} />
                        <Route path="/wallets" element={<WalletsPage />} />
                        <Route path="/wallets/:id" element={<WalletView />} />
                        <Route path="/people" element={<PeoplePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/supabase-demo" element={<SupabaseDemo />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
};


// Main App component with Auth Provider - RESTRUCTURED with a protected route layout
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TestEnvironmentProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route 
                  path="/auth/auth-code-error" 
                  element={
                    <AuthErrorPage 
                      title="Link Invalid" 
                      message="The password reset link is invalid or has expired. Please try again." 
                    />
                  } 
                />

                {/* Protected App Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/*" element={<MainApp />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </TestEnvironmentProvider>
    </QueryClientProvider>
  );
};

export default App;
