import React, { useState, useEffect, useRef } from 'react';
import { Menu, ChevronLeft, SlidersHorizontal, ArrowUp, ArrowDown, Eye, EyeOff, X, ChevronDown, LogOut, Lock, Users, Bell, MessageCircle } from 'lucide-react';
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
import { useTransactions } from './src/hooks/useTransactions';
import { useAccounts } from './src/hooks/useAccounts';
import { useIncomingRequests, useUnreadMessagesCount, socialKeys } from './src/hooks/useBudies';
import { SetupWizard } from './src/components/SetupWizard';
import { Logo } from './src/components/Logo';
import { MessagesInbox } from './src/components/MessagesInbox';

// Helper function to convert UI Account to Supabase format
const accountToSupabase = (account: Account) => ({
  bank: account.bank,
  classification: account.classification,
  balance: account.balance,
  type: account.type,
  credit_limit: account.creditLimit ?? null,
  billing_date: account.billingDate ?? null,
  due_date: account.dueDate ?? null,
  is_active: (account as any).isActive !== false,
  deactivation_date: (account as any).deactivationDate ?? null,
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
  isActive: supabaseAccount.is_active ?? true,
  deactivationDate: supabaseAccount.deactivation_date,
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
    is_archived: installment.isArchived ?? false,
    archive_status: installment.archiveStatus ?? null,
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
  isArchived: supabaseInstallment.is_archived,
  archiveStatus: supabaseInstallment.archive_status,
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

// Helper function to convert Supabase Transaction to UI format
const formatTransaction = (supabaseTransaction: SupabaseTransaction): Transaction => ({
  id: supabaseTransaction.id,
  name: supabaseTransaction.name,
  date: supabaseTransaction.date,
  amount: supabaseTransaction.amount,
  paymentMethodId: supabaseTransaction.payment_method_id,
});

const queryClient = new QueryClient();

// Main App Content (Protected)
const AppContent: React.FC = () => {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  // Show auth page if not authenticated
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
    return <Auth />;
  }

  // User is authenticated, show main app
  return (
    <PinProtectionProvider>
      <MainApp user={user} userProfile={userProfile} signOut={signOut} />
    </PinProtectionProvider>
  );
};

const MainApp: React.FC<{ user: any; userProfile: any; signOut: () => Promise<void> }> = ({ user, userProfile, signOut }) => {
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [activeChatFriendId, setActiveChatFriendId] = useState<string | undefined>();
  const { data: pendingRequests = [], refetch: refetchRequests } = useIncomingRequests();
  const { data: unreadMessagesCount = 0 } = useUnreadMessagesCount();
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [txAccountSelections, setTxAccountSelections] = useState<Record<string, string>>({});
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const { getAccentClasses } = useTheme();

  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);
  const [minSplashTimeElapsed, setMinSplashTimeElapsed] = useState(false);

  // Scroll listener for Dashboard top bar visibility
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        setIsScrolled(scrollContainerRef.current.scrollTop > 40);
      }
    };

    const container = scrollContainerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [isDashboard, showSplash]);

  const loadNotifications = async () => {
    const { data: pTxs } = await getPendingTransactions();
    if (pTxs) setPendingTransactions(pTxs);
  };

  useEffect(() => {
    if (!user) return;
    
    loadNotifications();

    // Global Realtime Listeners for instant social alerts (Messages & Connections)
    const channel = supabase
      .channel(`global-social-alerts-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new && payload.new.receiver_id === user.id) {
            console.log('[Realtime] New message received:', payload.new);
            // Optimistically update the message notification badge instantly
            queryClient.setQueryData(socialKeys.unreadMessages(), (old: number = 0) => old + 1);
            // Delay network fetch slightly to avoid database read-replica lag
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: socialKeys.unreadMessages() });
            }, 500);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friendships' },
        (payload) => {
          if (payload.new && payload.new.friend_id === user.id) {
            console.log('[Realtime] New connect request received:', payload.new);
            setTimeout(() => {
              refetchRequests(); // Force immediate refetch of the hook
              queryClient.invalidateQueries({ queryKey: socialKeys.incomingRequests() });
            }, 500);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships' },
        (payload) => {
          if (payload.new && (payload.new.user_id === user.id || payload.new.friend_id === user.id)) {
            console.log('[Realtime] Connect request accepted:', payload.new);
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: socialKeys.friendships() });
            }, 500);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          console.log('[Realtime] Transaction change detected, updating notifications', payload);
          
          // 1. Optimistic Update (Replicating Messages Logic)
          // Instantly update the UI without waiting for the network fetch
          if (payload.eventType === 'INSERT' && payload.new) {
            // Only show notification if the transaction was created by someone else
            if (payload.new.user_id && payload.new.user_id !== user.id) {
              setPendingTransactions((prev) => {
                if (prev.some(tx => tx.id === payload.new.id)) return prev;
                return [{ ...payload.new, sender_profile: null }, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setPendingTransactions((prev) => prev.filter(tx => tx.id !== payload.new.id));
          }

          // 2. Delayed Network Fetch (to grab joined data like the sender's real name)
          setTimeout(() => {
            loadNotifications();
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
          }, 1200);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Global alerts subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const handleResolveTransaction = async (id: string, action: 'accept' | 'decline') => {
    if (resolvingIds.has(id)) return;
    setResolvingIds(prev => new Set(prev).add(id));
    
    try {
      let accountId = userProfile?.settings?.defaultReceiveAccountId || txAccountSelections[id];
      if (action === 'accept' && !accountId) {
        alert('Please select an account to receive these funds.');
        return;
      }
      const { error } = await resolvePendingTransaction(id, action, accountId);
      if (error) return alert('Failed to process transaction.');
      
      setPendingTransactions(prev => prev.filter(tx => tx.id !== id));
      
      if (action === 'accept') {
        await reloadAccounts();
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        // Force immediate background data refetch on active pages
        window.dispatchEvent(new CustomEvent('transactions_updated'));
      }
    } finally {
      setResolvingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleAcceptRequest = async (id: string) => {
    await acceptFriendRequest(id);
    await refetchRequests();
    // Per touchbase notes (Issue #2), the immediate profile creation logic is removed from here.
    // This logic will be moved to the People page to ensure profiles are created for BOTH users
    // when they load their connections, fixing the bug where the sender was left out.
  };

  const handleDeclineRequest = async (id: string) => {
    await removeFriendship(id);
    await refetchRequests();
  };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetItems, setBudgetItems] = useState(INITIAL_BUDGET);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [billersLoading, setBillersLoading] = useState(true);
  const [billersError, setBillersError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(true);
  const [installmentsError, setInstallmentsError] = useState<string | null>(null);

  const { data: txData, isLoading: transactionsLoading } = useTransactions();
  const rawTransactions = txData?.raw || [];
  // Ensure newly added database fields (like person_name) that might be stripped 
  // by the hook's formatting are preserved and passed down to the UI components.
  const transactions = (txData?.formatted || []).map((tx: any) => {
    const raw = rawTransactions.find((r: any) => r.id === tx.id);
    return {
      ...tx,
      person_name: raw?.person_name || tx.person_name,
      borrower_name: raw?.borrower_name || tx.borrower_name,
      transaction_type: raw?.transaction_type || tx.transaction_type
    };
  });

  const { data: rawAccounts = [], isLoading: accountsLoading, error: accountsQueryError } = useAccounts();
  const accountsError = accountsQueryError ? (accountsQueryError as Error).message : null;

  const [currency, setCurrency] = useState('PHP');
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Wizard State
  const [showWizard, setShowWizard] = useState(false);

  // Load Custom Categories from User Profile
  useEffect(() => {
    if (userProfile?.settings?.categories && Array.isArray(userProfile.settings.categories)) {
      setCategories(userProfile.settings.categories);
    } else {
      setCategories(INITIAL_CATEGORIES); // Fallback for new accounts
    }

    // Intercept New Users for Setup Wizard
    if (user?.created_at) {
      const isSetupCompleted = userProfile?.settings?.setupCompleted;
      const hasCustomCategories = userProfile?.settings?.categories && userProfile.settings.categories.length > 0;
      
      // Calculate account age in days
      const accountAgeDays = (new Date().getTime() - new Date(user.created_at).getTime()) / (1000 * 3600 * 24);
      
      if (accountAgeDays <= 7 && !isSetupCompleted && !hasCustomCategories) {
        setShowWizard(true);
      } else {
        setShowWizard(false);
      }
    }
  }, [userProfile, user]);

  // Lifted Budget Setups State - now loaded from Supabase
  const [budgetSetups, setBudgetSetups] = useState<any[]>([]);
  const [budgetSetupsLoading, setBudgetSetupsLoading] = useState(true);
  const [budgetSetupsError, setBudgetSetupsError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashTimeElapsed(true), 3000); // 3 seconds buffer
    return () => clearTimeout(timer);
  }, []);

  const isDataLoading = accountsLoading || transactionsLoading || billersLoading || installmentsLoading || budgetSetupsLoading;

  useEffect(() => {
    if (!isDataLoading && minSplashTimeElapsed) setShowSplash(false);
  }, [isDataLoading, minSplashTimeElapsed]);

  // Navigation Customization State
  const [navPreferences, setNavPreferences] = useState<{id: string, visible: boolean}[]>([]);
  const [showNavEditModal, setShowNavEditModal] = useState(false);
  const [tempNavPrefs, setTempNavPrefs] = useState(navPreferences);

  const { triggerStandbyLock, isPinEnabled } = usePinProtection();

  const effectiveNavItems = React.useMemo(() => {
    // Filter out savings and trash items from the menu
    const items = [...NAV_ITEMS].filter(item => 
      item.path !== '/savings' && 
      item.path !== '/trash' &&
      item.path !== '/settings' &&
      item.id?.toLowerCase() !== 'savings' &&
      item.id?.toLowerCase() !== 'trash' &&
      item.id?.toLowerCase() !== 'settings'
    );
    if (userProfile?.settings?.usePeoplePage && !items.find(i => i.id === 'people')) {
      items.push({
        id: 'people',
        label: 'People',
        path: '/people',
        icon: <Users className="w-5 h-5" />
      });
    }
    return items;
  }, [userProfile?.settings?.usePeoplePage]);

  useEffect(() => {
    let initialPrefs = null;

    // Priority: 1. Supabase profile, 2. localStorage (fallback), 3. Default
    if (userProfile?.nav_preferences && Array.isArray(userProfile.nav_preferences)) {
      console.log('[App] Loading nav preferences from Supabase profile.');
      initialPrefs = userProfile.nav_preferences;
    } else {
      const localData = localStorage.getItem('nav_preferences');
      if (localData) {
        try {
          console.log('[App] Loading nav preferences from localStorage (fallback).');
          initialPrefs = JSON.parse(localData);
        } catch (e) {
          console.error('Failed to parse nav preferences from localStorage', e);
        }
      }
    }

    if (!initialPrefs || !Array.isArray(initialPrefs)) {
      console.log('[App] Setting default nav preferences.');
      initialPrefs = effectiveNavItems.map(item => ({ id: item.id, visible: true }));
    }

    // Merge with hardcoded effectiveNavItems to include any new items from constants.ts
    const currentNavIds = new Set(initialPrefs.map((p: any) => p.id));
    const newItems = effectiveNavItems.filter(n => !currentNavIds.has(n.id)).map(n => ({ id: n.id, visible: true }));
    const combinedPrefs = [...initialPrefs, ...newItems].filter(p => effectiveNavItems.some(n => n.id === p.id));
    setNavPreferences(combinedPrefs);
  }, [userProfile, effectiveNavItems]);

  // Theme Initialization and Synchronization
  useEffect(() => {
    let initialTheme: 'light' | 'dark' = 'light';
    if (userProfile?.theme) {
      initialTheme = userProfile.theme;
    } else {
      const localTheme = localStorage.getItem('theme');
      if (localTheme === 'dark' || localTheme === 'light') {
        initialTheme = localTheme;
      } 
    }
    setTheme(initialTheme);
  }, [userProfile]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const { isTestMode, setTestMode } = useTestEnvironment();
  
  // Security fallback: Ensure non-admin users cannot be in test mode
  useEffect(() => {
    if (userProfile && (userProfile as any).role !== 'admin' && isTestMode) {
      console.log('[App] Non-admin user detected in test mode. Disabling test mode.');
      setTestMode(false);
    }
  }, [userProfile, isTestMode, setTestMode]);

  // Wallet state is managed internally by WalletsPage and WalletView (they fetch their own data)
  
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

    const fetchBudgetSetups = async () => {
      setBudgetSetupsLoading(true);
      setBudgetSetupsError(null);
      
      const { data, error } = await getAllBudgetSetupsFrontend();
      
      if (error) {
        console.error('Error loading budget setups:', error);
        setBudgetSetupsError('Failed to load budget setups from database');
        setBudgetSetups([]);
      } else {
        setBudgetSetups(data || []);
      }
      
      setBudgetSetupsLoading(false);
    };

    fetchBillers();
    fetchInstallments();
    fetchBudgetSetups();
  }, []);

  // Auto-recalculate account balances whenever accounts or transactions update!
  useEffect(() => {
    if (rawAccounts.length > 0) {
      setAccounts(recalculateAllAccountBalances(rawAccounts, rawTransactions));
    } else {
      setAccounts([]);
    }
  }, [rawAccounts, rawTransactions]);

  // Setup Wizard Completion Handler
  const handleCompleteWizard = async (wizardCategories: BudgetCategory[], newAccount: Account | null) => {
    if (newAccount) {
      await handleAddAccount(newAccount);
    }
    
    const newSettings = {
      ...(userProfile?.settings || {}),
      categories: wizardCategories,
      setupCompleted: true
    };
    
    try {
      await updateUserProfile(user.id, { settings: newSettings });
      setCategories(wizardCategories);
      setShowWizard(false);
    } catch (err) {
      console.error('Failed to complete setup wizard:', err);
      alert('Failed to save your setup. Please check your connection and try again.');
    }
  };

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
    await queryClient.invalidateQueries({ queryKey: ['accounts'] });
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

  const reloadBudgetSetups = async () => {
    const { data, error } = await getAllBudgetSetupsFrontend();
    if (error) {
      console.error('Error reloading budget setups:', error);
      setBudgetSetupsError('Failed to reload budget setups from database');
    } else {
      setBudgetSetups(data || []);
      setBudgetSetupsError(null);
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
    const previousBiller = billers.find(b => b.id === updatedBiller.id);
    const { data, error } = await updateBillerFrontend(updatedBiller, previousBiller);
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
      throw new Error('Failed to delete account due to existing relationships.');
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

  /**
   * Handle installment payment via transaction and payment schedule
   * This is the new way to record installment payments
   */
  const handlePayInstallment = async (
    installmentId: string,
    payment: {
      amount: number;
      date: string;
      accountId: string;
      receipt?: string;
      receiptFile?: File;
      scheduleId?: string; // target schedule ID passed from the UI selection
    }
  ) => {
    try {
      console.log('[App] Processing installment payment with transaction:', {
        installmentId,
        amount: payment.amount,
        date: payment.date,
        scheduleId: payment.scheduleId,
      });

      // Find the installment to get its details
      const installment = installments.find(i => i.id === installmentId);
      if (!installment) {
        throw new Error('Installment not found');
      }

      // Get payment schedules for this installment
      const { data: schedules, error: schedulesError } = await getPaymentSchedulesBySource('installment', installmentId);
      
      if (schedulesError || !schedules) {
        console.error('Error fetching payment schedules:', schedulesError);
        throw new Error('Could not find payment schedules for this installment');
      }

      let targetSchedule;

      // Prefer the schedule ID passed directly from the UI (exact selection by the user)
      if (payment.scheduleId) {
        targetSchedule = schedules.find(s => s.id === payment.scheduleId);
        if (!targetSchedule) {
          console.warn('[App] Provided scheduleId not found in fetched schedules — falling back to date-based matching', {
            scheduleId: payment.scheduleId,
            availableIds: schedules.map(s => s.id),
          });
        }
      }

      // Fallback: try to match by payment date month/year (only for unpaid schedules)
      // Use en-US locale to match the English month names stored in the DB (e.g. "January")
      if (!targetSchedule) {
        const currentMonth = new Date(payment.date).toLocaleString('en-US', { month: 'long' });
        const currentYear = new Date(payment.date).getFullYear();
        
        // First try to find schedule for current month/year
        targetSchedule = schedules.find(s => 
          s.month === currentMonth && 
          s.year === currentYear &&
          s.status !== 'paid'
        );
      }

      // Last resort: find the first unpaid schedule
      if (!targetSchedule) {
        targetSchedule = schedules.find(s => s.status === 'pending' || s.status === 'partial');
      }

      if (!targetSchedule) {
        throw new Error('No unpaid payment schedule found for this installment');
      }

      console.log('[App] Found target payment schedule:', {
        scheduleId: targetSchedule.id,
        month: targetSchedule.month,
        year: targetSchedule.year,
        currentStatus: targetSchedule.status,
      });

      // Record the payment on the schedule
      const { data: updatedSchedule, error: paymentError } = await recordPayment(targetSchedule.id, {
        amountPaid: payment.amount,
        datePaid: payment.date,
        accountId: payment.accountId,
        receipt: payment.receipt,
      });

      if (paymentError || !updatedSchedule) {
        throw new Error('Failed to record payment on schedule');
      }

      // Create the transaction linked to the payment schedule
      const { data: transaction, error: transactionError } = await createPaymentScheduleTransaction(
        targetSchedule.id,
        {
          name: `${installment.name} - ${targetSchedule.month} ${targetSchedule.year}`,
          date: combineDateWithCurrentTime(payment.date),
          amount: payment.amount,
          paymentMethodId: payment.accountId,
        }
      );

      if (transactionError || !transaction) {
        console.error('Failed to create transaction:', transactionError);
        // Payment schedule was updated but transaction failed - not ideal but acceptable
        console.warn('[App] Payment schedule updated but transaction creation failed');
      } else {
        console.log('[App] Transaction created successfully:', {
          transactionId: transaction.id,
          linkedScheduleId: targetSchedule.id,
        });

        // Upload receipt to storage if a file was provided
        if (payment.receiptFile) {
          const { path, error: uploadError } = await uploadTransactionReceipt(transaction.id, payment.receiptFile);
          if (uploadError || !path) {
            console.error('[App] Receipt upload failed for installment payment:', uploadError);
            alert('Payment saved, but receipt upload failed. You can re-attach it from the transaction details.');
          } else {
            await updateTransaction(transaction.id, { receipt_url: path });
            console.log('[App] Receipt uploaded and linked to installment transaction:', path);
          }
        }
      }

      // Update the installment's paidAmount
      const updatedInstallment: Installment = {
        ...installment,
        paidAmount: installment.paidAmount + payment.amount,
      };

      await updateInstallmentFrontend(updatedInstallment);

      // Reload installments and transactions to get fresh data
      await reloadInstallments();

      console.log('[App] Installment payment processed successfully');
    } catch (error) {
      console.error('[App] Error processing installment payment:', error);
      throw error; // Re-throw to let the UI handle it
    }
  };

  /**
   * Handle biller payment via transaction and payment schedule
   * This is the new way to record biller payments
   */
  const handlePayBiller = async (
    billerId: string,
    payment: {
      amount: number;
      date: string;
      accountId: string;
      receipt?: string;
      receiptFile?: File;
      scheduleId?: string; // target schedule ID passed from the UI selection
      expectedAmount?: number; // true expected amount when DB expected_amount is 0 (e.g. Loans billers)
    }
  ) => {
    try {
      console.log('[App] Processing biller payment with transaction:', {
        billerId,
        amount: payment.amount,
        date: payment.date,
        scheduleId: payment.scheduleId,
      });

      // Find the biller to get its details
      const biller = billers.find(b => b.id === billerId);
      if (!biller) {
        throw new Error('Biller not found');
      }

      // Get payment schedules for this biller
      const { data: schedules, error: schedulesError } = await getPaymentSchedulesBySource('biller', billerId);
      
      if (schedulesError || !schedules) {
        console.error('Error fetching payment schedules:', schedulesError);
        throw new Error('Could not find payment schedules for this biller');
      }

      let targetSchedule;

      // Prefer the schedule ID passed directly from the UI (exact selection by the user)
      if (payment.scheduleId) {
        targetSchedule = schedules.find(s => s.id === payment.scheduleId);
        if (!targetSchedule) {
          console.warn('[App] Provided scheduleId not found in fetched schedules — falling back to date-based matching', {
            scheduleId: payment.scheduleId,
            availableIds: schedules.map(s => s.id),
          });
        }
      }

      // Fallback: try to match by payment date month/year (only for unpaid schedules)
      // Use en-US locale to match the English month names stored in the DB (e.g. "January")
      if (!targetSchedule) {
        const currentMonth = new Date(payment.date).toLocaleString('en-US', { month: 'long' });
        const currentYear = new Date(payment.date).getFullYear();
        targetSchedule = schedules.find(s => 
          s.month === currentMonth && 
          s.year === currentYear &&
          s.status !== 'paid'
        );
      }

      // Last resort: first unpaid or partially paid schedule
      if (!targetSchedule) {
        targetSchedule = schedules.find(s => s.status === 'pending' || s.status === 'partial');
      }

      if (!targetSchedule) {
        throw new Error('No unpaid payment schedule found for this biller');
      }

      console.log('[App] Found target payment schedule:', {
        scheduleId: targetSchedule.id,
        month: targetSchedule.month,
        year: targetSchedule.year,
        currentStatus: targetSchedule.status,
      });

      // Record the payment on the schedule
      const { data: updatedSchedule, error: paymentError } = await recordPayment(targetSchedule.id, {
        amountPaid: payment.amount,
        datePaid: payment.date,
        accountId: payment.accountId,
        receipt: payment.receipt,
        expectedAmount: payment.expectedAmount,
      });

      if (paymentError || !updatedSchedule) {
        throw new Error('Failed to record payment on schedule');
      }

      // Create the transaction linked to the payment schedule
      const { data: transaction, error: transactionError } = await createPaymentScheduleTransaction(
        targetSchedule.id,
        {
          name: `${biller.name} - ${targetSchedule.month} ${targetSchedule.year}`,
          date: combineDateWithCurrentTime(payment.date),
          amount: payment.amount,
          paymentMethodId: payment.accountId,
        }
      );

      if (transactionError || !transaction) {
        console.error('Error creating transaction:', transactionError);
        throw new Error('Failed to create transaction');
      }

      console.log('[App] Transaction created successfully:', transaction.id);

      // Upload receipt to storage if a file was provided
      if (payment.receiptFile) {
        const { path, error: uploadError } = await uploadTransactionReceipt(transaction.id, payment.receiptFile);
        if (uploadError || !path) {
          console.error('[App] Receipt upload failed for biller payment:', uploadError);
          alert('Payment saved, but receipt upload failed. You can re-attach it from the transaction details.');
        } else {
          await updateTransaction(transaction.id, { receipt_url: path });
          console.log('[App] Receipt uploaded and linked to biller transaction:', path);
        }
      }

      // If this biller is linked to a credit account, record a credit_payment on that account
      // so the outstanding balance and available credit are updated automatically.
      if (biller.linkedAccountId) {
        const linkedAccount = accounts.find(a => a.id === biller.linkedAccountId);
        if (linkedAccount?.type === 'Credit') {
          const { error: creditTxError } = await createTransaction({
            name: `${biller.name} - ${targetSchedule.month} ${targetSchedule.year}`,
            date: combineDateWithCurrentTime(payment.date),
            amount: -Math.abs(payment.amount), // negative → reduces outstanding balance
            payment_method_id: biller.linkedAccountId,
            transaction_type: 'credit_payment',
            notes: null,
            payment_schedule_id: null,
            related_transaction_id: transaction.id,
          });
          if (creditTxError) {
            console.error('[App] Failed to create credit account payment transaction:', creditTxError);
          } else {
            console.log('[App] Credit account payment transaction created for linked account:', biller.linkedAccountId);
          }
        }
      }

      // Update biller's payment tracking in the old schedules array (for backward compatibility)
      // This updates the biller object stored in the billers table
      const updatedBiller = {
        ...biller,
        schedules: biller.schedules.map(s => {
          if (s.month === targetSchedule.month && s.year === targetSchedule.year) {
            return {
              ...s,
              amountPaid: payment.amount,
              datePaid: payment.date,
              accountId: payment.accountId,
              receipt: payment.receipt,
            };
          }
          return s;
        }),
      };

      await handleUpdateBiller(updatedBiller);

      console.log('[App] Payment processed successfully, reloading billers and transactions');
      await reloadBillers();
    } catch (err) {
      console.error('[App] Error processing biller payment:', err);
      throw err;
    }
  };

  /**
   * Handle transaction deletion with payment schedule reversion
   * This triggers a reload of accounts, installments and transactions to reflect status changes in UI
   */
  const handleTransactionDeleted = async () => {
    console.log('[App] Transaction deleted, reloading accounts and installments to reflect changes');
    await reloadAccounts(); // Reload accounts to recalculate balances
    await reloadInstallments();
  };

  /**
   * Handle transaction creation
   * This triggers a reload of accounts to recalculate balances
   */
  const handleTransactionCreated = async () => {
    console.log('[App] Transaction created, reloading accounts to recalculate balances');
    await reloadAccounts(); // Reload accounts to recalculate balances
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
      setBudgetSetups([]);
    }
  };

  const handleSaveNavPreferences = async () => {
    setNavPreferences(tempNavPrefs);
    setShowNavEditModal(false);

    // Save to Supabase profile
    const { error } = await supabase
      .from('user_profiles')
      .update({ nav_preferences: tempNavPrefs })
      .eq('user_id', user.id);

    if (error) {
      console.error("Failed to save nav preferences to Supabase:", error);
      // Fallback to localStorage if Supabase fails, so user doesn't lose settings on this device
      alert('Could not save your navigation settings to the cloud. They will be saved on this device only for now.');
      localStorage.setItem('nav_preferences', JSON.stringify(tempNavPrefs));
    } else {
      // On successful save to Supabase, remove the old localStorage value
      localStorage.removeItem('nav_preferences');
      console.log("Nav preferences saved to Supabase profile.");
    }
  };

  const handleMoveNavUp = (index: number) => {
    if (index === 0) return;
    const newPrefs = [...tempNavPrefs];
    [newPrefs[index - 1], newPrefs[index]] = [newPrefs[index], newPrefs[index - 1]];
    setTempNavPrefs(newPrefs);
  };

  const handleMoveNavDown = (index: number) => {
    if (index === tempNavPrefs.length - 1) return;
    const newPrefs = [...tempNavPrefs];
    [newPrefs[index], newPrefs[index + 1]] = [newPrefs[index + 1], newPrefs[index]];
    setTempNavPrefs(newPrefs);
  };

  const handleToggleNavVisibility = (id: string) => {
    setTempNavPrefs(tempNavPrefs.map(pref => 
      pref.id === id ? { ...pref, visible: !pref.visible } : pref
    ));
  };

  const handleToggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    
    if (user?.id) {
      const { error } = await supabase
        .from('user_profiles')
        .update({ theme: newTheme })
        .eq('user_id', user.id);
      
      if (error) {
        console.error("Failed to save theme to Supabase:", error);
        localStorage.setItem('theme', newTheme); // Fallback
      } else {
        localStorage.removeItem('theme'); // Clean up if successfully cloud synced
      }
    } else {
      localStorage.setItem('theme', newTheme);
    }
  };

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 via-gray-50 to-purple-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-colors duration-300">
        <style>
          {`@import url('https://fonts.googleapis.com/css2?family=Titan+One&display=swap');
          .font-titan { font-family: 'Titan One', cursive; font-weight: 400; letter-spacing: 1px; }
          @keyframes squeeze-mascot {
            0% { transform: translateY(16px) rotate(15deg); }
            5% { transform: translateY(16px) rotate(15deg); }
            30% { transform: translateY(0) rotate(15deg); }
            38% { transform: translateY(0) rotate(15deg); }
            55% { transform: translateY(0) translateX(12px) rotate(22deg) scale(0.92); }
            72% { transform: translateY(0) translateX(12px) rotate(22deg) scale(0.92); }
            100% { transform: translateY(0) translateX(0) rotate(15deg) scale(1); }
          }
          .animate-squeeze-mascot {
            animation: squeeze-mascot 1.8s ease-in-out forwards;
          }`}
        </style>
        <div className="text-center animate-in fade-in zoom-in duration-700">
          <div className="w-24 h-24 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl flex items-center justify-center mx-auto mb-8 relative overflow-hidden border border-gray-100 dark:border-gray-800">
            <div className="absolute inset-0 bg-blue-50/50 dark:bg-blue-900/10 animate-pulse"></div>
            <div className="w-10 h-10 border-4 border-blue-100 dark:border-gray-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin relative z-10"></div>
          </div>
          <div className="flex flex-row flex-nowrap justify-center items-center mb-6 active:scale-95 transition-transform">
            <img 
              src="/iconapp.png" 
              alt="Budee Mascot" 
              className="w-24 h-24 md:w-32 md:h-32 drop-shadow-2xl z-10 -mr-10 md:-mr-12 rotate-[15deg] animate-squeeze-mascot hover:scale-105 hover:rotate-12 transition-all duration-300" 
            />
            <div className="mt-2 md:mt-4">
              <Logo className="text-6xl md:text-8xl" />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium text-sm max-w-[260px] mx-auto leading-relaxed animate-pulse">
            Loading your financial data and preparing your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
        {showWizard && <SetupWizard onComplete={handleCompleteWizard} />}
        <style>
          {`@import url('https://fonts.googleapis.com/css2?family=Titan+One&display=swap');
          .font-titan { font-family: 'Titan One', cursive; font-weight: 400; letter-spacing: 1px; }
          
          @keyframes ring {
            0% { transform: rotate(0); }
            5% { transform: rotate(15deg); }
            10% { transform: rotate(-10deg); }
            15% { transform: rotate(15deg); }
            20% { transform: rotate(-10deg); }
            25% { transform: rotate(0); }
            100% { transform: rotate(0); }
          }
          .animate-ring { animation: ring 2s ease-in-out infinite; }`}
        </style>
        <div className="flex h-[100dvh] bg-gray-100 dark:bg-gray-950 w-full overflow-hidden fixed inset-0 transition-colors duration-200">
        <aside className={`fixed inset-y-0 left-0 z-50 bg-gray-50 dark:bg-gray-900 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-52' : 'hidden md:flex w-20'} overscroll-none ${
          isScrolled ? 'border-r-4 border-black shadow-[2px_0px_0px_0px_rgba(0,0,0,1)]' : 'border-r border-gray-200 dark:border-gray-800'
        }`}> 
          <div className="flex flex-col h-full">
            <div className={`flex items-center h-14 px-4 transition-all duration-300 ${isSidebarOpen ? 'justify-between' : 'justify-center'} ${
              isScrolled ? `${getAccentClasses('bg')} border-b-4 border-black` : 'border-b border-gray-100 dark:border-gray-800'
            }`}>
              <div 
                className="flex flex-row flex-nowrap items-center cursor-pointer active:scale-95 transition-transform"
                onClick={() => !isSidebarOpen && setIsSidebarOpen(true)}
                title={!isSidebarOpen ? "Expand Menu" : ""}
              >
                <img 
                  src="/iconapp.png" 
                  alt="Budee Mascot" 
                  className={`drop-shadow-md transition-all duration-300 z-10 ${
                    isSidebarOpen 
                      ? 'w-10 h-10 md:w-12 md:h-12 -mr-5 md:-mr-6 rotate-[15deg] hover:scale-110 hover:rotate-12' 
                      : 'w-8 h-8 hover:scale-110'
                  }`} 
                />
                {isSidebarOpen && (
                  <div className="mt-1 ml-1">
                    <Logo className="text-3xl md:text-4xl" />
                  </div>
                )}
              </div>
              
              {isSidebarOpen && (
                <button onClick={() => setIsSidebarOpen(false)} className={`p-2 rounded-lg transition-colors ml-2 active:scale-95 ${isScrolled ? 'hover:bg-black/10 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
            </div>
            <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
              {navPreferences.filter(pref => pref.visible).map((pref) => {
                const item = effectiveNavItems.find(n => n.id === pref.id);
                if (!item) return null;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={({ isActive }) =>
                      `w-full flex items-center p-2 rounded-xl transition-colors group ${
                        isActive ? 'bg-black/5 dark:bg-white/5' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                      }`
                    }
                    end={item.path === '/'}
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border-2 border-black transition-all duration-200 z-10 relative ${
                          isSidebarOpen ? '' : 'mx-auto'
                        } ${
                          isActive 
                            ? `${getAccentClasses('bg')} text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -rotate-3` 
                            : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 shadow-none'
                        } group-hover:rotate-0 group-hover:scale-110 group-hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`}>
                          {item.icon}
                        </div>
                        {isSidebarOpen && <span className={`ml-2.5 font-bold text-sm transition-colors ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
            {isSidebarOpen && (
              <div className="flex justify-center px-4 mb-4 mt-2">
                <button 
                  onClick={() => { setTempNavPrefs(navPreferences); setShowNavEditModal(true); }} 
                  className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
                  title="Customize Menu"
                >
                  Edit Menu
                </button>
              </div>
            )}
          <div className="p-3 border-t border-gray-100 dark:border-gray-800 transition-colors">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `w-full flex items-center p-2 rounded-xl transition-colors group ${
                  isActive ? 'bg-black/5 dark:bg-white/5' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border-2 border-black transition-all duration-200 z-10 relative ${
                    isSidebarOpen ? '' : 'mx-auto'
                  } ${
                    isActive 
                      ? `${getAccentClasses('bg')} text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -rotate-3` 
                      : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 shadow-none'
                  } group-hover:rotate-0 group-hover:scale-110 group-hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`}>
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  {isSidebarOpen && <span className={`ml-2.5 font-bold text-sm transition-colors ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>Settings</span>}
                </>
              )}
            </NavLink>
          </div>
          </div>
        </aside>
        <main className={`flex-1 bg-gray-100 dark:bg-gray-950 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-52' : 'md:ml-20'} h-full flex flex-col overflow-hidden`}> 
        
        <TestModeBanner sidebarOpen={isSidebarOpen} />

        {/* Top Navigation Bar - Reactive for Dashboard, Static for others */}
        <header className={`fixed top-0 right-0 left-0 h-14 px-4 md:px-8 flex items-center justify-end transition-all duration-300 z-30 ${
          isSidebarOpen ? 'md:ml-52' : 'md:ml-20'
        } ${
          isScrolled ? `${getAccentClasses('bg')} shadow-lg border-b-4 border-black` : 'bg-transparent border-transparent'
        }`}>
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Messages */}
            <div className="relative">
              <button 
                onClick={() => setIsMessagesOpen(!isMessagesOpen)}
                className={`relative p-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 -rotate-2 hover:rotate-0 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${isScrolled ? 'bg-white' : getAccentClasses('bg')} ${unreadMessagesCount > 0 && !isMessagesOpen ? 'animate-ring' : ''}`}
              >
                <MessageCircle className={`w-5 h-5 ${isScrolled ? getAccentClasses('text') : 'text-white'}`} />
                {unreadMessagesCount > 0 && !isMessagesOpen && ( // Only show badge if not open
                  <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-[20px] px-1 bg-yellow-300 text-black text-[10px] font-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] z-10">
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                )}
              </button>
            </div>
            {/* Notifications */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={`relative p-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 rotate-3 hover:rotate-0 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${isScrolled ? 'bg-white' : getAccentClasses('bg')}`}
              >
                <Bell className={`w-5 h-5 ${isScrolled ? getAccentClasses('text') : 'text-white'}`} />
                {((pendingRequests?.length || 0) + (pendingTransactions?.length || 0)) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-300 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] z-10"></span>
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-[40]" onClick={() => setIsNotificationsOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-[50] animate-in zoom-in-95">
                    <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex justify-between items-center">
                      <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest">Notifications</h3>
                      {((pendingRequests?.length || 0) + (pendingTransactions?.length || 0)) > 0 && (
                        <span className={`${getAccentClasses('lightBg')} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                          {(pendingRequests?.length || 0) + (pendingTransactions?.length || 0)} New
                        </span>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {((pendingRequests?.length || 0) + (pendingTransactions?.length || 0)) > 0 ? (
                        <>
                          {pendingRequests.map(req => (
                          <div key={req.id} className="p-4 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center uppercase shrink-0">
                                {(req.sender_profile?.first_name?.charAt(0) || '') + (req.sender_profile?.last_name?.charAt(0) || '') || '?'}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{req.sender_profile?.first_name} {req.sender_profile?.last_name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">sent a Connect Request</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleAcceptRequest(req.id)} className={`flex-1 text-white py-2 rounded-xl text-xs font-bold transition-colors ${getAccentClasses('bg')}`}>Accept</button>
                              <button onClick={() => handleDeclineRequest(req.id)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Decline</button>
                            </div>
                          </div>
                          ))}
                          {pendingTransactions.map(tx => {
                            const senderName = tx.sender_profile ? `${tx.sender_profile.first_name} ${tx.sender_profile.last_name}` : 'A Budee';
                            const formatCurrency = (val: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);
                            const needsAccount = !userProfile?.settings?.defaultReceiveAccountId;
                            return (
                              <div key={tx.id} className="p-4 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 font-black flex items-center justify-center uppercase shrink-0">
                                    {tx.sender_profile?.first_name?.charAt(0) || 'B'}{tx.sender_profile?.last_name?.charAt(0) || ''}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{senderName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">sent you {formatCurrency(tx.amount)}</p>
                                  </div>
                                </div>
                                {needsAccount && (
                                  <div className="mb-3">
                                    <select 
                                      className="w-full text-xs p-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
                                      value={txAccountSelections[tx.id] || ''}
                                      onChange={e => setTxAccountSelections(prev => ({...prev, [tx.id]: e.target.value}))}
                                    >
                                      <option value="">Select deposit account...</option>
                                      {accounts.filter(a => a.type === 'Debit').map(a => (
                                        <option key={a.id} value={a.id}>{a.bank}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button onClick={() => handleResolveTransaction(tx.id, 'accept')} disabled={resolvingIds.has(tx.id)} className="flex-1 bg-green-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50">
                                    {resolvingIds.has(tx.id) ? '...' : 'Accept'}
                                  </button>
                                  <button onClick={() => handleResolveTransaction(tx.id, 'decline')} disabled={resolvingIds.has(tx.id)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                                    {resolvingIds.has(tx.id) ? '...' : 'Decline'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="p-8 flex flex-col items-center justify-center text-center">
                          <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                            <Bell className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                          </div>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">All caught up!</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">No new notifications.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative ml-2 border-l border-gray-200 dark:border-gray-700 pl-4">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-2 p-1 pr-2 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all duration-200"
              >
                <div className={`w-8 h-8 border-2 border-black ${isScrolled ? getAccentClasses('bg') : 'bg-white text-black'} flex items-center justify-center text-white font-bold text-sm transition-colors`}>
                  {userProfile ? 
                    `${userProfile.first_name.charAt(0)}${userProfile.last_name.charAt(0)}`.toUpperCase() :
                    user?.email?.charAt(0).toUpperCase() || 'U'
                  }
                </div>
                <span className="hidden sm:block text-sm font-black uppercase tracking-tight text-black truncate max-w-[120px]">
                  {userProfile ? userProfile.first_name : (user?.email?.split('@')[0] || 'User')}
                </span>
                <ChevronDown className={`w-4 h-4 text-black transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[40]" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-[50] animate-in zoom-in-95">
                    <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 mb-2">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                        {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'User'}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                    </div>
                    {isPinEnabled() && (
                      <button
                        onClick={() => { setIsUserMenuOpen(false); triggerStandbyLock(); }}
                        className="w-full flex items-center space-x-3 py-2.5 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Lock App</span>
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          setIsUserMenuOpen(false);
                          await signOut();
                        } catch (error) {
                          console.error('Logout error:', error);
                        }
                      }}
                      className="w-full flex items-center space-x-3 py-2.5 px-4 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div 
          ref={scrollContainerRef}
          className="w-full flex-1 overflow-auto overscroll-none touch-pan-y pt-0 px-4 pb-4 md:px-8 md:pb-6" 
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
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
                    // Delete from Supabase
                    const { error } = await deleteBudgetSetupFrontend(setup.id);
                    if (error) {
                      console.error('Error deleting budget setup:', error);
                      alert('Failed to delete budget setup. Please try again.');
                    } else {
                      // Update local state
                      setBudgetSetups(prev => prev.filter(s => s.id !== setup.id));
                    }
                  }}
                  onReloadSetups={reloadBudgetSetups}
                  onReloadBillers={reloadBillers}
                  onTransactionCreated={handleTransactionCreated}
                  onTransactionDeleted={handleTransactionDeleted}
                  onArchiveBudget={async (setup) => {
                    const { data, error } = await archiveBudgetSetup(setup.id);
                    if (error) {
                      console.error('Error archiving budget setup:', error);
                      throw error;
                    }
                    if (data) {
                      setBudgetSetups(prev => prev.map(s => s.id === data.id ? data : s));
                    }
                  }}
                  onReopenBudget={async (setup) => {
                    const { data, error } = await reopenBudgetSetup(setup.id);
                    if (error) {
                      console.error('Error reopening budget setup:', error);
                      throw error;
                    }
                    if (data) {
                      setBudgetSetups(prev => prev.map(s => s.id === data.id ? data : s));
                    }
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
                  onPayBiller={handlePayBiller}
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
                  onPayInstallment={handlePayInstallment}
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
                    const accountToDeactivate = accounts.find(a => a.id === id);
                    if (accountToDeactivate) {
                      try {
                        const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
                        const tableName = isTestMode ? 'accounts_test' : 'accounts';
                        
                        let updatePayload: any = {};
                        if (when === 'now') {
                          updatePayload = { is_active: false };
                        } else {
                          updatePayload = { deactivation_date: when };
                        }
                        
                        const { error } = await supabase.from(tableName).update(updatePayload).eq('id', id);
                        if (error) throw error;
                        
                        await reloadAccounts();
                      } catch (err) {
                        console.error('Failed to deactivate account:', err);
                        alert('Failed to deactivate account. Please try again.');
                      }
                    }
                  }}
                  loading={accountsLoading}
                  error={accountsError}
                />
              } />
              <Route path="/accounts/view" element={<AccountFilteredTransactions accounts={accounts} onTransactionCreated={reloadAccounts} />} />
              <Route path="/accounts/statement" element={<StatementPage accounts={accounts} />} />
              <Route path="/wallets" element={<WalletsPage accounts={accounts} />} />
              <Route path="/wallets/view" element={<WalletView accounts={accounts} />} />
              <Route path="/settings" element={
                <SettingsPage 
                  currency={currency}
                  setCurrency={setCurrency}
                  categories={categories}
                  setCategories={setCategories}
                  onResetAll={handleResetAll}
                  billers={billers}
                  installments={installments}
                  onUpdateBiller={handleUpdateBiller}
                  theme={theme}
                  onToggleTheme={handleToggleTheme}
                />
              } />
          <Route path="/people" element={<PeoplePage onStartChat={(friendId: string) => {
            setActiveChatFriendId(friendId);
            setIsMessagesOpen(true);
          }} />} />
              <Route path="/transactions" element={
                <TransactionsPage 
                  transactions={transactions}
                  loading={transactionsLoading}
                  onTransactionDeleted={handleTransactionDeleted}
                  onTransactionCreated={handleTransactionCreated}
                />
              } />
              <Route path="/supabase-demo" element={
                <SupabaseDemo />
              } />
              <Route path="/update-password" element={<UpdatePassword />} />
              {/* Start with Dashboard and redirect anything else unrecognized */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Navigation Edit Modal */}
      {showNavEditModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative flex flex-col max-h-[85vh] animate-in zoom-in-95 transition-colors">
            <button onClick={() => setShowNavEditModal(false)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">Edit Menu</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 font-medium transition-colors">Reorder pages or hide the ones you don't use often.</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 mb-6 pr-2">
              {tempNavPrefs.map((pref, idx) => {
                const item = effectiveNavItems.find(n => n.id === pref.id);
                if (!item) return null;
                return (
                  <div key={pref.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${pref.visible ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-800/50 border-transparent opacity-60'}`}>
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-xl ${pref.visible ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {item.icon}
                      </div>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleMoveNavUp(idx)} disabled={idx === 0} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl disabled:opacity-30 transition-colors"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => handleMoveNavDown(idx)} disabled={idx === tempNavPrefs.length - 1} className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl disabled:opacity-30 transition-colors"><ArrowDown className="w-4 h-4" /></button>
                      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                      <button onClick={() => handleToggleNavVisibility(pref.id)} className={`p-2 rounded-xl transition-colors ${pref.visible ? 'text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                        {pref.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowNavEditModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={handleSaveNavPreferences} className={`flex-1 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-colors shadow-xl ${getAccentClasses('bg')} ${getAccentClasses('shadow')}`}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Inbox Drawer */}
      <MessagesInbox 
        isOpen={isMessagesOpen}
        onClose={() => setIsMessagesOpen(false)}
        currentUserId={user.id}
        activeFriendId={activeChatFriendId}
        onClearActiveChat={() => setActiveChatFriendId(undefined)}
      />
    </>
  );
};

// Main App component with Auth Provider
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TestEnvironmentProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </TestEnvironmentProvider>
    </QueryClientProvider>
  );
};

export default App;
