
import React, { useState, useEffect, useCallback } from 'react';
import { Biller, BillerAmountIncrease, Account, PaymentSchedule, BudgetCategory, Installment } from '../types';
import { Plus, Calendar, Receipt, ChevronDown, ChevronRight, Upload, CheckCircle2, X, ArrowLeft, Power, PowerOff, MoreVertical, Edit2, Eye, Trash2, AlertTriangle, Info, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { PageHeader } from '../src/components/PageHeader';
import { getAllTransactions, getTransactionsByPaymentSchedule, getReceiptSignedUrl, updateTransaction, updateTransactionAndSyncSchedule, deleteTransactionAndRevertSchedule } from '../src/services/transactionsService';
import { getPaymentSchedulesBySource } from '../src/services/paymentSchedulesService';
import { combineDateWithCurrentTime, getTodayIso } from '../src/utils/dateUtils';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule } from '../src/types/supabase';
import { getScheduleExpectedAmount, getScheduleDisplayLabel, shouldUseLinkedAccount, getLinkedAccount } from '../src/utils/linkedAccountUtils';
import { getDueDayForMonth, ordinalSuffix } from '../src/utils/billingCycles';
import { generateScheduleId } from '../src/utils/billersAdapter';
import { useTheme } from '../src/contexts/ThemeContext';

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
    scheduleId?: string;
    expectedAmount?: number;
  }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TRANSACTION_AMOUNT_TOLERANCE = 1;
const TRANSACTION_MIN_NAME_LENGTH = 3;

const calculateTiming = (dayString: string): '1/2' | '2/2' => {
  const day = parseInt(dayString);
  if (isNaN(day) || day < 1 || day > 31) return '1/2';
  return (day >= 1 && day <= 21) ? '1/2' : '2/2';
};

const SCHEDULED_INCREASE_CATEGORY_PREFIXES = ['Fixed', 'Utilities', 'Subscriptions'];
const categorySupportsScheduledIncreases = (category: string): boolean =>
  SCHEDULED_INCREASE_CATEGORY_PREFIXES.some(prefix => category.startsWith(prefix));

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

const calculateStatusFromActivation = (activationDate: { month: string; year: string }): 'active' | 'inactive' => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const actYear = parseInt(activationDate.year);
  const actMonthIdx = MONTHS.indexOf(activationDate.month);
  if (isNaN(actYear) || actMonthIdx === -1) return 'inactive';
  if (actYear < currentYear || (actYear === currentYear && actMonthIdx <= currentMonth)) {
    return 'active';
  }
  return 'inactive';
};

const calculateStatus = (deactivationDate?: { month: string; year: string }): 'active' | 'inactive' => {
  if (!deactivationDate) return 'active';
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const deactYear = parseInt(deactivationDate.year);
  const deactMonth = MONTHS.indexOf(deactivationDate.month);
  if (isNaN(deactYear) || deactMonth === -1) return 'active';
  if (currentYear > deactYear || (currentYear === deactYear && currentMonth >= deactMonth)) {
    return 'inactive';
  }
  return 'active';
};

const Billers: React.FC<BillersProps> = ({ billers, installments = [], onAdd, accounts, categories, onUpdate, onDelete, onPayBiller, loading = false, error = null }) => {
  const { getAccentClasses } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Biller | null>(null);
  const [showPayModal, setShowPayModal] = useState<{ biller: Biller, schedule: PaymentSchedule, expectedAmount?: number } | null>(null);
  const [detailedBillerId, setDetailedBillerId] = useState<string | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isInactiveOpen, setIsInactiveOpen] = useState(false);
  const [isActiveOpen, setIsActiveOpen] = useState(true);
  const [timingFeedback, setTimingFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddDeactSection, setShowAddDeactSection] = useState(false);
  const [showEditDeactSection, setShowEditDeactSection] = useState(false);
  const [showAddScheduledSection, setShowAddScheduledSection] = useState(false);
  const [showEditScheduledSection, setShowEditScheduledSection] = useState(false);
  const [addScheduledIncreases, setAddScheduledIncreases] = useState<{ effectiveMonth: string; effectiveYear: string; amount: string }[]>([]);
  const [editScheduledIncreases, setEditScheduledIncreases] = useState<{ effectiveMonth: string; effectiveYear: string; amount: string }[]>([]);
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [editBillerSchedules, setEditBillerSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void; }>({ show: false, title: '', message: '', onConfirm: () => {}, });
  const [addFormData, setAddFormData] = useState({ name: '', category: categories[0]?.name || '', dueDate: '', expectedAmount: '', actMonth: MONTHS[(new Date().getMonth() + 1) % 12], actDay: '', actYear: new Date().getFullYear().toString(), deactMonth: '', deactYear: '', linkedAccountId: '' });
  const [editFormData, setEditFormData] = useState({ name: '', category: '', dueDate: '', expectedAmount: '', actMonth: '', actDay: '', actYear: '', deactMonth: '', deactYear: '', linkedAccountId: '', reactMonth: '', reactYear: '' });
  const [payFormData, setPayFormData] = useState({ amount: '', receipt: '', datePaid: getTodayIso(), accountId: accounts[0]?.id || '' });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);
  type BillerScheduleTx = { id: string; name: string; amount: number; date: string; paymentMethodId: string; receiptUrl?: string | null };
  const [schedulePaymentsModal, setSchedulePaymentsModal] = useState<{ label: string; scheduleId: string; transactions: BillerScheduleTx[] } | null>(null);
  const [loadingScheduleTx, setLoadingScheduleTx] = useState(false);
  const [scheduleSignedUrls, setScheduleSignedUrls] = useState<Record<string, string | null>>({});
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [editingScheduleTx, setEditingScheduleTx] = useState<BillerScheduleTx | null>(null);
  const [editScheduleTxForm, setEditScheduleTxForm] = useState({ name: '', amount: '', date: '' });
  const [isEditingScheduleTx, setIsEditingScheduleTx] = useState(false);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const { data, error } = await getAllTransactions();
        if (error) console.error('[Billers] Failed to load transactions:', error);
        else if (data) {
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          const recentTransactions = data.filter(tx => new Date(tx.date) >= twoYearsAgo);
          setTransactions(recentTransactions);
        }
      } catch (error) {
        console.error('[Billers] Error loading transactions:', error);
      }
    };
    loadTransactions();
  }, []);

  const loadPaymentSchedules = useCallback(async () => {
    if (detailedBillerId) {
      setLoadingSchedules(true);
      try {
        const { data, error } = await getPaymentSchedulesBySource('biller', detailedBillerId);
        if (error) {
          console.error('[Billers] Error loading payment schedules:', error);
          setPaymentSchedules([]);
        } else {
          setPaymentSchedules(data || []);
        }
      } catch (err) {
        console.error('[Billers] Exception loading payment schedules:', err);
        setPaymentSchedules([]);
      } finally {
        setLoadingSchedules(false);
      }
    } else {
      setPaymentSchedules([]);
    }
  }, [detailedBillerId]);

  useEffect(() => {
    loadPaymentSchedules();
  }, [detailedBillerId, billers, loadPaymentSchedules]);

  const openSchedulePaymentsModal = async (scheduleId: string, label: string) => {
    setLoadingScheduleTx(true);
    setSchedulePaymentsModal({ label, scheduleId, transactions: [] });
    try {
      const { data } = await getTransactionsByPaymentSchedule(scheduleId);
      const txs: BillerScheduleTx[] = (data || []).map((t: SupabaseTransaction) => ({ id: t.id, name: t.name, amount: t.amount, date: t.date, paymentMethodId: t.payment_method_id, receiptUrl: t.receipt_url ?? null }));
      setSchedulePaymentsModal({ label, scheduleId, transactions: txs });
      const urls: Record<string, string | null> = {};
      await Promise.all(txs.filter(tx => tx.receiptUrl).map(async tx => { urls[tx.id] = await getReceiptSignedUrl(tx.receiptUrl as string).catch(() => null); }));
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
      const { error } = await updateTransactionAndSyncSchedule(editingScheduleTx.id, { name: editScheduleTxForm.name, date: combineDateWithCurrentTime(editScheduleTxForm.date), amount: sign * Math.abs(parseFloat(editScheduleTxForm.amount)) });
      if (error) throw error;
      setEditingScheduleTx(null);
      await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
      await loadPaymentSchedules();
    } catch (err) {
      console.error('[Billers] Error updating schedule transaction:', err);
      alert('Failed to update transaction. Please try again.');
    } finally {
      setIsEditingScheduleTx(false);
    }
  };

  const handleDeleteBillerScheduleTx = async (txId: string) => {
    setConfirmModal({ show: true, title: 'Delete Payment Record', message: 'Are you sure you want to delete this payment record? This cannot be undone.', onConfirm: async () => {
      setConfirmModal(p => ({ ...p, show: false }));
      try {
        const { error } = await deleteTransactionAndRevertSchedule(txId);
        if (error) throw error;
        if (schedulePaymentsModal) await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
        await loadPaymentSchedules();
      } catch (err) {
        console.error('[Billers] Error deleting schedule transaction:', err);
        alert('Failed to delete transaction. Please try again.');
      }
    } });
  };

  const checkIfPaidByTransaction = useCallback((billerName: string, expectedAmount: number, month: string, year: string): boolean => {
    if (isNaN(expectedAmount) || expectedAmount <= 0) return false;
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;
    const targetYear = parseInt(year);
    if (isNaN(targetYear)) return false;
    const matchingTransaction = transactions.find(tx => {
      const billerNameLower = billerName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      const nameMatch = (txNameLower.includes(billerNameLower) && billerNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) || (billerNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH);
      const amountMatch = Math.abs(tx.amount - expectedAmount) <= TRANSACTION_AMOUNT_TOLERANCE;
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      const dateMatch = (txMonth === monthIndex) && (txYear === targetYear || txYear === targetYear - 1);
      return nameMatch && amountMatch && dateMatch;
    });
    return !!matchingTransaction;
  }, [transactions]);

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
      let resolvedDueDate = addFormData.dueDate;
      if (addFormData.category.startsWith('Loans') && addFormData.linkedAccountId) {
        const linkedAcc = accounts.find(a => a.id === addFormData.linkedAccountId);
        if (linkedAcc) {
          const today = new Date();
          const computed = getDueDayForMonth(linkedAcc, today.getMonth(), today.getFullYear());
          if (computed) resolvedDueDate = computed.toString();
        }
      }
      const dayForTiming = resolvedDueDate || addFormData.actDay;
      const timing = calculateTiming(dayForTiming);
      const activationDate: { month: string; day?: string; year: string } = { month: addFormData.actMonth, year: addFormData.actYear };
      if (addFormData.actDay) activationDate.day = addFormData.actDay;
      const deactivationDate = (addFormData.deactMonth && addFormData.deactYear) ? { month: addFormData.deactMonth, year: addFormData.deactYear } : undefined;
      const status = calculateStatus(deactivationDate);
      const newBiller: Biller = {
        id: '',
        name: addFormData.name,
        category: addFormData.category,
        dueDate: resolvedDueDate,
        expectedAmount: expected,
        timing: timing,
        activationDate: activationDate,
        deactivationDate: deactivationDate,
        status: status,
        schedules: MONTHS.map(month => ({ id: generateScheduleId(month, '2026'), month, year: '2026', expectedAmount: expected })),
        linkedAccountId: addFormData.linkedAccountId || undefined,
        scheduledIncreases: categorySupportsScheduledIncreases(addFormData.category)
          ? addScheduledIncreases
              .filter(inc => parseFloat(inc.amount) > 0 && inc.effectiveMonth && inc.effectiveYear)
              .map(inc => ({ effectiveDate: `${inc.effectiveYear}-${String(MONTHS.indexOf(inc.effectiveMonth) + 1).padStart(2, '0')}-01`, amount: parseFloat(inc.amount) }))
              .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
          : [],
      };
      await onAdd(newBiller);
      setShowAddModal(false);
      setAddFormData({ name: '', category: categories[0]?.name || '', dueDate: '', expectedAmount: '', actMonth: MONTHS[(new Date().getMonth() + 1) % 12], actDay: '', actYear: new Date().getFullYear().toString(), deactMonth: '', deactYear: '', linkedAccountId: '' });
      setAddScheduledIncreases([]);
      setShowAddScheduledSection(false);
      setShowAddDeactSection(false);
      setTimingFeedback('');
    } catch (error) {
      console.error('Failed to add biller:', error);
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
        activationDate = { month: editFormData.reactMonth || editFormData.actMonth, year: editFormData.reactYear || editFormData.actYear };
        deactivationDate = undefined;
        status = calculateStatusFromActivation(activationDate);
      } else {
        activationDate = { month: editFormData.actMonth, year: editFormData.actYear };
        if (editFormData.actDay) activationDate.day = editFormData.actDay;
        deactivationDate = (editFormData.deactMonth && editFormData.deactYear) ? { month: editFormData.deactMonth, year: editFormData.deactYear } : undefined;
        status = calculateStatus(deactivationDate);
      }
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
                .filter(inc => parseFloat(inc.amount) > 0 && inc.effectiveMonth && inc.effectiveYear)
                .map(inc => ({ effectiveDate: `${inc.effectiveYear}-${String(MONTHS.indexOf(inc.effectiveMonth) + 1).padStart(2, '0')}-01`, amount: parseFloat(inc.amount) }))
                .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
            : [],
        });
        setShowEditModal(null);
        setEditScheduledIncreases([]);
        setShowEditScheduledSection(false);
        setTimingFeedback('');
      };
      if (!isInactiveBiller) {
        const oldActMonth = showEditModal.activationDate.month;
        const oldActYear = showEditModal.activationDate.year;
        if (oldActMonth !== activationDate.month || oldActYear !== activationDate.year) {
          const newActMonthIdx = MONTHS.indexOf(activationDate.month);
          const newActYear = parseInt(activationDate.year);
          const affectedSchedules = editBillerSchedules.filter(s => {
            const sYear = typeof s.year === 'number' ? s.year : parseInt(String(s.year));
            const sMonthIdx = MONTHS.indexOf(s.month);
            return (sYear < newActYear || (sYear === newActYear && sMonthIdx < newActMonthIdx)) && (s.status === 'paid' || s.status === 'partial');
          });
          if (affectedSchedules.length > 0) {
            setIsSubmitting(false);
            setConfirmModal({ show: true, title: 'Activation Date Change', message: `Changing the activation date will affect ${affectedSchedules.length} existing payment record(s) for months before ${activationDate.month} ${activationDate.year}. Payment history will be preserved but pending schedules for those months will be removed. Do you want to proceed?`, onConfirm: async () => {
              setConfirmModal(prev => ({ ...prev, show: false }));
              setIsSubmitting(true);
              try { await applyUpdate(); } catch (err) { console.error('Failed to update biller after confirmation:', err); } finally { setIsSubmitting(false); }
            } });
            return;
          }
        }
      }
      await applyUpdate();
    } catch (error) {
      console.error('Failed to update biller:', error);
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
      if (onPayBiller) {
        await onPayBiller(biller.id, { amount: parseFloat(payFormData.amount), date: payFormData.datePaid, accountId: payFormData.accountId, receipt: payFormData.receipt || undefined, receiptFile: payReceiptFile || undefined, scheduleId: schedule.id, expectedAmount: showPayModal.expectedAmount });
        setShowPayModal(null);
        setPayFormData({ amount: '', receipt: '', datePaid: getTodayIso(), accountId: accounts[0]?.id || '' });
        setPayReceiptFile(null);
        await loadPaymentSchedules();
      }
    } catch (error) {
      console.error('[Billers] Failed to update payment:', error);
      alert('Failed to process payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTrigger = (id: string, name: string) => {
    setConfirmModal({ show: true, title: 'Delete Biller', message: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`, onConfirm: async () => {
      await onDelete?.(id);
      setDetailedBillerId(null);
      setConfirmModal(prev => ({ ...prev, show: false }));
      setActiveDropdownId(null);
    } });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const getScheduleWithStatus = (sched: PaymentSchedule, biller: Biller, scheduleIndex: number) => {
    let dbSchedule = paymentSchedules.find(ps => ps.month === sched.month && ps.year === sched.year);
    if (!dbSchedule && scheduleIndex >= 0) {
      dbSchedule = paymentSchedules.find(ps => ps.payment_number === scheduleIndex + 1 && ps.year === sched.year);
    }
    if (dbSchedule) {
      return { ...sched, isPaid: dbSchedule.status === 'paid', isPartial: dbSchedule.status === 'partial', amountPaid: dbSchedule.amount_paid, status: dbSchedule.status, scheduleId: dbSchedule.id };
    }
    const isPaidViaSchedule = !!sched.amountPaid;
    const calculatedAmount = getScheduleExpectedAmount(biller, sched, accounts, transactions).amount;
    const isPaidViaTransaction = checkIfPaidByTransaction(biller.name, calculatedAmount, sched.month, sched.year);
    return { ...sched, isPaid: isPaidViaSchedule || isPaidViaTransaction, isPartial: false, amountPaid: sched.amountPaid || 0, status: (isPaidViaSchedule || isPaidViaTransaction) ? 'paid' : 'pending' };
  };

  const activeBillers = billers.filter(b => b.status === 'active');
  const inactiveBillers = billers.filter(b => b.status === 'inactive');
  const detailedBiller = billers.find(b => b.id === detailedBillerId);

  const openEditModal = async (biller: Biller) => {
    const nextMonthDate = new Date();
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const defaultReactMonth = MONTHS[nextMonthDate.getMonth()];
    const defaultReactYear = nextMonthDate.getFullYear().toString();
    setEditFormData({ name: biller.name, category: biller.category, dueDate: biller.dueDate, expectedAmount: biller.expectedAmount.toFixed(2), actMonth: biller.activationDate.month, actDay: biller.activationDate.day || '', actYear: biller.activationDate.year, deactMonth: biller.deactivationDate?.month || '', deactYear: biller.deactivationDate?.year || '', linkedAccountId: biller.linkedAccountId || '', reactMonth: defaultReactMonth, reactYear: defaultReactYear });
    setEditScheduledIncreases((biller.scheduledIncreases ?? []).map(inc => {
      const [yearStr, monthStr] = inc.effectiveDate.split('-');
      const monthIdx = parseInt(monthStr, 10) - 1;
      return { effectiveMonth: MONTHS[monthIdx] ?? MONTHS[0], effectiveYear: yearStr, amount: inc.amount.toFixed(2) };
    }));
    setShowEditScheduledSection(false);
    setShowEditDeactSection(!!(biller.deactivationDate?.month && biller.deactivationDate?.year));
    setShowEditModal(biller);
    setActiveDropdownId(null);
    setTimingFeedback('');
    try {
      const { data } = await getPaymentSchedulesBySource('biller', biller.id);
      setEditBillerSchedules(data || []);
    } catch { setEditBillerSchedules([]); }
  };

  const renderCategoryOptions = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeCats = categories.filter(c => {
      if (c.active === false) {
        if (!c.deactivatedAt) return false;
        const deactivationDate = new Date(c.deactivatedAt.split('-').map(Number)[0], c.deactivatedAt.split('-').map(Number)[1] - 1, 1);
        return today < deactivationDate;
      }
      return true;
    });
    return (
      <>
        {activeCats.map(c => (
          <React.Fragment key={c.id}>
            <option value={c.name} className="font-bold">{c.name}</option>
            {c.subcategories.map(sub => <option key={`${c.id}-${sub}`} value={`${c.name} - ${sub}`}>&nbsp;&nbsp;&nbsp;{sub}</option>)}
          </React.Fragment>
        ))}
      </>
    );
  };

  const getExpectedAmount = (biller: Biller): number => {
    if (biller.category.startsWith('Loans')) {
      if (shouldUseLinkedAccount(biller)) {
        const linkedAccount = getLinkedAccount(biller, accounts);
        if (linkedAccount && transactions.some(tx => tx.payment_method_id === linkedAccount.id)) {
          const today = new Date();
          const currentSchedule: PaymentSchedule = { id: 'display-current', month: today.toLocaleString('en-US', { month: 'long' }), year: today.getFullYear().toString(), expectedAmount: 0 };
          const { amount, isFromLinkedAccount } = getScheduleExpectedAmount(biller, currentSchedule, accounts, transactions);
          if (isFromLinkedAccount && amount > 0) return amount;
        }
      }
      const linkedInstallments = installments.filter(inst => inst.billerId === biller.id);
      if (linkedInstallments.length > 0) return linkedInstallments.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
    }
    return biller.expectedAmount || 0;
  };

  const renderBillerCard = (biller: Biller) => {
    const displayAmount = getExpectedAmount(biller);
    const hasLinkedAccount = shouldUseLinkedAccount(biller);
    const linkedAccount = hasLinkedAccount ? getLinkedAccount(biller, accounts) : null;
    return (
      <div key={biller.id} className="relative bg-white dark:bg-gray-800 border-[3px] border-black rounded-2xl p-6 flex flex-col h-full group transition-all duration-300 shadow-[4px_4px_0px_#000] overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 onClick={() => setDetailedBillerId(biller.id)} className={`font-titan text-xl tracking-tighter truncate transition-all cursor-pointer ${getAccentClasses('text')} [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[2px_2px_0px_#000] hover:drop-shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]`}>{biller.name}</h3>
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 dark:bg-gray-700/50 rounded text-gray-600 dark:text-gray-300 uppercase">{biller.category}</span>
              {linkedAccount && <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 dark:bg-gray-700/50 rounded text-gray-600 dark:text-gray-300 uppercase flex items-center gap-1"><span role="img" aria-label="Linked">🔗</span> {linkedAccount.bank}</span>}
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <button onClick={() => setActiveDropdownId(activeDropdownId === biller.id ? null : biller.id)} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><MoreVertical className="w-5 h-5" /></button>
            {activeDropdownId === biller.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActiveDropdownId(null)}></div>
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border-2 border-black py-2 z-20 animate-in zoom-in-95">
                  <button onClick={() => { setDetailedBillerId(biller.id); setActiveDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Eye className="w-4 h-4" /> View Details</button>
                  <button onClick={() => openEditModal(biller)} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Edit2 className="w-4 h-4" /> Edit Biller</button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                  <button onClick={() => handleDeleteTrigger(biller.id, biller.name)} className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-auto pt-4 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Due on day {biller.dueDate}</span>
            <span className={`font-poppins text-xl font-black ${getAccentClasses('text')}`}>{formatCurrency(displayAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDetailedBillerId(biller.id)} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-gray-700 border-2 border-black text-black dark:text-white transition-all shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]">View</button>
            <button onClick={() => { const today = new Date(); const schedule: PaymentSchedule = { id: '', month: today.toLocaleString('default', { month: 'long' }), year: today.getFullYear().toString(), expectedAmount: displayAmount }; setShowPayModal({ biller, schedule, expectedAmount: displayAmount }); setPayFormData({ ...payFormData, amount: displayAmount.toFixed(2), receipt: '' }); }} className={`px-3 py-1.5 rounded-lg text-sm font-bold text-white border-2 border-black transition-all shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] ${getAccentClasses('bg')}`}>Pay</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {!loading && (
        <>
          {detailedBiller ? (
            <div className="animate-in slide-in-from-right-4 duration-500">
              <PageHeader title={<span className={`${getAccentClasses('text')}`}>{detailedBiller.name}</span>} subtitle="Look ahead your sched" />
              <div className="flex justify-between items-center mb-2">
                <button onClick={() => setDetailedBillerId(null)} className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white dark:bg-gray-700 border-2 border-black text-black dark:text-white transition-all shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"><ArrowLeft className="w-5 h-5" /></button>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEditModal(detailedBiller)} className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white dark:bg-gray-700 border-2 border-black text-black dark:text-white transition-all shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"><Edit2 className="w-5 h-5" /></button>
                  <button onClick={() => handleDeleteTrigger(detailedBiller.id, detailedBiller.name)} className="flex items-center justify-center w-10 h-10 rounded-2xl bg-red-500 border-2 border-black text-white transition-all shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]"><Trash2 className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 border-[3px] border-black rounded-2xl p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors">
                <div className="grid grid-cols-3 gap-x-10 sm:gap-x-10 gap-y-5 mb-4 border-b-2 border-dashed border-black/10 dark:border-white/10 pb-2">
                  <div className="flex flex-col items-center"><span className="text-sm font-bold text-gray-500 dark:text-gray-400">Category</span><span className="text-base font-bold text-gray-800 dark:text-gray-200 truncate">{detailedBiller.category}</span></div>
                  <div className="flex flex-col items-center"><span className="text-sm font-bold text-gray-500 dark:text-gray-400">Due Day</span><span className="text-base font-bold text-gray-800 dark:text-gray-200">{detailedBiller.dueDate}{ordinalSuffix(detailedBiller.dueDate)}</span></div>
                  <div className="flex flex-col items-center"><span className="text-sm font-bold text-gray-500 dark:text-gray-400">Amount</span><span className={`font-poppins text-base font-black ${getAccentClasses('text')}`}>{formatCurrency(getExpectedAmount(detailedBiller))}</span></div>
                </div>
                {shouldUseLinkedAccount(detailedBiller) && getLinkedAccount(detailedBiller, accounts) && (
                  <div className="mb-4 p-1 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center gap-3 text-sm border-2 border-purple-200 dark:border-purple-800/30"><span role="img" aria-label="Linked">🔗</span> <span className="font-bold text-purple-700 dark:text-purple-300">Linked to {getLinkedAccount(detailedBiller, accounts)?.bank}</span><span className="text-purple-600 dark:text-purple-400 text-xs">(Amount is auto-calculated)</span></div>
                )}
                <div className="overflow-hidden rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className={`border-b-[3px] border-black text-white ${getAccentClasses('bg')}`}><th className="p-4 text-xs font-bold uppercase tracking-widest">Month</th><th className="p-4 text-xs font-bold uppercase tracking-widest">Amount</th><th className="p-4 text-xs font-bold uppercase tracking-widest text-center">Action</th></tr></thead>
                      <tbody className="divide-y-2 divide-black/10 dark:divide-white/10">
                        {paymentSchedules.length > 0 ? (
                          (() => {
                            const getMonthOrder = (month: string): number => ({ 'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 }[month] || 999);
                            return [...paymentSchedules].sort((a, b) => a.year !== b.year ? a.year - b.year : getMonthOrder(a.month) - getMonthOrder(b.month)).map((schedule) => {
                              const legacySched: PaymentSchedule = { id: schedule.id, month: schedule.month, year: schedule.year.toString(), expectedAmount: schedule.expected_amount, amountPaid: schedule.amount_paid, receipt: schedule.receipt || undefined, datePaid: schedule.date_paid || undefined, accountId: schedule.account_id || undefined };
                              const { amount: calculatedAmount, isFromLinkedAccount } = getScheduleExpectedAmount(detailedBiller, legacySched, accounts, transactions);
                              const isPaid = schedule.status === 'paid';
                              const isPartial = schedule.status === 'partial';
                              let displayAmount = calculatedAmount;
                              if (isPaid && schedule.amount_paid > 0) displayAmount = schedule.amount_paid;
                              else if (!isPaid && !isPartial) displayAmount = calculatedAmount;
                              const displayLabel = getScheduleDisplayLabel(legacySched, shouldUseLinkedAccount(detailedBiller) ? getLinkedAccount(detailedBiller, accounts) : null);
                              return (
                                <tr key={schedule.id} className={`${isPaid ? 'bg-green-500/10' : isPartial ? 'bg-yellow-500/10' : 'hover:bg-black/5 dark:hover:bg-white/5'} transition-colors`}>
                                  <td className="p-4"><div className="flex flex-col"><span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">{displayLabel}</span>{isFromLinkedAccount && <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium mt-1 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" aria-hidden="true"></span>From linked account</span>}{isPartial && schedule.amount_paid > 0 && <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Paid: {formatCurrency(schedule.amount_paid)} of {formatCurrency(calculatedAmount)}</span>}</div></td>
                                  <td className="p-4 font-mono font-medium text-gray-600 dark:text-gray-400 text-sm sm:text-base">{formatCurrency(displayAmount)}</td>
                                  <td className="p-4 text-center">{isPaid ? <span role="status" className="flex items-center justify-center space-x-2 text-green-600"><CheckCircle2 className="w-5 h-5" aria-label="Payment completed" title="Paid" /><button onClick={() => openSchedulePaymentsModal(schedule.id, `${schedule.month} ${schedule.year}`)} title="View payment records" className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full p-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Info className="w-4 h-4" /></button></span> : isPartial ? <div className="flex flex-col items-center space-y-1"><div className="flex items-center space-x-2"><span className="px-3 py-1 bg-yellow-500 text-white rounded-lg font-bold text-xs">Partial</span><button onClick={() => openSchedulePaymentsModal(schedule.id, `${schedule.month} ${schedule.year}`)} title="View payment records" className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full p-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Info className="w-4 h-4" /></button></div><button onClick={() => { setShowPayModal({ biller: detailedBiller, schedule: legacySched, expectedAmount: calculatedAmount }); setPayFormData({ ...payFormData, amount: (calculatedAmount - schedule.amount_paid).toFixed(2), receipt: '' }); }} className="bg-indigo-600 text-white px-3 py-1 sm:px-4 rounded-lg font-bold text-[10px] sm:text-xs transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]">Pay Remaining</button></div> : <button onClick={() => { setShowPayModal({ biller: detailedBiller, schedule: legacySched, expectedAmount: calculatedAmount }); setPayFormData({ ...payFormData, amount: displayAmount.toFixed(2), receipt: '' }); }} className="bg-indigo-600 text-white px-4 py-2 sm:px-6 rounded-xl font-bold text-[11px] sm:text-xs transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]">Pay</button>}</td>
                                </tr>
                              );
                            });
                          })()
                        ) : (detailedBiller.schedules.map((sched, idx) => {
                            const schedWithStatus = getScheduleWithStatus(sched, detailedBiller, idx);
                            const { amount: calculatedAmount, isFromLinkedAccount } = getScheduleExpectedAmount(detailedBiller, sched, accounts, transactions);
                            const isPaid = schedWithStatus.isPaid, isPartial = schedWithStatus.isPartial;
                            let displayAmount = calculatedAmount;
                            if (isPaid && schedWithStatus.amountPaid > 0) displayAmount = schedWithStatus.amountPaid;
                            else if (!isPaid && !isPartial) displayAmount = calculatedAmount;
                            const displayLabel = getScheduleDisplayLabel(sched, shouldUseLinkedAccount(detailedBiller) ? getLinkedAccount(detailedBiller, accounts) : null);
                            return (
                              <tr key={idx} className={`${isPaid ? 'bg-green-500/10' : isPartial ? 'bg-yellow-500/10' : 'hover:bg-black/5 dark:hover:bg-white/5'} transition-colors`}>
                                <td className="p-4"><div className="flex flex-col"><span className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">{displayLabel}</span>{isFromLinkedAccount && <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium mt-1 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" aria-hidden="true"></span>From linked account</span>}{isPartial && schedWithStatus.amountPaid > 0 && <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Paid: {formatCurrency(schedWithStatus.amountPaid)} of {formatCurrency(calculatedAmount)}</span>}</div></td>
                                <td className="p-4 font-mono font-medium text-gray-600 dark:text-gray-400 text-sm sm:text-base">{formatCurrency(displayAmount)}</td>
                                <td className="p-4 text-center">{isPaid ? <span role="status" className="flex items-center justify-center space-x-2 text-green-600"><CheckCircle2 className="w-5 h-5" aria-label="Payment completed" title="Paid" />{sched.id && <button onClick={() => openSchedulePaymentsModal(sched.id!, `${sched.month} ${sched.year}`)} title="View payment records" className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full p-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Info className="w-4 h-4" /></button>}</span> : isPartial ? <div className="flex flex-col items-center space-y-1"><div className="flex items-center space-x-2"><span className="px-3 py-1 bg-yellow-500 text-white rounded-lg font-bold text-xs">Partial</span>{sched.id && <button onClick={() => openSchedulePaymentsModal(sched.id!, `${sched.month} ${sched.year}`)} title="View payment records" className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full p-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Info className="w-4 h-4" /></button>}</div><button onClick={() => { setShowPayModal({ biller: detailedBiller, schedule: sched, expectedAmount: calculatedAmount }); setPayFormData({ ...payFormData, amount: (calculatedAmount - schedWithStatus.amountPaid).toFixed(2), receipt: '' }); }} className="bg-indigo-600 text-white px-3 py-1 sm:px-4 rounded-lg font-bold text-[10px] sm:text-xs transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]">Pay Remaining</button></div> : <button onClick={() => { setShowPayModal({ biller: detailedBiller, schedule: sched, expectedAmount: calculatedAmount }); setPayFormData({ ...payFormData, amount: displayAmount.toFixed(2), receipt: '' }); }} className="bg-indigo-600 text-white px-4 py-2 sm:px-6 rounded-xl font-bold text-[11px] sm:text-xs transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px]">Pay</button>}</td>
                              </tr>
                            );
                          }))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <PageHeader title="Billers" subtitle="Your forever-bills, on autopilot" icon={<div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}><Receipt className="w-7 h-7" /></div>} actions={<button onClick={() => { setShowAddModal(true); setTimingFeedback(''); }} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] ${getAccentClasses('bg')}`}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Add Biller</span></button>} />
              {activeBillers.length > 0 && (
                <div className="mb-8">
                  <button onClick={() => setIsActiveOpen(!isActiveOpen)} className="flex items-center space-x-2 mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-bold text-lg transition-colors">{isActiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}<span>Active Billers ({activeBillers.length})</span></button>
                  {isActiveOpen && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{activeBillers.map(renderBillerCard)}</div>}
                </div>
              )}
              {inactiveBillers.length > 0 && (
                <div>
                  <button onClick={() => setIsInactiveOpen(!isInactiveOpen)} className="flex items-center space-x-2 mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-bold text-lg transition-colors">{isInactiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}<span>Inactive Billers ({inactiveBillers.length})</span></button>
                  {isInactiveOpen && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{inactiveBillers.map(renderBillerCard)}</div>}
                </div>
              )}
              {activeBillers.length === 0 && inactiveBillers.length === 0 && (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4"><Receipt className="w-10 h-10 text-gray-400" /></div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 transition-colors">No Billers Yet</h3>
                  <p className="text-gray-500 mb-6">Get started by adding your first recurring bill</p>
                  <button onClick={() => { setShowAddModal(true); setTimingFeedback(''); }} className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg"><Plus className="w-5 h-5" /><span>Add Your First Biller</span></button>
                </div>
              )}
            </>
          )}

          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95">
                <div className="p-8 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">New Biller</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add a new recurring bill to your list</p>
                </div>
                <form onSubmit={handleAddSubmit} className="p-8 overflow-y-auto space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Biller Name</label>
                    <input value={addFormData.name} onChange={e => setAddFormData(f => ({ ...f, name: e.target.value }))} required className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Category</label>
                      <select value={addFormData.category} onChange={e => setAddFormData(f => ({ ...f, category: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none focus:ring-2 focus:ring-indigo-500 transition-all">{renderCategoryOptions()}</select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Due Day of Month</label>
                      <input type="text" value={addFormData.dueDate} onChange={e => setAddFormData(f => ({ ...f, dueDate: e.target.value.replace(/[^0-9]/g, '') }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Expected Amount (per month)</label>
                    <input type="number" step="0.01" value={addFormData.expectedAmount} onChange={e => setAddFormData(f => ({ ...f, expectedAmount: e.target.value }))} required className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Activation Date</label>
                    <div className="grid grid-cols-3 gap-3">
                      <select value={addFormData.actMonth} onChange={e => setAddFormData(f => ({ ...f, actMonth: e.target.value }))} className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none">{MONTHS.map(m => <option key={m}>{m}</option>)}</select>
                      <input value={addFormData.actDay} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setAddFormData(f => ({ ...f, actDay: v })); showTimingInfo(v); }} placeholder="Day" className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                      <input value={addFormData.actYear} onChange={e => setAddFormData(f => ({ ...f, actYear: e.target.value.replace(/[^0-9]/g, '') }))} required className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                    </div>
                    {timingFeedback && <p className="text-xs text-indigo-500 mt-2">{timingFeedback}</p>}
                  </div>
                  {addFormData.category.startsWith('Loans') && (
                     <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Linked Account (Optional)</label>
                      <select value={addFormData.linkedAccountId} onChange={e => setAddFormData(f => ({ ...f, linkedAccountId: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        <option value="">None</option>
                        {accounts.filter(a => a.type === 'Credit').map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-2">If linked, due day and amount can be calculated automatically.</p>
                    </div>
                  )}
                  {categorySupportsScheduledIncreases(addFormData.category) && (
                    <div className="space-y-3 pt-2">
                      <button type="button" onClick={() => setShowAddScheduledSection(!showAddScheduledSection)} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">{showAddScheduledSection ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Scheduled Rate Increases</button>
                      {showAddScheduledSection && (
                        <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl animate-in fade-in">
                          {addScheduledIncreases.map((inc, index) => (
                            <div key={index} className="grid grid-cols-3 gap-2 items-center">
                              <select value={inc.effectiveMonth} onChange={e => { const newIncreases = [...addScheduledIncreases]; newIncreases[index].effectiveMonth = e.target.value; setAddScheduledIncreases(newIncreases); }} className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm"><option value="">Month</option>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                              <input value={inc.effectiveYear} onChange={e => { const newIncreases = [...addScheduledIncreases]; newIncreases[index].effectiveYear = e.target.value; setAddScheduledIncreases(newIncreases); }} placeholder="Year" className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm" />
                              <div className="relative">
                                <input type="number" value={inc.amount} onChange={e => { const newIncreases = [...addScheduledIncreases]; newIncreases[index].amount = e.target.value; setAddScheduledIncreases(newIncreases); }} placeholder="Amount" className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm w-full pl-6" />
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => setAddScheduledIncreases([...addScheduledIncreases, { effectiveMonth: '', effectiveYear: '', amount: '' }])} className="text-xs font-bold text-indigo-500">+ Add Increase</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="pt-2">
                    <button type="button" onClick={() => setShowAddDeactSection(!showAddDeactSection)} className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">{showAddDeactSection ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Set Deactivation Date</button>
                    {showAddDeactSection && (
                      <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in">
                        <select value={addFormData.deactMonth} onChange={e => setAddFormData(f => ({...f, deactMonth: e.target.value}))} className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none"><option value="">Select Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
                        <input value={addFormData.deactYear} onChange={e => setAddFormData(f => ({ ...f, deactYear: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Year" className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                      </div>
                    )}
                  </div>
                </form>
                <div className="p-8 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-4">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-6 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                  <button type="submit" form="add-biller-form" onClick={handleAddSubmit} disabled={isSubmitting} className="px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Biller'}</button>
                </div>
              </div>
            </div>
          )}

          {showEditModal && showEditModal.status === 'active' && (
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in zoom-in-95">
                <div className="p-8 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">Edit Biller</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update details for {showEditModal.name}</p>
                </div>
                <form onSubmit={handleEditSubmit} className="p-8 overflow-y-auto space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Biller Name</label>
                    <input value={editFormData.name} onChange={e => setEditFormData(f => ({ ...f, name: e.target.value }))} required className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Category</label>
                      <select value={editFormData.category} onChange={e => setEditFormData(f => ({ ...f, category: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none focus:ring-2 focus:ring-indigo-500 transition-all">{renderCategoryOptions()}</select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Due Day of Month</label>
                      <input type="text" value={editFormData.dueDate} onChange={e => setEditFormData(f => ({ ...f, dueDate: e.target.value.replace(/[^0-9]/g, '') }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Expected Amount (per month)</label>
                    <input type="number" step="0.01" value={editFormData.expectedAmount} onChange={e => setEditFormData(f => ({ ...f, expectedAmount: e.target.value }))} required className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Activation Date</label>
                    <div className="grid grid-cols-3 gap-3">
                      <select value={editFormData.actMonth} onChange={e => setEditFormData(f => ({ ...f, actMonth: e.target.value }))} className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none">{MONTHS.map(m => <option key={m}>{m}</option>)}</select>
                      <input value={editFormData.actDay} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setEditFormData(f => ({ ...f, actDay: v })); showTimingInfo(v); }} placeholder="Day" className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                      <input value={editFormData.actYear} onChange={e => setEditFormData(f => ({ ...f, actYear: e.target.value.replace(/[^0-9]/g, '') }))} required className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                    </div>
                    {timingFeedback && <p className="text-xs text-indigo-500 mt-2">{timingFeedback}</p>}
                  </div>
                  {editFormData.category.startsWith('Loans') && (
                     <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Linked Account (Optional)</label>
                      <select value={editFormData.linkedAccountId} onChange={e => setEditFormData(f => ({ ...f, linkedAccountId: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        <option value="">None</option>
                        {accounts.filter(a => a.type === 'Credit').map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-2">If linked, due day and amount can be calculated automatically.</p>
                    </div>
                  )}
                  {categorySupportsScheduledIncreases(editFormData.category) && (
                    <div className="space-y-3 pt-2">
                      <button type="button" onClick={() => setShowEditScheduledSection(!showEditScheduledSection)} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">{showEditScheduledSection ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Scheduled Rate Increases</button>
                      {showEditScheduledSection && (
                        <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl animate-in fade-in">
                          {editScheduledIncreases.map((inc, index) => (
                            <div key={index} className="grid grid-cols-4 gap-2 items-center">
                              <select value={inc.effectiveMonth} onChange={e => { const newIncreases = [...editScheduledIncreases]; newIncreases[index].effectiveMonth = e.target.value; setEditScheduledIncreases(newIncreases); }} className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm"><option value="">Month</option>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                              <input value={inc.effectiveYear} onChange={e => { const newIncreases = [...editScheduledIncreases]; newIncreases[index].effectiveYear = e.target.value; setEditScheduledIncreases(newIncreases); }} placeholder="Year" className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm" />
                              <div className="relative col-span-2 flex items-center">
                                <input type="number" value={inc.amount} onChange={e => { const newIncreases = [...editScheduledIncreases]; newIncreases[index].amount = e.target.value; setEditScheduledIncreases(newIncreases); }} placeholder="Amount" className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm w-full pl-6" />
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                                {isIncreaseElapsed(inc.effectiveMonth, inc.effectiveYear) && <span className="text-xs ml-2 text-green-600 font-bold">✓</span>}
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => setEditScheduledIncreases([...editScheduledIncreases, { effectiveMonth: '', effectiveYear: '', amount: '' }])} className="text-xs font-bold text-indigo-500">+ Add Increase</button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="pt-2">
                    <button type="button" onClick={() => setShowEditDeactSection(!showEditDeactSection)} className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">{showEditDeactSection ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} Set Deactivation Date</button>
                    {showEditDeactSection && (
                      <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in">
                        <select value={editFormData.deactMonth} onChange={e => setEditFormData(f => ({...f, deactMonth: e.target.value}))} className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none"><option value="">Select Month</option>{MONTHS.map(m=><option key={m} value={m}>{m}</option>)}</select>
                        <input value={editFormData.deactYear} onChange={e => setEditFormData(f => ({ ...f, deactYear: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Year" className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                      </div>
                    )}
                  </div>
                </form>
                <div className="p-8 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-4">
                  <button type="button" onClick={() => setShowEditModal(null)} className="px-6 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                  <button type="submit" form="edit-biller-form" onClick={handleEditSubmit} disabled={isSubmitting} className="px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          )}

          {showEditModal && showEditModal.status === 'inactive' && (
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg animate-in zoom-in-95">
                <div className="p-8 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">Reactivate Biller</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Re-activate {showEditModal.name} with a new activation date</p>
                </div>
                <form onSubmit={handleEditSubmit} className="p-8 space-y-6">
                  <p className="text-sm rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-4">This biller is inactive. To make changes, please set a new activation date for it.</p>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">New Activation Date</label>
                    <div className="grid grid-cols-2 gap-3">
                      <select value={editFormData.reactMonth} onChange={e => setEditFormData(f => ({ ...f, reactMonth: e.target.value }))} className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold appearance-none">{MONTHS.map(m => <option key={m}>{m}</option>)}</select>
                      <input value={editFormData.reactYear} onChange={e => setEditFormData(f => ({ ...f, reactYear: e.target.value.replace(/[^0-9]/g, '') }))} required className="bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 font-bold" />
                    </div>
                  </div>
                </form>
                <div className="p-8 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-4">
                  <button type="button" onClick={() => setShowEditModal(null)} className="px-6 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                  <button type="submit" form="edit-biller-form" onClick={handleEditSubmit} disabled={isSubmitting} className="px-6 py-3 rounded-xl font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">{isSubmitting ? 'Reactivating...' : 'Reactivate Biller'}</button>
                </div>
              </div>
            </div>
          )}
          
          {showPayModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-in fade-in" onClick={() => setShowPayModal(null)}>
              <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
                <form id="pay-biller-form" onSubmit={handlePaySubmit} className="p-8">
                  <div className="text-center sm:text-left">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">Pay {showPayModal.biller.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">For {showPayModal.schedule.month} {showPayModal.schedule.year}</p>
                  </div>
                  <div className="space-y-4 mt-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">₱</span>
                        <input required type="number" value={payFormData.amount} onChange={e => setPayFormData(prev => ({ ...prev, amount: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-transparent dark:border-gray-700 rounded-2xl p-4 pl-9 font-bold text-xl focus:ring-2 focus:ring-green-500 outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                        <input required type="date" value={payFormData.datePaid} onChange={e => setPayFormData(prev => ({ ...prev, datePaid: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-transparent dark:border-gray-700 rounded-2xl p-4 font-bold text-sm outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                        <select value={payFormData.accountId} onChange={e => setPayFormData(prev => ({ ...prev, accountId: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-2 border-transparent dark:border-gray-700 rounded-2xl p-4 font-bold text-sm appearance-none outline-none focus:ring-2 focus:ring-green-500">{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}</select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Receipt (Optional)</label>
                      <div className="relative">
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { const f = e.target.files?.[0] || null; setPayReceiptFile(f); setPayFormData(prev => ({ ...prev, receipt: f?.name || '' })); }} />
                        <div className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-3 text-center text-sm text-gray-500 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all flex items-center justify-center gap-2">
                          <Upload className="w-5 h-5 text-green-500" />
                          <span className="font-bold text-xs truncate">{payFormData.receipt || 'Upload Receipt'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-4 mt-6">
                    <button type="button" onClick={() => setShowPayModal(null)} className="flex-1 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                    <button type="submit" form="pay-biller-form" disabled={isSubmitting} className="flex-1 py-4 rounded-2xl font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">{isSubmitting ? 'Submitting...' : 'Submit Payment'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
          {schedulePaymentsModal && <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSchedulePaymentsModal(null)}><div className="w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}><button onClick={() => setSchedulePaymentsModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close"><X className="w-5 h-5" /></button><h2 className="text-xl font-black text-gray-900 mb-1">Payment Records</h2><p className="text-gray-500 text-sm mb-6">{schedulePaymentsModal.label}</p>{loadingScheduleTx ? <div className="text-center py-8 text-gray-400">Loading...</div> : schedulePaymentsModal.transactions.length === 0 ? <div className="text-center py-8 text-gray-400 italic">No payment records found.</div> : <div className="space-y-4">{schedulePaymentsModal.transactions.map(tx => <div key={tx.id} className="bg-gray-50 rounded-2xl p-6 space-y-2"><div className="flex justify-between items-start"><div className="space-y-2 flex-1"><div className="flex justify-between"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</span><span className="text-sm font-bold text-gray-900">{tx.name}</span></div><div className="flex justify-between"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</span><span className="text-sm font-bold text-red-600">{formatCurrency(tx.amount)}</span></div><div className="flex justify-between"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</span><span className="text-sm text-gray-700">{accounts.find(a=>a.id===tx.paymentMethodId)?.bank||tx.paymentMethodId}</span></div><div className="flex justify-between"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</span><span className="text-sm text-gray-700">{new Date(tx.date).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</span></div></div><button onClick={()=>{setEditingScheduleTx(tx);setEditScheduleTxForm({name:tx.name,amount:Math.abs(tx.amount).toFixed(2),date:tx.date.split('T')[0]})}} className="ml-3 mt-1 text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0"><Edit2 className="w-3 h-3"/></button><PinProtectedAction featureId="transaction_deletions" onVerified={()=>handleDeleteBillerScheduleTx(tx.id)} actionLabel="Delete Payment Record"><button onClick={(e)=>e.preventDefault()} title="Delete payment record" className="ml-1 mt-1 text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-100 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 className="w-3 h-3"/></button></PinProtectedAction></div>{tx.receiptUrl&&<div className="flex items-center space-x-3 pt-1">{scheduleSignedUrls[tx.id]?<><img src={scheduleSignedUrls[tx.id]} alt="Receipt" className="w-12 h-12 rounded-xl object-cover border border-gray-200" onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none'}}/><button onClick={()=>{setZoom(0.5);setPreviewReceiptUrl(scheduleSignedUrls[tx.id])}} title="Preview receipt" className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold"><Eye className="w-3.5 h-3.5"/><span>Preview</span></button></>:<span className="text-xs text-gray-400 italic">Loading receipt…</span>}</div>}</div>)}</div>}</div></div>}
          {editingScheduleTx&&<div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={()=>setEditingScheduleTx(null)}><div className="w-full max-w-sm bg-white rounded-3xl p-10 shadow-2xl relative" onClick={e=>e.stopPropagation()}><button onClick={()=>setEditingScheduleTx(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close"><X className="w-6 h-6 text-gray-400"/></button><h2 className="text-xl font-black text-gray-900 mb-2">Edit Transaction</h2><p className="text-gray-500 text-sm mb-8">Update the transaction details below</p><form onSubmit={handleEditBillerScheduleTxSubmit} className="space-y-6"><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label><input value={editScheduleTxForm.name} onChange={e=>setEditScheduleTxForm(f=>({...f,name:e.target.value}))} required className="w-full bg-gray-50 border-2 border-black rounded-2xl p-6 outline-none font-bold text-sm"/></div><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label><input type="number" step="0.01" min="0" value={editScheduleTxForm.amount} onChange={e=>setEditScheduleTxForm(f=>({...f,amount:e.target.value}))} required className="w-full bg-gray-50 border-2 border-black rounded-2xl p-6 outline-none font-bold text-sm"/></div><div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label><input type="date" value={editScheduleTxForm.date} onChange={e=>setEditScheduleTxForm(f=>({...f,date:e.target.value}))} required className="w-full bg-gray-50 border-2 border-black rounded-2xl p-6 outline-none font-bold text-sm"/></div><div className="flex gap-4 pt-4"><button type="button" onClick={()=>setEditingScheduleTx(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-4 rounded-2xl font-bold transition-colors" disabled={isEditingScheduleTx}>Cancel</button><button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold transition-colors disabled:opacity-50" disabled={isEditingScheduleTx}>{isEditingScheduleTx?'Saving…':'Save Changes'}</button></div></form></div></div>}
          {previewReceiptUrl&&<div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={()=>setPreviewReceiptUrl(null)}><div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden" style={{maxHeight:'90vh'}} onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="text-base font-black text-gray-900 uppercase tracking-widest">Receipt Preview</h3><div className="flex items-center space-x-2"><button onClick={()=>setZoom(z=>Math.max(0.25,parseFloat((z-.25).toFixed(2))))} title="Zoom out" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4"/></button><span className="text-xs font-bold text-gray-500 w-10 text-center">{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(4,parseFloat((z+.25).toFixed(2))))} title="Zoom in" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4"/></button><a href={previewReceiptUrl} download target="_blank" rel="noreferrer" title="Download receipt" className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-600 transition-colors" aria-label="Download receipt"><Download className="w-4 h-4"/></a><button onClick={()=>setPreviewReceiptUrl(null)} title="Close" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Close preview"><X className="w-4 h-4"/></button></div></div><div className="overflow-auto flex-1 p-4 flex justify-center"><img src={previewReceiptUrl} alt="Receipt" style={{width:`${zoom*100}%`,height:'auto',transition:'width .2s'}}/></div></div></div>}
        </>
      )}
      {loading && <div className="flex items-center justify-center py-12"><div className="text-center"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div><p className="text-gray-600 font-medium">Loading billers from database...</p></div></div>}
      {error && !loading && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"><div className="flex items-start space-x-3"><AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"/><div><h3 className="text-sm font-semibold text-red-800">Error Loading Billers</h3><p className="text-sm text-red-600 mt-1">{error}</p></div></div></div>}
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
