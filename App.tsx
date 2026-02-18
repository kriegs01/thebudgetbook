import React, { useState, useEffect } from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { NAV_ITEMS, INITIAL_BUDGET, DEFAULT_SETUP, INITIAL_CATEGORIES } from './constants';
import { getAllBillersFrontend, createBillerFrontend, updateBillerFrontend, deleteBillerFrontend } from './src/services/billersService';
import { getAllAccountsWithCalculatedBalances, createAccountFrontend, updateAccountFrontend, deleteAccountFrontend } from './src/services/accountsService';
import { getAllInstallmentsFrontend, createInstallmentFrontend, updateInstallmentFrontend, deleteInstallmentFrontend } from './src/services/installmentsService';
import { getAllSavingsFrontend, createSavingsFrontend, updateSavingsFrontend, deleteSavingsFrontend } from './src/services/savingsService';
import { getAllBudgetSetupsFrontend, deleteBudgetSetupFrontend } from './src/services/budgetSetupsService';
import { getPaymentSchedulesBySource } from './src/services/paymentSchedulesService';
import { getAllTransactions, createPaymentScheduleTransaction } from './src/services/transactionsService';
import { recordPayment } from './src/services/paymentSchedulesService';
import { supabase } from './src/utils/supabaseClient';
import { combineDateWithCurrentTime } from './src/utils/dateUtils';
import type { Biller, Account, Installment, SavingsJar, Transaction } from './types';
import type { SupabaseTransaction } from './src/types/supabase';

// Context
import { TestEnvironmentProvider } from './src/contexts/TestEnvironmentContext';
import { PinProtectionProvider } from './src/contexts/PinProtectionContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
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
import Savings from './pages/Savings';
import Projections from './pages/Projections';
import SettingsPage from './pages/Settings';
import TrashPage from './pages/Trash';
import SupabaseDemo from './pages/SupabaseDemo';
import Auth from './pages/Auth';

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

// Helper function to convert Supabase Transaction to UI format
const formatTransaction = (supabaseTransaction: SupabaseTransaction): Transaction => ({
  id: supabaseTransaction.id,
  name: supabaseTransaction.name,
  date: supabaseTransaction.date,
  amount: supabaseTransaction.amount,
  paymentMethodId: supabaseTransaction.payment_method_id,
});

// Main App Content (Protected)
const AppContent: React.FC = () => {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();

  // Show auth page if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
  return <MainApp user={user} userProfile={userProfile} signOut={signOut} />;
};

const MainApp: React.FC<{ user: any; userProfile: any; signOut: () => Promise<void> }> = ({ user, userProfile, signOut }) => {
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [currency, setCurrency] = useState('PHP');
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  
  // Lifted Budget Setups State - now loaded from Supabase
  const [budgetSetups, setBudgetSetups] = useState([]);
  const [budgetSetupsLoading, setBudgetSetupsLoading] = useState(true);
  const [budgetSetupsError, setBudgetSetupsError] = useState<string | null>(null);

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
      
      const { data, error } = await getAllAccountsWithCalculatedBalances();
      
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

    const fetchTransactions = async () => {
      setTransactionsLoading(true);
      
      const { data, error } = await getAllTransactions();
      
      if (error) {
        console.error('Error loading transactions:', error);
        setTransactions([]);
      } else {
        const formattedTransactions = (data || []).map(formatTransaction);
        setTransactions(formattedTransactions);
      }
      
      setTransactionsLoading(false);
    };
    
    fetchBillers();
    fetchAccounts();
    fetchInstallments();
    fetchSavings();
    fetchBudgetSetups();
    fetchTransactions();
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
    const { data, error } = await getAllAccountsWithCalculatedBalances();
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

  const reloadTransactions = async () => {
    const { data, error } = await getAllTransactions();
    if (error) {
      console.error('Error reloading transactions:', error);
    } else {
      const formattedTransactions = (data || []).map(formatTransaction);
      setTransactions(formattedTransactions);
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

  // Real-time subscription for transaction changes
  // This enables instant balance updates when transactions are created/deleted
  useEffect(() => {
    console.log('[App] Setting up real-time subscription for transactions');
    
    // Create a channel for listening to transactions table changes
    const channel = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('[App] Transaction changed via real-time:', payload.eventType, payload);
          
          // Reload accounts to recalculate balances in real-time
          reloadAccounts();
          
          // Also reload transactions list if needed
          reloadTransactions();
        }
      )
      .subscribe((status) => {
        console.log('[App] Real-time subscription status:', status);
      });

    // Cleanup subscription when component unmounts
    return () => {
      console.log('[App] Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array - only set up once

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
    }
  ) => {
    try {
      console.log('[App] Processing installment payment with transaction:', {
        installmentId,
        amount: payment.amount,
        date: payment.date,
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

      // Find the next unpaid or partially paid schedule
      const currentMonth = new Date(payment.date).toLocaleString('default', { month: 'long' });
      const currentYear = new Date(payment.date).getFullYear();
      
      // First try to find schedule for current month/year
      let targetSchedule = schedules.find(s => 
        s.month === currentMonth && 
        s.year === currentYear &&
        s.status !== 'paid'
      );

      // If not found, find the first unpaid schedule
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
      }

      // Update the installment's paidAmount
      const updatedInstallment: Installment = {
        ...installment,
        paidAmount: installment.paidAmount + payment.amount,
      };

      await updateInstallmentFrontend(updatedInstallment);

      // Reload installments and transactions to get fresh data
      await reloadInstallments();
      await reloadTransactions();

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
    }
  ) => {
    try {
      console.log('[App] Processing biller payment with transaction:', {
        billerId,
        amount: payment.amount,
        date: payment.date,
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

      // Find the next unpaid or partially paid schedule
      const currentMonth = new Date(payment.date).toLocaleString('default', { month: 'long' });
      const currentYear = new Date(payment.date).getFullYear();
      
      // First try to find schedule for current month/year
      let targetSchedule = schedules.find(s => 
        s.month === currentMonth && 
        s.year === currentYear &&
        s.status !== 'paid'
      );

      // If not found, find the first unpaid schedule
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
      await reloadTransactions();
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
    console.log('[App] Transaction deleted, reloading accounts, installments and transactions to reflect changes');
    await reloadAccounts(); // Reload accounts to recalculate balances
    await reloadInstallments();
    await reloadTransactions();
  };

  /**
   * Handle transaction creation
   * This triggers a reload of accounts to recalculate balances
   */
  const handleTransactionCreated = async () => {
    console.log('[App] Transaction created, reloading accounts to recalculate balances');
    await reloadAccounts(); // Reload accounts to recalculate balances
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
    <TestEnvironmentProvider>
      <PinProtectionProvider>
        <TestModeBanner sidebarOpen={isSidebarOpen} />
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
                <div className="space-y-2">
                  <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                      {userProfile ? 
                        `${userProfile.first_name.charAt(0)}${userProfile.last_name.charAt(0)}`.toUpperCase() :
                        user?.email?.charAt(0).toUpperCase() || 'U'
                      }
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {userProfile ? 
                          `${userProfile.first_name} ${userProfile.last_name}` :
                          user?.email?.split('@')[0] || 'User'
                        }
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await signOut();
                      } catch (error) {
                        console.error('Logout error:', error);
                      }
                    }}
                    className="w-full py-2 px-3 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mx-auto">
                    {userProfile ? 
                      `${userProfile.first_name.charAt(0)}${userProfile.last_name.charAt(0)}`.toUpperCase() :
                      user?.email?.charAt(0).toUpperCase() || 'U'
                    }
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await signOut();
                      } catch (error) {
                        console.error('Logout error:', error);
                      }
                    }}
                    className="w-full py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Logout"
                  >
                    Exit
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>
        <main className={`flex-1 bg-gray-50 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-64' : 'ml-20'} min-h-screen flex flex-col`}> 
          <div className="p-8 w-full flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard accounts={accounts} budget={budgetItems} installments={installments} transactions={transactions} budgetSetups={budgetSetups} userProfile={userProfile} />} />
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
                      setTrashSetups(prev => [...prev, setup]);
                    }
                  }}
                  onReloadSetups={reloadBudgetSetups}
                  onReloadBillers={reloadBillers}
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
                    // For now, just mark as inactive or remove - can be enhanced later
                    if (when === 'now') {
                      await handleDeleteAccount(id);
                    }
                  }}
                  loading={accountsLoading}
                  error={accountsError}
                />
              } />
              <Route path="/accounts/view" element={<AccountFilteredTransactions accounts={accounts} onTransactionCreated={reloadAccounts} />} />
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
              <Route path="/projections" element={
                <Projections
                  budgetSetups={savedSetups}
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
                <TransactionsPage 
                  onTransactionDeleted={handleTransactionDeleted}
                  onTransactionCreated={handleTransactionCreated}
                />
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
    </PinProtectionProvider>
    </TestEnvironmentProvider>
  );
};

// Main App component with Auth Provider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
