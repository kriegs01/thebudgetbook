import React, { useState, useEffect, useCallback } from 'react';
import { Biller, BillerAmountIncrease, Account, PaymentSchedule, BudgetCategory, Installment } from '../types';
import { Plus, Calendar, Bell, ChevronDown, ChevronRight, Upload, CheckCircle2, X, ArrowLeft, Power, PowerOff, MoreVertical, Edit2, Eye, Trash2, AlertTriangle, Info, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { getAllTransactions, getTransactionsByPaymentSchedule, getReceiptSignedUrl, updateTransaction, updateTransactionAndSyncSchedule, deleteTransactionAndRevertSchedule } from '../src/services/transactionsService';
import { getPaymentSchedulesBySource } from '../src/services/paymentSchedulesService';
import { combineDateWithCurrentTime } from '../src/utils/dateUtils';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule } from '../src/types/supabase';
// ENHANCEMENT: Import linked account utilities for billing cycle-based amount calculation
import { 
  getScheduleExpectedAmount, 
  getScheduleDisplayLabel, 
  shouldUseLinkedAccount, 
  getLinkedAccount 
} from '../src/utils/linkedAccountUtils';
import { getDueDayForMonth, ordinalSuffix } from '../src/utils/billingCycles';
// Import schedule ID generator for consistent ID creation
import { generateScheduleId } from '../src/utils/billersAdapter';


interface BillersProps {
  billers: Biller[];
  installments?: Installment[];
  onAdd: (b: Biller) => Promise<void>;
  accounts: Account[];
  categories: BudgetCategory[];
  onUpdate: (b: Biller) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onPayBiller?: (billerId: string, payment: {
    amount: number;
    date: string;
    accountId: string;
    receipt?: string;
    receiptFile?: File;
    scheduleId?: string; // target schedule ID so the correct month is always updated
    expectedAmount?: number; // true expected amount when DB expected_amount is 0 (e.g. Loans billers)
  }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Transaction matching configuration
const TRANSACTION_AMOUNT_TOLERANCE = 1; // ±1 peso tolerance for amount matching
const TRANSACTION_MIN_NAME_LENGTH = 3; // Minimum length for partial name matching

// Utility function to calculate timing based on day of month
const calculateTiming = (dayString: string): '1/2' | '2/2' => {
  const day = parseInt(dayString);
  if (isNaN(day) || day < 1 || day > 31) return '1/2';
  return (day >= 1 && day <= 21) ? '1/2' : '2/2';
};

// Categories that support scheduled amount increases (Loans excluded)
const SCHEDULED_INCREASE_CATEGORY_PREFIXES = ['Fixed', 'Utilities', 'Subscriptions'];
const categorySupportsScheduledIncreases = (category: string): boolean =>
  SCHEDULED_INCREASE_CATEGORY_PREFIXES.some(prefix => category.startsWith(prefix));

/**
 * Returns true when the effective month of a scheduled increase has already
 * been reached or elapsed (i.e., month/year ≤ today's month/year).
 * Used to lock the remove button so historical increases can't be deleted.
 */
const isIncreaseElapsed = (effectiveMonth: string, effectiveYear: string): boolean => {
  const today = new Date();
  const incYear = parseInt(effectiveYear, 10);
  const incMonthIdx = MONTHS.indexOf(effectiveMonth);
  if (isNaN(incYear) || incMonthIdx === -1) return false;
  return (
    incYear < today.getFullYear() ||
    (incYear === today.getFullYear() && incMonthIdx <= today.getMonth())
  );
};

// Utility function to calculate status for a future/past activation date.
// Returns 'active' only when the activation month has already been reached.
// Used when reactivating an inactive biller to keep it 'inactive' until its
// activation month arrives.
const calculateStatusFromActivation = (activationDate: { month: string; year: string }): 'active' | 'inactive' => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const actYear = parseInt(activationDate.year);
  const actMonthIdx = MONTHS.indexOf(activationDate.month); // 0-indexed

  if (isNaN(actYear) || actMonthIdx === -1) return 'inactive';

  // Active once the activation month has arrived (current >= activation)
  if (actYear < currentYear || (actYear === currentYear && actMonthIdx <= currentMonth)) {
    return 'active';
  }

  return 'inactive';
};

// Utility function to calculate status based on deactivationDate.
// A biller remains 'active' until the deactivation month actually arrives;
// only then does its status flip to 'inactive'.
const calculateStatus = (deactivationDate?: { month: string; year: string }): 'active' | 'inactive' => {
  if (!deactivationDate) return 'active';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const deactYear = parseInt(deactivationDate.year);
  const deactMonth = MONTHS.indexOf(deactivationDate.month); // 0-indexed

  if (isNaN(deactYear) || deactMonth === -1) return 'active';

  // Biller is inactive only when the current month has reached or passed the deactivation month
  if (currentYear > deactYear || (currentYear === deactYear && currentMonth >= deactMonth)) {
    return 'inactive';
  }

  return 'active';
};

const Billers: React.FC<BillersProps> = ({ billers, installments = [], onAdd, accounts, categories, onUpdate, onDelete, onPayBiller, loading = false, error = null }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Biller | null>(null);
  const [showPayModal, setShowPayModal] = useState<{ biller: Biller, schedule: PaymentSchedule, expectedAmount?: number } | null>(null);
  const [detailedBillerId, setDetailedBillerId] = useState<string | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isInactiveOpen, setIsInactiveOpen] = useState(false);
  const [isActiveOpen, setIsActiveOpen] = useState(true);
  const [timingFeedback, setTimingFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Collapsible deactivation date visibility for Add/Edit forms
  const [showAddDeactSection, setShowAddDeactSection] = useState(false);
  const [showEditDeactSection, setShowEditDeactSection] = useState(false);

  // Collapsible scheduled increases visibility for Add/Edit forms
  const [showAddScheduledSection, setShowAddScheduledSection] = useState(false);
  const [showEditScheduledSection, setShowEditScheduledSection] = useState(false);

  // Scheduled increases for Add/Edit forms (eligible categories only)
  // Shape uses separate month/year fields; effectiveDate is derived as YYYY-MM-01 on submit
  const [addScheduledIncreases, setAddScheduledIncreases] = useState<{ effectiveMonth: string; effectiveYear: string; amount: string }[]>([]);
  const [editScheduledIncreases, setEditScheduledIncreases] = useState<{ effectiveMonth: string; effectiveYear: string; amount: string }[]>([]);

  // Transactions state for payment status matching
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);

  // Payment schedules state for database-driven status display
  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Schedules loaded when opening the edit modal — used for orphaning detection
  const [editBillerSchedules, setEditBillerSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);

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
  
  const [addFormData, setAddFormData] = useState({
    name: '',
    category: categories[0]?.name || '',
    dueDate: '',
    expectedAmount: '',
    actMonth: MONTHS[(new Date().getMonth() + 1) % 12],
    actDay: '',
    actYear: new Date().getFullYear().toString(),
    deactMonth: '',
    deactYear: '',
    linkedAccountId: '' // ENHANCEMENT: Support linking Loans-category billers to credit accounts
  });

  const [editFormData, setEditFormData] = useState({
    name: '',
    category: '',
    dueDate: '',
    expectedAmount: '',
    actMonth: '',
    actDay: '',
    actYear: '',
    deactMonth: '',
    deactYear: '',
    linkedAccountId: '', // ENHANCEMENT: Support linking Loans-category billers to credit accounts
    reactMonth: '', // Reactivation date (used when editing an inactive biller)
    reactYear: '',
  });

  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);

  // Schedule payments modal (consolidated transactions for a schedule entry)
  type BillerScheduleTx = { id: string; name: string; amount: number; date: string; paymentMethodId: string; receiptUrl?: string | null };
  const [schedulePaymentsModal, setSchedulePaymentsModal] = useState<{ label: string; scheduleId: string; transactions: BillerScheduleTx[] } | null>(null);
  const [loadingScheduleTx, setLoadingScheduleTx] = useState(false);
  const [scheduleSignedUrls, setScheduleSignedUrls] = useState<Record<string, string | null>>({});
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);

  // Edit schedule transaction modal state
  const [editingScheduleTx, setEditingScheduleTx] = useState<BillerScheduleTx | null>(null);
  const [editScheduleTxForm, setEditScheduleTxForm] = useState({ name: '', amount: '', date: '' });
  const [isEditingScheduleTx, setIsEditingScheduleTx] = useState(false);

  // Load transactions for payment status matching
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const { data, error } = await getAllTransactions();
        if (error) {
          console.error('[Billers] Failed to load transactions:', error);
        } else if (data) {
          // Filter to last 24 months for performance
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          
          const recentTransactions = data.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= twoYearsAgo;
          });
          
          setTransactions(recentTransactions);
          console.log('[Billers] Loaded transactions:', recentTransactions.length, 'of', data.length);
        }
      } catch (error) {
        console.error('[Billers] Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, []); // Load once on mount

  // Load payment schedules when viewing biller details
  // Load payment schedules function (extracted for reuse)
  const loadPaymentSchedules = useCallback(async () => {
    if (detailedBillerId) {
      setLoadingSchedules(true);
      console.log('[Billers] Loading payment schedules for biller:', detailedBillerId);
      
      try {
        const { data, error } = await getPaymentSchedulesBySource('biller', detailedBillerId);
        
        if (error) {
          console.error('[Billers] Error loading payment schedules:', error);
          setPaymentSchedules([]);
        } else if (data) {
          console.log('[Billers] Loaded payment schedules:', data.length, 'schedules');
          setPaymentSchedules(data);
        } else {
          setPaymentSchedules([]);
        }
      } catch (err) {
        console.error('[Billers] Exception loading payment schedules:', err);
        setPaymentSchedules([]);
      } finally {
        setLoadingSchedules(false);
      }
    } else {
      // Clear schedules when not viewing details
      setPaymentSchedules([]);
    }
  }, [detailedBillerId]);

  // Also reload when billers change (e.g., after payment) to get updated status
  useEffect(() => {
    loadPaymentSchedules();
  }, [detailedBillerId, billers, loadPaymentSchedules]);

  const openSchedulePaymentsModal = async (scheduleId: string, label: string) => {
    setLoadingScheduleTx(true);
    setSchedulePaymentsModal({ label, scheduleId, transactions: [] });
    try {
      const { data } = await getTransactionsByPaymentSchedule(scheduleId);
      const txs: BillerScheduleTx[] = (data || []).map((t: SupabaseTransaction) => ({
        id: t.id, name: t.name, amount: t.amount, date: t.date, paymentMethodId: t.payment_method_id, receiptUrl: t.receipt_url ?? null
      }));
      setSchedulePaymentsModal({ label, scheduleId, transactions: txs });
      const urls: Record<string, string | null> = {};
      await Promise.all(txs.filter(tx => tx.receiptUrl).map(async tx => {
        urls[tx.id] = await getReceiptSignedUrl(tx.receiptUrl as string).catch(() => null);
      }));
      setScheduleSignedUrls(urls);
    } finally {
      setLoadingScheduleTx(false);
    }
  };

  const handleEditBillerScheduleTxSubmit = async (e: React.FormEvent) => {
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
      await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
      // Reload payment schedules so status (partial/paid/pending) is recalculated
      await loadPaymentSchedules();
    } catch (err) {
      console.error('[Billers] Error updating schedule transaction:', err);
      alert('Failed to update transaction. Please try again.');
    } finally {
      setIsEditingScheduleTx(false);
    }
  };

  /** Delete a payment transaction from the payment records modal.
   * Cascade-deletes any linked credit_payment counterpart automatically. */
  const handleDeleteBillerScheduleTx = async (txId: string) => {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      const { error } = await deleteTransactionAndRevertSchedule(txId);
      if (error) throw error;
      // Reload the modal and the schedule list to reflect the deletion
      if (schedulePaymentsModal) {
        await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
      }
      await loadPaymentSchedules();
    } catch (err) {
      console.error('[Billers] Error deleting schedule transaction:', err);
      alert('Failed to delete transaction. Please try again.');
    }
  };

  /**
   * Check if a biller schedule is paid by matching transactions
   * Matches by name, amount (within tolerance), and date (within month/year)
   */
  const checkIfPaidByTransaction = useCallback((
    billerName: string,
    expectedAmount: number,
    month: string,
    year: string
  ): boolean => {
    if (isNaN(expectedAmount) || expectedAmount <= 0) return false;

    // Get month index (0-11) for date comparison
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;

    const targetYear = parseInt(year);
    if (isNaN(targetYear)) return false;

    // Find matching transaction
    const matchingTransaction = transactions.find(tx => {
      // Check name match with minimum length requirement
      const billerNameLower = billerName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      const nameMatch = (
        (txNameLower.includes(billerNameLower) && billerNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (billerNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      // Check amount match (within tolerance)
      const amountMatch = Math.abs(tx.amount - expectedAmount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      // Check date match (same month and year, or previous year for year-end carryover)
      // Note: Previous year matching is intentional - allows for payments made in December
      // for January bills, or delayed transaction recording across year boundaries
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      const dateMatch = (txMonth === monthIndex) && 
                       (txYear === targetYear || txYear === targetYear - 1);

      return nameMatch && amountMatch && dateMatch;
    });

    // Debug logging (can be removed in production)
    if (process.env.NODE_ENV === 'development' && matchingTransaction) {
      console.log(`[Billers] ✓ Found matching transaction for "${billerName}" (${month} ${year}):`, {
        txName: matchingTransaction.name,
        txAmount: matchingTransaction.amount,
        txDate: matchingTransaction.date
      });
    }

    return !!matchingTransaction;
  }, [transactions]);

  /**
   * Get the matching transaction for a biller schedule
   * Returns the transaction object if found, null otherwise
   */
  const getMatchingTransaction = useCallback((
    billerName: string,
    expectedAmount: number,
    month: string,
    year: string
  ): SupabaseTransaction | null => {
    if (isNaN(expectedAmount) || expectedAmount <= 0) return null;

    // Get month index (0-11) for date comparison
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return null;

    const targetYear = parseInt(year);
    if (isNaN(targetYear)) return null;

    // Find matching transaction
    const matchingTransaction = transactions.find(tx => {
      // Check name match with minimum length requirement
      const billerNameLower = billerName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      const nameMatch = (
        (txNameLower.includes(billerNameLower) && billerNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (billerNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      // Check amount match (within tolerance)
      const amountMatch = Math.abs(tx.amount - expectedAmount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      // Check date match (same month and year, or previous year for year-end carryover)
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      const dateMatch = (txMonth === monthIndex) && 
                       (txYear === targetYear || txYear === targetYear - 1);

      return nameMatch && amountMatch && dateMatch;
    });

    return matchingTransaction || null;
  }, [transactions]);

  // Helper to show timing feedback when dates change
  const showTimingInfo = (dayString: string) => {
    if (!dayString) {
      setTimingFeedback('');
      return;
    }
    const timing = calculateTiming(dayString);
    const day = parseInt(dayString);
    if (!isNaN(day)) {
      setTimingFeedback(`Timing automatically set to ${timing} (day ${day} is in ${timing === '1/2' ? 'first' : 'second'} half of month)`);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const expected = parseFloat(addFormData.expectedAmount) || 0;
      
      // Auto-compute dueDate from linked account if applicable
      let resolvedDueDate = addFormData.dueDate;
      if (addFormData.category.startsWith('Loans') && addFormData.linkedAccountId) {
        const linkedAcc = accounts.find(a => a.id === addFormData.linkedAccountId);
        if (linkedAcc) {
          const today = new Date();
          const computed = getDueDayForMonth(linkedAcc, today.getMonth(), today.getFullYear());
          if (computed) resolvedDueDate = computed.toString();
        }
      }

      // Calculate timing automatically from dueDate or actDay
      const dayForTiming = resolvedDueDate || addFormData.actDay;
      const timing = calculateTiming(dayForTiming);
      
      // Build activationDate with optional day
      const activationDate: { month: string; day?: string; year: string } = {
        month: addFormData.actMonth,
        year: addFormData.actYear
      };
      if (addFormData.actDay) {
        activationDate.day = addFormData.actDay;
      }
      
      // Build deactivationDate if provided
      const deactivationDate = (addFormData.deactMonth && addFormData.deactYear) 
        ? { month: addFormData.deactMonth, year: addFormData.deactYear }
        : undefined;
      
      // Calculate status automatically
      const status = calculateStatus(deactivationDate);
      
      const newBiller: Biller = {
        id: '', // ID will be generated by Supabase
        name: addFormData.name,
        category: addFormData.category,
        dueDate: resolvedDueDate,
        expectedAmount: expected,
        timing: timing,
        activationDate: activationDate,
        deactivationDate: deactivationDate,
        status: status,
        schedules: MONTHS.map(month => ({ 
          id: generateScheduleId(month, '2026'), 
          month, 
          year: '2026', 
          expectedAmount: expected 
        })),
        linkedAccountId: addFormData.linkedAccountId || undefined, // ENHANCEMENT: Support linked credit accounts
        scheduledIncreases: categorySupportsScheduledIncreases(addFormData.category)
          ? addScheduledIncreases
              .filter(inc => {
                const parsed = parseFloat(inc.amount);
                return inc.effectiveMonth !== '' && inc.effectiveYear !== '' && inc.amount !== '' && !isNaN(parsed) && parsed > 0;
              })
              .map(inc => ({
                effectiveDate: `${inc.effectiveYear}-${String(MONTHS.indexOf(inc.effectiveMonth) + 1).padStart(2, '0')}-01`,
                amount: parseFloat(inc.amount),
              }))
              .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
          : [],
      };
      
      await onAdd(newBiller);
      
      // Only close modal and reset form on success
      setShowAddModal(false);
      setAddFormData({ 
        name: '', 
        category: categories[0]?.name || '', 
        dueDate: '', 
        expectedAmount: '', 
        actMonth: MONTHS[(new Date().getMonth() + 1) % 12], 
        actDay: '',
        actYear: new Date().getFullYear().toString(),
        deactMonth: '',
        deactYear: '',
        linkedAccountId: '' // ENHANCEMENT: Reset linked account field
      });
      setAddScheduledIncreases([]);
      setShowAddScheduledSection(false);
      setShowAddDeactSection(false);
      setTimingFeedback('');
    } catch (error) {
      console.error('Failed to add biller:', error);
      // Keep modal open so user can retry or fix the issue
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const isInactiveBiller = showEditModal.status === 'inactive';

      // Auto-compute dueDate from linked account if applicable
      let resolvedEditDueDate = editFormData.dueDate;
      if (editFormData.category.startsWith('Loans') && editFormData.linkedAccountId) {
        const linkedAcc = accounts.find(a => a.id === editFormData.linkedAccountId);
        if (linkedAcc) {
          const today = new Date();
          const computed = getDueDayForMonth(linkedAcc, today.getMonth(), today.getFullYear());
          if (computed) resolvedEditDueDate = computed.toString();
        }
      }

      const dayForTiming = resolvedEditDueDate || editFormData.actDay;
      const timing = calculateTiming(dayForTiming);

      let activationDate: { month: string; day?: string; year: string };
      let deactivationDate: { month: string; year: string } | undefined;
      let status: 'active' | 'inactive';

      if (isInactiveBiller) {
        // Reactivation: treat reactMonth/reactYear as the new activation date.
        // Only set status to 'active' once the reactivation month has arrived;
        // otherwise keep 'inactive' until that month is reached.
        activationDate = {
          month: editFormData.reactMonth || editFormData.actMonth,
          year: editFormData.reactYear || editFormData.actYear,
        };
        deactivationDate = undefined;
        status = calculateStatusFromActivation(activationDate);
      } else {
        // Regular edit for active billers
        activationDate = {
          month: editFormData.actMonth,
          year: editFormData.actYear,
        };
        if (editFormData.actDay) {
          activationDate.day = editFormData.actDay;
        }
        deactivationDate = (editFormData.deactMonth && editFormData.deactYear)
          ? { month: editFormData.deactMonth, year: editFormData.deactYear }
          : undefined;
        status = calculateStatus(deactivationDate);
      }

      // Helper that performs the actual update
      const applyUpdate = async () => {
        await onUpdate({
          ...showEditModal,
          name: editFormData.name,
          category: editFormData.category,
          dueDate: resolvedEditDueDate,
          expectedAmount: parseFloat(editFormData.expectedAmount) || 0,
          timing: timing,
          activationDate: activationDate,
          deactivationDate: deactivationDate,
          status: status,
          linkedAccountId: editFormData.linkedAccountId || undefined,
          scheduledIncreases: categorySupportsScheduledIncreases(editFormData.category)
            ? editScheduledIncreases
                .filter(inc => {
                  const parsed = parseFloat(inc.amount);
                  return inc.effectiveMonth !== '' && inc.effectiveYear !== '' && inc.amount !== '' && !isNaN(parsed) && parsed > 0;
                })
                .map(inc => ({
                  effectiveDate: `${inc.effectiveYear}-${String(MONTHS.indexOf(inc.effectiveMonth) + 1).padStart(2, '0')}-01`,
                  amount: parseFloat(inc.amount),
                }))
                .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
            : [],
        });
        setShowEditModal(null);
        setEditScheduledIncreases([]);
        setShowEditScheduledSection(false);
        setTimingFeedback('');
      };

      // Orphaning check: warn when activation date changes for an active biller
      // and there are paid/partial schedules for months that fall before the new activation.
      if (!isInactiveBiller) {
        const oldActMonth = showEditModal.activationDate.month;
        const oldActYear = showEditModal.activationDate.year;

        if (oldActMonth !== activationDate.month || oldActYear !== activationDate.year) {
          const newActMonthIdx = MONTHS.indexOf(activationDate.month);
          const newActYear = parseInt(activationDate.year);

          const affectedSchedules = editBillerSchedules.filter(s => {
            const sYear = typeof s.year === 'number' ? s.year : parseInt(String(s.year));
            const sMonthIdx = MONTHS.indexOf(s.month);
            return (
              (sYear < newActYear || (sYear === newActYear && sMonthIdx < newActMonthIdx)) &&
              (s.status === 'paid' || s.status === 'partial')
            );
          });

          if (affectedSchedules.length > 0) {
            // Show orphaning warning — defer update until user confirms
            setIsSubmitting(false);
            setConfirmModal({
              show: true,
              title: 'Activation Date Change',
              message: `Changing the activation date will affect ${affectedSchedules.length} existing payment record(s) for months before ${activationDate.month} ${activationDate.year}. Payment history will be preserved but pending schedules for those months will be removed. Do you want to proceed?`,
              onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, show: false }));
                setIsSubmitting(true);
                try {
                  await applyUpdate();
                } catch (err) {
                  console.error('Failed to update biller after confirmation:', err);
                } finally {
                  setIsSubmitting(false);
                }
              },
            });
            return;
          }
        }
      }

      await applyUpdate();
    } catch (error) {
      console.error('Failed to update biller:', error);
      // Keep modal open so user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { biller, schedule } = showPayModal;

      // Use new payment handler if available
      if (onPayBiller) {
        console.log('[Billers] Using new transaction-based payment handler');
        await onPayBiller(biller.id, {
          amount: parseFloat(payFormData.amount),
          date: payFormData.datePaid,
          accountId: payFormData.accountId,
          receipt: payFormData.receipt || undefined,
          receiptFile: payReceiptFile || undefined,
          scheduleId: schedule.id, // target the exact schedule the user selected
          expectedAmount: showPayModal.expectedAmount,
        });
        
        // Close modal and clear form
        setShowPayModal(null);
        setPayFormData({
          amount: '',
          receipt: '',
          datePaid: new Date().toISOString().split('T')[0],
          accountId: accounts[0]?.id || ''
        });
        setPayReceiptFile(null);

        // Explicitly reload payment schedules to reflect the new payment status
        console.log('[Billers] Payment successful, reloading payment schedules');
        await loadPaymentSchedules();
      } else {
        // Fallback to old method (direct schedule update)
        console.log('[Billers] Using fallback direct schedule update');
        const updatedSchedules = biller.schedules.map(s => {
          // Match by ID if available (checking for null/undefined explicitly), otherwise fallback to month/year matching
          const isMatch = (schedule.id != null) ? 
            (s.id === schedule.id) : 
            (s.month === schedule.month && s.year === schedule.year);
            
          if (isMatch) {
            return { ...s, amountPaid: parseFloat(payFormData.amount), receipt: payFormData.receipt || `${biller.name}_${schedule.month}`, datePaid: payFormData.datePaid, accountId: payFormData.accountId };
          }
          return s;
        });
        await onUpdate({ ...biller, schedules: updatedSchedules });
        
        // Only close modal on success
        setShowPayModal(null);
      }
    } catch (error) {
      console.error('[Billers] Failed to update payment:', error);
      alert('Failed to process payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTrigger = (id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Biller',
      message: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      onConfirm: async () => {
        await onDelete?.(id);
        setDetailedBillerId(null);
        setConfirmModal(prev => ({ ...prev, show: false }));
        setActiveDropdownId(null);
      }
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  // Get payment schedule with database status
  const getScheduleWithStatus = (sched: PaymentSchedule, biller: Biller, scheduleIndex: number) => {
    // Try to find matching payment schedule from database
    // First try exact month/year match
    let dbSchedule = paymentSchedules.find(ps => 
      ps.month === sched.month && ps.year === sched.year
    );

    // If no match, try matching by payment_number as fallback
    // This helps when month names don't match exactly
    if (!dbSchedule && scheduleIndex >= 0) {
      dbSchedule = paymentSchedules.find(ps => 
        ps.payment_number === scheduleIndex + 1 && ps.year === sched.year
      );
      if (dbSchedule) {
        console.log('[Billers] Matched schedule by payment_number:', {
          scheduleIndex: scheduleIndex + 1,
          month: dbSchedule.month,
          year: dbSchedule.year
        });
      }
    }

    if (dbSchedule) {
      // Use database status
      console.log('[Billers] Using database status for schedule:', {
        month: sched.month,
        year: sched.year,
        paymentNumber: dbSchedule.payment_number,
        status: dbSchedule.status,
        amountPaid: dbSchedule.amount_paid,
        scheduleId: dbSchedule.id
      });
      return {
        ...sched,
        isPaid: dbSchedule.status === 'paid',
        isPartial: dbSchedule.status === 'partial',
        amountPaid: dbSchedule.amount_paid,
        status: dbSchedule.status,
        scheduleId: dbSchedule.id
      };
    }

    // Fallback to calculated status if no DB schedule
    console.log('[Billers] No DB schedule found for:', {
      month: sched.month,
      year: sched.year,
      scheduleIndex: scheduleIndex + 1,
      availableSchedules: paymentSchedules.map(ps => `${ps.month} ${ps.year} (payment_number: ${ps.payment_number})`).join(', '),
      totalSchedules: paymentSchedules.length
    });
    const isPaidViaSchedule = !!sched.amountPaid;
    const calculatedAmount = getScheduleExpectedAmount(
      biller,
      sched,
      accounts,
      transactions
    ).amount;
    
    const isPaidViaTransaction = checkIfPaidByTransaction(
      biller.name,
      calculatedAmount,
      sched.month,
      sched.year
    );

    return {
      ...sched,
      isPaid: isPaidViaSchedule || isPaidViaTransaction,
      isPartial: false,
      amountPaid: sched.amountPaid || 0,
      status: (isPaidViaSchedule || isPaidViaTransaction) ? 'paid' : 'pending'
    };
  };

  const activeBillers = billers.filter(b => b.status === 'active');
  const inactiveBillers = billers.filter(b => b.status === 'inactive');
  const detailedBiller = billers.find(b => b.id === detailedBillerId);

  const openEditModal = async (biller: Biller) => {
    // Default reactivation date to next month / current year
    const nextMonthDate = new Date();
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const defaultReactMonth = MONTHS[nextMonthDate.getMonth()];
    const defaultReactYear = nextMonthDate.getFullYear().toString();

    setEditFormData({ 
      name: biller.name, 
      category: biller.category, 
      dueDate: biller.dueDate, 
      expectedAmount: biller.expectedAmount.toString(),
      actMonth: biller.activationDate.month,
      actDay: biller.activationDate.day || '',
      actYear: biller.activationDate.year,
      deactMonth: biller.deactivationDate?.month || '',
      deactYear: biller.deactivationDate?.year || '',
      linkedAccountId: biller.linkedAccountId || '', // ENHANCEMENT: Populate linked account field
      reactMonth: defaultReactMonth,
      reactYear: defaultReactYear,
    });

    // Pre-populate scheduled increases from the biller
    setEditScheduledIncreases(
      (biller.scheduledIncreases ?? []).map(inc => {
        // Parse YYYY-MM-DD → month name + year string
        const [yearStr, monthStr] = inc.effectiveDate.split('-');
        const monthIdx = parseInt(monthStr, 10) - 1;
        return {
          effectiveMonth: MONTHS[monthIdx] ?? MONTHS[0],
          effectiveYear: yearStr,
          amount: inc.amount.toString(),
        };
      })
    );

    // Always start collapsed — user can expand to see/add scheduled increases
    setShowEditScheduledSection(false);

    // Show the deactivation date section if the biller already has one
    setShowEditDeactSection(!!(biller.deactivationDate?.month && biller.deactivationDate?.year));

    setShowEditModal(biller);
    setActiveDropdownId(null);
    setTimingFeedback('');

    // Load this biller's payment schedules for orphaning detection
    try {
      const { data } = await getPaymentSchedulesBySource('biller', biller.id);
      setEditBillerSchedules(data || []);
    } catch {
      setEditBillerSchedules([]);
    }
  };

  const renderCategoryOptions = () => {
    // Filter out legacy/inactive categories for new biller creation.
    // A category is considered inactive when active === false AND its deactivatedAt date
    // is in the past (or present) relative to today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeCats = categories.filter(c => {
      if (c.active === false) {
        if (!c.deactivatedAt) return false;
        const deactivationDate = new Date(c.deactivatedAt);
        // Include the deactivation month itself; hide only when today is strictly after it
        const deactivationMonthEnd = new Date(deactivationDate.getFullYear(), deactivationDate.getMonth() + 1, 1);
        return today < deactivationMonthEnd;
      }
      return true;
    });
    return (
      <>
        {activeCats.map(c => (
          <React.Fragment key={c.id}>
            <option value={c.name} className="font-bold">{c.name}</option>
            {c.subcategories.map(sub => (
              <option key={`${c.id}-${sub}`} value={`${c.name} - ${sub}`}>&nbsp;&nbsp;&nbsp;{sub}</option>
            ))}
          </React.Fragment>
        ))}
      </>
    );
  };

  // Calculate expected amount from linked installments or linked credit account for Loans billers
  const getExpectedAmount = (biller: Biller): number => {
    if (biller.category.startsWith('Loans')) {
      // Check linked credit account first — use current month's billing cycle amount
      if (shouldUseLinkedAccount(biller)) {
        const linkedAccount = getLinkedAccount(biller, accounts);
        const hasLinkedAccountTx = linkedAccount
          ? transactions.some(tx => tx.payment_method_id === linkedAccount.id)
          : false;
        if (hasLinkedAccountTx) {
          const today = new Date();
          const currentMonth = today.toLocaleString('en-US', { month: 'long' });
          const currentYear = today.getFullYear().toString();
          const currentSchedule: PaymentSchedule = {
            id: 'display-current',
            month: currentMonth,
            year: currentYear,
            expectedAmount: 0,
          };
          const { amount, isFromLinkedAccount } = getScheduleExpectedAmount(
            biller,
            currentSchedule,
            accounts,
            transactions
          );
          if (isFromLinkedAccount && amount > 0) return amount;
        }
      }

      // Find installments linked to this biller
      const linkedInstallments = installments.filter(inst => inst.billerId === biller.id);
      if (linkedInstallments.length > 0) {
        // Sum up monthly amounts from all linked installments
        const totalMonthly = linkedInstallments.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
        return totalMonthly;
      }
    }
    // Return the biller's expected amount for non-Loans or if no linked installments
    return biller.expectedAmount || 0;
  };

  const renderBillerCard = (biller: Biller) => {
    const displayAmount = getExpectedAmount(biller);
    // ENHANCEMENT: Check if biller has linked account
    const hasLinkedAccount = shouldUseLinkedAccount(biller);
    const linkedAccount = hasLinkedAccount ? getLinkedAccount(biller, accounts) : null;
    
    return (
    <div key={biller.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col h-full group relative overflow-visible">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <div className={`p-3 rounded-2xl flex-shrink-0 ${biller.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
            <Bell className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">{biller.name}</h3>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
               <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 rounded text-gray-500 uppercase">{biller.category}</span>
               <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 rounded text-blue-500">{biller.timing}</span>
               <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${biller.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                 {biller.status === 'active' ? <div className="flex items-center gap-1"><Power className="w-3 h-3" />Active</div> : <div className="flex items-center gap-1"><PowerOff className="w-3 h-3" />Inactive</div>}
               </span>
               {/* ENHANCEMENT: Show linked account indicator */}
               {linkedAccount && (
                 <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 rounded text-purple-600 uppercase">
                   <span role="img" aria-label="Linked">🔗</span> {linkedAccount.bank}
                 </span>
               )}
            </div>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setActiveDropdownId(activeDropdownId === biller.id ? null : biller.id)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <MoreVertical className="w-5 h-5" />
          </button>
          {activeDropdownId === biller.id && (
            <>
              <div className="fixed inset-0 z-[10]" onClick={() => setActiveDropdownId(null)}></div>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[20] animate-in zoom-in-95">
                <button onClick={() => { setDetailedBillerId(biller.id); setActiveDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"><Eye className="w-4 h-4" /><span>View Details</span></button>
                <button onClick={() => openEditModal(biller)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"><Edit2 className="w-4 h-4" /><span>Edit Biller</span></button>
                <div className="border-t border-gray-100 my-1"></div>
                <button onClick={() => handleDeleteTrigger(biller.id, biller.name)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center space-x-2"><Trash2 className="w-4 h-4" /><span>Delete</span></button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2 mb-6 text-xs text-gray-500">
        <div className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-2" />Due every {biller.dueDate}</div>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-400 uppercase">Expected</span><span className="text-lg font-black text-gray-900">{formatCurrency(displayAmount)}</span></div>
        <button onClick={() => setDetailedBillerId(biller.id)} className="bg-gray-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors">Details</button>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading billers from database...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error Loading Billers</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && (
      <>
      {detailedBiller ? (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="flex items-center justify-between">
            <button onClick={() => setDetailedBillerId(null)} className="flex items-center space-x-2 text-gray-500 hover:text-gray-900 group"><ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /><span className="font-medium">Back to Billers</span></button>
            <div className="flex items-center space-x-3">
              <button onClick={() => openEditModal(detailedBiller)} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200"><Edit2 className="w-4 h-4" /><span>Edit</span></button>
              <button onClick={() => handleDeleteTrigger(detailedBiller.id, detailedBiller.name)} className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100"><Trash2 className="w-4 h-4" /><span>Delete</span></button>
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center space-x-6">
                <div className="p-5 bg-indigo-50 text-indigo-600 rounded-3xl"><Bell className="w-10 h-10" /></div>
                <div>
                  <h2 className="text-3xl font-black text-gray-900">{detailedBiller.name}</h2>
                  <div className="flex items-center space-x-3 mt-2">
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-500 uppercase">{detailedBiller.category}</span>
                    <span className="text-sm text-gray-400 font-medium">Due every {detailedBiller.dueDate}</span>
                    {/* ENHANCEMENT: Show linked account info */}
                    {shouldUseLinkedAccount(detailedBiller) && getLinkedAccount(detailedBiller, accounts) && (
                      <span className="px-3 py-1 bg-purple-100 rounded-full text-xs font-bold text-purple-600">
                        <span role="img" aria-label="Linked">🔗</span> Linked to {getLinkedAccount(detailedBiller, accounts)?.bank}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right"><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Expected Amount</p><p className="text-3xl font-black text-indigo-600">{formatCurrency(getExpectedAmount(detailedBiller))}</p></div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-4 text-xs font-bold text-gray-400 uppercase">Month</th><th className="p-4 text-xs font-bold text-gray-400 uppercase">Amount</th><th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">Action</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">{paymentSchedules.length > 0 ? (
                    // PRIMARY: Display database payment schedules directly (source of truth)
                    (() => {
                      console.log('[Billers] Displaying database payment schedules (sorted chronologically)');
                      
                      // Helper function to get month order for sorting
                      const getMonthOrder = (month: string): number => {
                        const monthOrder: { [key: string]: number } = {
                          'January': 1, 'February': 2, 'March': 3, 'April': 4,
                          'May': 5, 'June': 6, 'July': 7, 'August': 8,
                          'September': 9, 'October': 10, 'November': 11, 'December': 12
                        };
                        return monthOrder[month] || 999;
                      };
                      
                      // Sort schedules chronologically
                      const sortedSchedules = [...paymentSchedules].sort((a, b) => {
                        // First sort by year
                        if (a.year !== b.year) {
                          return a.year - b.year;
                        }
                        // Then sort by month
                        return getMonthOrder(a.month) - getMonthOrder(b.month);
                      });
                      
                      return sortedSchedules.map((schedule, idx) => {
                        // Convert database schedule to legacy format for compatibility with existing functions
                        const legacySched: PaymentSchedule = {
                          id: schedule.id,
                          month: schedule.month,
                          year: schedule.year.toString(),
                          expectedAmount: schedule.expected_amount,
                          amountPaid: schedule.amount_paid,
                          receipt: schedule.receipt || undefined,
                          datePaid: schedule.date_paid || undefined,
                          accountId: schedule.account_id || undefined,
                        };
                        
                        // ENHANCEMENT: Calculate amount from linked account if applicable
                        const { amount: calculatedAmount, isFromLinkedAccount } = getScheduleExpectedAmount(
                          detailedBiller,
                          legacySched,
                          accounts,
                          transactions
                        );
                        
                        const isPaid = schedule.status === 'paid';
                        const isPartial = schedule.status === 'partial';
                        
                        // Get actual paid amount
                        let displayAmount = calculatedAmount; // Use calculated amount as base
                        if (isPaid && schedule.amount_paid > 0) {
                          displayAmount = schedule.amount_paid;
                        } else if (!isPaid && !isPartial) {
                          // For unpaid, keep calculated amount
                          displayAmount = calculatedAmount;
                        }
                        
                        // ENHANCEMENT: Get display label with cycle date range if linked account
                        const linkedAccount = shouldUseLinkedAccount(detailedBiller) 
                          ? getLinkedAccount(detailedBiller, accounts) 
                          : null;
                        const displayLabel = getScheduleDisplayLabel(legacySched, linkedAccount);
                        
                        return (
                          <tr key={schedule.id} className={`${
                            isPaid ? 'bg-green-50' : 
                            isPartial ? 'bg-yellow-50' : 
                            'hover:bg-gray-50/50'
                          } transition-colors`}>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{displayLabel}</span>
                                {isFromLinkedAccount && (
                                  <span className="text-[10px] text-purple-600 font-medium mt-1 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600" aria-hidden="true"></span>
                                    From linked account
                                  </span>
                                )}
                                {isPartial && schedule.amount_paid > 0 && (
                                  <span className="text-xs text-gray-500 mt-1">
                                    Paid: {formatCurrency(schedule.amount_paid)} of {formatCurrency(calculatedAmount)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-600">{formatCurrency(displayAmount)}</td>
                            <td className="p-4 text-center">
                              {isPaid ? (
                                <span role="status" className="flex items-center justify-center space-x-2 text-green-600">
                                  <CheckCircle2 className="w-5 h-5" aria-label="Payment completed" title="Paid" />
                                  <button onClick={() => openSchedulePaymentsModal(schedule.id, `${schedule.month} ${schedule.year}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-4 h-4" /></button>
                                </span>
                              ) : isPartial ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="px-3 py-1 bg-yellow-500 text-white rounded-lg font-bold text-xs">
                                      Partial
                                    </span>
                                    <button onClick={() => openSchedulePaymentsModal(schedule.id, `${schedule.month} ${schedule.year}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-4 h-4" /></button>
                                  </div>
                                  <button 
                                    onClick={() => { 
                                      setShowPayModal({ biller: detailedBiller, schedule: legacySched, expectedAmount: calculatedAmount }); 
                                      setPayFormData({ ...payFormData, amount: (calculatedAmount - schedule.amount_paid).toFixed(2), receipt: '' }); 
                                    }} 
                                    className="bg-indigo-600 text-white px-4 py-1 rounded-lg font-bold hover:bg-indigo-700 text-xs transition-all"
                                  >
                                    Pay Remaining
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => { 
                                    setShowPayModal({ biller: detailedBiller, schedule: legacySched, expectedAmount: calculatedAmount }); 
                                    setPayFormData({ ...payFormData, amount: displayAmount.toString(), receipt: '' }); 
                                  }} 
                                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 text-xs transition-all"
                                >
                                  Pay
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()
                  ) : (
                    // FALLBACK: Use legacy schedules array for backward compatibility
                    (() => {
                      console.log('[Billers] No payment schedules in database, using legacy schedules array (fallback)');
                      return detailedBiller.schedules.map((sched, idx) => {
                        // Get schedule with database status
                        const schedWithStatus = getScheduleWithStatus(sched, detailedBiller, idx);
                        
                        // ENHANCEMENT: Calculate amount from linked account if applicable
                        const { amount: calculatedAmount, isFromLinkedAccount } = getScheduleExpectedAmount(
                          detailedBiller,
                          sched,
                          accounts,
                          transactions
                        );
                        
                        const isPaid = schedWithStatus.isPaid;
                        const isPartial = schedWithStatus.isPartial;
                        
                        // Get actual paid amount
                        let displayAmount = calculatedAmount; // Use calculated amount as base
                        if (isPaid && schedWithStatus.amountPaid > 0) {
                          displayAmount = schedWithStatus.amountPaid;
                        } else if (!isPaid && !isPartial) {
                          // For unpaid, keep calculated amount
                          displayAmount = calculatedAmount;
                        }
                        
                        // ENHANCEMENT: Get display label with cycle date range if linked account
                        const linkedAccount = shouldUseLinkedAccount(detailedBiller) 
                          ? getLinkedAccount(detailedBiller, accounts) 
                          : null;
                        const displayLabel = getScheduleDisplayLabel(sched, linkedAccount);
                        
                        return (
                          <tr key={idx} className={`${
                            isPaid ? 'bg-green-50' : 
                            isPartial ? 'bg-yellow-50' : 
                            'hover:bg-gray-50/50'
                          } transition-colors`}>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{displayLabel}</span>
                                {isFromLinkedAccount && (
                                  <span className="text-[10px] text-purple-600 font-medium mt-1 flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600" aria-hidden="true"></span>
                                    From linked account
                                  </span>
                                )}
                                {isPartial && schedWithStatus.amountPaid > 0 && (
                                  <span className="text-xs text-gray-500 mt-1">
                                    Paid: {formatCurrency(schedWithStatus.amountPaid)} of {formatCurrency(calculatedAmount)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 font-medium text-gray-600">{formatCurrency(displayAmount)}</td>
                            <td className="p-4 text-center">
                              {isPaid ? (
                                <span role="status" className="flex items-center justify-center space-x-2 text-green-600">
                                  <CheckCircle2 className="w-5 h-5" aria-label="Payment completed" title="Paid" />
                                  {sched.id && <button onClick={() => openSchedulePaymentsModal(sched.id!, `${sched.month} ${sched.year}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-4 h-4" /></button>}
                                </span>
                              ) : isPartial ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="px-3 py-1 bg-yellow-500 text-white rounded-lg font-bold text-xs">
                                      Partial
                                    </span>
                                    {sched.id && <button onClick={() => openSchedulePaymentsModal(sched.id!, `${sched.month} ${sched.year}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-4 h-4" /></button>}
                                  </div>
                                  <button 
                                    onClick={() => { 
                                      setShowPayModal({ biller: detailedBiller, schedule: sched, expectedAmount: calculatedAmount }); 
                                      setPayFormData({ ...payFormData, amount: (calculatedAmount - schedWithStatus.amountPaid).toFixed(2), receipt: '' }); 
                                    }} 
                                    className="bg-indigo-600 text-white px-4 py-1 rounded-lg font-bold hover:bg-indigo-700 text-xs transition-all"
                                  >
                                    Pay Remaining
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => { 
                                    setShowPayModal({ biller: detailedBiller, schedule: sched, expectedAmount: calculatedAmount }); 
                                    setPayFormData({ ...payFormData, amount: displayAmount.toString(), receipt: '' }); 
                                  }} 
                                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 text-xs transition-all"
                                >
                                  Pay
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()
                  )}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1"><h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">BILLERS</h2><p className="text-gray-500 text-sm">Manage recurring bills and payment schedules</p></div>
            <button onClick={() => { setShowAddModal(true); setTimingFeedback(''); }} className="flex items-center justify-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg"><Plus className="w-5 h-5" /><span>Add Billers</span></button>
          </div>

          {/* Active Billers Section */}
          {activeBillers.length > 0 && (
            <div className="mb-8">
              <button 
                onClick={() => setIsActiveOpen(!isActiveOpen)}
                className="flex items-center space-x-2 mb-4 text-gray-700 hover:text-gray-900 font-bold text-lg"
              >
                {isActiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <span>Active Billers ({activeBillers.length})</span>
              </button>
              {isActiveOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeBillers.map(renderBillerCard)}
                </div>
              )}
            </div>
          )}

          {/* Inactive Billers Section */}
          {inactiveBillers.length > 0 && (
            <div>
              <button 
                onClick={() => setIsInactiveOpen(!isInactiveOpen)}
                className="flex items-center space-x-2 mb-4 text-gray-700 hover:text-gray-900 font-bold text-lg"
              >
                {isInactiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <span>Inactive Billers ({inactiveBillers.length})</span>
              </button>
              {isInactiveOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inactiveBillers.map(renderBillerCard)}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {activeBillers.length === 0 && inactiveBillers.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
                <Bell className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Billers Yet</h3>
              <p className="text-gray-500 mb-6">Get started by adding your first recurring bill</p>
              <button 
                onClick={() => { setShowAddModal(true); setTimingFeedback(''); }} 
                className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg"
              >
                <Plus className="w-5 h-5" />
                <span>Add Your First Biller</span>
              </button>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-8 uppercase tracking-tight">New Biller</h2>
            <form onSubmit={handleAddSubmit} className="space-y-6">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select value={addFormData.category} onChange={(e) => setAddFormData({ ...addFormData, category: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{renderCategoryOptions()}</select>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Biller Name</label><input required type="text" value={addFormData.name} onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Expected Amount {addFormData.category.startsWith('Loans') && <span className="text-gray-400 font-normal">(Optional for Loans)</span>}
                   </label>
                   <input required={!addFormData.category.startsWith('Loans')} type="number" min="0" step="0.01" value={addFormData.expectedAmount} onChange={(e) => setAddFormData({ ...addFormData, expectedAmount: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Due Date (day)
                     {addFormData.category.startsWith('Loans') && addFormData.linkedAccountId && (
                       <span className="ml-2 text-purple-500 font-bold normal-case">🔗 Auto</span>
                     )}
                   </label>
                   {addFormData.category.startsWith('Loans') && addFormData.linkedAccountId ? (
                     (() => {
                       const linkedAcc = accounts.find(a => a.id === addFormData.linkedAccountId);
                       const today = new Date();
                       const dueDay = linkedAcc ? getDueDayForMonth(linkedAcc, today.getMonth(), today.getFullYear()) : null;
                       const statementDay = linkedAcc?.billingDate ? new Date(linkedAcc.billingDate).getDate() : null;
                       const daysToPay = linkedAcc?.dueDate ? new Date(linkedAcc.dueDate).getDate() : null;
                       return (
                         <>
                           <input
                             type="number"
                             readOnly
                             value={dueDay ?? ''}
                             className="w-full bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 outline-none font-bold text-purple-700 cursor-not-allowed"
                           />
                           {dueDay && statementDay && daysToPay && (
                             <p className="text-xs text-purple-600 mt-1">
                               📅 Statement {statementDay}{ordinalSuffix(statementDay)} + {daysToPay} days → Due {dueDay}{ordinalSuffix(dueDay)}
                             </p>
                           )}
                         </>
                       );
                     })()
                   ) : (
                     <input required type="number" min="1" max="31" placeholder="e.g. 15" value={addFormData.dueDate} onChange={(e) => { setAddFormData({ ...addFormData, dueDate: e.target.value }); showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                   )}
                 </div>
              </div>
              
              {/* ENHANCEMENT: Linked Account for Loans Category */}
              {addFormData.category.startsWith('Loans') && (
                <div className="bg-purple-50 rounded-2xl p-4 border-2 border-purple-200">
                  <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest mb-2">
                    Linked Credit Account (Optional)
                  </label>
                  <select 
                    value={addFormData.linkedAccountId} 
                    onChange={(e) => setAddFormData({ ...addFormData, linkedAccountId: e.target.value })} 
                    className="w-full bg-white border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    <option value="">None - Use Manual Amount</option>
                    {accounts
                      .filter(acc => acc.type === 'Credit' && acc.billingDate)
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bank} (Billing Day: {new Date(acc.billingDate).getDate()})
                        </option>
                      ))
                    }
                  </select>
                  {(() => {
                    const creditAccounts = accounts.filter(acc => acc.type === 'Credit');
                    const creditAccountsWithBilling = creditAccounts.filter(acc => acc.billingDate);
                    
                    if (creditAccounts.length === 0) {
                      return (
                        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                          <span className="font-bold">⚠️ No credit accounts found.</span> Create a credit account first to enable linking.
                        </p>
                      );
                    } else if (creditAccountsWithBilling.length === 0) {
                      return (
                        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                          <span className="font-bold">⚠️ No credit accounts with billing dates.</span> Edit your credit accounts to add billing dates.
                        </p>
                      );
                    } else {
                      return (
                        <p className="text-xs text-purple-600 mt-2">
                          Link to a credit account to automatically calculate expected amounts from billing cycle transactions
                        </p>
                      );
                    }
                  })()}
                </div>
              )}
              
              <div className="border-t border-gray-200 pt-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Activation Date</label>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                    <select value={addFormData.actMonth} onChange={(e) => setAddFormData({ ...addFormData, actMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Day (optional)</label><input type="number" min="1" max="31" placeholder="e.g. 15" value={addFormData.actDay} onChange={(e) => { setAddFormData({ ...addFormData, actDay: e.target.value }); if (!addFormData.dueDate) showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input required type="number" min="2000" max="2100" value={addFormData.actYear} onChange={(e) => setAddFormData({ ...addFormData, actYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                </div>
              </div>

              {/* Computed fields display */}
              <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Timing:</span>
                  <span className="text-sm font-black text-indigo-600">{calculateTiming(addFormData.dueDate || addFormData.actDay)}</span>
                </div>
                {(() => {
                  const deactDate = (addFormData.deactMonth && addFormData.deactYear)
                    ? { month: addFormData.deactMonth, year: addFormData.deactYear }
                    : undefined;
                  const computedStatus = calculateStatus(deactDate);
                  return (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Status:</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${computedStatus === 'inactive' ? 'text-gray-600' : 'text-green-600'}`}>{computedStatus}</span>
                        {deactDate && computedStatus === 'active' && (
                          <span className="text-xs text-orange-500 font-medium">— deactivates {deactDate.month} {deactDate.year}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="border-t border-gray-200 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (showAddDeactSection) {
                      // Collapse and clear fields
                      setAddFormData({ ...addFormData, deactMonth: '', deactYear: '' });
                    }
                    setShowAddDeactSection(!showAddDeactSection);
                  }}
                  className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 hover:text-gray-600"
                >
                  {showAddDeactSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Deactivation Date (optional)
                </button>
                {showAddDeactSection && (
                  <>
                    <p className="text-xs text-gray-400 mb-4">Biller deactivates at the start of this month — last payment is the month before.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                        <select value={addFormData.deactMonth} onChange={(e) => setAddFormData({ ...addFormData, deactMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                          <option value="">None</option>
                          {MONTHS.map(m => {
                            const deactYearNum = parseInt(addFormData.deactYear);
                            const actYearNum = parseInt(addFormData.actYear);
                            const sameYear = !isNaN(deactYearNum) && !isNaN(actYearNum) && deactYearNum === actYearNum;
                            const actMonthIdx = MONTHS.indexOf(addFormData.actMonth);
                            const mIdx = MONTHS.indexOf(m);
                            // Disable months on or before activation month when deact year == act year
                            const isDisabled = sameYear && mIdx <= actMonthIdx;
                            return <option key={m} value={m} disabled={isDisabled} className={isDisabled ? 'text-gray-300' : ''}>{m}</option>;
                          })}
                        </select>
                      </div>
                      <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input type="number" min="2000" max="2100" placeholder="e.g. 2026" value={addFormData.deactYear} onChange={(e) => {
                        const newDeactYear = e.target.value;
                        const deactYearNum = parseInt(newDeactYear);
                        const actYearNum = parseInt(addFormData.actYear);
                        const actMonthIdx = MONTHS.indexOf(addFormData.actMonth);
                        const deactMonthIdx = MONTHS.indexOf(addFormData.deactMonth);
                        // Clear deactMonth if it becomes invalid (same year and deact month <= act month)
                        const shouldClear = !isNaN(deactYearNum) && !isNaN(actYearNum) && deactYearNum === actYearNum && deactMonthIdx !== -1 && deactMonthIdx <= actMonthIdx;
                        setAddFormData({ ...addFormData, deactYear: newDeactYear, deactMonth: shouldClear ? '' : addFormData.deactMonth });
                      }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                    </div>
                  </>
                )}
              </div>

              {/* Scheduled Increases — eligible categories only (Fixed, Utilities, Subscriptions) */}
              {categorySupportsScheduledIncreases(addFormData.category) && (
                <div className="border-t border-gray-200 pt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddScheduledSection(!showAddScheduledSection)}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 hover:text-gray-600"
                  >
                    {showAddScheduledSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Scheduled Increases (optional)
                  </button>
                  {!showAddScheduledSection && (
                    <span className="text-xs text-gray-400">Set future months when the amount changes.</span>
                  )}
                  {showAddScheduledSection && (
                    <div className="mt-4">
                      <div className="flex justify-end mb-3">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Date();
                            next.setMonth(next.getMonth() + 1);
                            setAddScheduledIncreases([
                              ...addScheduledIncreases,
                              {
                                effectiveMonth: MONTHS[next.getMonth()],
                                effectiveYear: next.getFullYear().toString(),
                                amount: '',
                              },
                            ]);
                          }}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>
                      {addScheduledIncreases.map((inc, idx) => (
                        <div key={idx} className="flex gap-3 mb-3 items-end">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-400 mb-1">Month</label>
                            <select
                              value={inc.effectiveMonth}
                              onChange={(e) => {
                                const updated = [...addScheduledIncreases];
                                updated[idx] = { ...updated[idx], effectiveMonth: e.target.value };
                                setAddScheduledIncreases(updated);
                              }}
                              className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm appearance-none"
                            >
                              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="w-24">
                            <label className="block text-[10px] font-bold text-gray-400 mb-1">Year</label>
                            <input
                              type="number"
                              min="2000"
                              max="2100"
                              value={inc.effectiveYear}
                              onChange={(e) => {
                                const updated = [...addScheduledIncreases];
                                updated[idx] = { ...updated[idx], effectiveYear: e.target.value };
                                setAddScheduledIncreases(updated);
                              }}
                              className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-400 mb-1">New Amount</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={inc.amount}
                              onChange={(e) => {
                                const updated = [...addScheduledIncreases];
                                updated[idx] = { ...updated[idx], amount: e.target.value };
                                setAddScheduledIncreases(updated);
                              }}
                              className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setAddScheduledIncreases(addScheduledIncreases.filter((_, i) => i !== idx))}
                            className="p-3 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50"
                            aria-label="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {timingFeedback && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <p className="text-xs font-medium text-blue-700">{timingFeedback}</p>
                </div>
              )}

              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => { setShowAddModal(false); setTimingFeedback(''); }} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-xl">Add Biller</button></div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-8 uppercase tracking-tight">Edit Biller</h2>
            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select value={editFormData.category} onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{renderCategoryOptions()}</select>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Biller Name</label><input required type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Expected Amount {editFormData.category.startsWith('Loans') && <span className="text-gray-400 font-normal">(Optional for Loans)</span>}
                   </label>
                   <input required={!editFormData.category.startsWith('Loans')} type="number" min="0" step="0.01" value={editFormData.expectedAmount} onChange={(e) => setEditFormData({ ...editFormData, expectedAmount: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                 </div>
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Due Date (day)
                     {editFormData.category.startsWith('Loans') && editFormData.linkedAccountId && (
                       <span className="ml-2 text-purple-500 font-bold normal-case">🔗 Auto</span>
                     )}
                   </label>
                   {editFormData.category.startsWith('Loans') && editFormData.linkedAccountId ? (
                     (() => {
                       const linkedAcc = accounts.find(a => a.id === editFormData.linkedAccountId);
                       const today = new Date();
                       const dueDay = linkedAcc ? getDueDayForMonth(linkedAcc, today.getMonth(), today.getFullYear()) : null;
                       const statementDay = linkedAcc?.billingDate ? new Date(linkedAcc.billingDate).getDate() : null;
                       const daysToPay = linkedAcc?.dueDate ? new Date(linkedAcc.dueDate).getDate() : null;
                       return (
                         <>
                           <input
                             type="number"
                             readOnly
                             value={dueDay ?? ''}
                             className="w-full bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 outline-none font-bold text-purple-700 cursor-not-allowed"
                           />
                           {dueDay && statementDay && daysToPay && (
                             <p className="text-xs text-purple-600 mt-1">
                               📅 Statement {statementDay}{ordinalSuffix(statementDay)} + {daysToPay} days → Due {dueDay}{ordinalSuffix(dueDay)}
                             </p>
                           )}
                         </>
                       );
                     })()
                   ) : (
                     <input required type="number" min="1" max="31" placeholder="e.g. 15" value={editFormData.dueDate} onChange={(e) => { setEditFormData({ ...editFormData, dueDate: e.target.value }); showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                   )}
                 </div>
              </div>
              
              {/* ENHANCEMENT: Linked Account for Loans Category */}
              {editFormData.category.startsWith('Loans') && (
                <div className="bg-purple-50 rounded-2xl p-4 border-2 border-purple-200">
                  <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest mb-2">
                    Linked Credit Account (Optional)
                  </label>
                  <select 
                    value={editFormData.linkedAccountId} 
                    onChange={(e) => setEditFormData({ ...editFormData, linkedAccountId: e.target.value })} 
                    className="w-full bg-white border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    <option value="">None - Use Manual Amount</option>
                    {accounts
                      .filter(acc => acc.type === 'Credit' && acc.billingDate)
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bank} (Billing Day: {new Date(acc.billingDate).getDate()})
                        </option>
                      ))
                    }
                  </select>
                  {(() => {
                    const creditAccounts = accounts.filter(acc => acc.type === 'Credit');
                    const creditAccountsWithBilling = creditAccounts.filter(acc => acc.billingDate);
                    
                    if (creditAccounts.length === 0) {
                      return (
                        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                          <span className="font-bold">⚠️ No credit accounts found.</span> Create a credit account first to enable linking.
                        </p>
                      );
                    } else if (creditAccountsWithBilling.length === 0) {
                      return (
                        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                          <span className="font-bold">⚠️ No credit accounts with billing dates.</span> Edit your credit accounts to add billing dates.
                        </p>
                      );
                    } else {
                      return (
                        <p className="text-xs text-purple-600 mt-2">
                          Link to a credit account to automatically calculate expected amounts from billing cycle transactions
                        </p>
                      );
                    }
                  })()}
                </div>
              )}
              
              {/* Date fields: show Reactivation Date for inactive billers, Activation+Deactivation for active */}
              {showEditModal?.status === 'inactive' ? (
                <div className="border-t border-gray-200 pt-6">
                  <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Reactivation Date</label>
                  <p className="text-xs text-gray-500 mb-4">New payment schedules will be created from this month. Existing payment history will be preserved.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                      <select required value={editFormData.reactMonth} onChange={(e) => setEditFormData({ ...editFormData, reactMonth: e.target.value })} className="w-full bg-indigo-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label>
                      <input required type="number" min="2000" max="2100" value={editFormData.reactYear} onChange={(e) => setEditFormData({ ...editFormData, reactYear: e.target.value })} className="w-full bg-indigo-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-t border-gray-200 pt-6">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Activation Date</label>
                    <div className="grid grid-cols-3 gap-4">
                      <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                        <select value={editFormData.actMonth} onChange={(e) => setEditFormData({ ...editFormData, actMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                      </div>
                      <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Day (optional)</label><input type="number" min="1" max="31" placeholder="e.g. 15" value={editFormData.actDay} onChange={(e) => { setEditFormData({ ...editFormData, actDay: e.target.value }); if (!editFormData.dueDate) showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                      <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input required type="number" min="2000" max="2100" value={editFormData.actYear} onChange={(e) => setEditFormData({ ...editFormData, actYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                    </div>
                  </div>

                  {/* Computed fields display */}
                  <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Timing:</span>
                      <span className="text-sm font-black text-indigo-600">{calculateTiming(editFormData.dueDate || editFormData.actDay)}</span>
                    </div>
                    {(() => {
                      const deactDate = (editFormData.deactMonth && editFormData.deactYear)
                        ? { month: editFormData.deactMonth, year: editFormData.deactYear }
                        : undefined;
                      const computedStatus = calculateStatus(deactDate);
                      return (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Status:</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black ${computedStatus === 'inactive' ? 'text-gray-600' : 'text-green-600'}`}>{computedStatus}</span>
                            {deactDate && computedStatus === 'active' && (
                              <span className="text-xs text-orange-500 font-medium">— deactivates {deactDate.month} {deactDate.year}</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        if (showEditDeactSection) {
                          // Collapse and clear fields
                          setEditFormData({ ...editFormData, deactMonth: '', deactYear: '' });
                        }
                        setShowEditDeactSection(!showEditDeactSection);
                      }}
                      className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 hover:text-gray-600"
                    >
                      {showEditDeactSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Deactivation Date (optional)
                    </button>
                    {showEditDeactSection && (
                      <>
                        <p className="text-xs text-gray-400 mb-4">Biller deactivates at the start of this month — last payment is the month before.</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                            <select value={editFormData.deactMonth} onChange={(e) => setEditFormData({ ...editFormData, deactMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                              <option value="">None</option>
                              {MONTHS.map(m => {
                                const deactYearNum = parseInt(editFormData.deactYear);
                                const actYearNum = parseInt(editFormData.actYear);
                                const sameYear = !isNaN(deactYearNum) && !isNaN(actYearNum) && deactYearNum === actYearNum;
                                const actMonthIdx = MONTHS.indexOf(editFormData.actMonth);
                                const mIdx = MONTHS.indexOf(m);
                                const isDisabled = sameYear && mIdx <= actMonthIdx;
                                return <option key={m} value={m} disabled={isDisabled} className={isDisabled ? 'text-gray-300' : ''}>{m}</option>;
                              })}
                            </select>
                          </div>
                          <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input type="number" min="2000" max="2100" placeholder="e.g. 2026" value={editFormData.deactYear} onChange={(e) => {
                            const newDeactYear = e.target.value;
                            const deactYearNum = parseInt(newDeactYear);
                            const actYearNum = parseInt(editFormData.actYear);
                            const actMonthIdx = MONTHS.indexOf(editFormData.actMonth);
                            const deactMonthIdx = MONTHS.indexOf(editFormData.deactMonth);
                            const shouldClear = !isNaN(deactYearNum) && !isNaN(actYearNum) && deactYearNum === actYearNum && deactMonthIdx !== -1 && deactMonthIdx <= actMonthIdx;
                            setEditFormData({ ...editFormData, deactYear: newDeactYear, deactMonth: shouldClear ? '' : editFormData.deactMonth });
                          }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Scheduled Increases — eligible categories only (Fixed, Utilities, Subscriptions) */}
                  {categorySupportsScheduledIncreases(editFormData.category) && (
                    <div className="border-t border-gray-200 pt-6">
                      <button
                        type="button"
                        onClick={() => setShowEditScheduledSection(!showEditScheduledSection)}
                        className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 hover:text-gray-600"
                      >
                        {showEditScheduledSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Scheduled Increases (optional)
                      </button>
                      {!showEditScheduledSection && (
                        <span className="text-xs text-gray-400">Set future months when the amount changes.</span>
                      )}
                      {showEditScheduledSection && (
                        <div className="mt-4">
                          <div className="flex justify-end mb-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = new Date();
                                next.setMonth(next.getMonth() + 1);
                                setEditScheduledIncreases([
                                  ...editScheduledIncreases,
                                  {
                                    effectiveMonth: MONTHS[next.getMonth()],
                                    effectiveYear: next.getFullYear().toString(),
                                    amount: '',
                                  },
                                ]);
                              }}
                              className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                          {editScheduledIncreases.map((inc, idx) => {
                            const elapsed = isIncreaseElapsed(inc.effectiveMonth, inc.effectiveYear);
                            return (
                              <div key={idx} className="flex gap-3 mb-3 items-end">
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Month</label>
                                  <select
                                    value={inc.effectiveMonth}
                                    onChange={(e) => {
                                      const updated = [...editScheduledIncreases];
                                      updated[idx] = { ...updated[idx], effectiveMonth: e.target.value };
                                      setEditScheduledIncreases(updated);
                                    }}
                                    className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm appearance-none"
                                  >
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div className="w-24">
                                  <label className="block text-[10px] font-bold text-gray-400 mb-1">Year</label>
                                  <input
                                    type="number"
                                    min="2000"
                                    max="2100"
                                    value={inc.effectiveYear}
                                    onChange={(e) => {
                                      const updated = [...editScheduledIncreases];
                                      updated[idx] = { ...updated[idx], effectiveYear: e.target.value };
                                      setEditScheduledIncreases(updated);
                                    }}
                                    className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-[10px] font-bold text-gray-400 mb-1">New Amount</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={inc.amount}
                                    onChange={(e) => {
                                      const updated = [...editScheduledIncreases];
                                      updated[idx] = { ...updated[idx], amount: e.target.value };
                                      setEditScheduledIncreases(updated);
                                    }}
                                    className="w-full bg-gray-50 border-transparent rounded-2xl p-3 outline-none font-bold text-sm"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={elapsed}
                                  onClick={() => !elapsed && setEditScheduledIncreases(editScheduledIncreases.filter((_, i) => i !== idx))}
                                  className={`p-3 rounded-xl ${elapsed ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                                  aria-label="Remove"
                                  title={elapsed ? 'Cannot remove a past or current month increase' : 'Remove'}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Computed fields display — inactive biller only (reactivation preview) */}
              {showEditModal?.status === 'inactive' && (
                <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Timing:</span>
                    <span className="text-sm font-black text-indigo-600">{calculateTiming(editFormData.dueDate || editFormData.actDay)}</span>
                  </div>
                  {(() => {
                    const reactDate = {
                      month: editFormData.reactMonth || editFormData.actMonth,
                      year: editFormData.reactYear || editFormData.actYear,
                    };
                    const computedStatus = calculateStatusFromActivation(reactDate);
                    return (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">After Reactivation:</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black ${computedStatus === 'inactive' ? 'text-gray-600' : 'text-green-600'}`}>{computedStatus}</span>
                          {computedStatus === 'inactive' && (
                            <span className="text-xs text-orange-500 font-medium">— activates {reactDate.month} {reactDate.year}</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {timingFeedback && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <p className="text-xs font-medium text-blue-700">{timingFeedback}</p>
                </div>
              )}

              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => { setShowEditModal(null); setTimingFeedback(''); }} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-xl disabled:opacity-60">{showEditModal?.status === 'inactive' ? 'Reactivate Biller' : 'Update Biller'}</button></div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowPayModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Pay {showPayModal.biller.name}</h2>
            <form onSubmit={handlePaySubmit} className="space-y-6 pt-4">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Paid</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span><input required type="number" value={payFormData.amount} onChange={(e) => setPayFormData(prev => ({...prev, amount: e.target.value}))} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500" /></div></div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receipt Upload</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0] || null; setPayReceiptFile(f); setPayFormData(prev => ({...prev, receipt: f?.name || ''})); }} />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label><input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData(prev => ({...prev, datePaid: e.target.value}))} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label><select value={payFormData.accountId} onChange={(e) => setPayFormData(prev => ({...prev, accountId: e.target.value}))} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}</select></div>
              </div>
              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl">Submit Payment</button></div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}

      {/* Schedule Payments Modal */}
      {schedulePaymentsModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSchedulePaymentsModal(null)}>
          <div className="w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSchedulePaymentsModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close"><X className="w-5 h-5" /></button>
            <h2 className="text-2xl font-black text-gray-900 mb-1">Payment Records</h2>
            <p className="text-gray-500 text-sm mb-6">{schedulePaymentsModal.label}</p>
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
                    <div key={tx.id} className="bg-gray-50 rounded-2xl p-4 space-y-2">
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
                          onClick={() => { setEditingScheduleTx(tx); setEditScheduleTxForm({ name: tx.name, amount: Math.abs(tx.amount).toString(), date: tx.date.split('T')[0] }); }}
                          className="ml-3 mt-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteBillerScheduleTx(tx.id)}
                          title="Delete payment record"
                          className="ml-1 mt-1 text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {tx.receiptUrl && (
                        <div className="flex items-center space-x-3 pt-1">
                          {signedUrl ? (
                            <>
                              <img src={signedUrl} alt="Receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              <button onClick={() => { setZoom(0.5); setPreviewReceiptUrl(signedUrl); }} title="Preview receipt" className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold">
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
          <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditingScheduleTx(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close"><X className="w-6 h-6 text-gray-400" /></button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Edit Transaction</h2>
            <p className="text-gray-500 text-sm mb-8">Update the transaction details below</p>
            <form onSubmit={handleEditBillerScheduleTxSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
                <input
                  value={editScheduleTxForm.name}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editScheduleTxForm.amount}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, amount: e.target.value }))}
                  required
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input
                  type="date"
                  value={editScheduleTxForm.date}
                  onChange={e => setEditScheduleTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingScheduleTx(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors" disabled={isEditingScheduleTx}>Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50" disabled={isEditingScheduleTx}>{isEditingScheduleTx ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setPreviewReceiptUrl(null)}>
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
      </>
      )}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6"><AlertTriangle className="w-8 h-8" /></div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3"><button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700">Proceed</button><button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200">Cancel</button></div>
    </div>
  </div>
);

export default Billers;