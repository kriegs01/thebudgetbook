
import React, { useState, useEffect, useRef } from 'react';
import { Menu, ChevronLeft, SlidersHorizontal, ArrowUp, ArrowDown, Eye, EyeOff, X, ChevronDown, LogOut, Lock, Users, Bell, MessageCircle, AlertCircle } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
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
import AuthConfirm from './pages/AuthConfirm'; // <-- ADDED
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useIncomingRequests, useUnreadMessagesCount, socialKeys } from './src/hooks/useBudies';
import { SetupWizard } from './src/components/SetupWizard';
import { Logo } from './src/components/Logo';
import useMediaQuery from './src/hooks/useMediaQuery';
import { MessagesInbox } from './src/components/MessagesInbox';

// ... (Your helper functions like accountToSupabase, etc. remain unchanged) ...

const queryClient = new QueryClient();

// ADDED: A simple component for auth-related error pages
const AuthErrorPage: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
    <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
    <h1 className="text-2xl font-semibold text-red-800">{title}</h1>
    <p className="text-gray-600 mt-2">{message}</p>
  </div>
);

// Main App Content (Protected) - MODIFIED to be an auth gate
const AppContent: React.FC = () => {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();

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

  // MODIFIED: If no user, redirect to the public auth page.
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User is authenticated, show main app
  return (
    <PinProtectionProvider>
      <MainApp user={user} userProfile={userProfile} signOut={signOut} />
    </PinProtectionProvider>
  );
};


// ... (The large MainApp component remains mostly unchanged, but it now renders the nested routes) ...
const MainApp: React.FC<{ user: any; userProfile: any; signOut: () => Promise<void> }> = ({ user, userProfile, signOut }) => {
    // ... all your existing state and logic for MainApp ...

    return (
        <>
            {/* ... All your existing JSX for the main layout (sidebar, header, modals) ... */}

            <div 
                ref={scrollContainerRef}
                className="w-full flex-1 overflow-auto pt-0 px-4 pb-4 md:px-8 md:pb-6" 
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {/* MODIFIED: The Routes are now inside the main layout */}
                <Routes>
                    <Route path="/" element={<Dashboard accounts={accounts} budget={budgetItems} installments={installments} transactions={transactions} budgetSetups={budgetSetups} userProfile={userProfile} theme={theme} />} />
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
                            onUpdateBiller={handleUpdateBiller}
                            onUpdateInstallment={handleUpdateInstallment}
                            installments={installments}
                            onMoveToTrash={async (setup) => {
                                const { error } = await deleteBudgetSetupFrontend(setup.id);
                                if (error) {
                                    alert('Failed to delete budget setup.');
                                } else {
                                    setBudgetSetups(prev => prev.filter(s => s.id !== setup.id));
                                }
                            }}
                            onReloadSetups={reloadBudgetSetups}
                            onReloadBillers={reloadBillers}
                            onTransactionCreated={handleTransactionCreated}
                            onTransactionDeleted={handleTransactionDeleted}
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
                    <Route path="/update-password" element={<UpdatePassword />} />
                    {/* ... other protected routes ... */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </div>
        </>
    );
};


// Main App component with Auth Provider - MODIFIED with top-level routing
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TestEnvironmentProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Routes>
                {/* Public auth routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />
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
                <Route path="/*" element={<AppContent />} />
              </Routes>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </TestEnvironmentProvider>
    </QueryClientProvider>
  );
};

export default App;
