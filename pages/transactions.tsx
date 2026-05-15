import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Info, Eye, ZoomIn, ZoomOut, Download, X, ArrowLeft, Pencil, Trash2, CheckSquare, Square, ChevronDown, Filter, AlertTriangle, ArrowUpFromLine, ArrowDownToLine, ArrowLeftRight, Landmark, CreditCard, FileText, User, UserPlus } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { useAuth } from '../src/contexts/AuthContext';
import { createTransaction, updateTransaction, deleteTransactionAndRevertSchedule, uploadTransactionReceipt, getReceiptSignedUrl, batchDeleteTransactions, createTransfer } from '../src/services/transactionsService';
import { getAllAccountsFrontend } from '../src/services/accountsService';
import { getAllPeople, createPerson } from '../src/services/peopleService';
import { getFriendships } from '../src/services/friendshipsService';
import type { SupabasePerson, SupabaseUserProfile, SupabaseFriendship } from '../src/types/supabase';
import { supabase } from '../src/utils/supabaseClient';
import { combineDateWithCurrentTime, getTodayIso, getFirstDayOfCurrentYearIso, getLastDayOfCurrentYearIso } from '../src/utils/dateUtils';
import { useTheme } from '../src/contexts/ThemeContext';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { TransactionList } from '../src/components/TransactionList';
import type { Transaction, AccountOption } from '../types';

const FILTER_MIN_DATE = '2025-01-01';

// Use the utility function from dateUtils
const todayIso = getTodayIso;

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

const TRANSACTION_TYPES = [
  { id: 'payment', label: 'Payment', icon: <CreditCard className="w-5 h-5" />, x: -130, y: 0 },
  { id: 'withdraw', label: 'Withdrawal', icon: <ArrowUpFromLine className="w-5 h-5" />, x: -120, y: -50 },
  { id: 'cash_in', label: 'Cash In', icon: <ArrowDownToLine className="w-5 h-5" />, x: -92, y: -92 },
  { id: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className="w-5 h-5" />, x: -50, y: -120 },
  { id: 'loan', label: 'Loan', icon: <Landmark className="w-5 h-5" />, x: 0, y: -130 },
];

type ContactOption = {
  id: string;
  name: string;
  handleOrEmail?: string;
  isLinked: boolean;
  isBudeeOnly: boolean;
  budeeProfile?: SupabaseUserProfile;
};

/** 
 * PageHeader component mirroring Dashboard style
 */
const PageHeader: React.FC<{
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  backButton?: React.ReactNode;
}> = ({ title, subtitle, icon, actions, backButton }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const [highlightWidth, setHighlightWidth] = useState(0);

  useEffect(() => {
    const calculateWidth = () => {
      if (titleContainerRef.current) {
        setHighlightWidth(titleContainerRef.current.offsetWidth);
      }
    };

    calculateWidth();
    // Recalculate on resize
    window.addEventListener('resize', calculateWidth);
    return () => window.removeEventListener('resize', calculateWidth);
  }, [title]); // Rerun if title changes

  return (
    <header className={`${isMobile ? 'pt-10' : 'pt-12'} mb-12 flex flex-row items-center justify-between gap-6`}>
      <div className="flex-1">
        {/* Title container for positioning the highlight */}
        <div className="relative inline-block">
          <div ref={titleContainerRef} className="flex items-center gap-4">
            {icon && <div className="z-10 shrink-0">{icon}</div>}
            <h1 className="text-[clamp(2rem,7.5vw,3.75rem)] font-[950] uppercase tracking-tighter leading-none relative z-10 text-black dark:text-white transition-colors duration-300">
              {title}
            </h1>
          </div>
          {/* Dynamic highlight */}
          {highlightWidth > 0 && (
            <div
              className={`absolute bottom-1 left-0 h-5 ${getAccentClasses('bg')} opacity-40 -z-0 -rotate-1 transition-colors duration-300`}
              style={{ width: `${highlightWidth}px` }}
            />
          )}
        </div>

        {/* Subtitle container */}
        <div className="flex items-center gap-3 mt-1 ml-1">
          {backButton ? (
            <div className="mt-6">{backButton}</div>
          ) : (
            <p className="text-[clamp(1rem,3vw,1.25rem)] font-bold italic text-black/50 dark:text-gray-400 transition-colors duration-300">
              {subtitle}
            </p>
          )}
        </div>

        <div className={`h-2 w-32 mt-2 bg-black dark:bg-white/20 transition-colors duration-300`} />
      </div>
      {actions && <div className="flex items-center justify-end gap-3">{actions}</div>}
    </header>
  );
};

const ContactDropdown = ({ value, onChange, contacts, placeholder }: { value: string, onChange: (val: string) => void, contacts: ContactOption[], placeholder: string }) => {
  const { getAccentClasses } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const exactMatch = contacts.find(c => c.name.toLowerCase() === search.toLowerCase());

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 pr-10 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
      />
      {exactMatch && !isOpen && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {exactMatch.isLinked && (
            <div className="flex items-center justify-center bg-green-100 dark:bg-green-900/30 p-1.5 rounded-lg" title="Profile Linked">
              <CheckSquare className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            </div>
          )}
          {exactMatch.isBudeeOnly && (
            <div className="flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-lg" title="Budee Connection">
              <UserPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
          )}
        </div>
      )}
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <div key={c.id} onClick={() => { setSearch(c.name); onChange(c.name); setIsOpen(false); }} className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors border-b-2 border-black last:border-0 ${getAccentClasses('hoverLight')}`}>
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-sm font-bold truncate">{c.name}</span>
                {c.handleOrEmail && <span className="text-[10px] text-gray-500 truncate">{c.handleOrEmail}</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.isLinked && (
                  <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded" title="Profile Linked"><CheckSquare className="w-3 h-3 text-green-600 dark:text-green-400" /></div>
                )}
                {c.isBudeeOnly && (
                  <div className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded" title="Budee Connection"><UserPlus className="w-3 h-3 text-indigo-600 dark:text-indigo-400" /></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface TransactionsPageProps {
  transactions: Transaction[];
  loading?: boolean;
  onTransactionDeleted?: () => void;
  onTransactionCreated?: () => void;
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ transactions, loading = false, onTransactionDeleted, onTransactionCreated }) => {
  const { getAccentClasses } = useTheme();
  const { userProfile } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [people, setPeople] = useState<SupabasePerson[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);
  const [showFloatingAdd, setShowFloatingAdd] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [formSource, setFormSource] = useState<'top' | 'fab' | null>(null);
  const [transferTab, setTransferTab] = useState<'accounts' | 'friends'>('accounts');
  const [friendProfiles, setFriendProfiles] = useState<SupabaseUserProfile[]>([]);
  const [pendingProfileModal, setPendingProfileModal] = useState<{budee: SupabaseUserProfile, formName: string} | null>(null);

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
    feeAmount: '',
    paymentMethodId: '',
    transactionType: 'payment',
    transferToAccountId: '',
    borrowerName: '', // New field for loan transactions
    personName: ''
  });

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterStartDate, setFilterStartDate] = useState<string>(getFirstDayOfCurrentYearIso());
  const [filterEndDate, setFilterEndDate] = useState<string>(getLastDayOfCurrentYearIso());
  const [filterPaymentMethods, setFilterPaymentMethods] = useState<Set<string>>(new Set());
  const [showPaymentMethodDropdown, setShowPaymentMethodDropdown] = useState(false);
  const pmDropdownRef = useRef<HTMLDivElement>(null);

  // ── Select / batch-delete state ───────────────────────────────────────────
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Extract unique people names from both the People table and historical transactions
  const uniquePeopleNames = useMemo(() => {
    const names = [
      ...people.map(p => p.name),
      ...transactions.map(t => (t as any).person_name).filter(Boolean)
    ];
    return Array.from(new Set(names));
  }, [people, transactions]);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  // ── Derived: filtered transactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Hide credit_payment counterparts — they live exclusively on the credit account
      // statement and should not appear in the global transaction list.
      if (tx.transaction_type === 'credit_payment') return false;
      const d = tx.date.slice(0, 10);
      if (filterStartDate && d < filterStartDate) return false;
      if (filterEndDate && d > filterEndDate) return false;
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
      const { data: { user } } = await supabase.auth.getUser();
      const myId = user?.id;

      const [accountsResult, peopleResult, friendshipsResult] = await Promise.all([
        getAllAccountsFrontend(),
        getAllPeople(),
        getFriendships()
      ]);

      if (accountsResult.error) {
        console.error('Error loading accounts:', accountsResult.error);
      } else if (accountsResult.data) {
        setAccounts(accountsResult.data.map(a => ({ id: a.id, bank: a.bank, classification: a.classification, type: a.type })));
      }

      if (peopleResult.error) {
        console.error('Error loading people:', peopleResult.error);
      } else if (peopleResult.data) {
        setPeople(peopleResult.data);
      }

        if (myId) {
          const linkedFriendIds = peopleResult.data ? peopleResult.data.filter(p => p.friend_user_id).map(p => p.friend_user_id) : [];
          let friendIds: string[] = [];
          if (friendshipsResult.data) {
            const validFriendships = friendshipsResult.data.filter(f => f.status === 'accepted');
            friendIds = validFriendships.map(f => f.user_id === myId ? f.friend_id : f.user_id);
          }
          
          const allProfileIdsToFetch = Array.from(new Set([...linkedFriendIds, ...friendIds]));
          
          if (allProfileIdsToFetch.length > 0) {
            const { data: fProfiles } = await supabase.from('user_profiles').select('*').in('user_id', allProfileIdsToFetch);
            if (fProfiles) setFriendProfiles(fProfiles);
          } else {
            setFriendProfiles([]);
          }
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

  // Instantly sync data if a notification payment is accepted globally
  useEffect(() => {
    const handleUpdate = () => loadData();
    window.addEventListener('transactions_updated', handleUpdate);
    return () => window.removeEventListener('transactions_updated', handleUpdate);
  }, [loadData]);

  const selectableContacts: ContactOption[] = useMemo(() => {
    const list: ContactOption[] = [];
    const addedNames = new Set<string>();

    people.forEach(p => {
      const isLinked = !!p.friend_user_id;
      let handleOrEmail = '';
      if (isLinked) {
        const prof = friendProfiles.find(fp => fp.user_id === p.friend_user_id);
        if (prof) handleOrEmail = prof.username ? `@${prof.username}` : prof.email;
      }
      list.push({ id: p.id, name: p.name, handleOrEmail, isLinked, isBudeeOnly: false });
      addedNames.add(p.name.toLowerCase());
    });
    
    friendProfiles.forEach(prof => {
      const isAlreadyLinked = people.some(p => p.friend_user_id === prof.user_id);
      if (!isAlreadyLinked) {
        const name = `${prof.first_name} ${prof.last_name}${prof.username ? ` (@${prof.username})` : ''}`;
        list.push({ id: prof.user_id, name: name, handleOrEmail: prof.username ? `@${prof.username}` : prof.email, isLinked: false, isBudeeOnly: true, budeeProfile: prof });
        addedNames.add(name.toLowerCase());
      }
    });

    uniquePeopleNames.forEach(name => {
      if (name && !addedNames.has(name.toLowerCase())) {
        list.push({
          id: `hist-${name}`,
          name: name,
          isLinked: false,
          isBudeeOnly: false
        });
        addedNames.add(name.toLowerCase());
      }
    });
    return list;
  }, [people, friendProfiles, uniquePeopleNames]);

  // Observer to show floating add button when scrolled past header
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingAdd(!entry.isIntersecting);
      },
      { root: null, threshold: 0 }
    );
    if (headerRef.current) {
      observer.observe(headerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Set default paymentMethodId when accounts are loaded and form hasn't been touched
    if (accounts.length > 0 && !form.paymentMethodId) {
      const defaultAcc = accounts.find(a => form.transactionType === 'payment' ? a.classification !== 'Credit Card' : a.type !== 'Credit') || accounts[0];
      setForm(f => ({ ...f, paymentMethodId: defaultAcc?.id ?? '' }));
    }
  }, [accounts, form.paymentMethodId, form.transactionType]);

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

  const openAddForm = (type: string, source: 'top' | 'fab' = 'top') => {
    setForm({
      name: '',
      date: todayIso(),
      amount: '',
      paymentMethodId: accounts.find(a => type === 'payment' ? a.classification !== 'Credit Card' : a.type !== 'Credit')?.id ?? (accounts[0]?.id ?? ''),
      transactionType: type,
      transferToAccountId: '',
      borrowerName: '',
      personName: ''
    });
    setReceiptFile(null);
    setShowTypeModal(false);
    
    if (source === 'top') {
      setShowFabMenu(false);
    }
    setFormSource(source);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTxId(null);
    setFormSource(null);
    setReceiptFile(null); // Clear receipt file
    setForm({ name: '', date: todayIso(), amount: '', paymentMethodId: accounts[0]?.id ?? '', transactionType: 'payment', transferToAccountId: '', borrowerName: '', personName: '' });
  };

  const openEditForm = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setFormSource(null);
    setForm({
      name: tx.name,
      date: new Date(tx.date).toISOString().split('T')[0],
      amount: Math.abs(tx.amount).toFixed(2), // Absolute value makes editing easier
      paymentMethodId: tx.paymentMethodId,
      transactionType: tx.transaction_type || 'payment',
      transferToAccountId: '',
      borrowerName: tx.borrower_name || '',
      personName: (tx as any).person_name || ''
    });
    setReceiptFile(null);
    setShowForm(true);
  };

  const executeTransactionSubmit = async () => {
    
    // Transfer creation logic (uses specialized service)
    if (form.transactionType === 'transfer' && transferTab === 'accounts' && !editingTxId) {
      if (!form.paymentMethodId || !form.transferToAccountId || !form.amount || !form.date) return;
      try {
        const { error } = await createTransfer(
          form.paymentMethodId,
          form.transferToAccountId,
          parseFloat(form.amount),
          combineDateWithCurrentTime(form.date),
          parseFloat(form.feeAmount || '0')
        );
        if (error) throw error;
        await loadData();
        if (onTransactionCreated) onTransactionCreated();
        closeForm();
        return;
      } catch (error) {
        console.error('Error creating transfer:', error);
        alert('Failed to process transfer. Please try again.');
        return;
      }
    }

    let txName = form.name;
    if (form.transactionType === 'transfer' && transferTab === 'friends' && !txName) {
      txName = `Transfer to ${form.personName}`;
    }

    // Standard transaction creation/update logic
    if (!txName || !form.date || !form.amount || !form.paymentMethodId) return;

    // Apply correct positive/negative sign based on transaction type
    let finalAmount = parseFloat(form.amount);
    if (form.transactionType === 'cash_in') {
      finalAmount = -Math.abs(finalAmount); // Money in (negative reduces debt / increases asset internally)
    } else if (['withdraw', 'payment', 'loan', 'transfer'].includes(form.transactionType)) {
      finalAmount = Math.abs(finalAmount); // Money out
    }
    
    try { // eslint-disable-next-line
      if (editingTxId) {
        // Edit mode: update existing transaction
        const updates = {
          name: txName,
          date: combineDateWithCurrentTime(form.date),
          amount: finalAmount,
          payment_method_id: form.paymentMethodId,
          transaction_type: form.transactionType,
          borrower_name: form.transactionType === 'loan' ? form.borrowerName || null : null,
          person_name: (form.transactionType === 'transfer' && transferTab === 'friends') ? form.personName || null : null
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
          name: txName,
          date: combineDateWithCurrentTime(form.date),
          amount: finalAmount,
          payment_method_id: form.paymentMethodId,
          transaction_type: form.transactionType,
          borrower_name: form.transactionType === 'loan' ? form.borrowerName || null : null,
          person_name: (form.transactionType === 'transfer' && transferTab === 'friends') ? form.personName || null : null
        };
        
        const { data, error } = await createTransaction(transaction as any);
        
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isTransferToFriend = form.transactionType === 'transfer' && transferTab === 'friends' && !editingTxId;
    const targetName = isTransferToFriend ? form.personName : (form.transactionType === 'loan' ? form.borrowerName : null);

    if (targetName) {
      const matchedBudee = selectableContacts.find(c => c.name === targetName && c.isBudeeOnly);
      if (matchedBudee && matchedBudee.budeeProfile) {
        setPendingProfileModal({ budee: matchedBudee.budeeProfile, formName: targetName });
        return;
      }
    }
    await executeTransactionSubmit();
  };

  const removeTx = async (id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Transaction',
      message: `Are you sure you want to delete transaction "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
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
      }
    });
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
    setFilterStartDate(getFirstDayOfCurrentYearIso());
    setFilterEndDate(getLastDayOfCurrentYearIso());
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
<div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200 pt-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Header & Controllers ───────────────────────────────────────── */}
        <div ref={headerRef}>
          <PageHeader 
            title="Transactions"
            subtitle="Keep tabs on your funds"
            icon={
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
                <FileText className="w-7 h-7" />
              </div>
            }
            actions={
              <button onClick={() => setShowTypeModal(true)} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold transition-all text-sm border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] ${getAccentClasses('bg')}`}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Transaction</span>
              </button>
            }
          />
        </div>

        {/* ── Filter Bar ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 mb-6">
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
                className={`bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-offset-2 ${getAccentClasses('focus-ring')} transition-all`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                min={filterStartDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className={`bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-offset-2 ${getAccentClasses('focus-ring')} transition-all`}
              />
            </div>
            <div className="flex flex-col gap-1 relative" ref={pmDropdownRef}>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</label>
              <button
                type="button"
                onClick={() => setShowPaymentMethodDropdown(p => !p)}
                className={`flex items-center gap-2 w-full justify-between bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-offset-2 ${getAccentClasses('focus-ring')} transition-all`}
              >
                <span>{pmFilterLabel}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {showPaymentMethodDropdown && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 min-w-[180px] py-2 transition-colors">
                  {accounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={filterPaymentMethods.has(a.id)}
                        onChange={() => togglePaymentMethodFilter(a.id)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.bank}</span>
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
              onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
              className={`self-end px-4 py-2.5 text-xs font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] ${getAccentClasses('bg')} text-white`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="self-end px-4 py-2.5 text-xs font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] bg-black text-white"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ── Total Spend Dashboard ────────────────────────────────────────── */}
        <div className="mb-6">
          <div className={`${getAccentClasses('bg')} border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-5 text-white`}>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-1">Total Spend</p>
            <p className="text-3xl font-black">{formatCurrency(totalSpend)}</p>
            <p className="text-xs text-indigo-300 mt-1">Based on current filter · {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-x-auto transition-colors">
          <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between transition-colors">
            <h2 className="text-sm font-bold uppercase text-gray-600 dark:text-gray-400 tracking-widest">All transactions</h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-500">{filteredTransactions.length} items</div>
              {/* Batch delete trash icon — shown only when ≥1 selected */}
              {isSelectMode && selectedIds.size > 0 && (
                <button
                  onClick={() => setShowBatchConfirm(true)}
                  title="Delete selected"
                  aria-label="Delete selected transactions"
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px]"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] ${isSelectMode ? 'bg-black text-white' : getAccentClasses('bg') + ' text-white'}`}>
                {isSelectMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>Select</span>
              </button>
            </div>
          </div>

          <div className="p-4">
            {isLoading || loading ? (
              <div className="text-center py-8 text-gray-500">Loading transactions...</div>
            ) : (
              <TransactionList
                transactions={filteredTransactions}
                accounts={accounts}
                isSelectMode={isSelectMode}
                selectedIds={selectedIds}
                onToggleId={toggleId}
                onSelectAll={toggleAllVisible}
                allVisibleSelected={allVisibleSelected}
                onViewDetails={setSelectedTx}
                onEdit={openEditForm}
                onDelete={removeTx}
              />
            )}
            {filteredTransactions.length === 0 && !isLoading && (
                 <div className="text-center py-16 px-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
                    <p className="font-bold mt-4 text-gray-800 dark:text-gray-200">No transactions found</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">There are no transactions for the selected date range and payment methods.</p>
                </div>
            )}
          </div>
        </div>

        {/* QA: Consistent Transaction Form - with receipt upload, exclude credit accounts */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 md:p-8 relative transition-all -rotate-1 max-h-[95vh] overflow-y-auto">
            {formSource === 'top' && !editingTxId && (
              <button 
                onClick={() => { setShowForm(false); setShowTypeModal(true); setFormSource(null); }} 
                className="absolute left-4 top-4 md:left-6 md:top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Back to type selection"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
            )}
            {(formSource === 'fab' || editingTxId) && (
              <button 
                onClick={closeForm} 
                className="absolute right-4 top-4 md:right-6 md:top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
            <h2 className={`text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 mb-1 ${formSource === 'top' && !editingTxId ? 'mt-8 md:mt-6' : ''}`}>
            {editingTxId ? 'Edit Transaction' : 
              form.transactionType === 'withdraw' ? 'Withdraw Funds' :
              form.transactionType === 'cash_in' ? 'Cash In' :
              form.transactionType === 'transfer' ? 'Transfer Funds' :
              form.transactionType === 'loan' ? 'Record Loan' :
              `Add New ${TRANSACTION_TYPES.find(t => t.id === form.transactionType)?.label || 'Transaction'}`
            }
            </h2>
          <p className="text-gray-500 text-xs md:text-sm mb-6">
            {editingTxId ? 'Update the transaction details below' : 
              form.transactionType === 'withdraw' ? 'Record an ATM withdrawal or cash out' :
              form.transactionType === 'cash_in' ? 'Record incoming funds' :
              form.transactionType === 'transfer' ? 'Move money between accounts' :
              form.transactionType === 'loan' ? 'Record money lent out' :
              'Record a payment transaction'
            }
          </p>
              <form onSubmit={onSubmit} className="space-y-4 md:space-y-5">
                {/* Conditional Name Field — Hide for Transfers since they auto-generate names */}
                {(form.transactionType !== 'transfer' || editingTxId) && (
                  <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  {['withdraw', 'cash_in', 'loan', 'transfer'].includes(form.transactionType) ? 'Label' : 'Name'}
                </label>
                    <input 
                      value={form.name} 
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                      required 
                  placeholder={
                    form.transactionType === 'withdraw' ? 'e.g. ATM Withdrawal' :
                    form.transactionType === 'cash_in' ? 'e.g. Salary, Deposit' :
                    form.transactionType === 'loan' ? 'e.g. Loan to John' :
                    'e.g. Groceries, Gas, etc.'
                  }
                  className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                    />
                  </div>
                )}

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
                      className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 pl-8 text-lg font-black outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all`}
                    />
                  </div>
                </div>

                {form.transactionType === 'transfer' && !editingTxId ? (
                  <>
                    {/* Tab Selector */}
                    <div className={`flex p-1 bg-gray-200 dark:bg-gray-800 rounded-xl mb-4 mt-2 border-2 border-black`}>
                      <button
                        type="button"
                        onClick={() => setTransferTab('accounts')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs md:text-sm font-bold transition-all ${transferTab === 'accounts' ? `bg-white dark:bg-gray-900 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('text')}` : 'text-gray-500'}`}>
                        <ArrowLeftRight className="w-4 h-4" />
                        <span>My Accounts</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransferTab('friends')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs md:text-sm font-bold transition-all ${transferTab === 'friends' ? `bg-white dark:bg-gray-900 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('text')}` : 'text-gray-500'}`}>
                        <User className="w-4 h-4" />
                        <span>Friends</span>
                      </button>
                    </div>

                    {/* TAB 1: MY ACCOUNTS */}
                    {transferTab === 'accounts' && (
                      <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
                          {/* Swap Accounts Button */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-0 sm:mt-3 flex items-center justify-center pointer-events-none z-10">
                            <button
                              type="button"
                              onClick={() => {
                                setForm(f => {
                                  const newFrom = f.transferToAccountId || accounts.find(a => a.type !== 'Credit' && a.id !== f.paymentMethodId)?.id || f.paymentMethodId;
                                  return {
                                    ...f,
                                    paymentMethodId: newFrom,
                                    transferToAccountId: f.paymentMethodId
                                  };
                                });
                              }}
                              className={`pointer-events-auto w-10 h-10 rounded-full bg-white dark:bg-gray-700 border-4 border-white dark:border-gray-900 flex items-center justify-center text-gray-500 transition-all shadow-sm ${getAccentClasses('hoverLight')}`}
                              title="Swap accounts"
                            >
                              <ArrowLeftRight className="w-4 h-4 rotate-90 sm:rotate-0" />
                            </button>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Transfer From</label>
                            {accounts.length === 0 ? (
                              <div className="text-xs text-red-600 p-4">No accounts available</div>
                            ) : (
                              <select 
                                value={form.paymentMethodId} 
                                onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} 
                                className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold text-sm appearance-none outline-none focus:ring-offset-2 ${getAccentClasses('ring')}`}>
                                {accounts.filter(a => a.type !== 'Credit').map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className={`block text-[10px] font-black ${getAccentClasses('text')} uppercase tracking-widest mb-2`}>Transfer To</label>
                            <select 
                              value={form.transferToAccountId} 
                              onChange={e => setForm(f => ({ ...f, transferToAccountId: e.target.value }))} 
                              className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 ${getAccentClasses('border')} rounded-xl p-3.5 font-bold text-sm appearance-none outline-none focus:ring-offset-2 ${getAccentClasses('ring')}`}>
                              <option value="">Select Destination</option>
                              {accounts.filter(a => a.id !== form.paymentMethodId && a.type !== 'Credit').map(a => (
                                <option key={a.id} value={a.id}>{a.bank}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Transfer Fee (Optional)</label>
                          <div className="relative mb-4">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={form.feeAmount}
                              onChange={e => setForm(f => ({ ...f, feeAmount: e.target.value }))}
                              placeholder="0.00"
                              className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 pl-8 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                            />
                          </div>
                          <p className="text-[10px] text-gray-500 mt-[-10px] mb-4 font-medium">Logged as separate expense.</p>

                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                          <input 
                            type="date" 
                            value={form.date} 
                            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                            required 
                            className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* TAB 2: FRIENDS */}
                    {transferTab === 'friends' && (
                      <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">From Account</label>
                          {accounts.length === 0 ? (
                            <div className="text-xs text-red-600 p-4">No accounts available</div>
                          ) : (
                            <select 
                              value={form.paymentMethodId} 
                              onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} 
                              className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold text-sm appearance-none outline-none focus:ring-offset-2 ${getAccentClasses('ring')}`}>
                              {accounts.filter(a => a.type !== 'Credit').map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                            </select>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">To Who?</label>
                          <ContactDropdown 
                            contacts={selectableContacts}
                            value={form.personName || ''} 
                            onChange={val => setForm(f => ({ ...f, personName: val }))}
                            placeholder="e.g. John Doe"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">For What? (Optional)</label>
                            <input 
                              value={form.name} 
                              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                              placeholder="e.g. Dinner" 
                              className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                            <input 
                              type="date" 
                              value={form.date} 
                              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                              required 
                              className={`w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                        {['withdraw', 'cash_in', 'loan', 'transfer'].includes(form.transactionType) ? 'Date' : 'Date Paid'}
                      </label>
                      <input 
                        type="date" 
                        value={form.date} 
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                        required 
                        className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold outline-none focus:ring-offset-2 ${getAccentClasses('ring')} transition-all text-sm`}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                        {['withdraw', 'cash_in', 'loan', 'transfer'].includes(form.transactionType) ? 'Account' : 'Payment Method'}
                      </label>
                      {accounts.length === 0 ? (
                        <div className="text-xs text-red-600 p-4">No accounts available</div>
                      ) : (
                        <select 
                          value={form.paymentMethodId} 
                          onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} 
                          className={`w-full min-w-0 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 font-bold text-sm appearance-none outline-none focus:ring-offset-2 ${getAccentClasses('ring')}`}>
                          {accounts.filter(a => form.transactionType === 'payment' ? a.classification !== 'Credit Card' : a.type !== 'Credit').map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* Borrower Field for Loan Transactions */}
                {form.transactionType === 'loan' && userProfile?.settings?.peopleEnabled && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Borrower (Optional)</label>
                    <ContactDropdown 
                      contacts={selectableContacts}
                      value={form.borrowerName || ''}
                      onChange={val => setForm(f => ({ ...f, borrowerName: val }))}
                      placeholder="Select or type borrower"
                    />
                    {people.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Add people in Settings to see them here.</p>
                    )}
                  </div>
                )}

            {form.transactionType === 'payment' && (
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                    />
                  <div className={`w-full bg-white dark:bg-gray-800 border-2 border-black border-dashed rounded-xl p-5 md:p-6 text-center text-sm transition-all ${getAccentClasses('hoverLight')}`}>
                      <span className="font-bold">{receiptFile ? receiptFile.name : 'Click or drag to upload receipt'}</span>
                    </div>
                  </div>
                </div>
            )}

                <div className="flex space-x-3 pt-2 md:pt-4">
                  <button type="button" onClick={closeForm} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3.5 rounded-xl font-bold text-gray-800 dark:text-gray-200 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
                  <button type="submit" disabled={accounts.length === 0 || (form.transactionType === 'transfer' && !editingTxId && transferTab === 'accounts' && !form.transferToAccountId) || (form.transactionType === 'transfer' && !editingTxId && transferTab === 'friends' && !form.personName)} className={`flex-1 bg-green-400 text-black py-3.5 rounded-xl font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:bg-gray-300`}>
                    {editingTxId ? 'Update' : form.transactionType === 'transfer' ? (transferTab === 'friends' ? 'Send to Friend' : 'Complete Transfer') : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Batch Delete Confirmation Modal ─────────────────────────────────── */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 transition-all -rotate-1">
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-200 mb-3">Confirm Deletion</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              You are deleting <span className="font-black text-red-600">{selectedIds.size}</span> transaction{selectedIds.size !== 1 ? 's' : ''}, and this will be irreversible. Do you want to proceed?
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                disabled={isBatchDeleting}
                className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-xl font-bold text-gray-800 dark:text-gray-200 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Cancel
              </button>
            <PinProtectedAction
              featureId="transaction_deletions"
              onVerified={handleBatchDelete}
              actionLabel="Delete Multiple Transactions"
            >
              <button
                type="button"
                onClick={(e) => e.preventDefault()}
                disabled={isBatchDeleting}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
              >
                {isBatchDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </PinProtectedAction>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && (() => {
        const pm = accounts.find(a => a.id === selectedTx.paymentMethodId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSelectedTx(null)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8 relative transition-all rotate-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setSelectedTx(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-black text-gray-900 dark:text-gray-200 mb-6">Transaction Details</h2>
              <dl className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Name</dt>
                  <dd className="text-sm font-bold text-gray-900 dark:text-gray-100">{selectedTx.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">Date</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100">
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
                  <dd className="text-sm text-gray-700 dark:text-gray-300">{pm ? pm.bank : selectedTx.paymentMethodId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black text-gray-400 uppercase tracking-widest self-center">
                    {selectedTx.transaction_type === 'loan' ? 'Borrower' : 'Recipient'}
                  </dt>
                  <dd className="text-sm text-gray-700 dark:text-gray-300">{selectedTx.borrower_name || (selectedTx as any).person_name || (selectedTx as any).personName || 'N/A'}</dd>
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
                        className="w-16 h-16 rounded-xl object-cover border-2 border-black"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <button
                        onClick={() => { setZoom(0.5); setPreviewReceiptUrl(receiptSignedUrl); }}
                        title="Preview receipt"
                        className={`flex items-center space-x-1 px-3 py-2 rounded-xl text-sm font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all ${getAccentClasses('lightBg')}`}>
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

      {/* Type Selection Modal for Top Button */}
      {showTypeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-10 relative transition-all animate-in zoom-in-95">
            <button onClick={() => setShowTypeModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight">Transaction Type</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 font-medium">Select the type of transaction you want to record</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {TRANSACTION_TYPES.map(type => (
                <button 
                  key={type.id} 
                  onClick={() => openAddForm(type.id, 'top')} 
                  className={`flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-800/50 rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all group ${getAccentClasses('hoverLight')}`}>
                  <div className={`mb-4 p-4 rounded-full shadow-sm transition-transform duration-300 border-2 border-black ${getAccentClasses('lightBg')}`}>
                    {type.icon}
                  </div>
                  <span className="font-bold text-sm">{type.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) with Fan Layout */}
      {showFloatingAdd && (
        <div className="fixed bottom-8 right-8 z-40 animate-in fade-in zoom-in duration-300">
          {/* Backdrop when fan is open */}
          {showFabMenu && <div className="fixed inset-0 z-30" onClick={() => setShowFabMenu(false)} />}
          
          <div className="relative z-40 flex items-center justify-center">
            {/* Fan Items Container */}
            <div className={`absolute inset-0 pointer-events-none`}>
              {TRANSACTION_TYPES.map((item, index) => (
                <div 
                  key={item.id}
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out ${showFabMenu ? 'opacity-100' : 'opacity-0 scale-50'}`}
                  style={{ 
                    transform: showFabMenu ? `translate(${item.x}px, ${item.y}px)` : 'translate(0px, 0px)',
                    transitionDelay: showFabMenu ? `${index * 40}ms` : '0ms'
                  }}
                >
                  <button 
                    onClick={() => openAddForm(item.id, 'fab')}
                    className={`w-12 h-12 bg-white dark:bg-gray-800 rounded-full border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center hover:scale-110 transition-all pointer-events-auto group ${getAccentClasses('hover:bg')} text-gray-700 dark:text-gray-300 hover:text-white`}>
                    {item.icon}
                    <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-sm pointer-events-none">
                      {item.label}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            
            {/* Main FAB */}
            <button
              onClick={() => setShowFabMenu(!showFabMenu)}
              className={`relative z-10 w-14 h-14 text-white rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center transition-all duration-300 ${getAccentClasses('bg')} ${showFabMenu ? 'rotate-[135deg] scale-110' : 'hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none'}`}
              aria-label="Add Transaction"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Intercept Modal for Unlinked Budies */}
      {pendingProfileModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-8 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative transition-all animate-in zoom-in-95 flex flex-col items-center text-center -rotate-1">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-6 transition-colors border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('lightBg')}`}>
              <UserPlus className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">Profile Required</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">
              You selected <strong>{pendingProfileModal.formName}</strong> who is a Budee but doesn't have a local profile yet. We will link them and create one so you can track this transaction.
            </p>
            <div className="flex flex-col w-full space-y-3">
              <button 
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    const prof = pendingProfileModal.budee;
                    const { data: newPerson } = await createPerson({ name: pendingProfileModal.formName } as any);
                    if (newPerson) {
                      const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
                      const peopleTable = isTestMode ? 'people_test' : 'people';
                      let { error: updateErr } = await supabase.from(peopleTable).update({ friend_user_id: prof.user_id }).eq('id', newPerson.id);
                      if (updateErr && updateErr.code === '42P01') {
                        updateErr = (await supabase.from('people').update({ friend_user_id: prof.user_id }).eq('id', newPerson.id)).error;
                      }
                      if (updateErr) {
                        console.error('Failed to link profile to budee during transaction intercept:', updateErr);
                        alert(`Profile created but failed to link: ${updateErr.message}`);
                      }
                    }
                    setPendingProfileModal(null);
                    await executeTransactionSubmit();
                  } catch (e) {
                    console.error('Failed to create profile', e);
                    alert('Failed to create local profile.');
                  } finally { setIsSubmitting(false); }
                }}
                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50 disabled:bg-gray-300 ${getAccentClasses('bg')}`}
              >
                {isSubmitting ? 'Processing...' : 'Create Profile & Continue'}
              </button>
              <button disabled={isSubmitting} onClick={() => setPendingProfileModal(null)} className="w-full bg-gray-200 dark:bg-gray-700 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] text-gray-800 dark:text-gray-200 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50">
                Cancel
              </button>
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
    <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-10 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in-95 flex flex-col items-center text-center transition-all rotate-1">
      <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-3xl flex items-center justify-center mb-6 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-red-500 text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Proceed</button>
        <button onClick={onClose} className="w-full bg-gray-200 dark:bg-gray-700 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] text-gray-800 dark:text-gray-200 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
      </div>
    </div>
  </div>
);

export default TransactionsPage;
