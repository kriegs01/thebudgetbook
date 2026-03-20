
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory, Installment, Wallet } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, FileText, ArrowRight, Upload, CheckCircle2, X, AlertTriangle, Info, Eye, ZoomIn, ZoomOut, Download, Archive, RotateCcw, Lock } from 'lucide-react';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend, archiveBudgetSetup, reopenBudgetSetup } from '../src/services/budgetSetupsService';
import { IconSquircleButton } from '../src/components/IconSquircleButton';
import { createTransaction, getAllTransactions, updateTransaction, updateTransactionAndSyncSchedule, createPaymentScheduleTransaction, uploadTransactionReceipt, getTransactionsByPaymentSchedule, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, getAllStashTransactions } from '../src/services/transactionsService';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule } from '../src/types/supabase';
import { getInstallmentPaymentSchedule, aggregateCreditCardPurchases } from '../src/utils/paymentStatus'; // PROTOTYPE: Import payment status utilities
import { getScheduleExpectedAmount } from '../src/utils/linkedAccountUtils'; // ENHANCEMENT: Import for linked account amount calculation
import { getBillerAmountForDate } from '../src/utils/billers'; // For scheduled increases fallback
import { getPaymentSchedulesByPeriod, recordPaymentViaTransaction } from '../src/services/paymentSchedulesService';
import { combineDateWithCurrentTime } from '../src/utils/dateUtils';
import { getWalletsForCurrentUser } from '../src/services/walletsService';

interface BudgetProps {
  items: BudgetItem[];
  accounts: Account[];
  billers: Biller[];
  categories: BudgetCategory[];
  savedSetups: SavedBudgetSetup[];
  setSavedSetups: React.Dispatch<React.SetStateAction<SavedBudgetSetup[]>>;
  onAdd: (item: BudgetItem) => void;
  onUpdateBiller: (biller: Biller) => Promise<void>;
  onMoveToTrash?: (setup: SavedBudgetSetup) => void;
  onReloadSetups?: () => Promise<void>;
  onReloadBillers?: () => Promise<void>;
  onUpdateInstallment?: (installment: Installment) => Promise<void>; // For updating installment payments
  installments?: Installment[]; // PROTOTYPE: Installments for Loans section
  onTransactionCreated?: () => void; // Notify App to reload accounts/balances after stash top-up
  onTransactionDeleted?: () => void; // Notify App to reload accounts/balances after stash top-up deletion
  onArchiveBudget?: (setup: SavedBudgetSetup) => Promise<void>; // Archive (close) a budget
  onReopenBudget?: (setup: SavedBudgetSetup) => Promise<void>; // Reopen an archived budget
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Checks whether a biller should appear in a budget for the given month/year,
 * based on its activation and deactivation dates.
 *
 * A biller is considered active for a period when:
 *   activationDate <= selectedPeriod  (inclusive)
 *   AND (no deactivationDate OR selectedPeriod < deactivationDate)
 *
 * The deactivation month is treated as the FIRST inactive month (matches
 * the calculateStatus logic in Billers.tsx).
 */
const isBillerActiveForPeriod = (biller: Biller, month: string, year: number): boolean => {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx === -1) return false;

  const actYear = parseInt(biller.activationDate.year);
  const actMonthIdx = MONTHS.indexOf(biller.activationDate.month);
  if (isNaN(actYear) || actMonthIdx === -1) return false;

  // Selected period must be on or after the activation date
  if (year < actYear || (year === actYear && monthIdx < actMonthIdx)) {
    return false;
  }

  // Selected period must be before the deactivation date (deact month = first inactive month)
  if (biller.deactivationDate) {
    const deactYear = parseInt(biller.deactivationDate.year);
    const deactMonthIdx = MONTHS.indexOf(biller.deactivationDate.month);
    if (!isNaN(deactYear) && deactMonthIdx !== -1) {
      if (year > deactYear || (year === deactYear && monthIdx >= deactMonthIdx)) {
        return false;
      }
    }
  }

  return true;
};

// Budget setup status constants
const BUDGET_SETUP_STATUS = {
  SAVED: 'Saved',
  ACTIVE: 'Active',
  COMPLETED: 'Completed'
} as const;

// Autosave configuration constants
const AUTO_SAVE_DEBOUNCE_MS = 3000; // 3 seconds debounce for autosave
const AUTO_SAVE_STATUS_TIMEOUT_MS = 3000; // How long to show status messages

// Transaction matching configuration
const TRANSACTION_AMOUNT_TOLERANCE = 1; // ±1 peso tolerance for amount matching (accounts for rounding differences)
const TRANSACTION_MIN_NAME_LENGTH = 3; // Minimum length for partial name matching to avoid false positives
const TRANSACTION_DATE_GRACE_DAYS = 7; // Allow transactions up to N days after budget month ends (for late payments)

// Schedule payments modal transaction type
type BudgetScheduleTx = { id: string; name: string; amount: number; date: string; paymentMethodId: string; receiptUrl?: string | null };

// Receipt preview zoom constants
const ZOOM_INCREMENT = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

// The first month where new stash-based budgets are in use.
// Budgets before this date are considered "legacy" (fixed billers, no real transactions).
const STASH_GO_LIVE = new Date(2026, 2, 1); // March 1, 2026

/**
 * Returns true if the given year/month predates the stash go-live date.
 * Legacy budgets use schedule/flag paid status; new budgets use real transactions.
 */
const isLegacyBudget = (year: number, month: string): boolean => {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx === -1) return false;
  const budgetStart = new Date(year, monthIdx, 1);
  return budgetStart < STASH_GO_LIVE;
};

/**
 * Returns true if a category should be considered "active" for the given budget month/year.
 *
 * Rules (in priority order):
 * 1. Deactivation only (`deactivatedAt` set, no `reactivatedFrom`):
 *    - Active for months strictly BEFORE deactivatedAt; hidden from that month onwards.
 * 2. Deactivation + reactivation (`deactivatedAt` AND `reactivatedFrom` set):
 *    - Active before deactivatedAt.
 *    - Hidden in the gap [deactivatedAt, reactivatedFrom).
 *    - Active again from reactivatedFrom onwards (inclusive).
 * 3. Reactivation only (`reactivatedFrom` set, no `deactivatedAt`):
 *    - Active from reactivatedFrom onwards; hidden before it.
 * 4. No lifecycle dates: active if `cat.active !== false`.
 * - Handles missing/invalid month names gracefully (returns true to avoid accidentally hiding sections).
 */
const isCategoryActiveForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  const monthIndex = MONTHS.indexOf(selectedMonthName);
  if (monthIndex < 0) return cat.active !== false; // fallback: don't hide accidentally

  const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
  const deactivationDate = cat.deactivatedAt ? new Date(cat.deactivatedAt) : null;
  const reactivationDate = cat.reactivatedFrom ? new Date(cat.reactivatedFrom) : null;

  if (!deactivationDate && !reactivationDate) {
    return cat.active !== false;
  }

  // Deactivation only
  if (deactivationDate && !reactivationDate) {
    return budgetMonthStart < deactivationDate;
  }

  // Reactivation only (rare)
  if (!deactivationDate && reactivationDate) {
    return budgetMonthStart >= reactivationDate;
  }

  // Deactivation + reactivation gap logic
  if (budgetMonthStart < deactivationDate!) {
    return true; // before deactivation
  }
  if (reactivationDate && budgetMonthStart >= reactivationDate) {
    return true; // from reactivation onwards
  }
  return false; // in the gap [deactivatedAt, reactivatedFrom)
};

/**
 * Returns true if a category section should be rendered for the given budget month/year.
 *
 * Key distinction from `isCategoryActiveForBudget`:
 * - When a `deactivatedAt` date is set and the budget month is AT or AFTER that cutoff
 *   (and before any `reactivatedFrom`), the section is NEVER rendered — even if `setupData`
 *   still has items. This prevents legacy data from leaking into months at/after the cutoff.
 * - Before the cutoff, or after reactivation, the section renders if the category is active OR has data.
 */
const shouldRenderCategorySection = (
  cat: BudgetCategory,
  hasData: boolean,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  const isActive = isCategoryActiveForBudget(cat, selectedYear, selectedMonthName);

  // Hard cutoff: if the category is in its deactivation gap, never render
  if (cat.deactivatedAt) {
    const monthIndex = MONTHS.indexOf(selectedMonthName);
    if (monthIndex >= 0) {
      const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
      const deactivationDate = new Date(cat.deactivatedAt);
      const reactivationDate = cat.reactivatedFrom ? new Date(cat.reactivatedFrom) : null;
      const inGap = budgetMonthStart >= deactivationDate && (!reactivationDate || budgetMonthStart < reactivationDate);
      if (inGap) return false;
    }
  }

  return isActive || hasData;
};

/**
 * Returns true if a "Legacy" label should be shown for the category in the given month.
 *
 * A category is "Legacy" for a given month when:
 * - It has a `deactivatedAt` date, AND
 * - It is currently visible (before the deactivation cutoff, or after reactivation), AND
 * - If `legacyFrom` is set, the budget month must be >= legacyFrom.
 */
const isCategoryLegacyForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  if (!cat.deactivatedAt) return false;

  const monthIndex = MONTHS.indexOf(selectedMonthName);
  if (monthIndex < 0) return false;

  const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
  const deactivationDate = new Date(cat.deactivatedAt);

  // Must be visible (before deactivation cutoff)
  if (budgetMonthStart >= deactivationDate) return false;

  // If legacyFrom is set, only show label from that month onwards
  if (cat.legacyFrom) {
    const legacyFromDate = new Date(cat.legacyFrom);
    return budgetMonthStart >= legacyFromDate;
  }

  return true; // has deactivatedAt and is still visible → always legacy
};

/**
 * Calculates the remaining amount for a saved budget setup.
 * Uses the same formula as the Budget Setup page's Month Summary:
 *   remaining = salaryToUse - setup.totalAmount
 * where salaryToUse = _actualSalary if set, otherwise _projectedSalary.
 */
const calculateBudgetRemaining = (setup: SavedBudgetSetup): number => {
  if (!setup.data) return -setup.totalAmount;
  const actualStr = setup.data._actualSalary;
  const projectedStr = setup.data._projectedSalary;
  const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
  const projectedValue = parseFloat(projectedStr || '0') || 0;
  const salaryToUse = actualValue !== null && !isNaN(actualValue) ? actualValue : projectedValue;
  return salaryToUse - setup.totalAmount;
};

const Budget: React.FC<BudgetProps> = ({ accounts, billers, categories, savedSetups, setSavedSetups, onUpdateBiller, onMoveToTrash, onReloadSetups, onReloadBillers, onUpdateInstallment, installments = [], onTransactionCreated, onTransactionDeleted, onArchiveBudget, onReopenBudget }) => {
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // REFACTOR: Track budget year for accurate payment schedule loading

  // Categorized Setup State
  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  // PROTOTYPE: Track excluded installments (by default all are included)
  const [excludedInstallmentIds, setExcludedInstallmentIds] = useState<Set<string>>(new Set());

  // Month Summary State - stored in Supabase with setup data
  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');

  // Transactions state - used for matching payments
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  
  // Wallets (Stash) state
  const [wallets, setWallets] = useState<Wallet[]>([]);
  // Dedicated stash top-up transactions state (queries directly by wallet_id IS NOT NULL)
  const [stashTopUps, setStashTopUps] = useState<SupabaseTransaction[]>([]);
  // Wallet IDs excluded from the grand total (persisted in setup data as _excludedWalletIds)
  const [excludedWalletIds, setExcludedWalletIds] = useState<Set<string>>(new Set());

  // Stash funding modal state
  const [fundModal, setFundModal] = useState<{ wallet: Wallet } | null>(null);
  const [fundForm, setFundForm] = useState({ amount: '', date: '', notes: '' });
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [stashInfoModal, setStashInfoModal] = useState<{ wallet: Wallet } | null>(null);
  const [stashStatusMsg, setStashStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Archive/reopen operation status
  const [archiveStatusMsg, setArchiveStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  // Collapsible archived section on summary view
  const [showArchived, setShowArchived] = useState(false);

  // REFACTOR: Payment schedules state - source of truth for payment status
  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);

  // Load from saved setup when month/timing changes
  useEffect(() => {
    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    if (existingSetup && existingSetup.data) {
      // Load salary data from setup if available
      if (existingSetup.data._projectedSalary !== undefined) {
        setProjectedSalary(existingSetup.data._projectedSalary);
      } else {
        setProjectedSalary('11000');
      }
      if (existingSetup.data._actualSalary !== undefined) {
        setActualSalary(existingSetup.data._actualSalary);
      } else {
        setActualSalary('');
      }
      // Restore excluded installment IDs from persisted setup data
      if (Array.isArray(existingSetup.data._excludedInstallmentIds)) {
        setExcludedInstallmentIds(new Set(existingSetup.data._excludedInstallmentIds));
      } else {
        setExcludedInstallmentIds(new Set());
      }
      // Restore excluded wallet IDs from persisted setup data
      if (Array.isArray(existingSetup.data._excludedWalletIds)) {
        setExcludedWalletIds(new Set(existingSetup.data._excludedWalletIds));
      } else {
        setExcludedWalletIds(new Set());
      }
    } else {
      // Reset to defaults if no saved setup
      setProjectedSalary('11000');
      setActualSalary('');
      setExcludedInstallmentIds(new Set());
      setExcludedWalletIds(new Set());
    }
  }, [selectedMonth, selectedTiming, savedSetups]);

  // Load transactions for matching payment status
  // Only loads once on mount to avoid excessive DB queries
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const { data, error } = await getAllTransactions();
        if (error) {
          console.error('[Budget] Failed to load transactions:', error);
        } else if (data) {
          // Filter transactions to last 24 months to improve performance
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          
          const recentTransactions = data.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= twoYearsAgo;
          });
          
          setTransactions(recentTransactions);
          console.log('[Budget] Loaded transactions:', recentTransactions.length, 'of', data.length);
        }
      } catch (error) {
        console.error('[Budget] Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, []); // Load once on mount, reload happens after creating transactions

  // Load wallets and stash top-ups for the Stash section
  useEffect(() => {
    const loadWalletsAndStash = async () => {
      try {
        const [walletsResult, stashResult] = await Promise.all([
          getWalletsForCurrentUser(),
          getAllStashTransactions(),
        ]);
        if (walletsResult.error) {
          console.error('[Budget] Failed to load wallets:', walletsResult.error);
        } else {
          setWallets(walletsResult.data || []);
        }
        if (stashResult.error) {
          console.error('[Budget] Failed to load stash transactions:', stashResult.error);
        } else {
          setStashTopUps((stashResult.data as SupabaseTransaction[]) || []);
        }
      } catch (error) {
        console.error('[Budget] Error loading wallets/stash:', error);
      }
    };
    loadWalletsAndStash();
  }, []);

  /** Reloads stash top-up transactions from the DB. */
  const reloadStashTopUps = useCallback(async () => {
    try {
      const { data, error } = await getAllStashTransactions();
      if (error) {
        console.error('[Budget] Failed to reload stash transactions:', error);
      } else {
        setStashTopUps((data as SupabaseTransaction[]) || []);
      }
    } catch (error) {
      console.error('[Budget] Error reloading stash transactions:', error);
    }
  }, []);

  /** Returns all stash top-up transactions for a wallet within the selected budget month. */
  const getStashTopUps = useCallback((walletId: string): SupabaseTransaction[] => {
    const monthIndex = MONTHS.indexOf(selectedMonth);
    return stashTopUps.filter(tx => {
      if (tx.wallet_id !== walletId) return false;
      const txDate = new Date(tx.date);
      return txDate.getMonth() === monthIndex && txDate.getFullYear() === selectedYear;
    });
  }, [stashTopUps, selectedMonth, selectedYear]);

  /** Computes funded/remaining/isFunded aggregates for a wallet in the selected month.
   * Amounts in the DB are stored as negative (cash_in convention), so Math.abs is used
   * to compute the positive funded total for display and comparison. */
  const getStashAggregates = useCallback((wallet: Wallet) => {
    const topUps = getStashTopUps(wallet.id);
    const funded = topUps.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const remaining = Math.max(0, wallet.amount - funded);
    const isFunded = funded >= wallet.amount;
    return { funded, remaining, isFunded, topUps };
  }, [getStashTopUps]);

  /** Opens the Fund Stash modal, pre-filling the amount with the remaining balance.
   * The date is defaulted to a date within the selected budget month/year so that
   * getStashTopUps correctly picks up the transaction in the status and info modal.
   * If today falls within the selected budget month/year, today's local date is used;
   * otherwise the 1st of the selected budget month is used. */
  const handleOpenFundModal = useCallback((wallet: Wallet) => {
    const { remaining } = getStashAggregates(wallet);
    const now = new Date();
    const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
    const isCurrentPeriod =
      now.getFullYear() === selectedYear && now.getMonth() === selectedMonthIndex;
    // Build default date using local date components (not UTC) to avoid midnight boundary issues
    let defaultDate: string;
    if (isCurrentPeriod) {
      defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    } else {
      defaultDate = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}-01`;
    }
    setFundForm({
      amount: remaining > 0 ? remaining.toFixed(2) : '',
      date: defaultDate,
      notes: '',
    });
    setFundModal({ wallet });
  }, [getStashAggregates, selectedMonth, selectedYear]);

  /** Submits the Fund Stash form, creating a stash top-up transaction. */
  const handleFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundModal) return;
    const amount = parseFloat(fundForm.amount);
    if (isNaN(amount) || amount <= 0) return;
    // Capture wallet details before the modal is closed so they remain accessible
    // in the async steps that follow setFundModal(null).
    const walletId = fundModal.wallet.id;
    const walletName = fundModal.wallet.name;
    const walletAccountId = fundModal.wallet.accountId;
    setFundSubmitting(true);
    try {
      // Build the base payload without wallet_id so we can retry without it if needed.
      const stashTxBase = {
        name: `Stash top-up - ${walletName} (${selectedMonth} ${selectedYear})`,
        // Negative amount: cash_in = money IN to the linked account (adds to balance per sign convention)
        amount: -amount,
        date: combineDateWithCurrentTime(fundForm.date),
        payment_method_id: walletAccountId,
        transaction_type: 'cash_in' as const,
        notes: fundForm.notes || null,
        payment_schedule_id: null,
        related_transaction_id: null,
        receipt_url: null,
      };
      // First attempt: include wallet_id so the transaction is linked to the stash wallet.
      let creationResult = await createTransaction({ ...stashTxBase, wallet_id: walletId });
      // If the wallet_id column doesn't exist yet in this environment (migration pending),
      // PostgREST returns a column-not-found error.  Retry without wallet_id so the
      // transaction is at least created; the optimistic frontend state will still show it
      // as a funded stash entry via safeNewTx below.
      if (creationResult.error) {
        const errMsg = JSON.stringify(creationResult.error).toLowerCase();
        if (errMsg.includes('wallet_id') || errMsg.includes('42703') || errMsg.includes('column')) {
          console.warn('[Budget] wallet_id column not available, retrying without it:', creationResult.error);
          creationResult = await createTransaction(stashTxBase);
        }
      }
      const { data: newTx, error } = creationResult;
      if (error) throw error;
      // Build a safe tx with wallet_id explicitly set.  The DB row returned by
      // createTransaction may omit wallet_id if the migration hasn't been applied
      // to the target table yet, which would cause getStashTopUps to filter it out.
      const safeNewTx: SupabaseTransaction | null = newTx
        ? { ...(newTx as SupabaseTransaction), wallet_id: walletId }
        : null;
      // Optimistic update: show funded state immediately (deduplicate by id)
      if (safeNewTx) {
        setStashTopUps(prev => [safeNewTx, ...prev.filter(t => t.id !== safeNewTx.id)]);
      }
      setFundModal(null);
      setStashStatusMsg({ msg: `Funded stash '${walletName}' by ${formatCurrency(amount)}`, type: 'success' });
      setTimeout(() => setStashStatusMsg(null), 3000);
      // Update budget setup status to Active when stash is being funded
      const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
      if (existingSetup && existingSetup.status !== BUDGET_SETUP_STATUS.ACTIVE) {
        const { error: statusError } = await updateBudgetSetupFrontend({
          ...existingSetup,
          status: BUDGET_SETUP_STATUS.ACTIVE,
        });
        if (statusError) {
          console.error('[Budget] Failed to update budget status after stash fund:', statusError);
        } else if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      // Reload from DB and merge: if the new tx isn't in the DB results (e.g. the
      // wallet_id column migration hasn't been applied yet), keep the optimistic tx
      // so the row and info modal continue to reflect the fund.
      // Also reload the main transactions list so the Transactions page and account
      // balances immediately reflect the new top-up.
      const [stashResult] = await Promise.all([
        getAllStashTransactions(),
        reloadTransactions(),
      ]);
      const { data: freshData, error: reloadError } = stashResult;
      if (!reloadError && freshData !== null) {
        const freshTopUps = freshData as SupabaseTransaction[];
        if (safeNewTx && !freshTopUps.some(t => t.id === safeNewTx.id)) {
          // New tx absent from DB result — keep it alongside the refreshed list
          setStashTopUps([safeNewTx, ...freshTopUps]);
        } else {
          setStashTopUps(freshTopUps);
        }
      }
      // If reload errors, the optimistic state set above remains intact
      // Notify parent to reload accounts so balances immediately reflect the new top-up.
      if (onTransactionCreated) onTransactionCreated();
    } catch (err) {
      console.error('[Budget] Error funding stash:', err);
      setStashStatusMsg({ msg: 'Failed to fund stash. Please try again.', type: 'error' });
      setTimeout(() => setStashStatusMsg(null), 3000);
    } finally {
      setFundSubmitting(false);
    }
  };

  /** Toggles a wallet's inclusion in the grand total computation. */
  const handleWalletIncludeToggle = useCallback((walletId: string) => {
    setExcludedWalletIds(prev => {
      const next = new Set(prev);
      if (next.has(walletId)) {
        next.delete(walletId);
      } else {
        next.add(walletId);
      }
      return next;
    });
  }, []);

  /** Confirms and deletes a stash top-up transaction.
   * Uses deleteTransactionAndRevertSchedule which safely handles null payment_schedule_id
   * and also cleans up any credit_payment counterpart transactions. */
  const handleDeleteStashTopUp = (txId: string, amount: number) => {
    const absAmount = Math.abs(amount);
    setConfirmModal({
      show: true,
      title: 'Delete Top-up',
      message: `Delete this stash top-up of ${formatCurrency(absAmount)}? This will remove the underlying transaction.`,
      onConfirm: async () => {
        setConfirmModal(p => ({ ...p, show: false }));
        const { error } = await deleteTransactionAndRevertSchedule(txId);
        if (error) {
          console.error('[Budget] Error deleting stash top-up:', error);
          setStashStatusMsg({ msg: 'Failed to delete top-up.', type: 'error' });
        } else {
          setStashStatusMsg({ msg: 'Top-up deleted.', type: 'success' });
          // Reload stash top-ups AND the main transactions list so the Transactions page
          // and account balances reflect the deletion immediately.
          await Promise.all([reloadStashTopUps(), reloadTransactions()]);
          // Notify parent to reload accounts so balances immediately reflect the deletion.
          if (onTransactionDeleted) onTransactionDeleted();
        }
        setTimeout(() => setStashStatusMsg(null), 3000);
      },
    });
  };
  
  // REFACTOR: Load payment schedules for the selected month
  // This provides accurate payment status from the monthly_payment_schedules table
  useEffect(() => {
    const loadPaymentSchedules = async () => {
      try {
        // REVIEW FIX: Use selectedYear instead of current year to handle historical/future budgets
        const { data, error } = await getPaymentSchedulesByPeriod(selectedMonth, selectedYear);
        
        if (error) {
          console.error('[Budget] Failed to load payment schedules:', error);
        } else if (data) {
          setPaymentSchedules(data);
          console.log('[Budget] Loaded payment schedules for', selectedMonth, selectedYear, ':', data.length, 'schedules');
        }
      } catch (error) {
        console.error('[Budget] Error loading payment schedules:', error);
      }
    };
    
    loadPaymentSchedules();
  }, [selectedMonth, selectedYear]); // REVIEW FIX: Reload when month or year changes

  // Autosave State
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');

  // Modal States
  // REFACTOR: Use schedule.id for payment schedule linking (removed redundant paymentScheduleId field)
  const [showPayModal, setShowPayModal] = useState<{ 
    biller: Biller, 
    schedule: PaymentSchedule; // schedule.id contains the payment schedule ID for linking
    expectedAmount?: number; // Override when DB expected_amount is 0 (e.g. Loans billers)
  } | null>(null);
  // QA: Add transactionId to support editing from Pay modal
  const [payFormData, setPayFormData] = useState({
    transactionId: '', // Empty for new, set for editing
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);

  // QA: Transaction form modal for Purchases (supports create and edit)
  // Fix for Issue #6: Enable transaction editing
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  // Default transaction form state - used for resetting
  const getDefaultTransactionFormData = () => ({
    id: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    accountId: accounts[0]?.id || '',
    paymentScheduleId: '' // FIX: Add payment schedule ID for linking installment payments
  });
  
  const [transactionFormData, setTransactionFormData] = useState(getDefaultTransactionFormData());

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

  // Schedule payments modal (consolidated payment records for a budget item)
  // scheduleId is present for schedule-based modals and null for direct-payment modals
  const [schedulePaymentsModal, setSchedulePaymentsModal] = useState<{ label: string; scheduleId: string | null; transactions: BudgetScheduleTx[] } | null>(null);
  const [loadingScheduleTx, setLoadingScheduleTx] = useState(false);
  const [scheduleSignedUrls, setScheduleSignedUrls] = useState<Record<string, string | null>>({});
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);

  /**
   * QA: Returns the sum of monthly amounts from installments linked to a Loans biller,
   * or null when the biller is not a Loans type or has no linked installments.
   */
  const getLinkedInstallmentsAmount = useCallback((biller: Biller): number | null => {
    if (!biller.category.startsWith('Loans')) return null;
    const linked = installments.filter(inst => inst.billerId === biller.id);
    if (linked.length === 0) return null;
    return linked.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
  }, [installments]);

  // Sync effect with Billers and Categories
  useEffect(() => {
    if (view === 'setup') {
      setSetupData(prev => {
        const newData = { ...prev };
        
        categories.forEach(cat => {
          if (!newData[cat.name]) newData[cat.name] = [];

          const matchingBillers = billers.filter(b => 
            (b.category === cat.name || b.category.startsWith(`${cat.name} -`)) && 
            b.timing === selectedTiming &&
            b.status === 'active' &&
            isBillerActiveForPeriod(b, selectedMonth, selectedYear) &&
            !removedIds.has(b.id)
          );

          // Remove billers that don't match the current timing or are not active for this period
          // ENHANCEMENT: Also update amounts for existing billers (in case of linked account changes)
          const filteredExisting = newData[cat.name].filter(item => {
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              return biller &&
                biller.timing === selectedTiming &&
                isBillerActiveForPeriod(biller, selectedMonth, selectedYear);
            }
            return true; // Keep non-biller items
          }).map(item => {
            // ENHANCEMENT: Update amount for existing biller items
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              if (biller) {
                // QA: For Loans billers, use linked installment monthly amounts first
                const instAmount = getLinkedInstallmentsAmount(biller);
                if (instAmount !== null) {
                  return { ...item, amount: instAmount.toString() };
                }
                const schedule = biller.schedules.find(s => s.month === selectedMonth);
                if (schedule) {
                  const { amount: calculatedAmount } = getScheduleExpectedAmount(
                    biller,
                    schedule,
                    accounts,
                    transactions
                  );
                  return {
                    ...item,
                    amount: calculatedAmount.toString()
                  };
                }
              }
            }
            return item;
          }).filter(item => {
            // QA: Exclude Loans biller rows that still resolve to 0 amount
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              if (biller?.category.startsWith('Loans') && parseFloat(item.amount) === 0) {
                return false;
              }
            }
            return true;
          });

          const existingIds = new Set(filteredExisting.map(i => i.id));
          const newItems = matchingBillers
            .filter(b => !existingIds.has(b.id))
            .map(b => {
              const schedule = b.schedules.find(s => s.month === selectedMonth);
              
              // QA: For Loans billers, use linked installment monthly amounts first
              let amount: number;
              const instAmount = getLinkedInstallmentsAmount(b);
              if (instAmount !== null) {
                amount = instAmount;
              } else if (schedule) {
                // ENHANCEMENT: For linked billers, calculate amount from transactions
                const { amount: calculatedAmount } = getScheduleExpectedAmount(b, schedule, accounts, transactions);
                amount = calculatedAmount;
              } else {
                // No schedule found — still apply any active scheduled increase
                const dateStr = `${selectedYear}-${String(MONTHS.indexOf(selectedMonth) + 1).padStart(2, '0')}-01`;
                amount = getBillerAmountForDate(b, dateStr);
              }
              
              return {
                id: b.id,
                name: b.name,
                amount: amount.toString(),
                included: true,
                timing: b.timing,
                isBiller: true
              };
            })
            // QA: Exclude Loans billers that resolve to 0 amount
            .filter(item => {
              const biller = billers.find(b => b.id === item.id);
              if (biller?.category.startsWith('Loans') && parseFloat(item.amount) === 0) {
                return false;
              }
              return true;
            });

          newData[cat.name] = [...filteredExisting, ...newItems];
        });

        return newData;
      });
    }
  }, [selectedMonth, selectedTiming, selectedYear, billers, view, removedIds, categories, getLinkedInstallmentsAmount]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  /**
   * QA: Check if installment should be displayed for selected month
   * Shows installments that have started on or before the selected month
   * AND whose last payment month (startDate + termDuration - 1) is on or after the selected month.
   * Fix for Issue #2: Incorrect installment scheduling
   */
  const shouldShowInstallment = useCallback((installment: Installment, month: string, year?: number): boolean => {
    // If no start date is set, always show (backward compatibility)
    if (!installment.startDate) return true;
    
    // Parse installment start date (format: YYYY-MM)
    const [startYear, startMonth] = installment.startDate.split('-').map(Number);
    
    // Parse selected month
    const selectedMonthIndex = MONTHS.indexOf(month);
    if (selectedMonthIndex === -1) return false;
    
    // Determine target year (use provided year or current year)
    const targetYear = year || new Date().getFullYear();

    // Use a monotonic month counter (months since year 0) to compare periods safely
    const startMonthAbs = startYear * 12 + (startMonth - 1);
    const selectedMonthAbs = targetYear * 12 + selectedMonthIndex;

    // Installment must have started on or before the selected month
    if (startMonthAbs > selectedMonthAbs) return false;

    // Installment must not be past its last payment month.
    // Last payment month = startDate + (termDuration - 1).
    // termDuration is stored as e.g. "12 months" (set by installmentsAdapter.ts:
    // `${supabase.term_duration} months`) — extract the leading integer.
    const termMonths = parseInt(installment.termDuration, 10);
    if (!isNaN(termMonths) && termMonths > 0) {
      const lastPaymentMonthAbs = startMonthAbs + (termMonths - 1);
      if (selectedMonthAbs > lastPaymentMonthAbs) return false;
    }

    return true;
  }, []); // MONTHS is a constant, no need to include in deps

  /**
   * REFACTOR: Get payment schedule for a biller or installment
   * Uses the monthly_payment_schedules table as the source of truth.
   * Optional month/year parameters allow explicit period filtering.
   */
  const getPaymentSchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string,
    month?: string,
    year?: number
  ): SupabaseMonthlyPaymentSchedule | undefined => {
    return paymentSchedules.find(
      schedule =>
        schedule.source_type === sourceType &&
        schedule.source_id === sourceId &&
        (month === undefined || schedule.month === month) &&
        (year === undefined || schedule.year === year)
    );
  }, [paymentSchedules]);
  
  /**
   * REFACTOR: Check if an item is fully paid using payment schedules
   * Only returns true when status === 'paid' (not partial)
   */
  const checkIfPaidBySchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId);
    if (!schedule) return false;
    return schedule.status === 'paid';
  }, [getPaymentSchedule]);

  /**
   * Check if an item has a partial payment using payment schedules
   */
  const checkIfPartialBySchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId);
    if (!schedule) return false;
    return schedule.status === 'partial' && schedule.amount_paid > 0;
  }, [getPaymentSchedule]);

  /**
   * Check if an item is paid by matching transactions
   * Matches by name (with minimum length), amount (within tolerance), and date (within month/year)
   */
  const checkIfPaidByTransaction = useCallback((
    itemName: string, 
    itemAmount: string | number, 
    month: string,
    year?: number // Optional year parameter for viewing past budgets
  ): boolean => {
    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return false;

    // Get month index (0-11) for date comparison
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;

    // Determine target year (use provided year or current year)
    const targetYear = year || new Date().getFullYear();

    // Find matching transaction
    const matchingTransaction = transactions.find(tx => {
      // Check name match with minimum length requirement to avoid false positives
      const itemNameLower = itemName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      // Require at least TRANSACTION_MIN_NAME_LENGTH characters to match
      const nameMatch = (
        (txNameLower.includes(itemNameLower) && itemNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (itemNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      // Check amount match (within tolerance)
      const amountMatch = Math.abs(tx.amount - amount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      // Check date match with grace period for late payments
      // Allow:
      // 1. Transactions in the same month and year
      // 2. Transactions in December of previous year (for January budgets)
      // 3. Transactions within TRANSACTION_DATE_GRACE_DAYS after month ends
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      let dateMatch = false;
      
      // Same month and year
      if (txMonth === monthIndex && txYear === targetYear) {
        dateMatch = true;
      }
      // December of previous year for January budgets
      else if (monthIndex === 0 && txMonth === 11 && txYear === targetYear - 1) {
        dateMatch = true;
      }
      // Within grace period after month ends (next month only, within first N days)
      else if (txMonth === (monthIndex + 1) % 12) {
        const budgetMonthEnd = new Date(targetYear, monthIndex + 1, 0); // Last day of budget month
        const daysDifference = Math.floor((txDate.getTime() - budgetMonthEnd.getTime()) / (1000 * 60 * 60 * 24));
        
        // Ensure transaction is after month end and within grace period
        if (daysDifference > 0 && daysDifference <= TRANSACTION_DATE_GRACE_DAYS) {
          // Handle year transition for December -> January
          const expectedYear = monthIndex === 11 ? targetYear + 1 : targetYear;
          if (txYear === expectedYear) {
            dateMatch = true;
          }
        }
      }

      return nameMatch && amountMatch && dateMatch;
    });

    if (matchingTransaction) {
      console.log(`[Budget] ✓ Found matching transaction for "${itemName}":`, {
        txName: matchingTransaction.name,
        txAmount: matchingTransaction.amount,
        txDate: matchingTransaction.date,
        itemAmount: amount
      });
    } else {
      console.log(`[Budget] ✗ No matching transaction for "${itemName}" (${amount}) in ${month}`, {
        totalTransactions: transactions.length,
        itemAmount: amount,
        month,
        targetYear: year || new Date().getFullYear()
      });
    }

    return !!matchingTransaction;
  }, [transactions]);

  /**
   * QA: Find existing transaction for an item
   * Fix for Issue: Transaction editing from Pay modal
   */
  const findExistingTransaction = useCallback((
    itemName: string, 
    itemAmount: string | number, 
    month: string,
    year?: number
  ): SupabaseTransaction | undefined => {
    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return undefined;

    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return undefined;

    const targetYear = year || new Date().getFullYear();

    return transactions.find(tx => {
      const itemNameLower = itemName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      const nameMatch = (
        (txNameLower.includes(itemNameLower) && itemNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (itemNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      const amountMatch = Math.abs(tx.amount - amount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      const dateMatch = (txMonth === monthIndex) && 
                       (txYear === targetYear || txYear === targetYear - 1);

      return nameMatch && amountMatch && dateMatch;
    });
  }, [transactions]);

  /**
   * Reload transactions from Supabase
   */
  const reloadTransactions = useCallback(async () => {
    try {
      const { data, error } = await getAllTransactions();
      if (error) {
        console.error('[Budget] Failed to reload transactions:', error);
      } else if (data) {
        setTransactions(data);
        console.log('[Budget] Reloaded transactions:', data.length);
      }
    } catch (error) {
      console.error('[Budget] Error reloading transactions:', error);
    }
  }, []);

  /**
   * REFACTOR: Reload payment schedules from Supabase
   */
  const reloadPaymentSchedules = useCallback(async () => {
    try {
      // REVIEW FIX: Use selectedYear to match the loadPaymentSchedules logic
      const { data, error } = await getPaymentSchedulesByPeriod(selectedMonth, selectedYear);
      if (error) {
        console.error('[Budget] Failed to reload payment schedules:', error);
      } else if (data) {
        setPaymentSchedules(data);
        console.log('[Budget] Reloaded payment schedules:', data.length);
      }
    } catch (error) {
      console.error('[Budget] Error reloading payment schedules:', error);
    }
  }, [selectedMonth, selectedYear]);

  /** Open the consolidated payment records modal for a payment schedule */
  const openSchedulePaymentsModal = async (scheduleId: string, label: string) => {
    setLoadingScheduleTx(true);
    setScheduleSignedUrls({});
    setSchedulePaymentsModal({ label, scheduleId, transactions: [] });
    try {
      const { data } = await getTransactionsByPaymentSchedule(scheduleId);
      const txs: BudgetScheduleTx[] = (data || []).map((t: SupabaseTransaction) => ({
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

  /** Open the payment records modal for a non-schedule item (e.g. Purchases) */
  const openDirectPaymentModal = (tx: SupabaseTransaction, label: string) => {
    const txEntry: BudgetScheduleTx = { id: tx.id, name: tx.name, amount: tx.amount, date: tx.date, paymentMethodId: tx.payment_method_id, receiptUrl: tx.receipt_url ?? null };
    setScheduleSignedUrls({});
    setSchedulePaymentsModal({ label, scheduleId: null, transactions: [txEntry] });
    if (tx.receipt_url) {
      getReceiptSignedUrl(tx.receipt_url)
        .then(url => setScheduleSignedUrls({ [tx.id]: url }))
        .catch(() => setScheduleSignedUrls({ [tx.id]: null }));
    }
  };

  /** Delete a payment transaction from the payment records modal.
   * The cascade-delete in deleteTransactionAndRevertSchedule also removes any linked
   * credit_payment counterpart on the associated credit account. */
  const handleDeleteScheduleTx = async (txId: string) => {
    if (!window.confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      const { error } = await deleteTransactionAndRevertSchedule(txId);
      if (error) throw error;
      // Reload the modal to reflect the deletion
      if (schedulePaymentsModal?.scheduleId) {
        await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
      } else {
        // For direct-payment modals (no scheduleId), just close — no reload needed
        setSchedulePaymentsModal(null);
      }
    } catch (err) {
      console.error('[Budget] Error deleting schedule transaction:', err);
      alert('Failed to delete transaction. Please try again.');
    }
  };

  /**
   * Auto-save budget setup with debouncing
   * Automatically saves changes after 3 seconds of inactivity
   */
  const autoSave = useCallback(async () => {
    // Only auto-save in setup view
    if (view !== 'setup') return;
    
    // Prepare data including salary information (use structuredClone for better performance)
    const dataToSave = {
      ...structuredClone(setupData),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary,
      _excludedInstallmentIds: [...excludedInstallmentIds],
      _excludedWalletIds: [...excludedWalletIds]
    };
    
    // Check if data has actually changed
    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      console.log('[Budget] No changes detected, skipping auto-save');
      return;
    }
    
    // Calculate total for regular items
    let regularItemsTotal = 0;
    Object.values(setupData)
      .filter((value): value is CategorizedSetupItem[] => Array.isArray(value))
      .forEach(catItems => {
        catItems.forEach(item => {
          if (item.included) {
            const amount = parseFloat(item.amount);
            if (!isNaN(amount)) {
              regularItemsTotal += amount;
            }
          }
        });
      });

    // Calculate installments total (same logic as categorySummary)
    const installmentsTotal = installments
      .filter(inst => {
        const timingMatch = !inst.timing || inst.timing === selectedTiming;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        // Only hide when there is NO schedule for this period AND the total is fully paid.
        // When a schedule exists for the viewed period, always keep the row visible so the
        // user can see the paid/partial indicator rather than the row disappearing on payment.
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    // Grand total includes both regular items AND installments AND included stash wallets
    // Use the actual funded amount when it exceeds the target (over-funded stash)
    const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
    const total = regularItemsTotal + installmentsTotal + stashTotal;
    
    try {
      setAutoSaveStatus('saving');
      console.log('[Budget] Auto-saving budget setup...');
      
      const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
      
      if (existingSetup) {
        // Update existing setup
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: 'Saved'
        };
        
        const { error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          console.error('[Budget] Auto-save failed:', error);
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      } else {
        // Create new setup
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          console.error('[Budget] Auto-save failed:', error);
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      }
      
      // Update last saved data reference
      lastSavedDataRef.current = currentDataString;
      
      // Reload setups to get fresh data
      if (onReloadSetups) {
        await onReloadSetups();
      }
      
      console.log('[Budget] Auto-save completed successfully');
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[Budget] Error in auto-save:', error);
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
    }
  }, [view, setupData, projectedSalary, actualSalary, selectedMonth, selectedTiming, savedSetups, excludedInstallmentIds, excludedWalletIds, wallets, getStashAggregates, onReloadSetups]);

  /**
   * Debounced auto-save trigger
   * Waits for specified delay after last change before auto-saving
   */
  const triggerAutoSave = useCallback(() => {
    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [autoSave]);

  // Trigger auto-save when setupData, projectedSalary, actualSalary, excludedInstallmentIds, or excludedWalletIds changes
  useEffect(() => {
    if (view === 'setup') {
      triggerAutoSave();
    }
  }, [setupData, projectedSalary, actualSalary, excludedInstallmentIds, excludedWalletIds, view, triggerAutoSave]);

  // Cleanup timeout on component unmount only
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array ensures this only runs on unmount

  const handleSetupToggle = (category: string, id: string) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === id ? { ...item, included: !item.included } : item
      )
    }));
  };

  const handleSetupUpdate = (category: string, id: string, field: keyof CategorizedSetupItem, value: any) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
  };

  const addItemToCategory = (category: string) => {
    // For all categories, add a blank item
    const newItem: CategorizedSetupItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Item',
      amount: '0',
      included: true,
    };
    setSetupData(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), newItem]
    }));
  };

  // QA: Exclude item from current Budget Setup view only (doesn't delete master record)
  // Fix for Issue #4: Exclude button behavior
  const removeItemFromCategory = (category: string, id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Exclude Item',
      message: `Are you sure you want to exclude "${name}" from this month's budget? This will NOT delete the biller or payment schedule.`,
      onConfirm: () => {
        setRemovedIds(prev => new Set([...prev, id]));
        setSetupData(prev => ({
          ...prev,
          [category]: prev[category].filter(item => item.id !== id)
        }));
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  /**
   * Save budget setup to Supabase
   * This replaces the previous localStorage-based persistence
   */
  const handleSaveSetup = async () => {
    console.log('[Budget] ===== Starting budget setup save =====');
    console.log('[Budget] Selected month:', selectedMonth);
    console.log('[Budget] Selected timing:', selectedTiming);
    console.log('[Budget] Current setupData type:', typeof setupData);
    console.log('[Budget] Current setupData keys:', Object.keys(setupData));
    
    // Calculate total for regular items
    let regularItemsTotal = 0;
    // Filter out non-array values (like _projectedSalary, _actualSalary) before iterating
    Object.values(setupData)
      .filter((value): value is CategorizedSetupItem[] => Array.isArray(value))
      .forEach(catItems => {
        catItems.forEach(item => {
          if (item.included) {
            const amount = parseFloat(item.amount);
            if (isNaN(amount)) {
              console.warn(`[Budget] Invalid amount for item "${item.name}": "${item.amount}"`);
            } else {
              regularItemsTotal += amount;
            }
          }
        });
      });

    // Calculate installments total (same logic as categorySummary)
    const installmentsTotal = installments
      .filter(inst => {
        const timingMatch = !inst.timing || inst.timing === selectedTiming;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        // Only hide when there is NO schedule for this period AND the total is fully paid.
        // When a schedule exists for the viewed period, always keep the row visible so the
        // user can see the paid/partial indicator rather than the row disappearing on payment.
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    // Grand total includes both regular items AND installments AND included stash wallets
    // Use the actual funded amount when it exceeds the target (over-funded stash)
    const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
    const total = regularItemsTotal + installmentsTotal + stashTotal;

    console.log('[Budget] Regular items total:', regularItemsTotal);
    console.log('[Budget] Installments total:', installmentsTotal);
    console.log('[Budget] Stash total:', stashTotal);
    console.log('[Budget] Grand total amount:', total);

    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    console.log('[Budget] Existing setup found:', !!existingSetup);
    
    // Prepare data including salary information
    // Deep clone to avoid reference issues - cannot use spread for nested objects
    const dataToSave = {
      ...JSON.parse(JSON.stringify(setupData)),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary,
      _excludedInstallmentIds: [...excludedInstallmentIds],
      _excludedWalletIds: [...excludedWalletIds]
    };
    
    console.log('[Budget] Data to save type:', typeof dataToSave);
    console.log('[Budget] Data to save keys:', Object.keys(dataToSave));
    console.log('[Budget] Projected salary:', projectedSalary);
    console.log('[Budget] Actual salary:', actualSalary);
    
    try {
      if (existingSetup) {
        console.log('[Budget] Updating existing setup, ID:', existingSetup.id);
        
        // Update existing setup in Supabase
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: BUDGET_SETUP_STATUS.SAVED
        };
        
        const { data, error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          console.error('[Budget] Error updating budget setup:', error);
          const errorMessage = error?.message || 'Unknown error occurred';
          alert(`Failed to save budget setup: ${errorMessage}`);
          return;
        }
        
        console.log('[Budget] Budget setup updated successfully');
        console.log('[Budget] Updated record ID:', data?.id);
        console.log('[Budget] Updated record data type:', data?.data ? typeof data.data : 'undefined');
        console.log('[Budget] Updated record data keys:', data?.data ? Object.keys(data.data) : []);
        
        // Reload setups from Supabase to get fresh data
        if (onReloadSetups) {
          await onReloadSetups();
        }
      } else {
        console.log('[Budget] Creating new setup');
        
        // Create new setup in Supabase
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { data, error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          console.error('[Budget] Error creating budget setup:', error);
          const errorMessage = error?.message || 'Unknown error occurred';
          alert(`Failed to save budget setup: ${errorMessage}`);
          return;
        }
        
        console.log('[Budget] Budget setup created successfully');
        console.log('[Budget] Created record ID:', data?.id);
        console.log('[Budget] Created record data type:', data?.data ? typeof data.data : 'undefined');
        console.log('[Budget] Created record data keys:', data?.data ? Object.keys(data.data) : []);
        
        // Reload setups from Supabase to get the new one with generated ID
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      console.log('[Budget] ===== Budget setup save completed successfully =====');
      setView('summary');
    } catch (error) {
      console.error('[Budget] Error in handleSaveSetup:', error);
      const errorMessage = (error as any)?.message || 'Unknown error occurred';
      alert(`Failed to save budget setup: ${errorMessage}`);
    }
  };

  // QA: Handle transaction create/update
  // Fix for Issue #6: Enable transaction editing
  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isEditing = !!transactionFormData.id;
    const paymentScheduleId = transactionFormData.paymentScheduleId;
    
    console.log(`[Budget] ${isEditing ? 'Updating' : 'Creating'} transaction in Supabase`);
    console.log('[Budget] Transaction data:', transactionFormData);
    console.log('[Budget] Payment schedule ID:', paymentScheduleId);
    
    try {
      let transactionData, transactionError;
      
      if (isEditing) {
        // Update existing transaction and recalculate the linked payment schedule
        const transaction = {
          name: transactionFormData.name,
          date: combineDateWithCurrentTime(transactionFormData.date),
          amount: parseFloat(transactionFormData.amount),
          payment_method_id: transactionFormData.accountId
        };
        const result = await updateTransactionAndSyncSchedule(transactionFormData.id, transaction);
        transactionData = result.data;
        transactionError = result.error;
      } else if (paymentScheduleId) {
        // FIX: Create transaction linked to payment schedule (for installments)
        console.log('[Budget] Creating transaction with payment schedule link');
        const result = await createPaymentScheduleTransaction(
          paymentScheduleId,
          {
            name: transactionFormData.name,
            date: combineDateWithCurrentTime(transactionFormData.date),
            amount: parseFloat(transactionFormData.amount),
            paymentMethodId: transactionFormData.accountId
          }
        );
        transactionData = result.data;
        transactionError = result.error;
        
        // FIX: Update payment schedule status
        if (!transactionError && transactionData) {
          console.log('[Budget] Updating payment schedule status');
          const { error: scheduleError } = await recordPaymentViaTransaction(
            paymentScheduleId,
            {
              transactionName: transactionFormData.name,
              amountPaid: parseFloat(transactionFormData.amount),
              datePaid: transactionFormData.date,
              accountId: transactionFormData.accountId,
              receipt: undefined
            }
          );
          
          if (scheduleError) {
            console.error('[Budget] Failed to update payment schedule:', scheduleError);
          } else {
            console.log('[Budget] Payment schedule updated successfully');
          }

          // If this is an installment payment, update the installment's cumulative paidAmount
          // so that the Loans section reflects the new total and reloadInstallments is triggered.
          const linkedSchedule = paymentSchedules.find(s => s.id === paymentScheduleId);
          if (linkedSchedule?.source_type === 'installment') {
            const inst = installments.find(i => i.id === linkedSchedule.source_id);
            const amountPaidDelta = parseFloat(transactionFormData.amount);
            if (inst && !isNaN(amountPaidDelta) && onUpdateInstallment) {
              await onUpdateInstallment({
                ...inst,
                paidAmount: inst.paidAmount + amountPaidDelta
              });
              console.log('[Budget] Installment paidAmount updated after schedule payment:', inst.name, '+', amountPaidDelta);
            } else if (!onUpdateInstallment) {
              console.warn('[Budget] onUpdateInstallment callback not provided; installment paidAmount will not be synced');
            }
          }
        }
      } else {
        // Create new transaction without schedule link (for purchases)
        const transaction = {
          name: transactionFormData.name,
          date: combineDateWithCurrentTime(transactionFormData.date),
          amount: parseFloat(transactionFormData.amount),
          payment_method_id: transactionFormData.accountId
        };
        const result = await createTransaction(transaction);
        transactionData = result.data;
        transactionError = result.error;
      }
      
      if (transactionError) {
        console.error(`[Budget] Failed to ${isEditing ? 'update' : 'save'} transaction:`, transactionError);
        alert(`Failed to ${isEditing ? 'update' : 'save'} transaction. Please try again.`);
        return;
      }
      
      console.log(`[Budget] Transaction ${isEditing ? 'updated' : 'saved'} successfully:`, transactionData);
      
      // Reload transactions to update paid status
      await reloadTransactions();
      
      // Always reload payment schedules after any transaction change to keep status current
      await reloadPaymentSchedules();
      
      // Close the modal and reset form to defaults
      setShowTransactionModal(false);
      setTransactionFormData(getDefaultTransactionFormData());
    } catch (e) {
      console.error('[Budget] Error saving transaction:', e);
      alert('Failed to save transaction. Please try again.');
    }
  };

  // REFACTOR: Handle Pay modal submission - uses payment schedules
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    
    try {
      const { biller, schedule } = showPayModal;
      const isEditing = !!payFormData.transactionId;
      const paymentScheduleId = schedule.id; // Use schedule.id for payment schedule linking
      
      console.log(`[Budget] ${isEditing ? 'Updating' : 'Creating'} transaction for payment`);
      
      let transactionData, transactionError;
      
      if (isEditing) {
        // Update existing transaction
        const transaction = {
          name: `${biller.name} - ${schedule.month} ${schedule.year}`,
          date: combineDateWithCurrentTime(payFormData.datePaid),
          amount: parseFloat(payFormData.amount),
          payment_method_id: payFormData.accountId
        };
        const result = await updateTransaction(payFormData.transactionId, transaction);
        transactionData = result.data;
        transactionError = result.error;
      } else if (paymentScheduleId) {
        // REFACTOR: Create new transaction linked to payment schedule
        // This is the primary path for recording payments from Budget Setup
        const result = await createPaymentScheduleTransaction(
          paymentScheduleId,
          {
            name: `${biller.name} - ${schedule.month} ${schedule.year}`,
            date: combineDateWithCurrentTime(payFormData.datePaid),
            amount: parseFloat(payFormData.amount),
            paymentMethodId: payFormData.accountId
          }
        );
        transactionData = result.data;
        transactionError = result.error;
      } else {
        // REVIEW FIX: Fallback path for schedules without IDs
        // This should rarely happen as all schedules in monthly_payment_schedules have UUIDs
        // If this path executes, it indicates missing schedule generation or data migration issue
        console.warn('[Budget] No payment schedule ID available, creating transaction without link');
        console.warn('[Budget] This may indicate schedules were not generated for this biller');
        const transaction = {
          name: `${biller.name} - ${schedule.month} ${schedule.year}`,
          date: combineDateWithCurrentTime(payFormData.datePaid),
          amount: parseFloat(payFormData.amount),
          payment_method_id: payFormData.accountId
        };
        const result = await createTransaction(transaction);
        transactionData = result.data;
        transactionError = result.error;
      }
      
      if (transactionError) {
        console.error(`[Budget] Failed to ${isEditing ? 'update' : 'create'} transaction:`, transactionError);
        alert(`Failed to ${isEditing ? 'update' : 'save'} transaction. Please try again.`);
        return;
      }
      
      console.log(`[Budget] Transaction ${isEditing ? 'updated' : 'created'} successfully:`, transactionData);
      
      // Upload receipt to storage if a file was selected
      if (payReceiptFile && transactionData?.id) {
        const { path, error: uploadError } = await uploadTransactionReceipt(transactionData.id, payReceiptFile);
        if (uploadError || !path) {
          console.error('[Budget] Receipt upload failed:', uploadError);
          // Non-fatal: transaction was saved, just warn the user
          alert('Payment saved, but receipt upload failed. You can re-attach it from the transaction details.');
        } else {
          await updateTransaction(transactionData.id, { receipt_url: path });
          console.log('[Budget] Receipt uploaded and linked to transaction:', path);
        }
      }

      // If this biller is linked to a credit account, record a credit_payment on that account
      // so the outstanding balance and available credit are updated automatically.
      if (!isEditing && biller.linkedAccountId && transactionData?.id) {
        const linkedAccount = accounts.find(a => a.id === biller.linkedAccountId);
        if (linkedAccount?.type === 'Credit') {
          const { error: creditTxError } = await createTransaction({
            name: `${biller.name} - ${schedule.month} ${schedule.year}`,
            date: combineDateWithCurrentTime(payFormData.datePaid),
            amount: -Math.abs(parseFloat(payFormData.amount)), // negative → reduces outstanding balance
            payment_method_id: biller.linkedAccountId,
            transaction_type: 'credit_payment',
            notes: null,
            payment_schedule_id: null,
            related_transaction_id: transactionData.id,
            receipt_url: null,
          });
          if (creditTxError) {
            console.error('[Budget] Failed to create credit account payment transaction:', creditTxError);
          } else {
            console.log('[Budget] Credit account payment transaction created for linked account:', biller.linkedAccountId);
          }
        }
      }
      
      // REFACTOR: Update payment schedule in monthly_payment_schedules table
      if (paymentScheduleId) {
        console.log('[Budget] Recording payment in payment schedule');
        const { error: scheduleError } = await recordPaymentViaTransaction(
          paymentScheduleId,
          {
            transactionName: `${biller.name} - ${schedule.month} ${schedule.year}`,
            amountPaid: parseFloat(payFormData.amount),
            datePaid: payFormData.datePaid,
            accountId: payFormData.accountId,
            receipt: payFormData.receipt || undefined,
            expectedAmount: showPayModal.expectedAmount ?? schedule.expectedAmount,
          }
        );
        
        if (scheduleError) {
          console.error('[Budget] Failed to update payment schedule:', scheduleError);
          // Continue anyway - transaction was created successfully
        } else {
          console.log('[Budget] Payment schedule updated successfully');
        }
      }
      
      // Update the biller's payment schedule using schedule ID for exact matching
      // BACKWARD COMPATIBILITY: Still update Biller.schedules JSONB for older code
      const updatedSchedules = biller.schedules.map(s => {
        // Match by ID if available (checking for null/undefined explicitly), otherwise fallback to month/year matching
        const isMatch = (schedule.id != null) ? 
          (s.id === schedule.id) : 
          (s.month === schedule.month && s.year === schedule.year);
          
        if (isMatch) {
          console.log(`[Budget] MATCHED schedule for update:`, {
            scheduleId: s.id,
            scheduleMonth: s.month,
            scheduleYear: s.year,
            paymentDate: payFormData.datePaid,
            amount: parseFloat(payFormData.amount),
            matchedBy: (schedule.id != null) ? 'ID' : 'month/year'
          });
          return { 
            ...s, 
            amountPaid: parseFloat(payFormData.amount), 
            receipt: payFormData.receipt || `${biller.name}_${schedule.month}`, 
            datePaid: payFormData.datePaid, 
            accountId: payFormData.accountId 
          };
        }
        return s;
      });
      
      console.log('[Budget] All updated schedules:', updatedSchedules.map(s => ({
        id: s.id,
        month: s.month,
        year: s.year,
        amountPaid: s.amountPaid,
        datePaid: s.datePaid
      })));
      
      console.log('[Budget] Updating biller with new schedule');
      await onUpdateBiller({ ...biller, schedules: updatedSchedules });
      
      // FIX: Update linked installment's paidAmount if this biller is linked to an installment
      if (biller.category.startsWith('Loans') && installments && installments.length > 0) {
        const linkedInstallment = installments.find(inst => inst.billerId === biller.id);
        if (linkedInstallment && onUpdateInstallment) {
          console.log('[Budget] Found linked installment, updating paidAmount');
          const updatedInstallment: Installment = {
            ...linkedInstallment,
            paidAmount: linkedInstallment.paidAmount + parseFloat(payFormData.amount)
          };
          await onUpdateInstallment(updatedInstallment);
          console.log('[Budget] Installment paidAmount updated successfully');
        }
      }
      
      // FIX: Update budget setup status to reflect payment activity
      const existingSetup = savedSetups.find(s => 
        s.month === schedule.month && s.timing === selectedTiming
      );
      if (existingSetup) {
        console.log('[Budget] Updating budget setup status after payment');
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          status: BUDGET_SETUP_STATUS.ACTIVE // Mark as Active when payments are being made
        };
        await updateBudgetSetupFrontend(updatedSetup);
        console.log('[Budget] Budget setup status updated to Active');
        
        // Reload setups to refresh UI
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      // Reload transactions and payment schedules to update paid status
      await reloadTransactions();
      
      // REFACTOR: Reload payment schedules to reflect the updated status
      await reloadPaymentSchedules();
      
      // Explicitly reload billers to ensure UI updates
      if (onReloadBillers) {
        console.log('[Budget] Reloading billers after payment');
        await onReloadBillers();
      }
      
      console.log('[Budget] Payment completed successfully');
      
      // Only close modal on success and reset form
      setShowPayModal(null);
      setPayFormData({
        transactionId: '',
        amount: '',
        receipt: '',
        datePaid: new Date().toISOString().split('T')[0],
        accountId: accounts[0]?.id || ''
      });
      setPayReceiptFile(null);
    } catch (error) {
      console.error('Failed to update payment:', error);
      alert('Failed to process payment. Please try again.');
      // Keep modal open so user can retry
    }
  };

  const handleOpenNew = () => {
    const emptySetup: { [key: string]: CategorizedSetupItem[] } = {};
    categories.forEach(c => emptySetup[c.name] = []);
    setSetupData(emptySetup);
    setRemovedIds(new Set());
    setSelectedMonth(MONTHS[new Date().getMonth()]);
    setSelectedTiming('1/2');
    setView('setup');
  };

  const handleLoadSetup = (setup: SavedBudgetSetup) => {
    console.log('[Budget] ===== Loading budget setup =====');
    console.log('[Budget] Setup ID:', setup.id);
    console.log('[Budget] Setup month:', setup.month);
    console.log('[Budget] Setup timing:', setup.timing);
    console.log('[Budget] Setup data type:', typeof setup.data);
    console.log('[Budget] Setup data keys:', setup.data ? Object.keys(setup.data) : []);
    
    // Validate that setup.data is an object before loading
    if (typeof setup.data !== 'object' || setup.data === null || Array.isArray(setup.data)) {
      console.error('[Budget] Invalid setup data structure:', typeof setup.data, Array.isArray(setup.data));
      alert('Cannot load this setup: data structure is invalid');
      return;
    }
    
    // Deep clone the data to avoid reference issues
    const loadedData = JSON.parse(JSON.stringify(setup.data));
    console.log('[Budget] Loaded data type:', typeof loadedData);
    console.log('[Budget] Loaded data keys:', Object.keys(loadedData));
    
    setSetupData(loadedData);
    setRemovedIds(new Set());
    // Restore excluded installment IDs from loaded setup data
    if (Array.isArray(loadedData._excludedInstallmentIds)) {
      setExcludedInstallmentIds(new Set(loadedData._excludedInstallmentIds));
    } else {
      setExcludedInstallmentIds(new Set());
    }
    setSelectedMonth(setup.month);
    setSelectedTiming(setup.timing as '1/2' | '2/2');
    setView('setup');
    
    console.log('[Budget] ===== Budget setup loaded successfully =====');
  };

  const handleArchiveSetup = (setup: SavedBudgetSetup) => {
    setConfirmModal({
      show: true,
      title: 'Close Budget',
      message: `Close and archive the ${setup.month} (${setup.timing}) budget? You'll still be able to view it in Archived Budgets and it will still be used in projections, but you won't be able to modify it.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);
        try {
          await onArchiveBudget?.(setup);
          setArchiveStatusMsg({ msg: 'Budget closed and archived.', type: 'success' });
        } catch {
          setArchiveStatusMsg({ msg: 'Could not close budget. Please try again.', type: 'error' });
        } finally {
          setArchiveSubmitting(false);
          setTimeout(() => setArchiveStatusMsg(null), 3000);
        }
      }
    });
  };

  const handleReopenSetup = (setup: SavedBudgetSetup) => {
    setConfirmModal({
      show: true,
      title: 'Reopen Budget',
      message: `Reopen the ${setup.month} (${setup.timing}) budget? You'll be able to make changes again. This may affect your projections.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);
        try {
          await onReopenBudget?.(setup);
          setArchiveStatusMsg({ msg: 'Budget reopened. You can edit this budget again.', type: 'success' });
        } catch {
          setArchiveStatusMsg({ msg: 'Could not reopen budget. Please try again.', type: 'error' });
        } finally {
          setArchiveSubmitting(false);
          setTimeout(() => setArchiveStatusMsg(null), 3000);
        }
      }
    });
  };

  if (view === 'summary') {
    const activeSetups = savedSetups.filter(s => !s.isArchived);
    const archivedSetups = savedSetups.filter(s => s.isArchived);

    const renderSetupRow = (setup: SavedBudgetSetup) => {
      const remaining = calculateBudgetRemaining(setup);
      return (
      <tr key={setup.id} className="hover:bg-gray-50/50 transition-colors group">
        <td className="p-8 pl-12">
          <div className="flex items-center space-x-5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${setup.isArchived ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-600 shadow-indigo-50/50'}`}>
              {setup.isArchived ? <Archive className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
            </div>
            <span className="text-base font-black text-gray-900 tracking-tight">{setup.month}</span>
          </div>
        </td>
        <td className="p-8"><span className="text-[10px] font-black text-gray-500 bg-gray-100/80 px-4 py-1.5 rounded-full uppercase tracking-widest">{setup.timing}</span></td>
        <td className="p-8"><span className="text-base font-black text-gray-900 tracking-tight">{formatCurrency(setup.totalAmount)}</span></td>
        <td className="p-8">
          <span className={`text-base font-black tracking-tight ${remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatCurrency(remaining)}
          </span>
        </td>
        <td className="p-8">
          {setup.isArchived ? (
            <span className="text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full bg-amber-100 text-amber-700">Archived</span>
          ) : (
            <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full ${setup.status === BUDGET_SETUP_STATUS.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {setup.status}
            </span>
          )}
        </td>
        <td className="p-6 pr-8 text-center">
          <div className="flex justify-center items-center gap-2">
            {setup.isArchived ? (
              <>
                <IconSquircleButton
                  variant="reopen"
                  onClick={() => handleReopenSetup(setup)}
                  disabled={archiveSubmitting}
                  aria-label="Reopen budget"
                >
                  <RotateCcw className="w-4 h-4" />
                </IconSquircleButton>
              </>
            ) : (
              <>
                <IconSquircleButton
                  variant="close"
                  onClick={() => handleArchiveSetup(setup)}
                  disabled={archiveSubmitting}
                  aria-label="Close budget"
                >
                  <Archive className="w-4 h-4" />
                </IconSquircleButton>
                <IconSquircleButton
                  variant="remove"
                  onClick={() => {
                    setConfirmModal({
                      show: true,
                      title: 'Move to Trash',
                      message: `Are you sure you want to move the ${setup.month} (${setup.timing}) budget history entry to Trash?`,
                      onConfirm: () => {
                        onMoveToTrash?.(setup);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      }
                    });
                  }}
                  aria-label="Remove budget"
                >
                  <Trash2 className="w-4 h-4" />
                </IconSquircleButton>
              </>
            )}
            <IconSquircleButton
              variant="open"
              onClick={() => handleLoadSetup(setup)}
              aria-label="Open budget"
            >
              <ArrowRight className="w-4 h-4" />
            </IconSquircleButton>
          </div>
        </td>
      </tr>
      );
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">BUDGET</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Review your monthly budget history</p>
          </div>
          <button type="button" onClick={handleOpenNew} className="flex items-center space-x-3 bg-indigo-600 text-white px-8 py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl transition-all">
            <Plus className="w-5 h-5" />
            <span>Open New</span>
          </button>
        </div>

        {archiveStatusMsg && (
          <div className={`flex items-center space-x-3 px-6 py-4 rounded-2xl text-sm font-bold ${archiveStatusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {archiveStatusMsg.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span>{archiveStatusMsg.msg}</span>
          </div>
        )}

        {/* Active budgets */}
        <div className="bg-white/40 backdrop-blur-xl rounded-[3rem] shadow-sm border border-gray-100 p-2 w-full">
          <div className="bg-white rounded-[2.5rem] overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Month</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Timing</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Total Budget</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Remaining</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Status</th>
                    <th className="p-6 pr-8 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activeSetups.length > 0 ? (
                    activeSetups.map(renderSetupRow)
                  ) : (
                    <tr><td colSpan={6} className="p-24 text-center text-gray-400 font-bold uppercase tracking-widest">No history found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Archived budgets – collapsible */}
        {archivedSetups.length > 0 && (
          <div className="bg-white/40 backdrop-blur-xl rounded-[3rem] shadow-sm border border-amber-100 p-2 w-full">
            <div className="bg-white rounded-[2.5rem] overflow-hidden w-full">
              <button
                type="button"
                onClick={() => setShowArchived(prev => !prev)}
                className="w-full flex items-center justify-between p-8 pl-12 pr-12 hover:bg-amber-50/40 transition-colors rounded-[2.5rem]"
              >
                <div className="flex items-center space-x-3">
                  <Archive className="w-5 h-5 text-amber-500" />
                  <span className="text-xs font-black text-amber-700 uppercase tracking-[0.25em]">Archived Budgets ({archivedSetups.length})</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-amber-400 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
              </button>
              {showArchived && (
                <div className="overflow-x-auto w-full border-t border-amber-50">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-amber-50">
                        <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Month</th>
                        <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Timing</th>
                        <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Total Budget</th>
                        <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Remaining</th>
                        <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Status</th>
                        <th className="p-6 pr-8 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {archivedSetups.map(renderSetupRow)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
      </div>
    );
  }

  const categorySummary = categories
    .filter(cat => {
      const catItems = setupData[cat.name] || [];
      const hasLoansData = cat.name === 'Loans' && installments.some(inst => {
        const timingMatch = !inst.timing || inst.timing === selectedTiming;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        return timingMatch && isActiveForPeriod && !isFinished && !excludedInstallmentIds.has(inst.id);
      });
      return shouldRenderCategorySection(cat, catItems.length > 0 || hasLoansData, selectedYear, selectedMonth);
    })
    .map((cat) => {
      const items = setupData[cat.name] || [];
      const itemsTotal = items.filter(i => i.included).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

      // FIX: Include installments for Loans category (same logic as Setup view)
      let installmentsTotal = 0;
      if (cat.name === 'Loans') {
        installmentsTotal = installments
          .filter(inst => {
            const timingMatch = !inst.timing || inst.timing === selectedTiming;
            const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
            const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
            // Only hide when there is NO schedule for this period AND the total is fully paid.
            // When a schedule exists for the viewed period, always keep the row visible so the
            // user can see the paid/partial indicator rather than the row disappearing on payment.
            const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
            const notExcluded = !excludedInstallmentIds.has(inst.id);
            return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
          })
          .reduce((s, inst) => s + inst.monthlyAmount, 0);
      }

      return { category: cat.name, total: itemsTotal + installmentsTotal };
    });
  // Include stash wallet targets for wallets not excluded from the grand total
  // Use the actual funded amount when it exceeds the target (over-funded stash)
  const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
  const grandTotal = categorySummary.reduce((sum, cat) => sum + cat.total, 0) + stashTotal;

  // Calculate Month Summary values
  const totalSpend = grandTotal;
  const actualSalaryValue = actualSalary.trim() !== '' ? parseFloat(actualSalary) : null;
  const projectedSalaryValue = parseFloat(projectedSalary) || 0;
  const salaryToUse = actualSalaryValue !== null && !isNaN(actualSalaryValue) ? actualSalaryValue : projectedSalaryValue;
  const remaining = salaryToUse - totalSpend;

  // Determine read-only state for the current setup
  const currentSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
  const isReadOnly = currentSetup?.isArchived ?? false;
  const legacyMode = isLegacyBudget(selectedYear, selectedMonth);

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20 w-full">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('summary')} className="flex flex-col text-left group">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-400 group-hover:text-indigo-400">Back to</span>
            <span className="text-sm font-black tracking-tight text-gray-600 group-hover:text-indigo-600">Summary</span>
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">BUDGET SETUP</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">{isReadOnly ? 'Archived — Read Only' : 'Configure Recurring Expenses'}</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Autosave Status Indicator */}
            {!isReadOnly && autoSaveStatus !== 'idle' && (
              <div className="flex items-center space-x-2 text-xs font-bold">
                {autoSaveStatus === 'saving' && (
                  <>
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-600">Saving...</span>
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">Saved</span>
                  </>
                )}
                {autoSaveStatus === 'error' && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-red-600">Error</span>
                  </>
                )}
              </div>
            )}
            {currentSetup && isReadOnly && (
              <button
                onClick={() => handleReopenSetup(currentSetup)}
                disabled={archiveSubmitting}
                className="flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-100 transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reopen</span>
              </button>
            )}
            {currentSetup && !isReadOnly && (
              <button
                onClick={() => handleArchiveSetup(currentSetup)}
                disabled={archiveSubmitting}
                className="flex items-center space-x-2 bg-amber-50 text-amber-700 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-amber-100 transition-all disabled:opacity-50"
              >
                <Archive className="w-4 h-4" />
                <span>Close</span>
              </button>
            )}
            {!isReadOnly && (
              <button onClick={handleSaveSetup} className="flex items-center space-x-3 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl">
                <Save className="w-5 h-5" />
                <span>Save</span>
              </button>
            )}
          </div>
        </div>

        {/* Read-only banner for archived budgets */}
        {isReadOnly && (
          <div className="flex items-center space-x-3 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4">
            <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-800">This budget is closed and archived. You can view it, but cannot make changes. Use <span className="font-black">Reopen</span> to edit it again.</p>
          </div>
        )}

        <div className="flex justify-center items-center space-x-6">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={isReadOnly} className="bg-white border border-gray-100 rounded-[1.5rem] px-8 py-4 font-black text-indigo-600 shadow-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed">
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedTiming} onChange={(e) => setSelectedTiming(e.target.value as '1/2' | '2/2')} disabled={isReadOnly} className="bg-white border border-gray-100 rounded-[1.5rem] px-8 py-4 font-black text-indigo-600 shadow-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed">
            <option value="1/2">1/2</option>
            <option value="2/2">2/2</option>
          </select>
          {legacyMode && (
            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-4 py-2 rounded-full uppercase tracking-widest">Legacy Budget</span>
          )}
        </div>
      </div>

      {/* Budget Summary and Month Summary side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Budget Summary - Compact Version */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
          <div className="p-4 border-b border-gray-50 bg-gray-50/30"><h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">BUDGET SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50"><th className="p-3 pl-6">Category</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {categorySummary.map((item) => (
                <tr key={item.category}><td className="p-3 pl-6 font-bold text-gray-700 text-sm">{item.category}</td><td className="p-3 pr-6 text-right font-black text-gray-900 text-sm">{formatCurrency(item.total)}</td></tr>
              ))}
              {stashTotal > 0 && (
                <tr><td className="p-3 pl-6 font-bold text-gray-700 text-sm">Stash</td><td className="p-3 pr-6 text-right font-black text-gray-900 text-sm">{formatCurrency(stashTotal)}</td></tr>
              )}
              <tr className="bg-indigo-50/30"><td className="p-3 pl-6 text-xs font-black text-indigo-600 uppercase">Grand Total</td><td className="p-3 pr-6 text-right text-lg font-black text-indigo-600">{formatCurrency(grandTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Month Summary - New Component */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
          <div className="p-4 border-b border-gray-50 bg-gray-50/30"><h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">MONTH SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50"><th className="p-3 pl-6">Item</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Projected Salary</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-gray-400 font-bold text-sm">₱</span>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={projectedSalary} 
                      onChange={(e) => setProjectedSalary(e.target.value)} 
                      disabled={isReadOnly}
                      className="bg-transparent border-none text-sm font-black text-gray-900 w-28 text-right outline-none focus:bg-indigo-50 rounded px-1 disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label="Projected Salary"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Actual Salary</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-gray-400 font-bold text-sm">₱</span>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={actualSalary} 
                      onChange={(e) => setActualSalary(e.target.value)} 
                      disabled={isReadOnly}
                      placeholder="Enter actual"
                      className="bg-transparent border-none text-sm font-black text-gray-900 w-28 text-right outline-none focus:bg-indigo-50 rounded px-1 placeholder:text-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label="Actual Salary"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Total Spend</td>
                <td className="p-3 pr-6 text-right font-black text-gray-900 text-sm">{formatCurrency(totalSpend)}</td>
              </tr>
              <tr className={`${remaining >= 0 ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                <td className="p-3 pl-6 text-xs font-black uppercase">Remaining</td>
                <td className={`p-3 pr-6 text-right text-lg font-black ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(remaining)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Tables - Full Width and Stacked for FIXED, UTILITIES, LOANS, SUBSCRIPTIONS, PURCHASES */}
      <div className="space-y-6">
        {/* Stash section - wallets from the wallets table */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
          <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">Stash</h3>
            <div className="flex items-center space-x-3">
              {stashStatusMsg && (
                <span className={`text-xs font-bold px-3 py-1 rounded-xl ${stashStatusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {stashStatusMsg.msg}
                </span>
              )}
              <span className="text-lg font-black text-indigo-600">
                {formatCurrency(wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0))}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {wallets.length === 0 ? (
              <div className="px-10 py-8 text-center text-gray-400 text-sm">
                No wallets configured yet.{' '}
                <a href="/wallets" className="text-indigo-500 font-bold hover:underline">Set up your wallets →</a>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                    <th className="p-4 pl-10">Name</th>
                    <th className="p-4">Target</th>
                    <th className="p-4">Account</th>
                    <th className="p-4 text-center">Info</th>
                    <th className="p-4 text-center">Actions</th>
                    <th className="p-4 pr-10 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {wallets.map((wallet) => {
                    const linkedAccount = accounts.find(a => a.id === wallet.accountId);
                    const { funded, isFunded } = getStashAggregates(wallet);
                    const isIncluded = !excludedWalletIds.has(wallet.id);
                    const isOverFunded = funded > wallet.amount && wallet.amount > 0;
                    const isExactlyFunded = funded === wallet.amount && wallet.amount > 0;
                    return (
                      <tr key={wallet.id} className={`${isIncluded ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                        <td className="p-4 pl-10">
                          <span className="text-sm font-bold text-gray-900">{wallet.name}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-sm font-black text-indigo-600">{formatCurrency(wallet.amount)}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-gray-600">
                            {linkedAccount ? `${linkedAccount.bank} (${linkedAccount.classification})` : wallet.accountId}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {isOverFunded ? (
                              <span aria-label={`Overfunded by ${formatCurrency(funded - wallet.amount)}`} className="text-xs font-black text-blue-600 px-2 py-1 bg-blue-50 rounded-lg">Overfunded +{formatCurrency(funded - wallet.amount)}</span>
                            ) : isExactlyFunded ? (
                              <span aria-label="Fully funded this month" className="text-xs font-black text-green-600 px-2 py-1 bg-green-50 rounded-lg">Funded</span>
                            ) : (
                              <span aria-label="Not yet funded" className="text-xs text-gray-400">—</span>
                            )}
                            <button
                              onClick={() => setStashInfoModal({ wallet })}
                              title="View stash details"
                              className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {!isReadOnly && (isFunded ? (
                            <button
                              onClick={() => handleOpenFundModal(wallet)}
                              title="Add more to this stash"
                              className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenFundModal(wallet)}
                              className="inline-flex items-center space-x-1 px-3 py-1 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Fund</span>
                            </button>
                          ))}
                        </td>
                        <td className="p-4 pr-10 text-right">
                          {!isReadOnly && (
                            <button
                              onClick={() => handleWalletIncludeToggle(wallet.id)}
                              title={isIncluded ? 'Exclude from grand total' : 'Include in grand total'}
                              className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Fixed category - full width with account and settle columns */}
        {categories.filter(cat => cat.name === 'Fixed').map((cat) => {
          const items = setupData[cat.name] || [];
          const shouldRenderCategory = shouldRenderCategorySection(cat, items.length > 0, selectedYear, selectedMonth);
          if (!shouldRenderCategory) return null;
          const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
          const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
          return (
            <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
              <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                  {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider" aria-label="Legacy category — use Stash for new savings/allowance items" title="This category is legacy. Use Stash for new savings/allowance items.">Legacy</span>}
                </div>
                <span className="text-lg font-black text-indigo-600">{formatCurrency(items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                      <th className="p-4 pl-10">Name</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Account</th>
                      <th className="p-4 text-center">Actions</th>
                      <th className="p-4 pr-10 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.length > 0 ? items.map((item) => {
                      return (
                        <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                          <td className="p-4 pl-10">
                            <input 
                              type="text" 
                              value={item.name} 
                              onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} 
                              disabled={isReadOnly}
                              className="bg-transparent border-none text-sm font-bold w-full disabled:cursor-default" 
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-400 font-bold">₱</span>
                              <input 
                                type="number" 
                                value={item.amount} 
                                onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} 
                                disabled={isReadOnly}
                                className="bg-transparent border-none text-sm font-black w-24 disabled:cursor-default" 
                              />
                            </div>
                          </td>
                          <td className="p-4">
                            <select 
                              value={item.accountId || ''} 
                              onChange={(e) => handleSetupUpdate(cat.name, item.id, 'accountId', e.target.value)}
                              disabled={isReadOnly}
                              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="">Select Account</option>
                              {accounts.filter(acc => acc.type === 'Debit').map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.bank} ({acc.classification})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {item.settled ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Item settled" title="Settled" />
                              ) : !isReadOnly ? (
                                <button 
                                  onClick={() => handleSetupUpdate(cat.name, item.id, 'settled', true)}
                                  className="px-3 py-1 bg-green-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-green-700 transition-colors"
                                >
                                  Settle
                                </button>
                              ) : null}
                              {!isReadOnly && (
                                <button 
                                  onClick={() => handleSetupToggle(cat.name, item.id)} 
                                  className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right">
                            {!isReadOnly && (
                              <button 
                                onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} 
                                className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg"
                              >
                                Exclude
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400 text-sm font-medium">
                          No items yet. Click "Add Item" below to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {canAddItems && <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600 border-t border-gray-50">+ Add Item</button>}
              </div>
            </div>
          );
        })}

        {/* Other full-width categories: Utilities, Loans, Subscriptions, Purchases */}
        {categories.filter(cat => ['Utilities', 'Loans', 'Subscriptions', 'Purchases'].includes(cat.name)).map((cat) => {
          const items = setupData[cat.name] || [];
          
          // QA: For Loans category, filter installments by timing, payment schedule existence, and completion status
          // Show installments that have a DB schedule for this month OR (no schedule yet) pass the date check.
          // Always exclude installments that are fully paid off.
          let relevantInstallments: Installment[] = [];
          if (cat.name === 'Loans') {
            relevantInstallments = installments.filter(inst => {
              // Filter by timing (if set, must match selected timing)
              const timingMatch = !inst.timing || inst.timing === selectedTiming;
              // Use schedule existence when available; fall back to date-based check for older installments
              const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
              const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
              // Only hide when there is NO schedule for this period AND the total is fully paid.
              // When a schedule exists for the viewed period, always keep the row visible so the
              // user can see the paid/partial indicator rather than the row disappearing on payment.
              const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
              return timingMatch && isActiveForPeriod && !isFinished;
            });
          }

          // Lifecycle: show if currently active OR has data (items or installments for Loans)
          const hasData = items.length > 0 || (cat.name === 'Loans' && relevantInstallments.length > 0);
          const shouldRenderCategory = shouldRenderCategorySection(cat, hasData, selectedYear, selectedMonth);
          if (!shouldRenderCategory) return null;

          // Flexi mode: only show Add Item when category allows manual items AND is still active
          const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
          const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
          
          // PROTOTYPE: Calculate total including installment monthly amounts (only included ones)
          const itemsTotal = items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          const installmentsTotal = relevantInstallments
            .filter(inst => !excludedInstallmentIds.has(inst.id))
            .reduce((s, inst) => s + inst.monthlyAmount, 0);
          const categoryTotal = itemsTotal + installmentsTotal;
          
          return (
            <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
              <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                  {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Legacy</span>}
                </div>
                <span className="text-lg font-black text-indigo-600">{formatCurrency(categoryTotal)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                      <th className="p-4 pl-10">Name</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4 text-center">Actions</th>
                      <th className="p-4 pr-10 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.length > 0 ? items.map((item) => {
                      let isPaid = false, isPartial = false, linkedBiller, paymentSchedule;
                      const isBiller = item.isBiller || billers.some(b => b.id === item.id);
                      
                      if (isBiller) {
                        linkedBiller = billers.find(b => b.id === item.id);
                        
                        // REFACTOR: Use payment schedule from monthly_payment_schedules table
                        paymentSchedule = getPaymentSchedule('biller', item.id);
                        
                        console.log(`[Budget] Checking payment for ${item.name} in ${selectedMonth}:`, {
                          foundPaymentSchedule: !!paymentSchedule,
                          scheduleId: paymentSchedule?.id,
                          scheduleStatus: paymentSchedule?.status,
                          amountPaid: paymentSchedule?.amount_paid,
                          expectedAmount: paymentSchedule?.expected_amount
                        });
                        
                        // REFACTOR: Use payment schedule status for accurate payment tracking
                        if (paymentSchedule) {
                          isPaid = checkIfPaidBySchedule('biller', item.id);
                          isPartial = checkIfPartialBySchedule('biller', item.id);
                          if (isPaid) {
                            console.log(`[Budget] Item ${item.name} in ${selectedMonth}: PAID via payment schedule`, {
                              scheduleId: paymentSchedule.id,
                              amountPaid: paymentSchedule.amount_paid,
                              datePaid: paymentSchedule.date_paid
                            });
                          }
                        } else {
                          // Fallback to transaction matching if no schedule found
                          isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                          if (isPaid) {
                            console.log(`[Budget] Item ${item.name} in ${selectedMonth}: PAID via transaction matching (no payment schedule)`);
                          }
                        }
                      } else {
                        // For non-biller items (like Purchases), only check transactions
                        isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                      }
                      return (
                        <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                          <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-bold w-full disabled:cursor-default" /></td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1"><span className="text-gray-400 font-bold">₱</span><input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 disabled:cursor-default" /></div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {isBiller && (
                                isPaid ? (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                    {paymentSchedule && (
                                      <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                        <Info className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {isPartial && paymentSchedule && (
                                      <>
                                        <span className="text-[9px] font-bold px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded uppercase" title={`Paid ₱${paymentSchedule.amount_paid} of ₱${parseFloat(item.amount)}`}>
                                          Partial
                                        </span>
                                        <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  {!isReadOnly && <button 
                                    onClick={() => { 
                                      if(linkedBiller && paymentSchedule) {
                                        // REFACTOR: Use payment schedule from monthly_payment_schedules table
                                        // Create a compatible schedule object for the modal
                                        const scheduleForModal: PaymentSchedule = {
                                          id: paymentSchedule.id, // schedule.id will be used for payment linking
                                          month: paymentSchedule.month,
                                          year: paymentSchedule.year.toString(),
                                          expectedAmount: paymentSchedule.expected_amount,
                                          amountPaid: paymentSchedule.amount_paid,
                                          datePaid: paymentSchedule.date_paid || undefined,
                                          receipt: paymentSchedule.receipt || undefined,
                                          accountId: paymentSchedule.account_id || undefined
                                        };
                                        
                                        // REVIEW FIX: Find latest transaction if multiple exist
                                        // Sort by date descending to get the most recent transaction
                                        const linkedTransactions = transactions
                                          .filter(tx => tx.payment_schedule_id === paymentSchedule.id)
                                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                        const existingTx = linkedTransactions[0]; // Get latest transaction
                                        
                                        setShowPayModal({
                                          biller: linkedBiller, 
                                          schedule: scheduleForModal, // schedule.id is included here
                                          expectedAmount: parseFloat(item.amount) // Use calculated amount (correct for Loans)
                                        }); 
                                        const today = new Date().toISOString().split('T')[0];
                                        setPayFormData({
                                          // When partial, always create a NEW transaction for the remaining amount.
                                          // Never reuse the existing partial transaction ID, which would overwrite it.
                                          transactionId: isPartial ? '' : (existingTx?.id || ''),
                                          amount: isPartial
                                            ? Math.max(0, parseFloat(item.amount) - paymentSchedule.amount_paid).toFixed(2)
                                            : existingTx?.amount.toString() || item.amount,
                                          receipt: (!isPartial && existingTx) ? 'Receipt on file' : '',
                                          datePaid: (!isPartial && existingTx) ? new Date(existingTx.date).toISOString().split('T')[0] : today,
                                          accountId: existingTx?.payment_method_id || payFormData.accountId
                                        }); 
                                      } 
                                    }} 
                                    className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                  >
                                    {isPartial ? 'Pay Remaining' : 'Pay'}
                                  </button>}
                                  </>
                                )
                              )}
                              {/* Add Pay button or checkmark for Purchases category items that are not billers */}
                              {!isBiller && cat.name === 'Purchases' && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
                                isPaid ? (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                    <button onClick={() => { const tx = findExistingTransaction(item.name, item.amount, selectedMonth); if (tx) openDirectPaymentModal(tx, `${item.name} - ${selectedMonth}`); }} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-3.5 h-3.5" /></button>
                                  </>
                                ) : !isReadOnly ? (
                                  <button 
                                    onClick={() => {
                                      setTransactionFormData({
                                        id: '',
                                        name: item.name,
                                        date: new Date().toISOString().split('T')[0],
                                        amount: item.amount,
                                        accountId: item.accountId || accounts[0]?.id || '',
                                        paymentScheduleId: '' // No schedule for regular purchases
                                      });
                                      setShowTransactionModal(true);
                                    }}
                                    className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                  >
                                    Pay
                                  </button>
                                ) : null
                              )}
                              {!isReadOnly && <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>}
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right">{!isReadOnly && <button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Exclude</button>}</td>
                        </tr>
                      );
                    }) : (cat.name === 'Loans' && relevantInstallments.length > 0) ? null : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400 text-sm font-medium">
                          No items yet. Click "Add Item" below to get started.
                        </td>
                      </tr>
                    )}
                    {/* PROTOTYPE: Render installments for Loans category */}
                    {cat.name === 'Loans' && relevantInstallments.length > 0 && (
                      <>
                        {relevantInstallments.map((installment) => {
                          const account = accounts.find(a => a.id === installment.accountId);
                          const isIncluded = !excludedInstallmentIds.has(installment.id);
                          
                          // REFACTOR: Use payment schedule for accurate status
                          let isPaid = false, isPartial = false;
                          const installmentSchedule = getPaymentSchedule('installment', installment.id, selectedMonth, selectedYear);
                          
                          if (installmentSchedule) {
                            // Use payment schedule status
                            isPaid = checkIfPaidBySchedule('installment', installment.id);
                            isPartial = checkIfPartialBySchedule('installment', installment.id);
                            console.log('[Budget] Installment payment check via schedule:', {
                              name: installment.name,
                              selectedMonth,
                              scheduleId: installmentSchedule.id,
                              status: installmentSchedule.status,
                              amountPaid: installmentSchedule.amount_paid,
                              isPaid,
                              isPartial
                            });
                          } else if (installment.startDate) {
                            // Fallback to cumulative calculation if no schedule found
                            try {
                              // Parse start date (format: YYYY-MM)
                              const [startYear, startMonthNum] = installment.startDate.split('-').map(Number);
                              const startMonthIndex = startMonthNum - 1; // Convert to 0-based index
                              
                              // Get current month index
                              const currentYear = new Date().getFullYear();
                              const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
                              
                              // Calculate months passed (accounting for years)
                              const monthsPassed = (currentYear - startYear) * 12 + (selectedMonthIndex - startMonthIndex);
                              
                              if (monthsPassed >= 0) {
                                // Check if this month's installment is paid based on cumulative amount
                                const expectedPaidByThisMonth = (monthsPassed + 1) * installment.monthlyAmount;
                                isPaid = installment.paidAmount >= expectedPaidByThisMonth;
                                
                                console.log('[Budget] Installment payment check (fallback):', {
                                  name: installment.name,
                                  selectedMonth,
                                  monthsPassed,
                                  expectedPaidByThisMonth,
                                  actualPaidAmount: installment.paidAmount,
                                  isPaid
                                });
                              }
                            } catch (error) {
                              console.error('[Budget] Error calculating installment payment status:', error);
                              // Fallback to unpaid if calculation fails
                              isPaid = false;
                            }
                          }
                          
                          // Fallback transaction lookup for Info button when no payment schedule exists
                          const fallbackInstallmentTx = !installmentSchedule && (isPaid || isPartial)
                            ? findExistingTransaction(installment.name, installment.monthlyAmount, selectedMonth)
                            : undefined;

                          // Unified Info button click handler (schedule-based or fallback transaction)
                          const installmentInfoClick = installmentSchedule
                            ? () => openSchedulePaymentsModal(installmentSchedule.id, `${installment.name} - ${selectedMonth}`)
                            : fallbackInstallmentTx
                              ? () => openDirectPaymentModal(fallbackInstallmentTx, `${installment.name} - ${selectedMonth}`)
                              : null;

                          return (
                            <tr key={`installment-${installment.id}`} className={`${isIncluded ? 'bg-blue-50/30' : 'bg-gray-50 opacity-60'}`}>
                              <td className="p-4 pl-10">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-900">{installment.name}</span>
                                  <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 rounded text-blue-600">
                                    INSTALLMENT {installment.timing ? `• ${installment.timing}` : ''}
                                  </span>
                                </div>
                                {account && (
                                  <div className="text-[10px] text-gray-400 font-medium mt-1">
                                    {account.bank} • {installment.termDuration}
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1">
                                  <span className="text-gray-400 font-bold">₱</span>
                                  <span className="text-sm font-black">{formatCurrency(installment.monthlyAmount).replace('₱', '')}</span>
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isPaid ? (
                                    <>
                                      <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                      {installmentInfoClick && (
                                        <button onClick={installmentInfoClick} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {isPartial && (
                                        <>
                                          {installmentSchedule && (
                                            <span className="text-[9px] font-bold px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded uppercase" title={`Paid ₱${installmentSchedule.amount_paid} of ₱${installmentSchedule.expected_amount}`}>
                                              Partial
                                            </span>
                                          )}
                                          {installmentInfoClick && (
                                            <button onClick={installmentInfoClick} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                              <Info className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </>
                                      )}
                                    {!isReadOnly && <button 
                                      onClick={() => {
                                        // FIX: Include payment schedule ID for proper linking
                                        setTransactionFormData({
                                          id: '',
                                          name: `${installment.name} - ${selectedMonth} ${new Date().getFullYear()}`,
                                          date: new Date().toISOString().split('T')[0],
                                          amount: isPartial && installmentSchedule
                                            ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2)
                                            : installment.monthlyAmount.toString(),
                                          accountId: installment.accountId || accounts[0]?.id || '',
                                          paymentScheduleId: installmentSchedule?.id || '' // FIX: Pass schedule ID
                                        });
                                        setShowTransactionModal(true);
                                      }}
                                      className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                      {isPartial ? 'Pay Remaining' : 'Pay'}
                                    </button>}
                                    </>
                                  )}
                                  {!isReadOnly && <button 
                                    onClick={() => {
                                      setExcludedInstallmentIds(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(installment.id)) {
                                          newSet.delete(installment.id);
                                        } else {
                                          newSet.add(installment.id);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>}
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right">
                                {!isReadOnly && <button 
                                  onClick={() => {
                                    setConfirmModal({
                                      show: true,
                                      title: 'Exclude Installment',
                                      message: `Are you sure you want to exclude "${installment.name}" from this budget period? This will not delete the installment, just exclude it from this budget.`,
                                      onConfirm: () => {
                                        setExcludedInstallmentIds(prev => new Set([...prev, installment.id]));
                                        setConfirmModal(prev => ({ ...prev, show: false }));
                                      }
                                    });
                                  }}
                                  className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  Exclude
                                </button>}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
                {canAddItems && <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600 border-t border-gray-50">+ Add Item</button>}
              </div>
            </div>
          );
        })}

        {/* PROTOTYPE: Credit Card Regular Purchases Section */}
        {(() => {
          // Get all credit card accounts
          const creditCardAccounts = accounts.filter(acc => acc.classification === 'Credit Card' && acc.billingDate);
          
          if (creditCardAccounts.length === 0) return null;
          
          // Aggregate purchases for each credit card for the selected month
          const monthIndex = MONTHS.indexOf(selectedMonth);
          const currentYear = new Date().getFullYear();
          
          return creditCardAccounts.map(account => {
            const cycleSummaries = aggregateCreditCardPurchases(account, transactions, installments);
            
            // Find the cycle that contains the selected month
            const relevantCycle = cycleSummaries.find(cycle => {
              const cycleMonth = cycle.cycleStart.getMonth();
              const cycleYear = cycle.cycleStart.getFullYear();
              // Match if cycle overlaps with selected month
              return (cycleMonth === monthIndex && cycleYear === currentYear) ||
                     (cycle.cycleEnd.getMonth() === monthIndex && cycle.cycleEnd.getFullYear() === currentYear);
            });
            
            if (!relevantCycle || relevantCycle.transactionCount === 0) return null;
            
            return (
              <div key={`cc-${account.id}`} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
                <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">Credit Card Purchases</h3>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">{account.bank} • {relevantCycle.cycleLabel}</p>
                  </div>
                  <span className="text-lg font-black text-purple-600">{formatCurrency(relevantCycle.totalAmount)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                        <th className="p-4 pl-10">Transaction</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4 pr-10 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {relevantCycle.transactions.map((tx) => (
                        <tr key={tx.id} className="bg-purple-50/20">
                          <td className="p-4 pl-10">
                            <span className="text-sm font-bold text-gray-900">{tx.name}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs text-gray-500 font-medium">
                              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-400 font-bold">₱</span>
                              <span className="text-sm font-black">{formatCurrency(tx.amount).replace('₱', '')}</span>
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right">
                            {/* QA: Add edit button for transactions - Fix for Issue #6 */}
                            <button
                              onClick={() => {
                                // Format date as YYYY-MM-DD for input (split directly to avoid UTC shift)
                                const dateStr = tx.date.split('T')[0];
                                setTransactionFormData({
                                  id: tx.id,
                                  name: tx.name,
                                  date: dateStr,
                                  amount: tx.amount.toString(),
                                  accountId: tx.payment_method_id,
                                  paymentScheduleId: tx.payment_schedule_id || '' // FIX: Preserve schedule ID when editing
                                });
                                setShowTransactionModal(true);
                              }}
                              className="text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-purple-100/30">
                        <td colSpan={2} className="p-4 pl-10 text-xs font-black text-gray-700 uppercase">
                          Total Regular Purchases
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-400 font-bold">₱</span>
                            <span className="text-sm font-black text-purple-600">{formatCurrency(relevantCycle.totalAmount).replace('₱', '')}</span>
                          </div>
                        </td>
                        <td className="p-4 pr-10 text-right">
                          <span className="text-[9px] font-bold text-purple-600 uppercase tracking-widest">
                            {relevantCycle.transactionCount} txn(s)
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="p-4 border-t border-gray-50 bg-gray-50/50">
                    <p className="text-[10px] text-gray-500 font-medium text-center">
                      <span className="font-bold">PROTOTYPE:</span> Regular credit card purchases are auto-aggregated from transactions. 
                      Excludes installment payments.
                    </p>
                  </div>
                </div>
              </div>
            );
          });
        })()}

        {/* Remaining categories (excluding Fixed, Utilities, Loans, Subscriptions, Purchases) - keep in grid if needed */}
        {(() => {
          const remainingCats = categories.filter(cat =>
            !['Fixed', 'Utilities', 'Loans', 'Subscriptions', 'Purchases'].includes(cat.name) &&
            shouldRenderCategorySection(cat, (setupData[cat.name] || []).length > 0, selectedYear, selectedMonth)
          );
          if (remainingCats.length === 0) return null;
          return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {remainingCats.map((cat) => {
              const items = setupData[cat.name] || [];
              const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
              const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
              return (
                <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                      {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Legacy</span>}
                    </div>
                    <span className="text-lg font-black text-indigo-600">{formatCurrency(items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-gray-50">
                        {items.map((item) => {
                          let isPaid = false, linkedBiller, schedule;
                          const isBiller = item.isBiller || billers.some(b => b.id === item.id);
                          
                          if (isBiller) {
                            linkedBiller = billers.find(b => b.id === item.id);
                            schedule = linkedBiller?.schedules.find(s => s.month === selectedMonth);
                            // FIX: For billers with schedules, ONLY use schedule.amountPaid
                            // This prevents double-counting when transactions match multiple months via grace period
                            if (schedule) {
                              isPaid = !!schedule.amountPaid;
                            } else {
                              // Fallback to transaction matching if no schedule found
                              isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                            }
                          } else {
                            // For non-biller items, only check transactions
                            isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                          }
                          return (
                            <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                              <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold w-full" /></td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1"><span className="text-gray-400 font-bold">₱</span><input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} className="bg-transparent border-none text-sm font-black w-24" /></div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isBiller && (
                                    isPaid ? (
                                      <>
                                        <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                        {schedule?.id && (
                                          <button onClick={() => openSchedulePaymentsModal(schedule.id!, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                            <Info className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button 
                                        onClick={() => { 
                                          if(linkedBiller && schedule) {
                                            // QA: Check for existing transaction to enable editing
                                            const existingTx = findExistingTransaction(
                                              linkedBiller.name,
                                              schedule.expectedAmount,
                                              selectedMonth
                                            );
                                            
                                            setShowPayModal({biller: linkedBiller, schedule}); 
                                            setPayFormData({
                                              transactionId: existingTx?.id || '',
                                              amount: existingTx?.amount.toString() || schedule.expectedAmount.toString(),
                                              receipt: existingTx ? 'Receipt on file' : '',
                                              datePaid: existingTx ? new Date(existingTx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                              accountId: existingTx?.payment_method_id || payFormData.accountId
                                            }); 
                                          } 
                                        }} 
                                        className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                      >
                                        Pay
                                      </button>
                                    )
                                  )}
                                  <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right"><button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Exclude</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {canAddItems && <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600">+ Add Item</button>}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>

      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowPayModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
            {/* QA: Consistent Pay form - receipt upload added back, name in title */}
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Pay {showPayModal.biller.name}
            </h2>
            <p className="text-gray-500 text-sm mb-8">
              {payFormData.transactionId 
                ? `Updating payment for ${showPayModal.schedule.month}`
                : `Recording payment for ${showPayModal.schedule.month}`}
            </p>
            <form onSubmit={handlePaySubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input required type="number" step="0.01" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                  <input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                  <select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0] || null; setPayReceiptFile(f); setPayFormData({...payFormData, receipt: f?.name || ''}); }} />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">
                  {payFormData.transactionId ? 'Update Payment' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QA: Consistent Transaction Form Modal - with receipt upload */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowTransactionModal(false)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              {transactionFormData.id ? `Edit Payment` : `Pay ${transactionFormData.name || 'Item'}`}
            </h2>
            <p className="text-gray-500 text-sm mb-8">
              {transactionFormData.id 
                ? 'Update the payment details below' 
                : 'Record a payment transaction'}
            </p>
            <form onSubmit={handleTransactionSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    required 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={transactionFormData.amount} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, amount: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                  <input 
                    required 
                    type="date" 
                    value={transactionFormData.date} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, date: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                  <select 
                    value={transactionFormData.accountId} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, accountId: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">Click or drag to upload receipt</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">
                  {transactionFormData.id ? 'Update Payment' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fund Stash Modal */}
      {fundModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setFundModal(null)}>
          <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFundModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close"><X className="w-5 h-5" /></button>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Fund Stash</h2>
                <p className="text-xs text-gray-500 font-medium">{fundModal.wallet.name}</p>
              </div>
            </div>
            <form onSubmit={handleFundSubmit} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount <span className="text-red-500">*</span></label>
                <div className="flex items-center border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-indigo-400 transition-colors">
                  <span className="text-gray-400 font-bold mr-2">₱</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={fundForm.amount}
                    onChange={e => setFundForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    required
                    className="flex-1 bg-transparent border-none outline-none text-sm font-black text-indigo-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={fundForm.date}
                  onChange={e => setFundForm(f => ({ ...f, date: e.target.value }))}
                  min={(() => { const mi = MONTHS.indexOf(selectedMonth); return `${selectedYear}-${String(mi + 1).padStart(2, '0')}-01`; })()}
                  max={(() => { const mi = MONTHS.indexOf(selectedMonth); const last = new Date(selectedYear, mi + 1, 0).getDate(); return `${selectedYear}-${String(mi + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`; })()}
                  required
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Notes <span className="text-gray-300">(optional)</span></label>
                <input
                  type="text"
                  value={fundForm.notes}
                  onChange={e => setFundForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Monthly allocation"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-700 outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="flex flex-col space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={fundSubmitting}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all disabled:opacity-60"
                >
                  {fundSubmitting ? 'Funding…' : 'Fund Stash'}
                </button>
                <button type="button" onClick={() => setFundModal(null)} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stash Info Modal */}
      {stashInfoModal && (() => {
        const { funded, remaining, topUps } = getStashAggregates(stashInfoModal.wallet);
        const linkedAccount = accounts.find(a => a.id === stashInfoModal.wallet.accountId);
        return (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setStashInfoModal(null)}>
            <div className="w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <button onClick={() => setStashInfoModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close"><X className="w-5 h-5" /></button>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <Info className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Stash Info</h2>
                  <p className="text-xs text-gray-500 font-medium">{stashInfoModal.wallet.name} · {selectedMonth} {selectedYear}</p>
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-2xl p-4 text-center">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Target</p>
                  <p className="text-base font-black text-indigo-600">{formatCurrency(stashInfoModal.wallet.amount)}</p>
                </div>
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Funded</p>
                  <p className="text-base font-black text-green-600">{formatCurrency(funded)}</p>
                </div>
                <div className="bg-orange-50 rounded-2xl p-4 text-center">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Remaining</p>
                  <p className="text-base font-black text-orange-600">{formatCurrency(remaining)}</p>
                </div>
              </div>
              {linkedAccount && (
                <p className="text-xs text-gray-500 mb-5 font-medium">Account: <span className="text-gray-700 font-bold">{linkedAccount.bank} ({linkedAccount.classification})</span></p>
              )}
              {/* Top-ups list */}
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Top-ups this month</h3>
              {topUps.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">No top-ups for this stash this month. Fund this stash to see top-ups here.</p>
              ) : (
                <div className="space-y-3">
                  {topUps.map(tx => (
                    <div key={tx.id} className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-gray-900">{tx.name}</p>
                        <p className="text-xs text-gray-500">{new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                        {tx.notes && <p className="text-xs text-gray-400 italic">{tx.notes}</p>}
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-black text-indigo-600">{formatCurrency(Math.abs(tx.amount))}</span>
                        <button
                          onClick={() => handleDeleteStashTopUp(tx.id, tx.amount)}
                          aria-label={`Delete top-up of ${formatCurrency(Math.abs(tx.amount))} from ${new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                          className="text-red-400 hover:text-red-600 p-1.5 rounded-xl hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {schedulePaymentsModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setSchedulePaymentsModal(null)}>
          <div className="w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSchedulePaymentsModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Close"><X className="w-5 h-5" /></button>
            <h2 className="text-2xl font-black text-gray-900 mb-1">Payment Records</h2>
            <p className="text-gray-500 text-sm mb-6">{schedulePaymentsModal.label}</p>
            {loadingScheduleTx ? (
              <div className="text-center py-8 text-gray-400">Loading...</div>
            ) : schedulePaymentsModal.transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 italic">No payment records found.</div>
            ) : (
              <div className="space-y-4">
                {schedulePaymentsModal.transactions.map(tx => {
                  const pmName = accounts.find(a => a.id === tx.paymentMethodId)?.bank || tx.paymentMethodId;
                  const signedUrl = scheduleSignedUrls[tx.id];
                  return (
                    <div key={tx.id} className="bg-gray-50 rounded-2xl p-4 space-y-2">
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
                      {tx.receiptUrl && (
                        <div className="flex items-center space-x-3 pt-1">
                          {signedUrl ? (
                            <>
                              <img src={signedUrl} alt={`Receipt for ${tx.name}`} className="w-12 h-12 rounded-xl object-cover border border-gray-200" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              <button onClick={() => { setZoom(0.5); setPreviewReceiptUrl(signedUrl); }} title="Preview receipt" className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-bold">
                                <Eye className="w-3.5 h-3.5" /><span>Preview</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Loading receipt…</span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleDeleteScheduleTx(tx.id)}
                          title="Delete payment record"
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                <button onClick={() => setZoom(z => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_INCREMENT).toFixed(2))))} title="Zoom out" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_INCREMENT).toFixed(2))))} title="Zoom in" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
                <a href={previewReceiptUrl} download target="_blank" rel="noreferrer" title="Download receipt" className="p-2 rounded-xl hover:bg-indigo-50 text-indigo-600 transition-colors" aria-label="Download receipt"><Download className="w-4 h-4" /></a>
                <button onClick={() => setPreviewReceiptUrl(null)} title="Close" className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors" aria-label="Close preview"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4 flex justify-center">
              <img src={previewReceiptUrl} alt={`Receipt — ${schedulePaymentsModal?.label || ''}`} style={{ width: `${zoom * 100}%`, height: 'auto', transition: 'width 0.2s' }} />
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
    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all">Proceed</button>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
      </div>
    </div>
  </div>
);

export default Budget;
