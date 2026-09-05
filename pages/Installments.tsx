import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { Installment, Account, ViewMode, Biller } from '../types';
import { Plus, LayoutGrid, List, Calendar, Wallet, Trash2, X, Upload, AlertTriangle, Edit2, Eye, MoreVertical, Info, ZoomIn, ZoomOut, Download, Archive, CheckCircle2, ChevronDown, Hand, CheckSquare, UserPlus  } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { getPaymentSchedulesBySource } from '../src/services/paymentSchedulesService';
import { hasInstallmentPayments, deleteAllInstallmentPaymentsAndResetSchedules } from '../src/services/installmentsService';
import { getTransactionsByPaymentSchedule, getReceiptSignedUrl, updateTransaction, updateTransactionAndSyncSchedule, deleteTransactionAndRevertSchedule } from '../src/services/transactionsService';
import { combineDateWithCurrentTime, getTodayIso } from '../src/utils/dateUtils';
import type { SupabaseMonthlyPaymentSchedule, SupabaseTransaction } from '../src/types/supabase';
import { supabase } from '../src/utils/supabaseClient';
import { useTheme } from '../src/contexts/ThemeContext';
import { PageHeader } from '../src/components/PageHeader';

type ContactOption = {
  id: string;
  name: string;
  handleOrEmail?: string;
  isLinked: boolean;
  isBudeeOnly: boolean;
};

const ContactDropdown = ({ value, onChange, contacts, placeholder }: { value: string, onChange: (val: string) => void, contacts: ContactOption[], placeholder: string }) => {
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

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-700 rounded-xl p-3.5 pr-10 font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm shadow-[2px_2px_0px_rgba(0,0,0,0.12)] text-gray-900 dark:text-gray-100"
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <div 
              key={c.id} 
              onClick={() => { setSearch(c.name); onChange(c.id); setIsOpen(false); }} 
              className="px-4 py-3 cursor-pointer flex items-center justify-between border-b-2 border-black last:border-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="text-sm font-bold truncate text-gray-900 dark:text-gray-100">{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};



interface InstallmentsProps {
  installments: Installment[];
  accounts: Account[];
  billers?: Biller[];
  people?: { id: string; name: string }[];
  onAdd: (i: Installment) => Promise<void>;
  onUpdate?: (i: Installment) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onPayInstallment?: (installmentId: string, payment: {
    amount: number;
    date: string;
    accountId: string;
    receipt?: string;
    receiptFile?: File;
    scheduleId?: string; // target schedule ID when paying a specific month
  }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

const Installments: React.FC<InstallmentsProps> = ({ 
  installments, 
  accounts, 
  billers = [], 
  people = [], 
  onAdd, 
  onUpdate, 
  onDelete, 
  onPayInstallment, 
  loading = false, 
  error = null 
}) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Memoized first non-credit account ID to avoid redundant filtering
  const defaultNonCreditAccountId = useMemo(() => {
    return accounts.filter(acc => acc.classification !== 'Credit Card' && acc.type !== 'Credit')[0]?.id || '';
  }, [accounts]);

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<Installment | null>(null);
  // Track the specific schedule ID being paid when the user clicks Pay on a schedule row
  const [payModalScheduleId, setPayModalScheduleId] = useState<string | undefined>(undefined);

  // Close/Archive state
  const [showCloseModal, setShowCloseModal] = useState<Installment | null>(null);
  const [closeTagging, setCloseTagging] = useState<'completed' | 'terminated' | 'transferred'>('completed');
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  const [showEditModal, setShowEditModal] = useState<Installment | null>(null);
  const [showViewModal, setShowViewModal] = useState<Installment | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  // Store total paid amounts from database for each installment
  const [dbPaidAmounts, setDbPaidAmounts] = useState<Map<string, number>>(new Map());
  const [dbArchiveStatus, setDbArchiveStatus] = useState<Record<string, string>>({});

  // Schedule payments modal (consolidated transactions for a schedule entry)
  type ScheduleTx = { id: string; name: string; amount: number; date: string; paymentMethodId: string; receiptUrl?: string | null };
  const [schedulePaymentsModal, setSchedulePaymentsModal] = useState<{ month: string; scheduleId: string; transactions: ScheduleTx[] } | null>(null);
  const [loadingScheduleTx, setLoadingScheduleTx] = useState(false);
  const [scheduleSignedUrls, setScheduleSignedUrls] = useState<Record<string, string | null>>({});
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);

  // Edit schedule transaction modal state
  const [editingScheduleTx, setEditingScheduleTx] = useState<ScheduleTx | null>(null);
  const [editScheduleTxForm, setEditScheduleTxForm] = useState({ name: '', amount: '', date: '' });
  const [isEditingScheduleTx, setIsEditingScheduleTx] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const closePayModal = () => {
    setShowPayModal(null);
    setPayModalScheduleId(undefined);
    closeOverdraftPrompt();
  };
  
  {/* TO: Add linkedAccountId to both states */}
  const [formData, setFormData] = useState({ 
    name: '', 
    principalAmount: '',
    totalAmount: '', 
    monthlyAmount: '', 
    termDuration: '', 
    accountId: accounts[0]?.id || '', 
    startDate: '', 
    billerId: '', 
    due_date: '',
    linkedAccountId: '',
    fundingFriendId: '',
    debtorFriendId: '',
    expectedAccountId: '',
    budeeBillingDate: '',
    budeeDaysToPay: '',

});

const selectableContacts: ContactOption[] = useMemo(() => {
  return (people || []).map(p => ({
    id: p.id,
    name: p.name,
    isLinked: false, // You can expand this later if needed
    isBudeeOnly: false
  }));
}, [people]);



const [editFormData, setEditFormData] = useState({ 
  name: '',
  principalAmount: '', 
  totalAmount: '', 
  monthlyAmount: '', 
  termDuration: '',  
  accountId: '', 
  startDate: '', 
  billerId: '', 
  due_date: '',
  is_migrated: false,
  linkedAccountId: '',
  fundingFriendId: '',
  debtorFriendId: '',
  expectedAccountId: '',
  budeeBillingDate: '',
  budeeDaysToPay: '',
});

// 🟢 NEW: Proxy Pay & IOU Toggle States
const [isProxyPay, setIsProxyPay] = useState(false);
const [isIOU, setIsIOU] = useState(false);

const [paymentTab, setPaymentTab] = useState<'my_account' | 'budee'>('my_account');


  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: getTodayIso(),
    accountId: defaultNonCreditAccountId
  });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);

  // Overdraft prompt state for installment payments
  const [overdraftPrompt, setOverdraftPrompt] = useState<{
    mode: 'block' | 'warn';
    accountId: string;
    accountName: string;
    currentBalance: number;
    transactionAmount: number;
    projectedBalance: number;
  } | null>(null);
  const [pendingPaymentAction, setPendingPaymentAction] = useState<(() => Promise<void>) | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  // Helper: Calculate current balance for an account
  const calculateCurrentBalance = (account: Account): number => {
    // This is a simplified calculation - in reality, transactions would be filtered from database
    // For now, we assume balance is what was last set
    return account.balance;
  };

  // Guard function: Check for overdraft before paying installment
  const guardPayInstallmentOverdraft = (accountId: string, paymentAmount: number, action: () => Promise<void>) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.type !== 'Debit' || paymentAmount <= 0) {
      action();
      return;
    }

    const overdraftMode = account.overdraftMode || 'allow';
    const currentBalance = calculateCurrentBalance(account);
    const projectedBalance = currentBalance - paymentAmount;

    if (projectedBalance >= 0 || overdraftMode === 'allow') {
      action();
      return;
    }

    setOverdraftPrompt({
      mode: overdraftMode === 'block' ? 'block' : 'warn',
      accountId,
      accountName: account.bank,
      currentBalance,
      transactionAmount: paymentAmount,
      projectedBalance,
    });
    setPendingPaymentAction(() => action);
  };

  const closeOverdraftPrompt = () => {
    setOverdraftPrompt(null);
    setPendingPaymentAction(null);
  };

  const confirmPayDespiteOverdraft = async () => {
    if (pendingPaymentAction) {
      await pendingPaymentAction();
    }
    closeOverdraftPrompt();
  };

  const openSchedulePaymentsModal = async (scheduleId: string, month: string) => {
    setLoadingScheduleTx(true);
    setSchedulePaymentsModal({ month, scheduleId, transactions: [] });
    try {
      const { data } = await getTransactionsByPaymentSchedule(scheduleId);
      const txs: ScheduleTx[] = (data || []).map((t: SupabaseTransaction) => ({
        id: t.id, name: t.name, amount: t.amount, date: t.date, paymentMethodId: t.payment_method_id, receiptUrl: t.receipt_url ?? null
      }));
      setSchedulePaymentsModal({ month, scheduleId, transactions: txs });
      // Load signed URLs for receipts
      const urls: Record<string, string | null> = {};
      await Promise.all(txs.filter(tx => tx.receiptUrl).map(async tx => {
        urls[tx.id] = await getReceiptSignedUrl(tx.receiptUrl as string).catch(() => null);
      }));
      setScheduleSignedUrls(urls);
    } finally {
      setLoadingScheduleTx(false);
    }
  };

  const handleEditScheduleTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScheduleTx || !schedulePaymentsModal) return;

    setIsEditingScheduleTx(true);
    try {
      const sign = editingScheduleTx.amount < 0 ? -1 : 1;
      const { error } = await updateTransactionAndSyncSchedule(editingScheduleTx.id, {
        name: editScheduleTxForm.name,
        date: combineDateWithCurrentTime(editScheduleTxForm.date),
        amount: sign * Math.abs(parseFloat(editScheduleTxForm.amount))
      });

      if (error) throw error;

      setEditingScheduleTx(null);
      // Reload transactions in the modal for this schedule
      await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.month);
      // Reload payment schedules so status (partial/paid/pending) is recalculated
      await loadPaymentSchedulesForModal();
    } catch (err) {
      console.error('[Installments] Error updating schedule transaction:', err);
      alert('Failed to update transaction. Please try again.');
    } finally {
      setIsEditingScheduleTx(false);
    }
  };

  const handleDeleteInstallmentScheduleTx = async (txId: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Payment Record',
      message: 'Are you sure you want to delete this payment record? This cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const { error } = await deleteTransactionAndRevertSchedule(txId);
          if (error) throw error;
          // Reload the modal and the schedule list to reflect the deletion
          if (schedulePaymentsModal) {
            await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.month);
          }
          await loadPaymentSchedulesForModal();
        } catch (err) {
          console.error('[Installments] Error deleting schedule transaction:', err);
          alert('Failed to delete transaction. Please try again.');
        }
      }
    });
  };

  // 🟢 NEW: Auto-calculate Total Payable for New Installments
  useEffect(() => {
    const monthly = parseFloat(formData.monthlyAmount) || 0;
    // Extract numbers just in case it has "months" string attached
    const durationStr = String(formData.termDuration).replace(/\D/g, ''); 
    const duration = parseInt(durationStr) || 0;
    
    if (monthly > 0 && duration > 0) {
      setFormData(prev => ({ ...prev, totalAmount: (monthly * duration).toFixed(2) }));
    }
  }, [formData.monthlyAmount, formData.termDuration]);

  // 🟢 NEW: Auto-calculate Total Payable for Edit Form
  useEffect(() => {
    const monthly = parseFloat(editFormData.monthlyAmount) || 0;
    const durationStr = String(editFormData.termDuration).replace(/\D/g, '');
    const duration = parseInt(durationStr) || 0;
    
    if (monthly > 0 && duration > 0) {
      setEditFormData(prev => ({ ...prev, totalAmount: (monthly * duration).toFixed(2) }));
    }
  }, [editFormData.monthlyAmount, editFormData.termDuration]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // QA: Format termDuration with " months" suffix for consistency
      const termDurationFormatted = formData.termDuration ? `${formData.termDuration} months` : '12 months';
      
      console.log('DEBUG: Submitting formData:', formData); 
      {/* Update the onAdd payload: */}
      await onAdd({
        id: '', 
        name: formData.name,
        totalAmount: parseFloat(formData.totalAmount),
        principalAmount: parseFloat(formData.principalAmount), 
        monthlyAmount: parseFloat(formData.monthlyAmount),
        termDuration: termDurationFormatted,
        paidAmount: 0,
        // 🟢 If Proxy Pay is used, clear accountId/linkedAccountId so it doesn't revert
        accountId: isProxyPay ? '' : formData.accountId,
        startDate: formData.startDate || undefined,
        billerId: formData.billerId || undefined,
        due_date: formData.due_date || null, 
        is_migrated: true,
        linkedAccountId: isProxyPay ? undefined : (formData.linkedAccountId || undefined),
          // 🟢 Pass settlement fields explicitly
          funding_friend_id: isProxyPay ? formData.fundingFriendId : null,
          debtor_friend_id: isIOU ? formData.debtorFriendId : null,
          expected_account_id: isIOU ? formData.expectedAccountId : null,
                  // 🟢 NEW: Virtual Grace Period & Billing Cycle
        budee_billing_date: isProxyPay && formData.budeeBillingDate ? parseInt(formData.budeeBillingDate) : null,
        budee_days_to_pay: isProxyPay && formData.budeeDaysToPay ? parseInt(formData.budeeDaysToPay) : null,

        });



      setShowModal(false);
      setFormData({ 
        name: '', 
        principalAmount: '', 
        totalAmount: '', 
        monthlyAmount: '', 
        termDuration: '', 
        paidAmount: '', 
        accountId: accounts[0]?.id || '', 
        startDate: '', 
        billerId: '', 
        due_date: '', 
        linkedAccountId: '' ,
        linkedAccountId: '',
        fundingFriendId: '',
        debtorFriendId: '',
        expectedAccountId: ''
      });
      setIsProxyPay(false);
      setIsIOU(false);

    } catch (error) {
      console.error('Failed to add installment:', error);
      // PROTOTYPE: Show helpful message if timing column is missing
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Database migration required')) {
        alert('⚠️ Database Setup Required\n\nThe timing feature requires a database update. Please run the migration in Supabase.\n\nSee HOW_TO_ADD_TIMING_COLUMN.md for step-by-step instructions.');
      } else if (errorMessage.includes('Account ID is required')) {
        alert('⚠️ Account Required\n\nPlease create an account first before adding installments.');
      } else {
        alert(`Failed to add installment: ${errorMessage}\n\nPlease check your input and try again.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    console.log("DEBUG: showEditModal current item:", showEditModal);
    console.log("DEBUG: editFormData state:", editFormData);
    e.preventDefault();
    if (!showEditModal || isSubmitting) return;

    // QA: Format termDuration with " months" suffix for consistency
    const termDurationFormatted = editFormData.termDuration ? `${editFormData.termDuration} months` : '12 months';
    const newMonthlyAmount = parseFloat(editFormData.monthlyAmount);

    {/* Update the updatedInstallment object: */}
    const updatedInstallment: Installment = {
      ...showEditModal,
      name: editFormData.name,
      totalAmount: parseFloat(editFormData.totalAmount),
      principalAmount: parseFloat(editFormData.principalAmount), 
      monthlyAmount: newMonthlyAmount,
      termDuration: termDurationFormatted,
      paidAmount: showEditModal.paidAmount,
      // 🟢 Clear accounts if Budee (Proxy Pay) tab is active
      accountId: paymentTab === 'budee' ? '' : editFormData.accountId,
      startDate: editFormData.startDate || undefined,
      billerId: editFormData.billerId || undefined,
      due_date: editFormData.due_date,
      isMigrated: true,
      linkedAccountId: paymentTab === 'budee' ? undefined : (editFormData.linkedAccountId || undefined),
      // 🟢 Pass edit settlement fields explicitly based on active tab
      funding_friend_id: paymentTab === 'budee' ? editFormData.fundingFriendId : null,
      debtor_friend_id: (paymentTab === 'my_account' && isIOU) ? editFormData.debtorFriendId : null,
      expected_account_id: (paymentTab === 'my_account' && isIOU) ? editFormData.expectedAccountId : null,
      // 🟢 NEW: Virtual Grace Period & Billing Cycle
      budee_billing_date: paymentTab === 'budee' && editFormData.budeeBillingDate ? parseInt(editFormData.budeeBillingDate) : null,
      budee_days_to_pay: paymentTab === 'budee' && editFormData.budeeDaysToPay ? parseInt(editFormData.budeeDaysToPay) : null,
      
    };




    const executeUpdate = async () => {
      setIsSubmitting(true);
      try {
        await onUpdate?.(updatedInstallment);
        setShowEditModal(null);
      } catch (error) {
        console.error('Failed to update installment:', error);
        // PROTOTYPE: Show helpful message if timing column is missing
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Database migration required')) {
          alert('⚠️ Database Setup Required\n\nThe timing feature requires a database update. Please run the migration in Supabase.\n\nSee HOW_TO_ADD_TIMING_COLUMN.md for step-by-step instructions.');
        } else {
          alert('Failed to update installment. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    // When monthly amount changes, check whether any payments already exist.
    // Check the installment's paidAmount first (covers both the new schedule-based
    // payment path and the legacy direct-paidAmount-update path), then fall back to
    // a live DB query on the payment schedules for extra coverage.
    if (newMonthlyAmount !== showEditModal.monthlyAmount) {
      let hasPayments = showEditModal.paidAmount > 0;
      if (!hasPayments) {
        try {
          const result = await hasInstallmentPayments(showEditModal.id);
          if (result.error) {
            console.error('Error checking installment payments:', result.error);
          } else {
            hasPayments = result.hasPayments;
          }
        } catch (err) {
          console.error('Unexpected error checking installment payments:', err);
        }
      }
      if (hasPayments) {
        setConfirmModal({
          show: true,
          title: 'Update Monthly Amount',
          message: 'To change the monthly amount, all payments for this installment must be deleted. Remove all payments and update, or cancel?',
          onConfirm: async () => {
            setConfirmModal(p => ({ ...p, show: false }));
            const { error: deleteError } = await deleteAllInstallmentPaymentsAndResetSchedules(showEditModal.id);
            if (deleteError) {
              alert('Failed to delete existing payments. Please try again.');
              return;
            }
            await executeUpdate();
          }
        });
        return;
      }
    }

    await executeUpdate();
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal || isSubmitting) return;

    const paymentAmount = parseFloat(payFormData.amount) || 0;

    console.log('[Installments] Processing payment:', {
      installmentId: showPayModal.id,
      installmentName: showPayModal.name,
      previousPaidAmount: showPayModal.paidAmount,
      paymentAmount: paymentAmount,
      newPaidAmount: showPayModal.paidAmount + paymentAmount
    });

    // Guard against overdraft
    const performPayment = async () => {
      setIsSubmitting(true);
      try {
        // Use the new payment handler if provided, otherwise fall back to direct update
        if (onPayInstallment) {
          await onPayInstallment(showPayModal.id, {
            amount: paymentAmount,
            date: payFormData.datePaid,
            accountId: payFormData.accountId,
            receipt: payFormData.receipt || undefined,
            receiptFile: payReceiptFile || undefined,
            scheduleId: payModalScheduleId,
          });
        } else {
          // Fallback to old method
          const updatedInstallment: Installment = {
            ...showPayModal,
            paidAmount: showPayModal.paidAmount + paymentAmount
          };
          await onUpdate?.(updatedInstallment);
        }
        
        console.log('[Installments] Payment recorded successfully');
        
        // Close pay modal after successful payment
        closePayModal();
        setPayFormData({
          amount: '',
          receipt: '',
          datePaid: getTodayIso(),
          accountId: accounts[0]?.id || ''
        });
        setPayReceiptFile(null);
        
        // If view modal is open, we'll need to refresh - let parent handle this
        if (showViewModal && showViewModal.id === showPayModal.id) {
          setShowViewModal(null);
        }
      } catch (error) {
        console.error('[Installments] Failed to process payment:', error);
        alert('Failed to process payment. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    };

    guardPayInstallmentOverdraft(payFormData.accountId, paymentAmount, performPayment);
  };

  const handleDeleteTrigger = (id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Remove Installment',
      message: `Are you sure you want to permanently stop tracking the installment for "${name}"?`,
      onConfirm: async () => {
        await onDelete?.(id);
        setConfirmModal(p => ({ ...p, show: false }));
      }
    });
  };

  const openEditModal = (item: any) => {
    setShowEditModal(item);
    
    // 🟢 Extract funding friend from either snake_case or camelCase property
    const activeFundingFriend = item.funding_friend_id || item.fundingFriendId || '';
    const activeDebtorFriend = item.debtor_friend_id || item.debtorFriendId || '';

    // 🟢 Set the tab state based on the extracted friend ID
    setPaymentTab(activeFundingFriend ? 'budee' : 'my_account');
    setIsIOU(!!activeDebtorFriend);

    const termDurationNumeric = item.termDuration ? item.termDuration.replace(/\D/g, '') : '';

    setEditFormData({
      name: item.name,
      principalAmount: item.principalAmount ? item.principalAmount.toFixed(2) : '',
      totalAmount: item.totalAmount.toFixed(2),
      monthlyAmount: item.monthlyAmount.toFixed(2),
      termDuration: termDurationNumeric,
      accountId: item.accountId || '',
      startDate: item.startDate || '',
      billerId: item.billerId || '',
      due_date: item.due_date || '',
      is_migrated: !!item.isMigrated,
      linkedAccountId: item.accountId || '',
      // 🟢 Map using the safe fallback variables
      fundingFriendId: activeFundingFriend,
      debtorFriendId: activeDebtorFriend,
      expectedAccountId: item.expected_account_id || item.expectedAccountId || '',
      budeeBillingDate: item.budee_billing_date ? String(item.budee_billing_date) : '',
      budeeDaysToPay: item.budee_days_to_pay ? String(item.budee_days_to_pay) : '',
    });


    setOpenMenuId(null);
  };



  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showCloseModal || isSubmitting) return;

    setIsSubmitting(true);
    console.log('[Installments] Starting archive process for:', showCloseModal.name);
    try {
      const currentPaid = dbPaidAmounts.get(showCloseModal.id) ?? showCloseModal.paidAmount;
      const isPaid = currentPaid >= showCloseModal.totalAmount;
      
      const finalStatus = isPaid ? 'completed' : closeTagging;

      // 1. Force immediate UI update to make it disappear from active list
      setDbArchiveStatus(prev => {
        return { ...prev, [showCloseModal.id]: finalStatus };
      });

      // 2. Proceed with standard update first so it doesn't overwrite our explicit DB patch
      await onUpdate?.({
        ...showCloseModal,
        isArchived: true,
        archiveStatus: finalStatus
      });

      // 3. Direct DB update AFTER standard update to guarantee it sticks
      try {
        const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
        const tableName = isTestMode ? 'installments_test' : 'installments';
        const { error: dbError } = await supabase
          .from(tableName)
          .update({ 
            is_archived: true, 
            archive_status: finalStatus 
          })
          .eq('id', showCloseModal.id);

        if (dbError) {
          console.error('[Installments] DB update error:', dbError);
        }
      } catch (err) {
        console.warn('[Installments] Failed to execute direct archive update:', err);
      }

      console.log('[Installments] Archive successful');
      setIsCompletedOpen(true); // Automatically expand the section to show the archived card
      setShowCloseModal(null);
    } catch (error) {
      console.error('Failed to archive installment:', error);
      alert('Failed to archive installment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load total paid amounts from payment schedules for all installments
  useEffect(() => {
    const loadAllPaidAmounts = async () => {
      console.log('[Installments] Loading paid amounts from database for all installments');
      const paidAmountsMap = new Map<string, number>();
      
      // Fetch payment schedules for each installment and sum the amount_paid
      const promises = installments.map(async (installment) => {
        try {
          const { data, error } = await getPaymentSchedulesBySource('installment', installment.id);
          
          if (!error && data) {
            // Sum up all amount_paid values from payment schedules
            const totalPaid = data.reduce((sum, schedule) => sum + (schedule.amount_paid || 0), 0);
            paidAmountsMap.set(installment.id, totalPaid);
            console.log(`[Installments] Calculated paid amount for ${installment.name}: ${totalPaid}`);
          } else {
            // If no schedules or error, use 0
            paidAmountsMap.set(installment.id, 0);
          }
        } catch (err) {
          console.error(`[Installments] Error loading schedules for ${installment.id}:`, err);
          paidAmountsMap.set(installment.id, 0);
        }
      });
      
      await Promise.all(promises);
      setDbPaidAmounts(paidAmountsMap);
      console.log('[Installments] Finished loading all paid amounts from database');
    };
    
    if (installments.length > 0) {
      loadAllPaidAmounts();
    }
  }, [installments]);

  // Load accurate archive status directly from DB to bypass potential adapter omissions
  useEffect(() => {
    const loadArchiveStatus = async () => {
      if (installments.length === 0) return;
      try {
        const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
        const tableName = isTestMode ? 'installments_test' : 'installments';
        const { data, error } = await supabase
          .from(tableName)
          .select('id, is_archived, archive_status')
          .in('id', installments.map(i => i.id));
          
        if (!error && data) {
          const statuses: Record<string, string> = {};
          data.forEach(row => {
            if (row.is_archived) {
              statuses[row.id] = row.archive_status || 'completed';
            }
          });
          setDbArchiveStatus(statuses);
        } else if (error) {
          console.warn('[Installments] Failed to load DB archive status.', error);
        }
      } catch (e) {
        console.warn('[Installments] Failed to load DB archive status', e);
      }
    };
    loadArchiveStatus();
  }, [installments]);

  // Load payment schedules when view modal is opened (extracted so it can be called after edits)
  const loadPaymentSchedulesForModal = useCallback(async () => {
    if (showViewModal) {
      setLoadingSchedules(true);
      console.log('[Installments] Loading payment schedules for installment:', showViewModal.id);
      
      try {
        const { data, error } = await getPaymentSchedulesBySource('installment', showViewModal.id);
        
        if (error) {
          console.error('[Installments] Error loading payment schedules:', error);
          setPaymentSchedules([]);
        } else if (data) {
          console.log('[Installments] Loaded payment schedules:', data.length, 'schedules');
          setPaymentSchedules(data);
        } else {
          setPaymentSchedules([]);
        }
      } catch (err) {
        console.error('[Installments] Exception loading payment schedules:', err);
        setPaymentSchedules([]);
      } finally {
        setLoadingSchedules(false);
      }
    } else {
      // Clear schedules when modal is closed
      setPaymentSchedules([]);
    }
  }, [showViewModal]);

  useEffect(() => {
    loadPaymentSchedulesForModal();
  }, [loadPaymentSchedulesForModal]);

  const isItemArchived = useCallback((item: Installment) => {
    return !!item.isArchived || dbArchiveStatus.hasOwnProperty(item.id);
  }, [dbArchiveStatus]);

  const getItemArchiveStatus = useCallback((item: Installment) => {
    return dbArchiveStatus[item.id] || item.archiveStatus || 'Completed';
  }, [dbArchiveStatus]);

  const renderCard = (item: Installment) => {
    // Use database paid amount if available, otherwise fall back to item.paidAmount
    const paidAmount = dbPaidAmounts.get(item.id) ?? item.paidAmount;
    const progress = (paidAmount / item.totalAmount) * 100;
    const remaining = item.totalAmount - paidAmount;
    const account = accounts.find(a => a.id === item.accountId);
    const isFullyPaid = paidAmount >= item.totalAmount;

    const archived = isItemArchived(item);
    const archStatus = getItemArchiveStatus(item);

    return (
      <div key={item.id} className={`bg-white dark:bg-gray-900 p-6 rounded-3xl border-[3px] border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all group relative overflow-hidden`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-black text-lg text-gray-900 dark:text-gray-100 transition-colors uppercase tracking-tight ${getAccentClasses('text').replace('text-', 'group-hover:text-')}`}>{item.name}</h3>
              {archived && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                  archStatus === 'terminated' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                  archStatus === 'transferred' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                }`}>
                  {archStatus}
                </span>
              )}
              
            </div>
             
          </div>
          <div className="relative">
            <button 
              onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-all"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {openMenuId === item.id && (
              <>
                <div className="fixed inset-0 z-[10]" onClick={() => setOpenMenuId(null)}></div>
                <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-[20] transition-colors">
                  <button 
                    onClick={() => { setShowViewModal(item); setOpenMenuId(null); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-2"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View {archived ? 'History' : 'Schedule'}</span>
                  </button>
                  {!archived && (
                    <>
                      <button 
                        onClick={() => {
                          console.log("DEBUG: Item being passed to modal:", item);
                          openEditModal(item);
                        }}
                        
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button 
                        onClick={() => { setShowCloseModal(item); setOpenMenuId(null); setCloseTagging(isFullyPaid ? 'completed' : 'terminated'); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-400 transition-colors flex items-center space-x-2"
                      >
                        <Archive className="w-4 h-4" />
                        <span>Close</span>
                      </button>
                    </>
                  )}
                  <div className="border-t border-gray-100 dark:border-gray-800 my-1 transition-colors"></div>
                  <button 
                    onClick={() => handleDeleteTrigger(item.id, item.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-y-4 gap-x-4 mb-6">
  {/* Row 1: Duration and Due Date */}
  <div>
    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-widest transition-colors">Term Duration</p>
    <p className="font-black text-gray-900 dark:text-gray-100 transition-colors">{item.termDuration}</p>
  </div>
  <div className="text-right">
    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-widest transition-colors">Due Date</p>
    <p className="font-black text-gray-900 dark:text-gray-100 transition-colors">{item.due_date || 'N/A'}</p>
  </div>

  {/* Row 2: Monthly and Start Date */}
  <div>
    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-widest transition-colors">Monthly</p>
    <p className="font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(item.monthlyAmount)}</p>
  </div>
  <div className="text-right">
    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-widest transition-colors">Start Date</p>
    <p className="font-black text-gray-900 dark:text-gray-100 transition-colors">{item.startDate || 'N/A'}</p>
  </div>
</div>


        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
            <span className="text-indigo-600 dark:text-indigo-400 transition-colors">Paid: {formatCurrency(paidAmount)}</span>
            <span className="text-gray-400 dark:text-gray-500 transition-colors">Bal: {formatCurrency(remaining)}</span>
          </div>
          <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden transition-colors">
            <div 
              className="h-full bg-indigo-500 transition-all duration-1000" 
              style={{ width: `${Math.min(progress, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="flex flex-col space-y-4 pt-2">
          <div className="flex items-center gap-2 w-full">
            <button 
              onClick={() => { setShowViewModal(item); }}
              className={`flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-center border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]`}
            >
              View
            </button>
            {!archived && (
              isFullyPaid ? (
                <button 
                  onClick={() => { setShowCloseModal(item); setCloseTagging('completed'); }}
                  className={`flex-1 bg-amber-500 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-all border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-none text-center`}
                >
                  Close
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setShowPayModal(item);
                    setPayModalScheduleId(undefined);
                    const currentPeriodPaid = item.monthlyAmount > 0 ? paidAmount % item.monthlyAmount : 0;
                    setPayFormData({ 
                      amount: Math.max(0, item.monthlyAmount - currentPeriodPaid).toFixed(2),
                      receipt: '',
                      datePaid: getTodayIso(),
                      accountId: defaultNonCreditAccountId
                    });
                  }}
                  className={`flex-1 bg-indigo-600 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-none text-center`}
                >
                  Pay
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderListItem = (item: Installment) => {
    // Use database paid amount if available, otherwise fall back to item.paidAmount
    const paidAmount = dbPaidAmounts.get(item.id) ?? item.paidAmount;
    const progress = (paidAmount / item.totalAmount) * 100;
    const account = accounts.find(a => a.id === item.accountId);
    const isFullyPaid = paidAmount >= item.totalAmount;

    const archived = isItemArchived(item);
    const archStatus = getItemArchiveStatus(item);

    return (
      <div key={item.id} className="bg-white dark:bg-gray-900 p-4 pr-6 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
  <div className="flex-1 min-w-0">
  {/* Row 1: Full-width name */}
  <div className="flex items-center space-x-2 mb-2">
    <h3 className="font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight transition-colors truncate w-full">
      {item.name}
    </h3>
  </div>

  {/* Row 2: Metadata (Dates and Badge) */}
  <div className="flex items-center space-x-4">
    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-black transition-colors uppercase">
      Start: {item.startDate || 'N/A'}
    </p>
    <p className="text-[10px] text-gray-500 dark:text-gray-400 font-black transition-colors uppercase">
      Due: {item.due_date || 'N/A'}
    </p>
    <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest transition-colors">
      {item.termDuration}
    </span>
  </div>
</div>
        
        <div className="flex flex-1 items-center space-x-6">
           <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden transition-colors">
             <div className="h-full bg-indigo-500" style={{ width: `${Math.min(progress, 100)}%` }}></div>
           </div>
           <span className="text-xs font-black text-gray-900 dark:text-gray-100 whitespace-nowrap transition-colors">{Math.round(progress)}%</span>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex flex-col text-right min-w-[120px]">
            <span className="text-sm font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(item.monthlyAmount)}</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest transition-colors">Monthly</span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => { setShowViewModal(item); }}
              className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              View
            </button>
            {!archived && (
                isFullyPaid ? (
                <button 
                  onClick={() => { setShowCloseModal(item); setCloseTagging('completed'); }}
                  className="bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-all border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                >
                  Close
                </button>
              ) : (
                <button 
                  onClick={() => {
                    setShowPayModal(item);
                    setPayModalScheduleId(undefined);
                    const currentPeriodPaid = item.monthlyAmount > 0 ? paidAmount % item.monthlyAmount : 0;
                    setPayFormData({ 
                      amount: Math.max(0, item.monthlyAmount - currentPeriodPaid).toFixed(2),
                      receipt: '',
                      datePaid: getTodayIso(),
                      accountId: defaultNonCreditAccountId
                    });
                  }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                >
                  Pay
                </button>
              )
            )}
            <div className="relative">
              <button 
                onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-all"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {openMenuId === item.id && (
                <>
                  <div className="fixed inset-0 z-[10]" onClick={() => setOpenMenuId(null)}></div>
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-[20] transition-colors">
                    {!archived && (
                      <>
                        <button 
                          onClick={() => openEditModal(item)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center space-x-2"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Edit</span>
                        </button>
                        <button 
                          onClick={() => { setShowCloseModal(item); setOpenMenuId(null); setCloseTagging(isFullyPaid ? 'completed' : 'terminated'); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-400 transition-colors flex items-center space-x-2"
                        >
                          <Archive className="w-4 h-4" />
                          <span>Close</span>
                        </button>
                      </>
                    )}
                    <div className="border-t border-gray-100 dark:border-gray-800 my-1 transition-colors"></div>
                    <button 
                      onClick={() => handleDeleteTrigger(item.id, item.name)}
                      className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const activeInstallmentsList = installments.filter(i => !isItemArchived(i));
  const archivedInstallmentsList = installments.filter(i => isItemArchived(i));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading installments from database...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error Loading Installments</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && (
      <>
      <PageHeader 
        title="Installments"
        subtitle="Big tickets—right on track"
        icon={
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
            <Calendar className="w-7 h-7" />
          </div>
        }
        actions={!isMobile ? (
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl p-1 space-x-1 transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <button 
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setShowModal(true)}
                className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold transition-all text-sm ${getAccentClasses('bg')} filter drop-shadow-[0_10px_30px_rgba(0,0,0,0.12)] border-[3px] border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:scale-105`}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Installment</span>
            </button>
          </div>
        ) : undefined}
      />

      {isMobile && (
        <div className="flex justify-end mb-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl p-1 space-x-1 transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <button 
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setShowModal(true)}
                className={`flex items-center gap-2 text-white px-4 py-3 rounded-xl font-bold transition-all text-sm ${getAccentClasses('bg')} filter drop-shadow-[0_10px_30px_rgba(0,0,0,0.12)] border-[3px] border-black shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:scale-105`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
        {activeInstallmentsList.length > 0 ? (
          activeInstallmentsList.map(item => viewMode === 'card' ? renderCard(item) : renderListItem(item))
        ) : (
          <div className="col-span-full p-24 text-center">
            <p className="text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest text-sm transition-colors">No installments being tracked</p>
          </div>
        )}
      </div>

      {/* Completed Installments Section */}
      {archivedInstallmentsList.length > 0 && (
        <div className="mt-12 pt-12 border-t border-gray-100 dark:border-gray-800 transition-colors">
          <button 
            onClick={() => setIsCompletedOpen(!isCompletedOpen)}
            className="flex items-center space-x-3 mb-6 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors group"
          >
            <Archive className="w-5 h-5" />
            <h3 className="text-sm font-black uppercase tracking-[0.2em]">Completed Installments ({archivedInstallmentsList.length})</h3>
            <ChevronDown className={`w-4 h-4 transition-transform ${isCompletedOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isCompletedOpen && (
            <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80" : "space-y-4 opacity-80"}>
              {archivedInstallmentsList.map(item => viewMode === 'card' ? renderCard(item) : renderListItem(item))}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Track Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto transition-colors border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.08)]">
            <h2 className={`text-2xl font-titan normal-case tracking-tighter leading-none ${getAccentClasses('text')} mb-6`}>Track New Installment</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Installment Name</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" placeholder="e.g. MacBook Pro" />
              </div>
                            {/* Principal & Monthly Grid */}
                            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Principal (Item Cost)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                    <input required type="number" value={formData.principalAmount} onChange={(e) => setFormData({...formData, principalAmount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 pl-8 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-black transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Monthly Payment</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                    <input required type="number" value={formData.monthlyAmount} onChange={(e) => setFormData({...formData, monthlyAmount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 pl-8 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-black transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" />
                  </div>
                </div>
              </div>
              
              {/* Auto-Calculated Total Payable */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Total Payable (Auto-Calculated)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                  <input type="number" value={formData.totalAmount} readOnly className="w-full bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-transparent rounded-2xl p-4 pl-8 outline-none font-black cursor-not-allowed transition-colors" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Start Date</label>
                  <input type="month" placeholder="YYYY-MM" value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" />
                </div>
                
              </div>
              <div>
  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Due Day of Month</label>
  <input 
  type="number" 
  min="1" 
  max="31" 
  placeholder="e.g., 15" 
  value={formData.due_date || ''} // Adding '|| ''' handles any accidental null/undefined[span_6](start_span)[span_6](end_span)
  onChange={(e) => setFormData({...formData, due_date: e.target.value})}  
    className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
  />
</div>

              {/* QA: Fix for term duration issue - add term duration input field */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Term Duration (months)</label>
                <input 
                  required 
                  type="number" 
                  min="1" 
                  value={formData.termDuration} 
                  onChange={(e) => setFormData({...formData, termDuration: e.target.value})} 
                  placeholder="e.g., 12, 24, 36"
                  className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-black transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" 
                />
              </div>
              

            {/* 🟢 NEW: TABBED PAYMENT LAYOUT */}
                <div className="mt-6 rounded-2xl border-[3px] border-black bg-gray-50 overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900">
                
                {/* TABS HEADER */}
                <div className="flex border-b-[3px] border-black">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTab('my_account');
                      setIsProxyPay(false);
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors ${
                      paymentTab === 'my_account'
                        ? 'bg-white text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    My Account
                  </button>
                  <div className="w-[3px] bg-black"></div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTab('budee');
                      setIsProxyPay(true);
                      setIsIOU(false); // Reset IOU when switching to Budee
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors ${
                      paymentTab === 'budee'
                        ? 'bg-white text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    Budee
                  </button>
                </div>

                {/* TAB CONTENT */}
                <div className="p-4 bg-white dark:bg-gray-800">
                  
                  {/* TAB 1: MY ACCOUNT (Standard & IOU) */}
                  {paymentTab === 'my_account' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                      
                      {/* Standard Account Dropdown */}
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Linked Credit Card</label>
                        <select 
                          value={formData.linkedAccountId} 
                          onChange={(e) => setFormData({
                            ...formData, 
                            linkedAccountId: e.target.value,
                            accountId: e.target.value
                          })} 
                          className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold appearance-none transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                        >
                          <option value="">None (Standard Installment)</option>
                          {accounts.filter(acc => acc.type === 'Credit' || acc.classification === 'Credit Card' || acc.type === 'Loan' || acc.classification === 'Loan').map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.bank} - {acc.classification}</option>
                          ))}
                        </select>
                      </div>

                      {/* IOU Checkbox Nest */}
                      <div className="pt-2 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-3 cursor-pointer mb-3 mt-2">
                          <input 
                            type="checkbox" 
                            className="h-5 w-5 rounded border-black"
                            checked={isIOU} 
                            onChange={(e) => setIsIOU(e.target.checked)} 
                          />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">I paid for a Budee (IOU)</span>
                        </label>

                        {isIOU && (
                          <div className="ml-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Who owes you?</label>
                              <select 
                                value={formData.debtorFriendId} 
                                onChange={e => setFormData({...formData, debtorFriendId: e.target.value})}
                                className="w-full bg-white dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                                required={isIOU}
                              >
                                <option value="">Select a friend...</option>
                                {(people || []).map(person => (
                                  <option key={person.id} value={person.id}>{person.name}</option>
                                ))}
                              </select>
                            </div>


                            <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expected Receiving Account</label>
                              <select 
                                value={formData.expectedAccountId} 
                                onChange={e => setFormData({...formData, expectedAccountId: e.target.value})}
                                className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-3 outline-none font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                                required={isIOU}
                              >
                                <option value="">Select account...</option>
                                {accounts.filter(a => a.type === 'Debit').map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.bank}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: BUDEE (Proxy Pay) */}
                  {paymentTab === 'budee' && (
                    <div className="space-y-4 py-2 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Paid by</label>
                          <select 
                            value={formData.fundingFriendId} 
                            onChange={e => setFormData({...formData, fundingFriendId: e.target.value})}
                            className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold appearance-none transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                            required={paymentTab === 'budee'}
                          >
                            <option value="">Select a friend...</option>
                            {(people || []).map(person => (
                              <option key={person.id} value={person.id}>{person.name}</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-gray-400 mt-3 font-medium leading-tight">This will route the entire installment debt directly to this friend's profile instead of deducting from your bank account.</p>
                                                                                                {/* 🟢 NEW: Virtual Billing UI (Add Modal) */}
                        <div className="pt-4 mt-4 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 transition-colors">Virtual Billing Cycle</label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Billing Date</label>
                              <input 
                                type="number" 
                                min="1" max="31" 
                                placeholder="e.g. 20"
                                value={formData.budeeBillingDate}
                                onChange={e => setFormData({...formData, budeeBillingDate: e.target.value})}
                                className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-2xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)] dark:text-gray-100"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Days to Pay</label>
                              <input 
                                type="number" 
                                min="0" max="90" 
                                placeholder="e.g. 15"
                                value={formData.budeeDaysToPay}
                                onChange={e => setFormData({...formData, budeeDaysToPay: e.target.value})}
                                className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-2xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)] dark:text-gray-100"
                              />
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-2 font-medium leading-tight">Works like a credit card: The <strong>Billing Date</strong> generates the schedule, and <strong>Days to Pay</strong> maps the cash flow to the correct Budget tab.</p>
                        </div>



                        </div>

                    </div>
                  )}
                </div>
              </div>
              {/* 🟢 END TABBED PAYMENT LAYOUT */}



              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => { 
                  setShowModal(false);
                  setFormData({ name: '', totalAmount: '', monthlyAmount: '', termDuration: '', paidAmount: '', accountId: accounts[0]?.id || '', startDate: '', billerId: '', timing: '1/2' });
                }} className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-gray-500 dark:text-gray-300 transition-colors">Cancel</button>
                <button 
                  type="submit" 
                  disabled={accounts.length === 0 || isSubmitting}
                  className={`flex-1 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getAccentClasses('bg')} border-2 border-black filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.12)]`}
                >
                  {isSubmitting ? 'Saving...' : 'Start Tracking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Modal */}
      {showCloseModal && (() => {
        const paidAmount = dbPaidAmounts.get(showCloseModal.id) ?? showCloseModal.paidAmount;
        const isFullyPaid = paidAmount >= showCloseModal.totalAmount;

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative transition-colors">
              <button onClick={() => setShowCloseModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </button>
              <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">Close Installment</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 transition-colors">Mark this installment as finished and move it to archives.</p>
              
              <form onSubmit={handleCloseSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Tagging</label>
                  <div className="space-y-4">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300 transition-colors">This Installment has been:</p>
                    {isFullyPaid ? (
                      <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-2xl border border-green-100 dark:border-green-800/30 transition-colors">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-black uppercase tracking-widest text-xs">Completed</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <select 
                          value={closeTagging} 
                          onChange={(e) => setCloseTagging(e.target.value as any)}
                          className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 outline-none font-bold text-sm appearance-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                        >
                          <option value="terminated">Terminated (Early Close)</option>
                          <option value="transferred">Transferred (Moved to other loan)</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none transition-colors" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button type="button" disabled={isSubmitting} onClick={() => setShowCloseModal(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 py-4 rounded-2xl font-bold text-gray-500 dark:text-gray-300 disabled:opacity-50 transition-colors">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 bg-amber-500 text-white py-4 rounded-2xl font-bold hover:bg-amber-600 shadow-xl shadow-amber-100 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
                  >
                    {isSubmitting ? <span>Archiving...</span> : <span>Archive</span>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Standardized Modals */}
      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative transition-colors border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,1)]">
            <button onClick={closePayModal} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
            </button>
            <h2 className={`text-2xl font-titan normal-case tracking-tighter leading-none [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${getAccentClasses('text')} mb-2`}>Pay {showPayModal.name}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 transition-colors">Recording a monthly installment payment</p>
            <form onSubmit={handlePaySubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Amount Paid</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500 transition-colors">₱</span>
                  <input required type="number" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Receipt Upload</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0] || null; setPayReceiptFile(f); setPayFormData({...payFormData, receipt: f?.name || ''}); }} />
                  <div className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Date Paid</label>
                  <input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full min-w-0 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl px-3 py-4 outline-none font-bold text-sm transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Payment Method</label>
                  <select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full min-w-0 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl px-3 py-4 outline-none font-bold text-sm appearance-none transition-colors">
                    {accounts.filter(acc => acc.classification !== 'Credit Card' && acc.type !== 'Credit').map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={closePayModal} className="flex-1 bg-gray-100 dark:bg-gray-800 py-4 rounded-2xl font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100 dark:shadow-none transition-all active:scale-95 border-2 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overdraft Alert Modal */}
      {overdraftPrompt && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={closeOverdraftPrompt}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black rounded-2xl w-full max-w-md p-6 relative shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={closeOverdraftPrompt} className="absolute top-4 right-4 text-gray-400 p-1.5 rounded-full hover:bg-gray-100" aria-label="Close overdraft prompt">
              <X className="h-4 w-4" />
            </button>

            <div className="absolute left-1/2 top-0 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[4px] border-black bg-[#ff7a59] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Hand className="h-10 w-10" />
            </div>

            <div className="pt-10">
              <div className="mb-4 text-center">
                <span className="inline-block -rotate-2 rounded-full border-[3px] border-black bg-yellow-300 px-4 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  {overdraftPrompt.mode === 'block' ? 'Block Mode' : 'Warn Mode'}
                </span>
              </div>

              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 text-center">
                {overdraftPrompt.mode === 'block'
                  ? 'No can do. Please top-up to complete the transaction'
                  : 'Hold on a sec-your account is a little short. This will drop you into a negative balance. Still a go?'}
              </h2>

              <p className="mt-4 mb-5 text-center text-xs font-medium text-gray-600 dark:text-gray-400">
                {overdraftPrompt.accountName} goes from {formatCurrency(overdraftPrompt.currentBalance)} to {formatCurrency(overdraftPrompt.projectedBalance)} after this transaction.
              </p>

              <div className="mb-5 space-y-3 rounded-xl border-2 border-black bg-gray-50 dark:bg-gray-800 p-4">
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Current Balance</span>
                  <span className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCurrency(overdraftPrompt.currentBalance)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Transaction Amount</span>
                  <span className="text-sm font-black text-orange-600 dark:text-orange-400">{formatCurrency(overdraftPrompt.transactionAmount)}</span>
                </div>
                <div className="border-t-2 border-black pt-3 flex justify-between gap-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Projected Balance</span>
                  <span className="text-sm font-black text-red-600 dark:text-red-400">{formatCurrency(overdraftPrompt.projectedBalance)}</span>
                </div>
              </div>

              {overdraftPrompt.mode === 'block' ? (
                <button
                  type="button"
                  onClick={closeOverdraftPrompt}
                  className="w-full rounded-2xl border-[3px] border-black bg-[#ffd54f] px-4 py-4 text-xs font-black uppercase tracking-widest text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                >
                  Got it.
                </button>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={confirmPayDespiteOverdraft}
                    className="rounded-2xl border-[3px] border-black bg-green-400 px-4 py-4 text-xs font-black uppercase tracking-widest text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                  >
                    Proceed
                  </button>
                  <button
                    type="button"
                    onClick={closeOverdraftPrompt}
                    className="rounded-2xl border-[3px] border-black bg-gray-100 dark:bg-gray-800 px-4 py-4 text-xs font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

            {/* Edit Modal */}
            {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto transition-colors">
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-6 uppercase tracking-tight transition-colors">Edit Installment</h2>
            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Item Name</label>
                <input required type="text" value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors" />
              </div>
                            {/* Principal & Monthly Grid */}
                            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Principal (Item Cost)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                    <input required type="number" value={editFormData.principalAmount} onChange={(e) => setEditFormData({...editFormData, principalAmount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 pl-8 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-black transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Monthly Payment</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                    <input required type="number" value={editFormData.monthlyAmount} onChange={(e) => setEditFormData({...editFormData, monthlyAmount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 pl-8 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-black transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]" />
                  </div>
                </div>
              </div>
              
              {/* Auto-Calculated Total Payable */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Total Payable (Auto-Calculated)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 font-bold transition-colors">₱</span>
                  <input type="number" value={editFormData.totalAmount} readOnly className="w-full bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-transparent rounded-2xl p-4 pl-8 outline-none font-black cursor-not-allowed transition-colors" placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Start Date</label>
                  <input type="month" value={editFormData.startDate} onChange={(e) => setEditFormData({...editFormData, startDate: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors" />
                </div>
                
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">
                  Due Date
                </label>
                <input 
                  type="number" 
                  min="1" 
                  max="31"
                  value={editFormData.due_date} 
                  onChange={(e) => setEditFormData({...editFormData, due_date: e.target.value})} 
                  placeholder="e.g., 15"
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-black transition-colors" 
                />
              </div>            

              {/* Term Duration */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Term Duration (months)</label>
                <input 
                  required 
                  type="number" 
                  min="1" 
                  value={editFormData.termDuration} 
                  onChange={(e) => setEditFormData({...editFormData, termDuration: e.target.value})} 
                  placeholder="e.g., 12, 24, 36"
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-black transition-colors" 
                />
              </div>
              
              {/* 🟢 NEW: TABBED PAYMENT LAYOUT */}
              <div className="mt-6 rounded-2xl border-[3px] border-black bg-gray-50 overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900">
                
                {/* TABS HEADER */}
                <div className="flex border-b-[3px] border-black">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTab('my_account');
                      setIsProxyPay(false);
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors ${
                      paymentTab === 'my_account'
                        ? 'bg-white text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    My Account
                  </button>
                  <div className="w-[3px] bg-black"></div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTab('budee');
                      setIsProxyPay(true);
                      setIsIOU(false);
                    }}
                    className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors ${
                      paymentTab === 'budee'
                        ? 'bg-white text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    Budee
                  </button>
                </div>

                {/* TAB CONTENT */}
                <div className="p-4 bg-white dark:bg-gray-800">
                  
                  {/* TAB 1: MY ACCOUNT (Standard & IOU) */}
                  {paymentTab === 'my_account' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                      
                      {/* Standard Account Dropdown */}
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Linked Credit Card</label>
                        <select 
                          value={editFormData.linkedAccountId} 
                          onChange={(e) => setEditFormData({
                            ...editFormData, 
                            linkedAccountId: e.target.value,
                            accountId: e.target.value
                          })} 
                          className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold appearance-none transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                        >
                          <option value="">None (Standard Installment)</option>
                          {accounts.filter(acc => acc.type === 'Credit' || acc.classification === 'Credit Card' || acc.type === 'Loan' || acc.classification === 'Loan').map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.bank} - {acc.classification}</option>
                          ))}
                        </select>
                      </div>

                      {/* IOU Checkbox Nest */}
                      <div className="pt-2 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-3 cursor-pointer mb-3 mt-2">
                          <input 
                            type="checkbox" 
                            className="h-5 w-5 rounded border-black"
                            checked={isIOU} 
                            onChange={(e) => setIsIOU(e.target.checked)} 
                          />
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">I paid for a Budee (IOU)</span>
                        </label>

                        {isIOU && (
                          <div className="ml-8 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Who owes you?</label>
                              <select 
                                value={editFormData.debtorFriendId} 
                                onChange={e => setEditFormData({...editFormData, debtorFriendId: e.target.value})}
                                className="w-full bg-white dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                                required={isIOU}
                              >
                                <option value="">Select a friend...</option>
                                {(people || []).map(person => (
                                  <option key={person.id} value={person.id}>{person.name}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Expected Receiving Account</label>
                              <select 
                                value={editFormData.expectedAccountId} 
                                onChange={e => setEditFormData({...editFormData, expectedAccountId: e.target.value})}
                                className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-3 outline-none font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                                required={isIOU}
                              >
                                <option value="">Select account...</option>
                                {accounts.filter(a => a.type === 'Debit').map(acc => (
                                  <option key={acc.id} value={acc.id}>{acc.bank}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: BUDEE (Proxy Pay) */}
                  {paymentTab === 'budee' && (
                    <div className="space-y-4 py-2 animate-in fade-in slide-in-from-right-2 duration-300">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Paid by</label>
                        <select 
                          value={editFormData.fundingFriendId} 
                          onChange={e => setEditFormData({...editFormData, fundingFriendId: e.target.value})}
                          className="w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border-2 border-black rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold appearance-none transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)]"
                          required={paymentTab === 'budee'}
                        >
                          <option value="">Select a friend...</option>
                          {(people || []).map(person => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-gray-400 mt-3 font-medium leading-tight">This will route the entire installment debt directly to this friend's profile instead of deducting from your bank account.</p>
                      
                                                                                             {/* 🟢 NEW: Virtual Billing UI (Edit Modal) */}
                        <div className="pt-4 mt-4 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 transition-colors">Virtual Billing Cycle</label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Billing Date</label>
                              <input 
                                type="number" 
                                min="1" max="31" 
                                placeholder="e.g. 20"
                                value={editFormData.budeeBillingDate}
                                onChange={e => setEditFormData({...editFormData, budeeBillingDate: e.target.value})}
                                className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-2xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)] dark:text-gray-100"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Days to Pay</label>
                              <input 
                                type="number" 
                                min="0" max="90" 
                                placeholder="e.g. 15"
                                value={editFormData.budeeDaysToPay}
                                onChange={e => setEditFormData({...editFormData, budeeDaysToPay: e.target.value})}
                                className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-2xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors shadow-[2px_2px_0px_rgba(0,0,0,0.12)] dark:text-gray-100"
                              />
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-2 font-medium leading-tight">Works like a credit card: The <strong>Billing Date</strong> generates the schedule, and <strong>Days to Pay</strong> maps the cash flow to the correct Budget tab.</p>
                        </div>


                      
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* 🟢 END TABBED PAYMENT LAYOUT */}

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowEditModal(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-gray-500 dark:text-gray-300 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-xl dark:shadow-none">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* View Schedule Modal */}
      {showViewModal && (() => {
        const generateMonthlySchedule = () => {
          if (!showViewModal.startDate) return [];

          // Use actual payment schedules from database if available
          if (paymentSchedules.length > 0) {
            console.log('[Installments] Using database payment schedules for display');
            return paymentSchedules.map(schedule => ({
              month: `${schedule.month} ${schedule.year}`,
              amount: schedule.expected_amount,
              isPaid: schedule.status === 'paid',
              isPartial: schedule.status === 'partial',
              amountPaid: schedule.amount_paid,
              status: schedule.status,
              scheduleId: schedule.id
            }));
          }

          // Fallback to calculated schedule if no payment schedules exist
          console.log('[Installments] No payment schedules found, using calculated schedule (fallback)');
          const [startYear, startMonth] = showViewModal.startDate.split('-').map(Number);
          const termMonths = parseInt(showViewModal.termDuration) || 12;
          const monthlyAmount = showViewModal.monthlyAmount;
          const schedule = [];
          
          for (let i = 0; i < termMonths; i++) {
            const monthIndex = (startMonth - 1 + i) % 12;
            const year = startYear + Math.floor((startMonth - 1 + i) / 12);
            const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][monthIndex];
            
            schedule.push({
              month: `${monthName} ${year}`,
              amount: monthlyAmount,
              isPaid: (i + 1) * monthlyAmount <= showViewModal.paidAmount,
              isPartial: false,
              amountPaid: 0,
              status: (i + 1) * monthlyAmount <= showViewModal.paidAmount ? 'paid' : 'pending'
            });
          }
          
          return schedule;
        };
        
        const schedule = generateMonthlySchedule();
        
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className={`bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-3xl p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto transition-colors border-[3px] border-black shadow-[6px_6px_0px_rgba(0,0,0,1)]`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className={`text-2xl font-titan normal-case tracking-tighter leading-none [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${getAccentClasses('text')}`}>{showViewModal.name}</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 transition-colors">Monthly Payment Schedule</p>
                </div>
                <button onClick={() => setShowViewModal(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <X className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                </button>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 mb-6 grid grid-cols-3 gap-4 transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <div>
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Total Amount</p>
                  <p className="text-lg font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(showViewModal.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Paid Amount</p>
                  <p className="text-lg font-black text-green-600 dark:text-green-400 transition-colors">{formatCurrency(dbPaidAmounts.get(showViewModal.id) ?? showViewModal.paidAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Remaining</p>
                  <p className="text-lg font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(showViewModal.totalAmount - (dbPaidAmounts.get(showViewModal.id) ?? showViewModal.paidAmount))}</p>
                </div>
              </div>
              
              {loadingSchedules ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Loading payment schedules...</p>
                </div>
              ) : schedule.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 transition-colors">Payment Schedule</h3>
                  {schedule.map((item, index) => (
                    <div key={index} className={`flex items-center justify-between p-4 rounded-xl border-4 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.08)] filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-all ${
                      item.isPaid 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30' 
                        : item.isPartial 
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800/30'
                          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}>
                      <div className="flex items-center space-x-4">
                        <span className={`text-sm font-black ${
                          item.isPaid ? 'text-green-600 dark:text-green-400' : item.isPartial ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-gray-100'
                        }`}>{item.month}</span>
                        {item.isPaid && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded uppercase transition-colors">Paid</span>
                        )}
                        {item.isPartial && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase transition-colors">Partial</span>
                        )}
                        {item.isPartial && item.amountPaid > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors">
                            ({formatCurrency(item.amountPaid)} of {formatCurrency(item.amount)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(item.amount)}</span>
                        {(item.isPaid || item.isPartial) && item.scheduleId && (
                          <button
                            onClick={() => openSchedulePaymentsModal(item.scheduleId!, item.month)}
                            title="View payment records"
                            className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full p-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        )}
                        {!item.isPaid && (
                          <button 
                            onClick={() => {
                              setShowViewModal(null);
                              setShowPayModal(showViewModal);
                              // Pin the payment to this specific schedule month
                              setPayModalScheduleId(item.scheduleId);
                              // Autofill with remaining due for this schedule month (amount - already paid)
                              setPayFormData({ 
                                amount: Math.max(0, item.amount - item.amountPaid).toFixed(2),
                                receipt: '',
                                datePaid: getTodayIso(),
                                accountId: defaultNonCreditAccountId
                              });
                            }}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400 font-bold transition-colors">No start date set. Please edit the installment to add a start date.</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}

      {/* Schedule Payments Modal */}
      {schedulePaymentsModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSchedulePaymentsModal(null)}>
          <div className="w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,0.08)] filter drop-shadow-[0_10px_30px_rgba(0,0,0,0.08)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSchedulePaymentsModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]" aria-label="Close"><X className="w-5 h-5" /></button>
            <h2 className={`text-2xl font-titan normal-case tracking-tighter leading-none [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${getAccentClasses('text')} mb-1`}>Payment Records</h2>
            <p className="text-gray-500 text-sm mb-6">{schedulePaymentsModal.month}</p>
            {loadingScheduleTx ? (
              <div className="text-center py-8 text-gray-400">Loading...</div>
            ) : schedulePaymentsModal.transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 italic">No payment records found for this schedule.</div>
            ) : (
              <div className="space-y-4">
                {schedulePaymentsModal.transactions.map(tx => {
                  const pmName = accounts.find(a => a.id === tx.paymentMethodId)?.bank || tx.paymentMethodId;
                  const signedUrl = scheduleSignedUrls[tx.id];
                  return (
                    <div key={tx.id} className="bg-gray-50 rounded-2xl p-4 space-y-2 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                        <div className="flex justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</span>
                          <span className="text-sm font-bold text-gray-900">{tx.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</span>
                          <span className="text-sm font-bold text-red-600">{formatCurrency(tx.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</span>
                          <span className="text-sm text-gray-700">{pmName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</span>
                          <span className="text-sm text-gray-700">{new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                        </div>
                        <button
                          onClick={() => { setEditingScheduleTx(tx); setEditScheduleTxForm({ name: tx.name, amount: Math.abs(tx.amount).toFixed(2), date: tx.date.split('T')[0] }); }}
                          className="ml-3 mt-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <PinProtectedAction
                          featureId="transaction_deletions"
                          onVerified={() => handleDeleteInstallmentScheduleTx(tx.id)}
                          actionLabel="Delete Payment Record"
                        >
                          <button
                            onClick={(e) => e.preventDefault()}
                            title="Delete payment record"
                            className="ml-1 mt-1 text-[9px] font-black text-red-500 uppercase tracking-widest px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </PinProtectedAction>
                      </div>
                      {tx.receiptUrl && (
                        <div className="flex items-center space-x-3 pt-1">
                          {signedUrl ? (
                            <>
                              <img src={signedUrl} alt="Receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              <button onClick={() => { setZoom(0.5); setPreviewReceiptUrl(signedUrl); }} title="Preview receipt" className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                                <Eye className="w-3.5 h-3.5" /><span>Preview</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Loading receipt…</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Schedule Transaction Modal */}
      {editingScheduleTx && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setEditingScheduleTx(null)}>
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-10 shadow-2xl relative transition-colors" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditingScheduleTx(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" aria-label="Close"><X className="w-6 h-6 text-gray-400 dark:text-gray-500" /></button>
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 transition-colors">Edit Transaction</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 transition-colors">Update the transaction details below</p>
            <form onSubmit={handleEditScheduleTxSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Name</label>
                <input
                  value={editScheduleTxForm.name}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none font-bold text-sm transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editScheduleTxForm.amount}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, amount: e.target.value }))}
                  required
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none font-bold text-sm transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Date</label>
                <input
                  type="date"
                  value={editScheduleTxForm.date}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none font-bold text-sm transition-colors"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingScheduleTx(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-bold transition-colors" disabled={isEditingScheduleTx}>Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50" disabled={isEditingScheduleTx}>{isEditingScheduleTx ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setPreviewReceiptUrl(null)}>
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 transition-colors">
              <h3 className="text-base font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest transition-colors">Receipt Preview</h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))} title="Zoom out" className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-10 text-center transition-colors">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))} title="Zoom in" className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
                <a href={previewReceiptUrl} download target="_blank" rel="noreferrer" title="Download receipt" className="p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 transition-colors" aria-label="Download receipt"><Download className="w-4 h-4" /></a>
                <button onClick={() => setPreviewReceiptUrl(null)} title="Close" className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors" aria-label="Close preview"><X className="w-4 h-4" /></button>
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

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center transition-colors">
      <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6 transition-colors">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none">
          Proceed
        </button>
        <button onClick={onClose} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export default Installments;
