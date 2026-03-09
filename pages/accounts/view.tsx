import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Info, Eye, ZoomIn, ZoomOut, Download, X, Pencil, BanknoteArrowDown, Trash2, ArrowUpFromLine, ArrowDownToLine, ArrowLeftRight, Banknote, CheckSquare, Square, Filter, ChevronDown } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getTransactionsByPaymentMethod, createTransaction, updateTransaction, updateTransactionAndSyncSchedule, createTransfer, getLoanTransactionsWithPayments, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, batchDeleteTransactions } from '../../src/services/transactionsService';
import { combineDateWithCurrentTime, getFirstDayOfCurrentMonthIso, getTodayIso } from '../../src/utils/dateUtils';

const FILTER_MIN_DATE = '2025-01-01';

const TRANSACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'payment', label: 'Payment' },
  { value: 'withdraw', label: 'Withdrawal' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'loan', label: 'Loan' },
  { value: 'cash_in', label: 'Cash In' },
  { value: 'loan_payment', label: 'Loan Payment' },
];

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
  transaction_type?: 'payment' | 'withdraw' | 'transfer' | 'loan' | 'cash_in' | 'loan_payment';
  notes?: string | null;
  related_transaction_id?: string | null;
  receiptUrl?: string | null;
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
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || searchParams.get("id");
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loanTransactions, setLoanTransactions] = useState<LoanTransaction[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  
  // Modal states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [showLoanPaymentModal, setShowLoanPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanTransaction | null>(null);

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
  const [withdrawForm, setWithdrawForm] = useState({ forWhat: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [transferForm, setTransferForm] = useState({ amount: '', receivingAccountId: '', date: new Date().toISOString().split('T')[0] });
  const [loanForm, setLoanForm] = useState({ what: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [cashInForm, setCashInForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [loanPaymentForm, setLoanPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });

  // Edit transaction modal
  const [showEditTxModal, setShowEditTxModal] = useState(false);
  const [editingViewTx, setEditingViewTx] = useState<Transaction | null>(null);
  const [editTxForm, setEditTxForm] = useState({ name: '', amount: '', date: '' });

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterStartDate, setFilterStartDate] = useState<string>(getFirstDayOfCurrentMonthIso());
  const [filterEndDate, setFilterEndDate] = useState<string>(getTodayIso());
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // ── Select / batch-delete state ───────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

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
        receiptUrl: (t as unknown as { receipt_url?: string | null }).receipt_url ?? null
      }));
      setTransactions(txList);

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
    setFilterStartDate(getFirstDayOfCurrentMonthIso());
    setFilterEndDate(getTodayIso());
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
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Withdrawal recorded successfully');
      setShowWithdrawModal(false);
      setWithdrawForm({ forWhat: '', amount: '', date: new Date().toISOString().split('T')[0] });
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
        combineDateWithCurrentTime(transferForm.date)
      );

      if (error) throw error;
      
      showMessage('success', 'Transfer completed successfully');
      setShowTransferModal(false);
      setTransferForm({ amount: '', receivingAccountId: '', date: new Date().toISOString().split('T')[0] });
      await loadTransactions();
      onTransactionCreated?.();
    } catch (error) {
      console.error('Error creating transfer:', error);
      showMessage('error', 'Failed to create transfer');
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
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Loan recorded successfully');
      setShowLoanModal(false);
      setLoanForm({ what: '', amount: '', date: new Date().toISOString().split('T')[0] });
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
        related_transaction_id: null
      });

      if (error) throw error;
      
      showMessage('success', 'Cash in recorded successfully');
      setShowCashInModal(false);
      setCashInForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
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
        related_transaction_id: selectedLoan.id
      });

      if (error) throw error;
      
      showMessage('success', 'Loan payment recorded successfully');
      setShowLoanPaymentModal(false);
      setSelectedLoan(null);
      setLoanPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0] });
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

  const handleDeleteTx = async (tx: Transaction) => {
    if (!window.confirm(`Delete transaction "${tx.name}"? This action cannot be undone.`)) return;
    try {
      const { error } = await deleteTransactionAndRevertSchedule(tx.id);
      if (error) throw error;
      await loadTransactions();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction. Please check your connection and try again.');
    }
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
    if (!type || type === 'payment') return null;
    
    const badges: Record<string, { color: string; label: string }> = {
      withdraw: { color: 'bg-red-100 text-red-700', label: 'Withdraw' },
      transfer: { color: 'bg-blue-100 text-blue-700', label: 'Transfer' },
      loan: { color: 'bg-orange-100 text-orange-700', label: 'Loan' },
      cash_in: { color: 'bg-green-100 text-green-700', label: 'Cash In' },
      loan_payment: { color: 'bg-purple-100 text-purple-700', label: 'Loan Payment' }
    };
    
    const badge = badges[type];
    if (!badge) return null;
    
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // Filter for transfer dropdown: only debit accounts, exclude current account
  const transferAccountOptions = allAccounts.filter(
    a => a.type === 'Debit' && a.id !== accountId
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-black text-gray-900">
            {account ? account.bank : `Account ${accountId}`}
          </h1>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* ── Filter Bar ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <Filter className="w-4 h-4 text-gray-400 self-center mb-1 shrink-0" />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                min={FILTER_MIN_DATE}
                max={filterEndDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold border-transparent outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                min={filterStartDate}
                max={getTodayIso()}
                onChange={e => setFilterEndDate(e.target.value)}
                className="bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold border-transparent outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex flex-col gap-1 relative" ref={typeDropdownRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transaction Type</label>
              <button
                type="button"
                onClick={() => setShowTypeDropdown(p => !p)}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold border-transparent outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px] justify-between"
              >
                <span>{typeFilterLabel}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {showTypeDropdown && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[180px] py-2">
                  {TRANSACTION_TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={filterTypes.has(opt.value)}
                        onChange={() => toggleTypeFilter(opt.value)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="self-end px-3 py-2 text-xs font-bold text-gray-500 hover:text-indigo-600 bg-gray-100 hover:bg-indigo-50 rounded-xl transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-indigo-600 rounded-2xl shadow-sm p-4 text-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Current Balance</p>
            <p className="text-2xl font-black">{formatCurrency(currentBalance)}</p>
            <p className="text-[10px] text-indigo-300 mt-1">All time</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total In</p>
            <p className="text-2xl font-black text-green-600">{formatCurrency(totalIn)}</p>
            <p className="text-[10px] text-gray-400 mt-1">Based on filter</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total Out</p>
            <p className="text-2xl font-black text-red-600">{formatCurrency(totalOut)}</p>
            <p className="text-[10px] text-gray-400 mt-1">Based on filter</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-500">{filteredTransactions.length} items</div>

              {/* ── Action icon buttons (Debit only) + Select + Trash ─────── */}
              {account?.type === 'Debit' && (
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={() => setShowWithdrawModal(true)}
                    title="Withdraw"
                    aria-label="Record withdrawal"
                    className="w-9 h-9 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowTransferModal(true)}
                    title="Transfer"
                    aria-label="Transfer money"
                    className="w-9 h-9 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowLoanModal(true)}
                    title="Loan"
                    aria-label="Record loan"
                    className="w-9 h-9 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
                  >
                    <Banknote className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowCashInModal(true)}
                    title="Cash In"
                    aria-label="Record cash in"
                    className="w-9 h-9 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                  </button>

                  {/* Select toggle */}
                  <button
                    onClick={toggleSelectMode}
                    title={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                    aria-label={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors border ${
                      isSelectMode
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {isSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Trash — shown only when ≥1 item selected */}
                  <div className="w-9 h-9 flex items-center justify-center">
                    {isSelectMode && selectedIds.size > 0 && (
                      <button
                        onClick={() => setShowBatchConfirm(true)}
                        title="Delete selected"
                        aria-label="Delete selected transactions"
                        className="w-9 h-9 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                <p className="text-sm text-gray-500">Loading transactions...</p>
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
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(tx => {
                    const loanTx = loanTransactions.find(l => l.id === tx.id);
                    return (
                      <tr
                        key={tx.id}
                        className={`border-t border-gray-100 group ${isSelectMode && selectedIds.has(tx.id) ? 'bg-indigo-50' : ''}`}
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
                        <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{tx.name}</div></td>
                        <td className="px-4 py-3">{getTransactionTypeBadge(tx.transaction_type)}</td>
                        <td className="px-4 py-3"><div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div></td>
                        <td className="px-4 py-3">
                          <div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(-tx.amount)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedTx(tx)}
                              title="View details"
                              aria-label="View transaction details"
                              className="text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full p-1.5 transition-all"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditTxModal(tx)}
                              title="Edit transaction"
                              aria-label="Edit transaction"
                              className="text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full p-1.5 transition-all"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTx(tx)}
                              title="Delete transaction"
                              aria-label="Delete transaction"
                              className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full p-1.5 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                    <tr><td colSpan={isSelectMode ? 6 : 5} className="px-4 py-6 text-center text-gray-400">
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-3">Confirm Deletion</h2>
            <p className="text-sm text-gray-600 mb-6">
              You are deleting <span className="font-black text-red-600">{selectedIds.size}</span> transaction{selectedIds.size !== 1 ? 's' : ''}, and this will be irreversible. Do you want to proceed?
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                disabled={isBatchDeleting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-2xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={isBatchDeleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl font-bold transition-colors disabled:opacity-50"
              >
                {isBatchDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Withdraw</h2>
            <p className="text-gray-500 text-sm mb-8">Record a withdrawal from this account</p>
            <form onSubmit={handleWithdrawSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">For What?</label>
                <input 
                  value={withdrawForm.forWhat} 
                  onChange={e => setWithdrawForm(f => ({ ...f, forWhat: e.target.value }))} 
                  required 
                  placeholder="e.g. ATM Withdrawal"
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-red-500 transition-all" 
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={withdrawForm.amount} 
                    onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-red-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={withdrawForm.date} 
                  onChange={e => setWithdrawForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Record Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Transfer</h2>
            <p className="text-gray-500 text-sm mb-8">Transfer money to another account</p>
            <form onSubmit={handleTransferSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={transferForm.amount} 
                    onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-blue-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receiving Account</label>
                {transferAccountOptions.length === 0 ? (
                  <div className="text-xs text-red-600 p-4 bg-red-50 rounded-xl">No other debit accounts available</div>
                ) : (
                  <select 
                    value={transferForm.receivingAccountId} 
                    onChange={e => setTransferForm(f => ({ ...f, receivingAccountId: e.target.value }))} 
                    required
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    <option value="">Select account...</option>
                    {transferAccountOptions.map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={transferForm.date} 
                  onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
                  disabled={isSubmitting || transferAccountOptions.length === 0}
                >
                  {isSubmitting ? 'Processing...' : 'Complete Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Loan</h2>
            <p className="text-gray-500 text-sm mb-8">Record money lent out</p>
            <form onSubmit={handleLoanSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">What?</label>
                <input 
                  value={loanForm.what} 
                  onChange={e => setLoanForm(f => ({ ...f, what: e.target.value }))} 
                  required 
                  placeholder="e.g. John Doe, Emergency Loan"
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-orange-500 transition-all" 
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={loanForm.amount} 
                    onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-orange-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanForm.date} 
                  onChange={e => setLoanForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
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
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Cash In</h2>
            <p className="text-gray-500 text-sm mb-8">Add money to this account</p>
            <form onSubmit={handleCashInSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    value={cashInForm.amount} 
                    onChange={e => setCashInForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-green-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={cashInForm.date} 
                  onChange={e => setCashInForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Notes (Optional)</label>
                <textarea
                  value={cashInForm.notes} 
                  onChange={e => setCashInForm(f => ({ ...f, notes: e.target.value }))} 
                  placeholder="e.g. Salary, Bonus, etc."
                  rows={3}
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm focus:ring-2 focus:ring-green-500 transition-all resize-none" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCashInModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
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
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Receive Loan Payment</h2>
            <p className="text-gray-500 text-sm mb-4">Record payment received for: {selectedLoan.name}</p>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">Original Loan:</span>
                <span className="text-sm font-bold">{formatCurrency(Math.abs(selectedLoan.amount))}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">Total Paid:</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(selectedLoan.totalPaid || 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Remaining Balance:</span>
                <span className="text-sm font-bold text-orange-600">{formatCurrency(selectedLoan.remainingBalance || 0)}</span>
              </div>
            </div>

            <form onSubmit={handleLoanPaymentSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    max={selectedLoan.remainingBalance || undefined}
                    value={loanPaymentForm.amount} 
                    onChange={e => setLoanPaymentForm(f => ({ ...f, amount: e.target.value }))} 
                    required 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-purple-500 transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  value={loanPaymentForm.date} 
                  onChange={e => setLoanPaymentForm(f => ({ ...f, date: e.target.value }))} 
                  required 
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoanPaymentModal(false);
                    setSelectedLoan(null);
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
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
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Edit Transaction</h2>
            <p className="text-gray-500 text-sm mb-8">Update the transaction details below</p>
            <form onSubmit={handleEditTxSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
                <input
                  value={editTxForm.name}
                  onChange={e => setEditTxForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTxForm.amount}
                    onChange={e => setEditTxForm(f => ({ ...f, amount: e.target.value }))}
                    required
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input
                  type="date"
                  value={editTxForm.date}
                  onChange={e => setEditTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowEditTxModal(false); setEditingViewTx(null); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50"
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
            <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setSelectedTx(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-black text-gray-900 mb-6">Transaction Details</h2>
              <dl className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Name</dt>
                  <dd className="text-sm font-bold text-gray-900">{selectedTx.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Date</dt>
                  <dd className="text-sm text-gray-900">
                    {new Date(selectedTx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="ml-2 text-xs text-gray-400">{new Date(selectedTx.date).toLocaleTimeString()}</span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Amount</dt>
                  <dd className={`text-sm font-bold ${selectedTx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(-selectedTx.amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Payment Method</dt>
                  <dd className="text-sm text-gray-700">{pm ? pm.bank : selectedTx.paymentMethodId}</dd>
                </div>
              </dl>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Receipt</p>
                {selectedTx.receiptUrl ? (
                  receiptSignedUrl === undefined ? (
                    <div className="text-sm text-gray-400">Loading receipt…</div>
                  ) : receiptSignedUrl ? (
                    <div className="flex items-center space-x-3">
                      <img
                        src={receiptSignedUrl}
                        alt="Receipt thumbnail"
                        className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <button
                        onClick={() => { setZoom(0.5); setPreviewReceiptUrl(receiptSignedUrl); }}
                        title="Preview receipt"
                        className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-sm font-bold"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewReceiptUrl(null)}>
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900 uppercase tracking-widest">Receipt Preview</h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))} title="Zoom out" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))} title="Zoom in" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
                <a href={previewReceiptUrl} download target="_blank" rel="noreferrer" title="Download receipt" className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-600 transition-colors" aria-label="Download receipt"><Download className="w-4 h-4" /></a>
                <button onClick={() => setPreviewReceiptUrl(null)} title="Close" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Close preview"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4 flex justify-center">
              <img src={previewReceiptUrl} alt="Receipt" style={{ width: `${zoom * 100}%`, height: 'auto', transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountFilteredTransactions;
