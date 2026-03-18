import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Info, Eye, ZoomIn, ZoomOut, Download, X, Pencil, Trash2, CheckSquare, Square, ChevronDown, Filter } from 'lucide-react';
import { getAllTransactions, createTransaction, updateTransaction, deleteTransactionAndRevertSchedule, uploadTransactionReceipt, getReceiptSignedUrl, batchDeleteTransactions } from '../src/services/transactionsService';
import { getAllAccountsFrontend } from '../src/services/accountsService';
import { combineDateWithCurrentTime, getTodayIso, getFirstDayOfCurrentMonthIso } from '../src/utils/dateUtils';

const FILTER_MIN_DATE = '2025-01-01';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO
  amount: number;
  paymentMethodId: string; // account id
  transaction_type?: string | null;
  receiptUrl?: string | null;
};

type AccountOption = { id: string; bank: string; classification?: string };

// Use the utility function from dateUtils
const todayIso = getTodayIso;

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

interface TransactionsPageProps {
  onTransactionDeleted?: () => void;
  onTransactionCreated?: () => void;
  refreshKey?: number; // Increment to trigger a live data refresh from outside
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ onTransactionDeleted, onTransactionCreated, refreshKey }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Transaction details modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  // Signed URL for displaying a receipt (generated fresh each time the modal opens)
  // undefined = loading, null = error/no receipt, string = ready
  const [receiptSignedUrl, setReceiptSignedUrl] = useState<string | null | undefined>(undefined);
  // Receipt preview modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  // Receipt file for the add-transaction form
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    name: '',
    date: todayIso(),
    amount: '',
    paymentMethodId: ''
  });

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterStartDate, setFilterStartDate] = useState<string>(getFirstDayOfCurrentMonthIso());
  const [filterEndDate, setFilterEndDate] = useState<string>(getTodayIso());
  const [filterPaymentMethods, setFilterPaymentMethods] = useState<Set<string>>(new Set());
  const [showPaymentMethodDropdown, setShowPaymentMethodDropdown] = useState(false);
  const pmDropdownRef = useRef<HTMLDivElement>(null);

  // ── Select / batch-delete state ───────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // ── Derived: filtered transactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Hide credit_payment counterparts — they live exclusively on the credit account
      // statement and should not appear in the global transaction list.
      if (tx.transaction_type === 'credit_payment') return false;
      const d = tx.date.slice(0, 10);
      if (d < filterStartDate || d > filterEndDate) return false;
      if (filterPaymentMethods.size > 0 && !filterPaymentMethods.has(tx.paymentMethodId)) return false;
      return true;
    });
  }, [transactions, filterStartDate, filterEndDate, filterPaymentMethods]);

  // ── Derived: total spend (positive amounts = money going out) ─────────────
  const totalSpend = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0),
    [filteredTransactions]
  );

  // Load transactions and accounts from Supabase in parallel
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsResult, transactionsResult] = await Promise.all([
        getAllAccountsFrontend(),
        getAllTransactions(),
      ]);

      if (accountsResult.error) {
        console.error('Error loading accounts:', accountsResult.error);
      } else if (accountsResult.data) {
        setAccounts(accountsResult.data.map(a => ({ id: a.id, bank: a.bank, classification: a.classification })));
      }

      if (transactionsResult.error) {
        console.error('Error loading transactions:', transactionsResult.error);
      } else if (transactionsResult.data) {
        setTransactions(transactionsResult.data.map(t => ({
          id: t.id,
          name: t.name,
          date: t.date,
          amount: t.amount,
          paymentMethodId: t.payment_method_id,
          transaction_type: t.transaction_type ?? null,
          receiptUrl: t.receipt_url ?? null,
        })));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-fetch transactions when the parent signals an external change (e.g. stash top-up
  // created/deleted from the Budget page). Uses a ref so the initial render is skipped.
  const prevRefreshKey = useRef<number | undefined>();
  useEffect(() => {
    if (prevRefreshKey.current === undefined) {
      prevRefreshKey.current = refreshKey;
      return;
    }
    if (prevRefreshKey.current !== refreshKey) {
      prevRefreshKey.current = refreshKey;
      loadData();
    }
  }, [refreshKey, loadData]);

  useEffect(() => {
    // Set default paymentMethodId when accounts are loaded and form hasn't been touched
    if (accounts.length > 0 && !form.paymentMethodId) {
      setForm(f => ({ ...f, paymentMethodId: accounts[0].id }));
    }
  }, [accounts, form.paymentMethodId]);

  // Generate a fresh signed URL whenever the Transaction Details modal opens
  useEffect(() => {
    if (selectedTx?.receiptUrl) {
      setReceiptSignedUrl(undefined); // reset to loading state
      getReceiptSignedUrl(selectedTx.receiptUrl)
        .then(url => setReceiptSignedUrl(url)) // null on internal error, string on success
        .catch(() => setReceiptSignedUrl(null));
    } else {
      setReceiptSignedUrl(null);
    }
  }, [selectedTx]);

  // Close payment-method dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pmDropdownRef.current && !pmDropdownRef.current.contains(e.target as Node)) {
        setShowPaymentMethodDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const closeForm = () => {
    setShowForm(false);
    setEditingTxId(null);
    setReceiptFile(null);
    setForm({ name: '', date: todayIso(), amount: '', paymentMethodId: accounts[0]?.id ?? '' });
  };

  const openEditForm = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setForm({
      name: tx.name,
      date: new Date(tx.date).toISOString().split('T')[0],
      amount: tx.amount.toString(),
      paymentMethodId: tx.paymentMethodId
    });
    setReceiptFile(null);
    setShowForm(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.amount || !form.paymentMethodId) return;
    
    try {
      if (editingTxId) {
        // Edit mode: update existing transaction
        const updates = {
          name: form.name,
          date: combineDateWithCurrentTime(form.date),
          amount: parseFloat(form.amount),
          payment_method_id: form.paymentMethodId
        };
        const { error } = await updateTransaction(editingTxId, updates);
        if (error) {
          console.error('Error updating transaction:', error);
          alert('Failed to update transaction. Please try again.');
          return;
        }
        // Upload new receipt if a file was selected during edit
        if (receiptFile) {
          const { path, error: uploadError } = await uploadTransactionReceipt(editingTxId, receiptFile);
          if (uploadError) {
            console.error('Error uploading receipt:', uploadError);
            alert('Transaction updated, but receipt upload failed. Please try again.');
          } else if (path) {
            await updateTransaction(editingTxId, { receipt_url: path });
          }
        }
        console.log('[Transactions Page] Transaction updated successfully');
      } else {
        // Create mode
        const transaction = {
          name: form.name,
          date: combineDateWithCurrentTime(form.date),
          amount: parseFloat(form.amount),
          payment_method_id: form.paymentMethodId
        };
        
        const { data, error } = await createTransaction(transaction);
        
        if (error) {
          console.error('Error creating transaction:', error);
          alert('Failed to create transaction. Please try again.');
          return;
        }
        
        console.log('Transaction created successfully:', data);

        // Upload receipt if a file was selected
        if (receiptFile && data) {
          const { path, error: uploadError } = await uploadTransactionReceipt(data.id, receiptFile);
          if (uploadError) {
            console.error('Error uploading receipt:', uploadError);
            alert('Transaction saved, but receipt upload failed. Please try again.');
          } else if (path) {
            await updateTransaction(data.id, { receipt_url: path });
          }
        }
      }
      
      // Reload transactions to get fresh data
      await loadData();
      
      // Notify parent if callback provided (for refreshing related data like account balances)
      if (onTransactionCreated) {
        console.log('[Transactions Page] Notifying parent of transaction change');
        onTransactionCreated();
      }
      
      closeForm();
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Failed to save transaction. Please try again.');
    }
  };

  const removeTx = async (id: string, name: string) => {
    if (!window.confirm(`Delete transaction "${name}"? This action cannot be undone.`)) return;
    try {
      console.log('[Transactions Page] Deleting transaction with reversion:', id);
      const { error } = await deleteTransactionAndRevertSchedule(id);
      if (error) throw error;
      
      console.log('[Transactions Page] Transaction deleted successfully');
      // Reload transactions after deletion
      await loadData();
      
      // Notify parent if callback provided (for refreshing related data)
      if (onTransactionDeleted) {
        console.log('[Transactions Page] Notifying parent of transaction deletion');
        onTransactionDeleted();
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction. Please check your connection and try again.');
    }
  };

  // ── Select / batch-delete helpers ─────────────────────────────────────────

  const toggleSelectMode = () => {
    setIsSelectMode(prev => {
      if (prev) setSelectedIds(new Set()); // clear selection when turning off
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
      await loadData();
      if (onTransactionDeleted) onTransactionDeleted();
    } catch (error) {
      console.error('Batch delete error:', error);
      alert('Failed to delete transactions. Please try again.');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────

  const togglePaymentMethodFilter = (id: string) => {
    setFilterPaymentMethods(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setFilterStartDate(getFirstDayOfCurrentMonthIso());
    setFilterEndDate(getTodayIso());
    setFilterPaymentMethods(new Set());
  };

  const allVisibleSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every(t => selectedIds.has(t.id));

  const pmFilterLabel =
    filterPaymentMethods.size === 0
      ? 'All Accounts'
      : filterPaymentMethods.size === 1
        ? accounts.find(a => filterPaymentMethods.has(a.id))?.bank ?? '1 selected'
        : `${filterPaymentMethods.size} selected`;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-gray-900">Transactions</h1>
          <div className="flex items-center space-x-3">
            <a href="/" className="px-3 py-2 rounded-lg bg-white shadow-sm">Back</a>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center space-x-2 hover:bg-indigo-700">
              <Plus className="w-4 h-4" />
              <span>Add Transaction</span>
            </button>
          </div>
        </div>

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
            <div className="flex flex-col gap-1 relative" ref={pmDropdownRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</label>
              <button
                type="button"
                onClick={() => setShowPaymentMethodDropdown(p => !p)}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold border-transparent outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px] justify-between"
              >
                <span>{pmFilterLabel}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {showPaymentMethodDropdown && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[180px] py-2">
                  {accounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={filterPaymentMethods.has(a.id)}
                        onChange={() => togglePaymentMethodFilter(a.id)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">{a.bank}</span>
                    </label>
                  ))}
                  {accounts.length === 0 && (
                    <p className="px-4 py-2 text-sm text-gray-400">No accounts</p>
                  )}
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

        {/* ── Total Spend Dashboard ────────────────────────────────────────── */}
        <div className="mb-4">
          <div className="bg-indigo-600 rounded-2xl shadow-sm p-5 text-white">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-1">Total Spend</p>
            <p className="text-3xl font-black">{formatCurrency(totalSpend)}</p>
            <p className="text-xs text-indigo-300 mt-1">Based on current filter · {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">All transactions</h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-500">{filteredTransactions.length} items</div>
              {/* Batch delete trash icon — shown only when ≥1 selected */}
              {isSelectMode && selectedIds.size > 0 && (
                <button
                  onClick={() => setShowBatchConfirm(true)}
                  title="Delete selected"
                  aria-label="Delete selected transactions"
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{selectedIds.size}</span>
                </button>
              )}
              {/* Select toggle */}
              <button
                onClick={toggleSelectMode}
                title={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                aria-label={isSelectMode ? 'Cancel selection' : 'Select transactions'}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${
                  isSelectMode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                {isSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>Select</span>
              </button>
            </div>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading transactions...</div>
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
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Payment Method</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(tx => {
                      const pm = accounts.find(a => a.id === tx.paymentMethodId);
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
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{new Date(tx.date).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-400">{new Date(tx.date).toLocaleTimeString()}</div>
                          </td>
                          <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(-tx.amount)}</div></td>
                          <td className="px-4 py-3"><div className="text-sm text-gray-700">{pm ? pm.bank : tx.paymentMethodId}</div></td>
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
                                onClick={() => openEditForm(tx)}
                                title="Edit transaction"
                                aria-label="Edit transaction"
                                className="text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full p-1.5 transition-all"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => removeTx(tx.id, tx.name)}
                                title="Delete transaction"
                                aria-label="Delete transaction"
                                className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full p-1.5 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTransactions.length === 0 && (
                      <tr><td colSpan={isSelectMode ? 6 : 5} className="px-4 py-6 text-center text-gray-400">
                        {transactions.length === 0 ? 'No transactions yet.' : 'No transactions match the current filter.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* QA: Consistent Transaction Form - with receipt upload, exclude credit accounts */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
              <h2 className="text-2xl font-black text-gray-900 mb-2">{editingTxId ? 'Edit Transaction' : 'Add New Transaction'}</h2>
              <p className="text-gray-500 text-sm mb-8">{editingTxId ? 'Update the transaction details below' : 'Record a payment transaction'}</p>
              <form onSubmit={onSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
                  <input 
                    value={form.name} 
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                    required 
                    placeholder="e.g. Groceries, Gas, etc."
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
                      value={form.amount} 
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} 
                      required 
                      className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                    <input 
                      type="date" 
                      value={form.date} 
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                      required 
                      className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                    {accounts.length === 0 ? (
                      <div className="text-xs text-red-600 p-4">No payment methods available</div>
                    ) : (
                      <select 
                        value={form.paymentMethodId} 
                        onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} 
                        className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                      >
                      {accounts.filter(a => a.classification !== 'Credit Card').map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                      <span className="font-bold">{receiptFile ? receiptFile.name : 'Click or drag to upload receipt'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button type="button" onClick={closeForm} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                  <button type="submit" disabled={accounts.length === 0} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">{editingTxId ? 'Update Transaction' : 'Submit Payment'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
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

      {/* Transaction Details Modal */}
      {selectedTx && (() => {
        const pm = accounts.find(a => a.id === selectedTx.paymentMethodId);
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

      {/* Receipt Preview Modal — overlays the details modal without dimming the background */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewReceiptUrl(null)}>
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900 uppercase tracking-widest">Receipt Preview</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))}
                  title="Zoom out"
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
                  title="Zoom in"
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <a
                  href={previewReceiptUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  title="Download receipt"
                  className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-600 transition-colors"
                  aria-label="Download receipt"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setPreviewReceiptUrl(null)}
                  title="Close"
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4 flex justify-center">
              <img
                src={previewReceiptUrl}
                alt="Receipt"
                style={{ width: `${zoom * 100}%`, height: 'auto', transition: 'width 0.2s' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsPage;
