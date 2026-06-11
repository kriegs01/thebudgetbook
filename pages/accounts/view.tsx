import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Info, Eye, ZoomIn, ZoomOut, Download, X, Pencil, BanknoteArrowDown, Trash2, ArrowUpFromLine, ArrowDownToLine, Banknote, CheckSquare, Square, Filter, ChevronDown, ChevronUp, CreditCard, AlertTriangle, Send, User, Landmark, WalletCards } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getTransactionsByPaymentMethod, createTransaction, updateTransactionAndSyncSchedule, createTransfer, getLoanTransactionsWithPayments, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, batchDeleteTransactions } from '../../src/services/transactionsService';
import { combineDateWithCurrentTime, getFirstDayOfCurrentYearIso, getLastDayOfCurrentYearIso, getTodayIso } from '../../src/utils/dateUtils';
import type { SupabaseTransaction } from '../../src/types/supabase';
import { computeCreditUtilization, type CreditUtilization } from '../../src/utils/accounts';
import { PinProtectedAction } from '../../src/components/PinProtectedAction';
import { getAllPeople } from '../../src/services/peopleService';
import type { SupabasePerson } from '../../src/types/supabase';
import { PersonAutocomplete } from '../../src/components/PersonAutocomplete';
import useMediaQuery from '../../src/hooks/useMediaQuery';
import { useTheme } from '../../src/contexts/ThemeContext';
import { PageHeader } from '../../src/components/PageHeader';

const FILTER_MIN_DATE = '2025-01-01';

const TRANSACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'payment', label: 'Payment' },
  { value: 'withdraw', label: 'Withdrawal' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'loan', label: 'Loan' },
  { value: 'cash_in', label: 'Cash In' },
  { value: 'loan_payment', label: 'Loan Payment' },
  { value: 'credit_payment', label: 'Credit Card Payment' },
];

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
  transaction_type?: 'payment' | 'withdraw' | 'transfer' | 'loan' | 'cash_in' | 'loan_payment' | 'credit_payment';
  notes?: string | null;
  related_transaction_id?: string | null;
  receiptUrl?: string | null;
  person_name?: string | null;
};

type LoanTransaction = Transaction & {
  payments?: Transaction[];
  totalPaid?: number;
  remainingBalance?: number;
};

type AccountMeta = { bank?: string };

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

interface AccountFilteredTransactionsProps {
  accounts: Account[];
  onTransactionCreated?: () => void;
}

const AccountFilteredTransactions: React.FC<AccountFilteredTransactionsProps> = ({ accounts, onTransactionCreated }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || searchParams.get("id");
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loanTransactions, setLoanTransactions] = useState<LoanTransaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  
  // Modal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTab, setSendTab] = useState<'accounts' | 'friends'>('accounts');
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [showLoanPaymentModal, setShowLoanPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanTransaction | null>(null);
  const [showCardPaymentModal, setShowCardPaymentModal] = useState(false);

  // Transaction details modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [receiptSignedUrl, setReceiptSignedUrl] = useState<string | null | undefined>(undefined);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [withdrawForm, setWithdrawForm] = useState({ forWhat: '', amount: '', date: getTodayIso(), personName: '' });
  const [transferForm, setTransferForm] = useState({ amount: '', feeAmount: '', receivingAccountId: '', date: getTodayIso() }); // For My Accounts tab
  const [sendFriendForm, setSendFriendForm] = useState({ forWhat: '', amount: '', personName: '', date: getTodayIso() }); // For Friends tab
  const [loanForm, setLoanForm] = useState({ what: '', amount: '', date: getTodayIso(), personName: '' });
  const [cashInForm, setCashInForm] = useState({ amount: '', date: getTodayIso(), notes: '', personName: '' });
  const [loanPaymentForm, setLoanPaymentForm] = useState({ amount: '', date: getTodayIso() });
  const [cardPaymentForm, setCardPaymentForm] = useState({ name: '', amount: '', date: getTodayIso(), notes: '' });
  const [people, setPeople] = useState<SupabasePerson[]>([]);

  // Raw Supabase transactions (used for credit utilization calculation)
  const [supabaseTransactions, setSupabaseTransactions] = useState<SupabaseTransaction[]>([]);
  // Credit utilization state (null when account is not a credit card with a limit)
  const [creditUtilization, setCreditUtilization] = useState<CreditUtilization | null>(null);

  // Edit transaction modal
  const [showEditTxModal, setShowEditTxModal] = useState(false);
  const [editingViewTx, setEditingViewTx] = useState<Transaction | null>(null);
  const [editTxForm, setEditTxForm] = useState({ name: '', amount: '', date: '' });

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterStartDate, setFilterStartDate] = useState<string>(getFirstDayOfCurrentYearIso());
  const [filterEndDate, setFilterEndDate] = useState<string>(getLastDayOfCurrentYearIso());
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(!isMobile);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // ── Select / batch-delete state ───────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const loadTransactions = async () => {
    if (typeof window === "undefined" || !accountId) return;
    
    try {
      const { data: transactionsData, error: transactionsError } = await getTransactionsByPaymentMethod(accountId);
      
      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError);
        setTransactions([]);
        return;
      }
      
      const txList: Transaction[] = (transactionsData || []).map(t => ({
        id: t.id,
        name: t.name,
        date: t.date,
        amount: t.amount,
        paymentMethodId: t.payment_method_id,
        transaction_type: t.transaction_type,
        notes: t.notes,
        related_transaction_id: t.related_transaction_id,
        receiptUrl: (t as unknown as { receipt_url?: string | null }).receipt_url ?? null,
        person_name: (t as any).person_name ?? null
      }));
      setTransactions(txList);

      // Keep the raw Supabase rows for credit utilization computation
      setSupabaseTransactions(transactionsData || []);

      // Compute credit utilization if this is a credit account with a limit
      const currentAccountForUtil = accounts.find(a => a.id === accountId);
      if (currentAccountForUtil?.type === 'Credit' && currentAccountForUtil.creditLimit != null) {
        setCreditUtilization(computeCreditUtilization(currentAccountForUtil, transactionsData || []));
      } else {
        setCreditUtilization(null);
      }

      // Load loan transactions with payments (only for debit accounts)
      const currentAccount = accounts.find(a => a.id === accountId);
      if (currentAccount?.type === 'Debit') {
        const { data: loansData } = await getLoanTransactionsWithPayments(accountId);
        if (loansData) {
          const loansWithMeta = loansData.map(loan => ({
            id: loan.id,
            name: loan.name,
            date: loan.date,
            amount: loan.amount,
            paymentMethodId: loan.payment_method_id,
            transaction_type: loan.transaction_type as 'loan',
            notes: loan.notes,
            related_transaction_id: loan.related_transaction_id,
            payments: loan.payments?.map(p => ({
              id: p.id,
              name: p.name,
              date: p.date,
              amount: p.amount,
              paymentMethodId: p.payment_method_id,
              transaction_type: p.transaction_type as 'loan_payment',
              notes: p.notes,
              related_transaction_id: p.related_transaction_id
            })) || [],
            totalPaid: loan.totalPaid,
            remainingBalance: loan.remainingBalance
          }));
          setLoanTransactions(loansWithMeta);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (accountId) {
          const foundAccount = accounts.find(a => a.id === accountId);
          if (foundAccount) {
            setAccount(foundAccount);
          }
        }

        // Use accounts prop for transfer dropdown (already loaded from parent)
        setAllAccounts(accounts);
            
            const { data: peopleData } = await getAllPeople();
            if (peopleData) setPeople(peopleData);

        await loadTransactions();
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [accountId, accounts]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // Generate a fresh signed URL whenever the Transaction Details modal opens
  useEffect(() => {
    if (selectedTx?.receiptUrl) {
      setReceiptSignedUrl(undefined);
      getReceiptSignedUrl(selectedTx.receiptUrl)
        .then(url => setReceiptSignedUrl(url))
        .catch(() => setReceiptSignedUrl(null));
    } else {
      setReceiptSignedUrl(null);
    }
  }, [selectedTx]);

  // Close type-filter dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isMobile) setShowFiltersPanel(true);
  }, [isMobile]);

  // ── Derived: filtered transactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const d = tx.date.slice(0, 10);
      if (d < filterStartDate || d > filterEndDate) return false;
      if (filterTypes.size > 0 && !filterTypes.has(tx.transaction_type ?? 'payment')) return false;
      return true;
    });
  }, [transactions, filterStartDate, filterEndDate, filterTypes]);

  // ── Derived: current balance (pre-calculated from App.tsx, no re-reduction needed) ─
  const currentBalance = useMemo(() => account?.balance ?? 0, [account]);

  // ── Derived: total in / out from filtered transactions ────────────────────
  const totalIn = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + (tx.amount < 0 ? -tx.amount : 0), 0),
    [filteredTransactions]
  );
  const totalOut = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0),
    [filteredTransactions]
  );

  // ── Select / batch-delete helpers ─────────────────────────────────────────
  const toggleSelectMode = () => {
    setIsSelectMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredTransactions.map(t => t.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  };

  const handleBatchDelete = async () => {
    setIsBatchDeleting(true);
    try {
      const { errors } = await batchDeleteTransactions([...selectedIds]);
      if (errors.length > 0) {
        console.error('Some deletions failed:', errors);
        alert(`${errors.length} transaction(s) could not be deleted. Please try again.`);
      }
      setShowBatchConfirm(false);
      setSelectedIds(new Set());
      setIsSelectMode(false);
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Batch delete error:', error);
      alert('Failed to delete transactions. Please try again.');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────
  const toggleTypeFilter = (val: string) => {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });
  };

  const resetFilters = () => {
    setFilterStartDate(getFirstDayOfCurrentYearIso());
    setFilterEndDate(getLastDayOfCurrentYearIso());
    setFilterTypes(new Set());
  };

  const typeFilterLabel =
    filterTypes.size === 0
      ? 'All Types'
      : filterTypes.size === 1
        ? TRANSACTION_TYPE_OPTIONS.find(o => filterTypes.has(o.value))?.label ?? '1 selected'
        : `${filterTypes.size} selected`;

  const allVisibleSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every(t => selectedIds.has(t.id));

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: withdrawForm.forWhat,
        date: combineDateWithCurrentTime(withdrawForm.date),
        amount: Math.abs(parseFloat(withdrawForm.amount)), // Positive - money going out
        payment_method_id: accountId,
        transaction_type: 'withdraw',
        notes: null,
        payment_schedule_id: null,
        related_transaction_id: null,
        person_name: withdrawForm.personName.trim() || null,
      });

      if (error) throw error;
      
      showMessage('success', 'Withdrawal recorded successfully');
      setShowWithdrawModal(false);
      setWithdrawForm({ forWhat: '', amount: '', date: getTodayIso(), personName: '' });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      showMessage('error', 'Failed to create withdrawal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransfer(
        accountId,
        transferForm.receivingAccountId,
        parseFloat(transferForm.amount),
        combineDateWithCurrentTime(transferForm.date),
        parseFloat(transferForm.feeAmount || '0')
      );

      if (error) throw error;
      
      showMessage('success', 'Transfer completed successfully');
      setShowSendModal(false);
      setTransferForm({ amount: '', feeAmount: '', receivingAccountId: '', date: getTodayIso() });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating transfer:', error);
      showMessage('error', 'Failed to create transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: sendFriendForm.forWhat || `Transfer to ${sendFriendForm.personName}`,
        date: combineDateWithCurrentTime(sendFriendForm.date),
        amount: Math.abs(parseFloat(sendFriendForm.amount)), // Positive - money going out
        payment_method_id: accountId,
        transaction_type: 'transfer',
        notes: null,
        payment_schedule_id: null,
        related_transaction_id: null,
        person_name: sendFriendForm.personName.trim() || null,
      });

      if (error) throw error;
      
      showMessage('success', 'Transfer sent successfully');
      setShowSendModal(false);
      setSendFriendForm({ forWhat: '', amount: '', personName: '', date: getTodayIso() });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error sending to friend:', error);
      showMessage('error', 'Failed to send transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: `Loan: ${loanForm.what}`,
        date: combineDateWithCurrentTime(loanForm.date),
        amount: Math.abs(parseFloat(loanForm.amount)), // Positive - money going out (lent)
        payment_method_id: accountId,
        transaction_type: 'loan',
        notes: loanForm.what,
        payment_schedule_id: null,
        related_transaction_id: null,
        person_name: loanForm.personName.trim() || null,
      });

      if (error) throw error;
      
      showMessage('success', 'Loan recorded successfully');
      setShowLoanModal(false);
      setLoanForm({ what: '', amount: '', date: getTodayIso(), personName: '' });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating loan:', error);
      showMessage('error', 'Failed to create loan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCashInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: 'Cash In',
        date: combineDateWithCurrentTime(cashInForm.date),
        amount: -Math.abs(parseFloat(cashInForm.amount)), // Negative - money coming in
        payment_method_id: accountId,
        transaction_type: 'cash_in',
        notes: cashInForm.notes || null,
        payment_schedule_id: null,
        related_transaction_id: null,
        person_name: cashInForm.personName.trim() || null,
      });

      if (error) throw error;
      
      showMessage('success', 'Cash in recorded successfully');
      setShowCashInModal(false);
      setCashInForm({ amount: '', date: getTodayIso(), notes: '', personName: '' });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating cash in:', error);
      showMessage('error', 'Failed to record cash in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !selectedLoan) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: 'Loan Payment Received',
        date: combineDateWithCurrentTime(loanPaymentForm.date),
        amount: -Math.abs(parseFloat(loanPaymentForm.amount)), // Negative - money coming in
        payment_method_id: accountId,
        transaction_type: 'loan_payment',
        notes: `Payment for: ${selectedLoan.name}`,
        payment_schedule_id: null,
        related_transaction_id: selectedLoan.id,
      });

      if (error) throw error;
      
      showMessage('success', 'Loan payment recorded successfully');
      setShowLoanPaymentModal(false);
      setSelectedLoan(null);
      setLoanPaymentForm({ amount: '', date: getTodayIso() });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating loan payment:', error);
      showMessage('error', 'Failed to record loan payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLoanPaymentModal = (loan: LoanTransaction) => {
    setSelectedLoan(loan);
    setShowLoanPaymentModal(true);
  };

  const handleCardPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;

    const raw = cardPaymentForm.amount.trim();
    const amountValue = Math.abs(parseFloat(raw || '0'));
    if (isNaN(amountValue) || amountValue <= 0) {
      showMessage('error', 'Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: cardPaymentForm.name.trim() || 'Credit Card Payment',
        date: combineDateWithCurrentTime(cardPaymentForm.date),
        amount: -amountValue,                    // negative → reduces outstanding balance
        payment_method_id: accountId,
        transaction_type: 'credit_payment',
        notes: cardPaymentForm.notes.trim() || null,
        payment_schedule_id: null,
        related_transaction_id: null,
      });

      if (error) throw error;

      showMessage('success', 'Credit card payment recorded successfully');
      setShowCardPaymentModal(false);
      setCardPaymentForm({ name: '', amount: '', date: getTodayIso(), notes: '' });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error recording credit card payment:', error);
      showMessage('error', 'Failed to record credit card payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTx = async (tx: Transaction) => {
    setConfirmModal({
      show: true,
      title: 'Delete Transaction',
      message: `Are you sure you want to permanently delete "${tx.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const { error } = await deleteTransactionAndRevertSchedule(tx.id);
          if (error) throw error;
          await loadTransactions();
          onTransactionCreated?.();
        } catch (error) {
          console.error('Error deleting transaction:', error);
          alert('Failed to delete transaction. Please check your connection and try again.');
        }
      }
    });
  };

  const openEditTxModal = (tx: Transaction) => {
    setEditingViewTx(tx);
    setEditTxForm({
      name: tx.name,
      amount: Math.abs(tx.amount).toString(),
      date: tx.date.split('T')[0]
    });
    setShowEditTxModal(true);
  };

  const handleEditTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingViewTx) return;

    setIsSubmitting(true);
    try {
      // Preserve the original sign of the amount (positive = money out, negative = money in)
      const sign = editingViewTx.amount < 0 ? -1 : 1;
      const { error } = await updateTransactionAndSyncSchedule(editingViewTx.id, {
        name: editTxForm.name,
        date: combineDateWithCurrentTime(editTxForm.date),
        amount: sign * parseFloat(editTxForm.amount)
      });

      if (error) throw error;

      showMessage('success', 'Transaction updated successfully');
      setShowEditTxModal(false);
      setEditingViewTx(null);
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error updating transaction:', error);
      showMessage('error', 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTransactionTypeBadge = (type?: string) => {
    const badges: Record<string, { color: string; label: string }> = {
      payment: { color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300', label: 'Payment' },
      withdraw: { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Withdraw' },
      transfer: { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', label: 'Transfer' },
      loan: { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', label: 'Loan' },
      cash_in: { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', label: 'Cash In' },
      loan_payment: { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', label: 'Loan Payment' },
      credit_payment: { color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400', label: 'Card Payment' },
    };
    
    const key = type || 'payment';
    const badge = badges[key];
    if (!badge) return null;
    
    return (
      <span className={`inline-flex rounded-xl border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // Filter for transfer dropdown: only debit accounts, exclude current account
  const transferAccountOptions = allAccounts.filter(
    a => a.type === 'Debit' && a.id !== accountId
  );
  
  // Extract unique people names for autocomplete datalist
  const uniquePeopleNames = useMemo(() => {
    const names = [
      ...people.map(p => p.name),
      ...supabaseTransactions.map(t => (t as any).person_name).filter(Boolean)
    ];
    return Array.from(new Set(names));
  }, [people, supabaseTransactions]);

  const retroActionButtonBase = "inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-black px-3 py-2.5 text-xs font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none";
  const modalFieldClass = "w-full rounded-2xl border-[3px] border-black bg-[#fff8ea] p-4 font-bold text-gray-900 outline-none transition-colors dark:bg-gray-800 dark:text-gray-100";
  const retroModalShell = "w-full max-w-md rounded-[2rem] border-[4px] border-black bg-[#fff7e8] p-6 sm:p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900";
  const retroWideModalShell = "w-full max-w-2xl rounded-[2rem] border-[4px] border-black bg-[#fff7e8] shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900";
  const retroModalTitle = "text-2xl font-black uppercase tracking-tight text-gray-900 transition-colors dark:text-gray-100";
  const retroModalSubtitle = "mt-2 text-sm font-medium leading-relaxed text-gray-600 transition-colors dark:text-gray-400";
  const retroPanelClass = "rounded-[1.5rem] border-[3px] border-black bg-white p-4 transition-colors dark:bg-gray-950";
  const retroGhostButton = "rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-black text-gray-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100";
  const retroCloseButton = "absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100";
  const mobileSquircleActionButton = "inline-flex h-[clamp(2.75rem,12vw,3.15rem)] w-[clamp(2.75rem,12vw,3.15rem)] shrink-0 items-center justify-center rounded-[1.15rem] border-[3px] border-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none";
  const mobileActionIconClass = "h-[clamp(0.95rem,4vw,1.15rem)] w-[clamp(0.95rem,4vw,1.15rem)]";
  const mobileCardIconButton = "inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] border-[3px] border-black bg-white text-gray-800 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-900 dark:text-gray-100";

  return (
    <div className={`min-h-screen bg-gray-100 dark:bg-gray-950 transition-colors ${isMobile ? 'px-4 pb-8 pt-6' : 'p-8'}`}>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={account ? account.bank : 'Account'}
          subtitle={account ? `${account.type} · ${account.classification}` : `Account ${accountId}`}
          icon={
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
              {account?.type === 'Credit' ? <CreditCard className="w-7 h-7" /> : <WalletCards className="w-7 h-7" />}
            </div>
          }
          backButton={!isMobile ? (
            <Link to="/accounts" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          ) : undefined}
        />

        {/* Success/Error Message */}
        {message && (
          <div className={`mb-4 rounded-2xl border-[3px] border-black p-4 font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors ${message.type === 'success' ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'}`}>
            {message.text}
          </div>
        )}

        {/* ── Filter Bar ──────────────────────────────────────────────────── */}
        <div className={`${isMobile ? 'mb-5 flex items-start gap-3' : 'mb-5'}`}>
          {isMobile && (
            <Link to="/accounts" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
        <div className="min-w-0 flex-1 rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
          <button
            type="button"
            onClick={() => {
              if (isMobile) {
                setShowFiltersPanel(p => !p);
                setShowTypeDropdown(false);
              }
            }}
            className={`flex w-full items-center ${isMobile ? 'justify-center' : 'justify-between'} gap-3`}
          >
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-[1.2rem] border-[3px] border-black bg-yellow-200 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <Filter className="h-4 w-4" />
              </div>
              <p className={`text-sm font-black tracking-[0.08em] text-gray-800 dark:text-gray-100 ${isMobile ? 'text-center leading-tight' : 'leading-none'}`}>
                <span className="uppercase tracking-[0.18em]">Filters:</span>{' '}
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Date Range And Transaction Types</span>
              </p>
            </div>
            {isMobile && (
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[1.2rem] border-[3px] border-black bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-800 dark:text-white">
                {showFiltersPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            )}
          </button>
          {showFiltersPanel && (
          <div className={`mt-4 flex flex-wrap items-end gap-3 ${isMobile ? 'justify-center text-center' : 'justify-center'}`}>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                min={FILTER_MIN_DATE}
                max={filterEndDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="rounded-xl border-[3px] border-black bg-[#fff8ea] px-3 py-2 text-sm font-bold outline-none transition-colors dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                min={filterStartDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className="rounded-xl border-[3px] border-black bg-[#fff8ea] px-3 py-2 text-sm font-bold outline-none transition-colors dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="flex flex-col gap-1 relative" ref={typeDropdownRef}>
              <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Transaction Type</label>
              <button
                type="button"
                onClick={() => setShowTypeDropdown(p => !p)}
                className="flex min-w-[140px] items-center justify-between gap-2 rounded-xl border-[3px] border-black bg-[#fff8ea] px-3 py-2 text-sm font-bold outline-none transition-colors dark:bg-gray-800 dark:text-gray-100"
              >
                <span className="transition-colors">{typeFilterLabel}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
              </button>
              {showTypeDropdown && (
                <div className="absolute top-full left-0 z-30 mt-1 min-w-[180px] rounded-xl border-[3px] border-black bg-white py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
                  {TRANSACTION_TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={filterTypes.has(opt.value)}
                        onChange={() => toggleTypeFilter(opt.value)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="self-end rounded-xl border-[3px] border-black bg-white px-3 py-2 text-xs font-black text-gray-600 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-800 dark:text-gray-300"
            >
              Reset
            </button>
          </div>
          )}
        </div>
        </div>

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        <div className={`mb-5 grid gap-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <div className={`${getAccentClasses('bg')} rounded-[1.8rem] border-[4px] border-black p-4 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors ${isMobile ? 'col-span-2 text-center' : ''}`}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-indigo-200">Current Balance</p>
            <p className="text-2xl font-black">{formatCurrency(currentBalance)}</p>
            <p className="mt-1 text-[10px] text-indigo-300">All time</p>
          </div>
          <div className={`rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900 ${isMobile ? 'aspect-square text-center flex flex-col items-center justify-center' : ''}`}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Total In</p>
            <p className="text-2xl font-black text-green-600 dark:text-green-400">{formatCurrency(totalIn)}</p>
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">Based on filter</p>
          </div>
          <div className={`rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900 ${isMobile ? 'aspect-square text-center flex flex-col items-center justify-center' : ''}`}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Out</p>
            <p className="text-2xl font-black text-red-600 dark:text-red-400">{formatCurrency(totalOut)}</p>
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">Based on filter</p>
          </div>
        </div>

        {/* ── Credit Summary (credit accounts only) ───────────────────────── */}
        {account?.type === 'Credit' && account.creditLimit != null && creditUtilization && (
          <div className={`mb-5 grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
            <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Credit Limit</p>
              <p className="text-xl font-black text-gray-900 dark:text-gray-100">{formatCurrency(account.creditLimit)}</p>
            </div>
            <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Outstanding Balance</p>
              <p className="text-xl font-black text-red-600 dark:text-red-400">{formatCurrency(creditUtilization.currentOutstanding)}</p>
            </div>
            <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Available Credit</p>
              <p className="text-xl font-black text-green-600 dark:text-green-400">{formatCurrency(creditUtilization.availableCredit ?? 0)}</p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-[1.8rem] border-[4px] border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
          {account?.type === 'Debit' && (
            <div className={`border-b-[4px] border-black px-4 py-4 ${isMobile ? 'overflow-x-auto' : ''}`}>
              <div className={`${isMobile ? 'flex min-w-max items-center justify-center gap-2' : 'flex items-center justify-end gap-2'}`}>
                  <button
                    onClick={() => setShowWithdrawModal(true)}
                    title="Withdraw"
                    aria-label="Record withdrawal"
                    className={isMobile ? `${mobileSquircleActionButton} bg-red-500` : `${retroActionButtonBase} bg-red-500 text-white`}
                  >
                    <ArrowUpFromLine className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                    {!isMobile && <span>Withdraw</span>}
                  </button>
                  <button
                    onClick={() => setShowSendModal(true)}
                    title="Send / Transfer"
                    aria-label="Send or transfer money"
                    className={isMobile ? `${mobileSquircleActionButton} bg-blue-500` : `${retroActionButtonBase} bg-blue-500 text-white`}
                  >
                    <Send className={isMobile ? `${mobileActionIconClass} ml-0.5` : 'w-4 h-4 ml-0.5'} />
                    {!isMobile && <span>Transfer</span>}
                  </button>
                  <button
                    onClick={() => setShowLoanModal(true)}
                    title="Loan"
                    aria-label="Record loan"
                    className={isMobile ? `${mobileSquircleActionButton} bg-orange-500` : `${retroActionButtonBase} bg-orange-500 text-white`}
                  >
                    <Banknote className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                    {!isMobile && <span>Loan</span>}
                  </button>
                  <button
                    onClick={() => setShowCashInModal(true)}
                    title="Cash In"
                    aria-label="Record cash in"
                    className={isMobile ? `${mobileSquircleActionButton} bg-green-500` : `${retroActionButtonBase} bg-green-500 text-white`}
                  >
                    <ArrowDownToLine className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                    {!isMobile && <span>Cash-in</span>}
                  </button>
                  <button
                    onClick={toggleSelectMode}
                    title={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                    aria-label={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                    className={isMobile ? `${mobileSquircleActionButton} ${isSelectMode ? 'bg-black' : getAccentClasses('bg')}` : `${retroActionButtonBase} ${isSelectMode ? 'bg-black text-white' : `${getAccentClasses('bg')} text-white`}`}
                  >
                    {isSelectMode ? <CheckSquare className={isMobile ? mobileActionIconClass : 'w-4 h-4'} /> : <Square className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />}
                    {!isMobile && <span>Select</span>}
                  </button>
                  {isSelectMode && selectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBatchConfirm(true)}
                      title="Delete selected"
                      aria-label="Delete selected transactions"
                      className={isMobile ? `${mobileSquircleActionButton} bg-red-600` : `${retroActionButtonBase} bg-red-600 text-white`}
                    >
                      <Trash2 className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                      {!isMobile && <span>{selectedIds.size}</span>}
                    </button>
                  )}
              </div>
            </div>
          )}
          {account?.type === 'Credit' && (
            <div className={`border-b-[4px] border-black px-4 py-4 ${isMobile ? 'overflow-x-auto' : ''}`}>
              <div className={`${isMobile ? 'flex min-w-max items-center justify-center gap-2' : 'flex items-center justify-end gap-2'}`}>
              <button
                onClick={() => setShowCardPaymentModal(true)}
                title="Make Credit Card Payment"
                aria-label="Make credit card payment"
                className={isMobile ? `${mobileSquircleActionButton} bg-teal-500` : `${retroActionButtonBase} bg-teal-500 text-white`}
              >
                <CreditCard className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                {!isMobile && <span>Payment</span>}
              </button>
              <button
                onClick={toggleSelectMode}
                title={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                aria-label={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                className={isMobile ? `${mobileSquircleActionButton} ${isSelectMode ? 'bg-black' : getAccentClasses('bg')}` : `${retroActionButtonBase} ${isSelectMode ? 'bg-black text-white' : `${getAccentClasses('bg')} text-white`}`}
              >
                {isSelectMode ? <CheckSquare className={isMobile ? mobileActionIconClass : 'w-4 h-4'} /> : <Square className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />}
                {!isMobile && <span>Select</span>}
              </button>
              {isSelectMode && selectedIds.size > 0 && (
                <button
                  onClick={() => setShowBatchConfirm(true)}
                  title="Delete selected"
                  aria-label="Delete selected transactions"
                  className={isMobile ? `${mobileSquircleActionButton} bg-red-600` : `${retroActionButtonBase} bg-red-600 text-white`}
                >
                  <Trash2 className={isMobile ? mobileActionIconClass : 'w-4 h-4'} />
                  {!isMobile && <span>{selectedIds.size}</span>}
                </button>
              )}
              </div>
            </div>
          )}
          <div className="border-b-[4px] border-black px-6 py-4 flex items-center justify-between transition-colors">
            <h2 className="text-sm font-bold uppercase text-gray-600 dark:text-gray-400 tracking-widest">Transactions</h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">{filteredTransactions.length} items</div>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                <p className="text-sm text-gray-500">Loading transactions...</p>
              </div>
            ) : isMobile ? (
              <div className="space-y-3">
                {filteredTransactions.map(tx => {
                  const loanTx = loanTransactions.find(l => l.id === tx.id);
                  return (
                    <div
                      key={tx.id}
                      className={`rounded-[1.4rem] border-[3px] border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isSelectMode && selectedIds.has(tx.id) ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-[#fff8ea] dark:bg-gray-800'}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-gray-100">{tx.name}</p>
                          <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">{new Date(tx.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${tx.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {formatCurrency(-tx.amount)}
                          </p>
                          <div className="mt-1">{getTransactionTypeBadge(tx.transaction_type)}</div>
                        </div>
                      </div>
                      {isSelectMode && (
                        <label className="mb-3 flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => toggleId(tx.id)}
                            aria-label={`Select transaction ${tx.name}`}
                            className="rounded"
                          />
                          Select transaction
                        </label>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={() => setSelectedTx(tx)} title="View details" aria-label="View transaction details" className={mobileCardIconButton}>
                          <Info className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEditTxModal(tx)} title="Edit transaction" aria-label="Edit transaction" className={mobileCardIconButton}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <PinProtectedAction featureId="transaction_deletions" onVerified={() => handleDeleteTx(tx)} actionLabel="Delete Transaction">
                          <button onClick={(e) => e.preventDefault()} title="Delete transaction" aria-label="Delete transaction" className="inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] border-[3px] border-black bg-red-500 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </PinProtectedAction>
                        {account?.type === 'Debit' && tx.transaction_type === 'loan' && loanTx && (loanTx.remainingBalance ?? 0) > 0 && (
                          <button onClick={() => openLoanPaymentModal(loanTx)} title="Receive loan payment" aria-label="Receive loan payment" className="inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] border-[3px] border-black bg-purple-500 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">
                            <BanknoteArrowDown className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <div className="rounded-[1.4rem] border-[3px] border-dashed border-black bg-white p-6 text-center dark:bg-gray-800">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                      {transactions.length === 0 ? 'No transactions for this account.' : 'No transactions match the current filter.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    {isSelectMode && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          title="Select all"
                          aria-label="Select all visible transactions"
                          className="rounded"
                        />
                      </th>
                    )}
                      <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(tx => {
                    const loanTx = loanTransactions.find(l => l.id === tx.id);
                    return (
                      <tr
                        key={tx.id}
                        className={`border-t border-gray-100 dark:border-gray-800 group transition-colors ${isSelectMode && selectedIds.has(tx.id) ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                      >
                        {isSelectMode && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(tx.id)}
                              onChange={() => toggleId(tx.id)}
                              aria-label={`Select transaction ${tx.name}`}
                              className="rounded"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.name}</div></td>
                        <td className="px-4 py-3">{getTransactionTypeBadge(tx.transaction_type)}</td>
                        <td className="px-4 py-3"><div className="text-sm text-gray-500 dark:text-gray-400">{new Date(tx.date).toLocaleDateString()}</div></td>
                        <td className="px-4 py-3">
                          <div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {formatCurrency(-tx.amount)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedTx(tx)}
                              title="View details"
                              aria-label="View transaction details"
                              className="text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full p-1.5 transition-all"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditTxModal(tx)}
                              title="Edit transaction"
                              aria-label="Edit transaction"
                              className="text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full p-1.5 transition-all"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <PinProtectedAction
                              featureId="transaction_deletions"
                              onVerified={() => handleDeleteTx(tx)}
                              actionLabel="Delete Transaction"
                            >
                              <button onClick={(e) => e.preventDefault()} title="Delete transaction" aria-label="Delete transaction" className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full p-1.5 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </PinProtectedAction>
                            {account?.type === 'Debit' && tx.transaction_type === 'loan' && loanTx && (loanTx.remainingBalance ?? 0) > 0 && (
                              <button
                                onClick={() => openLoanPaymentModal(loanTx)}
                                title="Receive payment"
                                aria-label="Receive loan payment"
                                className="bg-purple-500 hover:bg-purple-600 text-white rounded-full p-1.5 transition-all ml-1"
                              >
                                <BanknoteArrowDown className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTransactions.length === 0 && (
                    <tr><td colSpan={isSelectMode ? 6 : 5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                      {transactions.length === 0 ? 'No transactions for this account.' : 'No transactions match the current filter.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Batch Delete Confirmation Modal ─────────────────────────────────── */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} max-w-sm`}>
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-red-200 text-red-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:bg-red-900/30 dark:text-red-300">
              <Trash2 className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Confirm Deletion</h2>
            <p className={`${retroModalSubtitle} mb-6`}>
              You are deleting <span className="font-black text-red-600">{selectedIds.size}</span> transaction{selectedIds.size !== 1 ? 's' : ''}, and this will be irreversible. Do you want to proceed?
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                disabled={isBatchDeleting}
                className={`flex-1 ${retroGhostButton}`}
              >
                Cancel
              </button>
              <PinProtectedAction
                featureId="transaction_deletions"
                onVerified={handleBatchDelete}
                actionLabel="Delete Selected Transactions"
              >
                <button type="button" onClick={(e) => e.preventDefault()} disabled={isBatchDeleting} className="flex-1 rounded-2xl border-[3px] border-black bg-red-500 py-3 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">
                  {isBatchDeleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </PinProtectedAction>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative`}>
            <button
              type="button"
              onClick={() => setShowWithdrawModal(false)}
              className={retroCloseButton}
              aria-label="Close withdraw modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-red-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <ArrowUpFromLine className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Withdraw</h2>
            <p className={`${retroModalSubtitle} mb-8`}>Record a withdrawal from this account.</p>
            <form onSubmit={handleWithdrawSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">For What?</label>
                <input 
                  value={withdrawForm.forWhat} 
                  onChange={e => setWithdrawForm(f => ({ ...f, forWhat: e.target.value }))} 
                  required 
                  placeholder="e.g. ATM Withdrawal"
                  className={modalFieldClass}
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={withdrawForm.amount} 
                    onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className={`${modalFieldClass} pl-8 text-xl`} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Person / Payee (Optional)</label>
                <PersonAutocomplete 
                  options={uniquePeopleNames.filter(Boolean) as string[]}
                  value={withdrawForm.personName} 
                  onChange={val => setWithdrawForm(f => ({ ...f, personName: val }))} 
                  placeholder="e.g. John Doe"
                  className={modalFieldClass}
                />
                <p className="text-[10px] text-gray-500 mt-2 font-medium">Link this expense to a person in your People page.</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={withdrawForm.date} 
                  onChange={e => setWithdrawForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className={modalFieldClass}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-red-500 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send / Transfer Tabbed Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className={`${retroModalShell} relative animate-in zoom-in-95`}>
            <button type="button" onClick={() => setShowSendModal(false)} className={retroCloseButton} aria-label="Close send money modal"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-blue-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Send className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Send Money</h2>
            <p className={`${retroModalSubtitle} mb-6`}>Where are you sending these funds?</p>
            
            {/* Tab Selector */}
            <div className="mb-8 grid grid-cols-2 gap-3 rounded-[1.6rem] border-[3px] border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-950">
              <button
                type="button"
                onClick={() => setSendTab('accounts')}
                className={`flex items-center justify-center gap-2 rounded-2xl border-[3px] border-black px-4 py-3 text-sm font-black transition-all ${sendTab === 'accounts' ? 'bg-blue-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-[#fff8ea] text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-800 dark:text-gray-100'}`}
              >
                <Landmark className="w-4 h-4" />
                <span>My Accounts</span>
              </button>
              <button
                type="button"
                onClick={() => setSendTab('friends')}
                className={`flex items-center justify-center gap-2 rounded-2xl border-[3px] border-black px-4 py-3 text-sm font-black transition-all ${sendTab === 'friends' ? 'bg-blue-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-[#fff8ea] text-gray-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-800 dark:text-gray-100'}`}
              >
                <User className="w-4 h-4" />
                <span>Friends</span>
              </button>
            </div>

            {/* TAB 1: MY ACCOUNTS (Internal Transfer) */}
            {sendTab === 'accounts' && (
              <form onSubmit={handleTransferSubmit} className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={transferForm.amount} 
                    onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className={`${modalFieldClass} pl-8 text-xl`}
                  />
                </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">To Account</label>
                    {transferAccountOptions.length === 0 ? (
                      <div className="rounded-2xl border-[3px] border-black bg-red-100 p-4 text-xs font-bold text-red-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:bg-red-900/20 dark:text-red-300">No debit accounts</div>
                    ) : (
                      <select 
                        value={transferForm.receivingAccountId} 
                        onChange={e => setTransferForm(f => ({ ...f, receivingAccountId: e.target.value }))} 
                        required
                        className={`${modalFieldClass} appearance-none`}
                      >
                        <option value="">Select...</option>
                        {transferAccountOptions.map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                    <input 
                      type="date" 
                      value={transferForm.date} 
                      onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} 
                      required 
                      className={modalFieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Transfer Fee (Optional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={transferForm.feeAmount} 
                    onChange={e => setTransferForm(f => ({ ...f, feeAmount: e.target.value }))} 
                    placeholder="0.00"
                      className={`${modalFieldClass} pl-8`}
                  />
                </div>
                </div>

                <button type="submit" disabled={isSubmitting || transferAccountOptions.length === 0} className="mt-4 w-full rounded-2xl border-[3px] border-black bg-blue-600 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Transferring...' : 'Transfer to Account'}
                </button>
              </form>
            )}

            {/* TAB 2: FRIENDS (External Payment) */}
            {sendTab === 'friends' && (
              <form onSubmit={handleSendFriendSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                    <input 
                      type="number" step="0.01" min="0.01" value={sendFriendForm.amount} 
                      onChange={e => setSendFriendForm(f => ({ ...f, amount: e.target.value }))} 
                      required className={`${modalFieldClass} pl-8 text-xl`}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">To Who?</label>
                  <PersonAutocomplete 
                    options={uniquePeopleNames.filter(Boolean) as string[]}
                    value={sendFriendForm.personName} 
                    onChange={val => setSendFriendForm(f => ({ ...f, personName: val }))} 
                    required 
                    placeholder="e.g. John Doe"
                    className={modalFieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">For What? (Optional)</label>
                    <input 
                      value={sendFriendForm.forWhat} onChange={e => setSendFriendForm(f => ({ ...f, forWhat: e.target.value }))} 
                      placeholder="e.g. Dinner" className={modalFieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                    <input 
                      type="date" value={sendFriendForm.date} onChange={e => setSendFriendForm(f => ({ ...f, date: e.target.value }))} 
                      required className={modalFieldClass}
                    />
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting} className="mt-4 w-full rounded-2xl border-[3px] border-black bg-blue-600 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Sending...' : 'Send to Friend'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative`}>
            <button type="button" onClick={() => setShowLoanModal(false)} className={retroCloseButton} aria-label="Close loan modal"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-orange-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Banknote className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Loan</h2>
            <p className={`${retroModalSubtitle} mb-8`}>Record money lent out.</p>
            <form onSubmit={handleLoanSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">What?</label>
                <input 
                  value={loanForm.what} 
                  onChange={e => setLoanForm(f => ({ ...f, what: e.target.value }))} 
                  required 
                  placeholder="e.g. John Doe, Emergency Loan"
                  className={modalFieldClass}
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={loanForm.amount} 
                    onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className={`${modalFieldClass} pl-8 text-xl`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Person (Optional)</label>
                <PersonAutocomplete 
                  options={uniquePeopleNames.filter(Boolean) as string[]}
                  value={loanForm.personName} 
                  onChange={val => setLoanForm(f => ({ ...f, personName: val }))} 
                  placeholder="e.g. John Doe"
                  className={modalFieldClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanForm.date} 
                  onChange={e => setLoanForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className={modalFieldClass}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-orange-500 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash In Modal */}
      {showCashInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative`}>
            <button type="button" onClick={() => setShowCashInModal(false)} className={retroCloseButton} aria-label="Close cash in modal"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-green-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <ArrowDownToLine className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Cash In</h2>
            <p className={`${retroModalSubtitle} mb-8`}>Add money to this account.</p>
            <form onSubmit={handleCashInSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={cashInForm.amount} 
                    onChange={e => setCashInForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className={`${modalFieldClass} pl-8 text-xl`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">From Person (Optional)</label>
                <PersonAutocomplete 
                  options={uniquePeopleNames.filter(Boolean) as string[]}
                  value={cashInForm.personName} 
                  onChange={val => setCashInForm(f => ({ ...f, personName: val }))} 
                  placeholder="e.g. John Doe"
                  className={modalFieldClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={cashInForm.date} 
                  onChange={e => setCashInForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className={modalFieldClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Notes (Optional)</label>
                <textarea
                  value={cashInForm.notes} 
                  onChange={e => setCashInForm(f => ({ ...f, notes: e.target.value }))} 
                  placeholder="e.g. Salary, Bonus, etc."
                  rows={3}
                  className={`${modalFieldClass} resize-none`} 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCashInModal(false)}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-green-500 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Cash In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Payment Modal */}
      {showLoanPaymentModal && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative`}>
            <button
              type="button"
              onClick={() => {
                setShowLoanPaymentModal(false);
                setSelectedLoan(null);
              }}
              className={retroCloseButton}
              aria-label="Close receive payment modal"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-purple-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <BanknoteArrowDown className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Receive Loan Payment</h2>
            <p className={`${retroModalSubtitle} mb-4`}>Record payment received for: {selectedLoan.name}</p>
            
            <div className={`${retroPanelClass} mb-6`}>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Original Loan:</span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(Math.abs(selectedLoan.amount))}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Paid:</span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(selectedLoan.totalPaid || 0)}</span>
              </div>
              <div className="flex justify-between border-t-[3px] border-black pt-2">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Remaining Balance:</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{formatCurrency(selectedLoan.remainingBalance || 0)}</span>
              </div>
            </div>

            <form onSubmit={handleLoanPaymentSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    max={selectedLoan.remainingBalance || undefined}
                    value={loanPaymentForm.amount} 
                    onChange={e => setLoanPaymentForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className={`${modalFieldClass} pl-8 text-xl`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanPaymentForm.date} 
                  onChange={e => setLoanPaymentForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className={modalFieldClass}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoanPaymentModal(false);
                    setSelectedLoan(null);
                  }}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-purple-500 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Card Payment Modal */}
      {showCardPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative max-h-[92vh] overflow-y-auto overflow-x-hidden ${isMobile ? 'p-5' : ''}`}>
            <button type="button" onClick={() => setShowCardPaymentModal(false)} className={retroCloseButton} aria-label="Close credit card payment modal"><X className="w-4 h-4" /></button>
            <div className={`mb-4 inline-flex items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-teal-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isMobile ? 'h-12 w-12' : 'h-14 w-14'}`}>
              <CreditCard className={isMobile ? 'w-6 h-6' : 'w-7 h-7'} />
            </div>
            <h2 className={retroModalTitle}>Make Credit Card Payment</h2>
            <p className={`${retroModalSubtitle} ${isMobile ? 'mb-5' : 'mb-8'}`}>Record a payment to reduce your credit card balance.</p>
            <form onSubmit={handleCardPaymentSubmit} className={isMobile ? 'space-y-4' : 'space-y-6'}>
              <div>
                <label className={`block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ${isMobile ? 'mb-1.5' : 'mb-2'}`}>Payment Name (Optional)</label>
                <input
                  value={cardPaymentForm.name}
                  onChange={e => setCardPaymentForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Credit Card Payment"
                  className={`${modalFieldClass} ${isMobile ? 'p-3 text-sm' : ''}`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ${isMobile ? 'mb-1.5' : 'mb-2'}`}>Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={cardPaymentForm.amount}
                    onChange={e => setCardPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    required
                    className={`${modalFieldClass} pl-8 ${isMobile ? 'p-3 text-base' : 'text-xl'}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ${isMobile ? 'mb-1.5' : 'mb-2'}`}>Date</label>
                <input
                  type="date"
                  value={cardPaymentForm.date}
                  onChange={e => setCardPaymentForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className={`${modalFieldClass} ${isMobile ? 'p-3 text-sm' : ''}`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest ${isMobile ? 'mb-1.5' : 'mb-2'}`}>Notes (Optional)</label>
                <textarea
                  value={cardPaymentForm.notes}
                  onChange={e => setCardPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Full payment, minimum payment, etc."
                  rows={3}
                  className={`${modalFieldClass} resize-none ${isMobile ? 'p-3 text-sm' : ''}`}
                />
              </div>

              <div className={`pt-3 ${isMobile ? 'flex flex-col gap-3' : 'flex gap-4 pt-4'}`}>
                <button
                  type="button"
                  onClick={() => setShowCardPaymentModal(false)}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-teal-500 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {showEditTxModal && editingViewTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className={`${retroModalShell} relative`}>
            <button type="button" onClick={() => { setShowEditTxModal(false); setEditingViewTx(null); }} className={retroCloseButton} aria-label="Close edit transaction modal"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-indigo-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <Pencil className="w-7 h-7" />
            </div>
            <h2 className={retroModalTitle}>Edit Transaction</h2>
            <p className={`${retroModalSubtitle} mb-8`}>Update the transaction details below.</p>
            <form onSubmit={handleEditTxSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Name</label>
                <input
                  value={editTxForm.name}
                  onChange={e => setEditTxForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className={modalFieldClass}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTxForm.amount}
                    onChange={e => setEditTxForm(f => ({ ...f, amount: e.target.value }))}
                    required
                    className={`${modalFieldClass} pl-8 text-xl`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Date</label>
                <input
                  type="date"
                  value={editTxForm.date}
                  onChange={e => setEditTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className={modalFieldClass}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowEditTxModal(false); setEditingViewTx(null); }}
                  className={`flex-1 ${retroGhostButton}`}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl border-[3px] border-black bg-indigo-600 py-4 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Update Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && (() => {
        const pm = allAccounts.find(a => a.id === selectedTx.paymentMethodId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSelectedTx(null)}>
            <div className={`${retroModalShell} relative`} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setSelectedTx(null)}
                className={retroCloseButton}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-indigo-200 text-indigo-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:bg-indigo-900/30 dark:text-indigo-300">
                <Info className="w-7 h-7" />
              </div>
              <h2 className={retroModalTitle}>Transaction Details</h2>
              <dl className={`${retroPanelClass} mb-6 space-y-4`}>
                <div className="flex justify-between gap-4">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Name</dt>
                  <dd className="text-right text-sm font-bold text-gray-900 dark:text-gray-100">{selectedTx.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Date</dt>
                  <dd className="text-right text-sm text-gray-900 dark:text-gray-100">
                    {new Date(selectedTx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="ml-2 text-xs text-gray-400">{new Date(selectedTx.date).toLocaleTimeString()}</span>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Amount</dt>
                  <dd className={`text-right text-sm font-bold ${selectedTx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(-selectedTx.amount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Payment Method</dt>
                  <dd className="text-right text-sm text-gray-700 dark:text-gray-300">{pm ? pm.bank : selectedTx.paymentMethodId}</dd>
                </div>
              </dl>
              <div className={retroPanelClass}>
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Receipt</p>
                {selectedTx.receiptUrl ? (
                  receiptSignedUrl === undefined ? (
                    <div className="text-sm font-medium text-gray-400">Loading receipt…</div>
                  ) : receiptSignedUrl ? (
                    <div className="flex items-center space-x-3">
                      <img
                        src={receiptSignedUrl}
                        alt="Receipt thumbnail"
                        className="h-16 w-16 rounded-xl border-[3px] border-black object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <button
                        onClick={() => { setZoom(0.5); setPreviewReceiptUrl(receiptSignedUrl); }}
                        title="Preview receipt"
                        className="inline-flex items-center gap-1 rounded-xl border-[3px] border-black bg-indigo-100 px-3 py-2 text-sm font-black text-indigo-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-indigo-900/30 dark:text-indigo-300"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Preview</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Could not load receipt preview.</p>
                  )
                ) : (
                  <p className="text-sm text-gray-400 italic">No receipt attached</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt Preview Modal */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setPreviewReceiptUrl(null)}>
          <div className={`${retroWideModalShell} flex max-h-[90vh] flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b-[4px] border-black px-4 py-4">
              <h3 className="text-base font-black uppercase tracking-widest text-gray-900 dark:text-gray-100">Receipt Preview</h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))} title="Zoom out" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
                <span className="w-12 text-center text-xs font-black text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))} title="Zoom in" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
                <a href={previewReceiptUrl} download target="_blank" rel="noreferrer" title="Download receipt" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-indigo-100 text-indigo-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-indigo-900/30 dark:text-indigo-300" aria-label="Download receipt"><Download className="w-4 h-4" /></a>
                <button onClick={() => setPreviewReceiptUrl(null)} title="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100" aria-label="Close preview"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex flex-1 justify-center overflow-auto bg-[#fffdf5] p-4 transition-colors dark:bg-gray-950">
              <img src={previewReceiptUrl} alt="Receipt" style={{ width: `${zoom * 100}%`, height: 'auto', transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="flex w-full max-w-sm flex-col items-center rounded-[2rem] border-[4px] border-black bg-[#fff7e8] p-8 text-center shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-colors animate-in zoom-in-95 dark:bg-gray-900">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border-[3px] border-black bg-red-200 text-red-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-red-900/30 dark:text-red-300">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full rounded-2xl border-[3px] border-black bg-red-600 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">Proceed</button>
        <button onClick={onClose} className="w-full rounded-2xl border-[3px] border-black bg-white py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-300">Cancel</button>
      </div>
    </div>
  </div>
);

export default AccountFilteredTransactions;
