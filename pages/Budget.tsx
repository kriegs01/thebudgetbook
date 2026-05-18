// pages/Budget.tsx
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory, Installment, Wallet } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, FileText, Wallet as WalletIcon, ArrowRight, ArrowLeft, Upload, CheckCircle2, X, AlertTriangle, Info, Eye, ZoomIn, ZoomOut, Download, Archive, RotateCcw, Lock, List } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend, archiveBudgetSetup, reopenBudgetSetup } from '../src/services/budgetSetupsService';
import { createTransaction, getAllTransactions, updateTransaction, updateTransactionAndSyncSchedule, createPaymentScheduleTransaction, uploadTransactionReceipt, getTransactionsByPaymentSchedule, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, getAllStashTransactions } from '../src/services/transactionsService';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule } from '../src/types/supabase';
import { getInstallmentPaymentSchedule, aggregateCreditCardPurchases } from '../src/utils/paymentStatus';
import { getScheduleExpectedAmount } from '../src/utils/linkedAccountUtils';
import { getBillerAmountForDate } from '../src/utils/billers';
import { getPaymentSchedulesByPeriod, recordPaymentViaTransaction } from '../src/services/paymentSchedulesService';
import { combineDateWithCurrentTime } from '../src/utils/dateUtils';
import { getWalletsForCurrentUser } from '../src/services/walletsService';
import { useTheme } from '../src/contexts/ThemeContext';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { BudgetSetupsList } from '../src/components/BudgetSetupsList';

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
  onUpdateInstallment?: (installment: Installment) => Promise<void>;
  installments?: Installment[];
  onTransactionCreated?: () => void;
  onTransactionDeleted?: () => void;
  onArchiveBudget?: (setup: SavedBudgetSetup) => Promise<void>;
  onReopenBudget?: (setup: SavedBudgetSetup) => Promise<void>;
  userProfile?: any;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const isBillerActiveForPeriod = (biller: Biller, month: string, year: number): boolean => {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx === -1) return false;

  const actYear = parseInt(biller.activationDate.year);
  const actMonthIdx = MONTHS.indexOf(biller.activationDate.month);
  if (isNaN(actYear) || actMonthIdx === -1) return false;

  if (year < actYear || (year === actYear && monthIdx < actMonthIdx)) {
    return false;
  }

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

const BUDGET_SETUP_STATUS = {
  SAVED: 'Saved',
  ACTIVE: 'Active',
  COMPLETED: 'Completed'
} as const;

const AUTO_SAVE_DEBOUNCE_MS = 3000;
const AUTO_SAVE_STATUS_TIMEOUT_MS = 3000;

const TRANSACTION_AMOUNT_TOLERANCE = 1;
const TRANSACTION_MIN_NAME_LENGTH = 3;
const TRANSACTION_DATE_GRACE_DAYS = 7;

type BudgetScheduleTx = { id: string; name: string; amount: number; date: string; paymentMethodId: string; receiptUrl?: string | null };

const ZOOM_INCREMENT = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

const STASH_GO_LIVE = new Date(2026, 2, 1);

const isLegacyBudget = (year: number, month: string): boolean => {
  const monthIdx = MONTHS.indexOf(month);
  if (monthIdx === -1) return false;
  const budgetStart = new Date(year, monthIdx, 1);
  return budgetStart < STASH_GO_LIVE;
};

const parseIsoMonthStart = (iso: string): Date => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1);
};

const isCategoryActiveForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  const monthIndex = MONTHS.indexOf(selectedMonthName);
  if (monthIndex < 0) return cat.active !== false;

  const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
  const deactivationDate = cat.deactivatedAt ? parseIsoMonthStart(cat.deactivatedAt) : null;
  const reactivationDate = cat.reactivatedFrom ? parseIsoMonthStart(cat.reactivatedFrom) : null;

  if (!deactivationDate && !reactivationDate) {
    return cat.active !== false;
  }

  if (deactivationDate && !reactivationDate) {
    return budgetMonthStart < deactivationDate;
  }

  if (!deactivationDate && reactivationDate) {
    return budgetMonthStart >= reactivationDate;
  }

  if (budgetMonthStart < deactivationDate!) {
    return true;
  }
  if (reactivationDate && budgetMonthStart >= reactivationDate) {
    return true;
  }
  return false;
};

const shouldRenderCategorySection = (
  cat: BudgetCategory,
  hasData: boolean,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  const isActive = isCategoryActiveForBudget(cat, selectedYear, selectedMonthName);

  if (cat.deactivatedAt) {
    const monthIndex = MONTHS.indexOf(selectedMonthName);
    if (monthIndex >= 0) {
      const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
      const deactivationDate = parseIsoMonthStart(cat.deactivatedAt);
      const reactivationDate = cat.reactivatedFrom ? parseIsoMonthStart(cat.reactivatedFrom) : null;
      const inGap = budgetMonthStart >= deactivationDate && (!reactivationDate || budgetMonthStart < reactivationDate);
      if (inGap) return false;
    }
  }

    if (cat.flexiMode === false && !hasData) {
      return false;
    }

  return isActive || hasData;
};

const isCategoryLegacyForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  if (!cat.deactivatedAt) return false;

  const monthIndex = MONTHS.indexOf(selectedMonthName);
  if (monthIndex < 0) return false;

  const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
  const deactivationDate = parseIsoMonthStart(cat.deactivatedAt);

  if (budgetMonthStart >= deactivationDate) return false;

  if (cat.legacyFrom) {
    const legacyFromDate = parseIsoMonthStart(cat.legacyFrom);
    return budgetMonthStart >= legacyFromDate;
  }

  return true;
};

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
    window.addEventListener('resize', calculateWidth);
    return () => window.removeEventListener('resize', calculateWidth);
  }, [title]);

  return (
    <header className={`${isMobile ? 'pt-8' : 'pt-12'} flex flex-row items-center justify-between gap-6`}>
        <div className="flex-1">
            <div className="relative inline-block">
                <div
                    ref={titleContainerRef}
                    className="flex items-center gap-4"
                >
                    {icon && <div className="z-10 shrink-0">{icon}</div>}
                    <h1
                        className="text-[clamp(2rem,7.5vw,3.75rem)] font-[950] uppercase tracking-tighter leading-none relative z-10 text-black dark:text-white transition-colors duration-300"
                    >
                        {title}
                    </h1>
                </div>
                {highlightWidth > 0 && (
                    <div
                        className={`absolute bottom-1 left-0 h-5 ${getAccentClasses('bg')} opacity-40 -z-0 -rotate-1 -translate-x-2 transition-colors duration-300`}
                        style={{ width: `${highlightWidth}px` }}
                    />
                )}
            </div>

            <div className="flex items-center gap-3 mt-1 ml-1">
                {!backButton && (
                    <p
                        className="text-[clamp(1rem,3vw,1.25rem)] font-bold italic text-black/50 dark:text-gray-400 transition-colors duration-300"
                    >
                        {subtitle}
                    </p>
                )}
            </div>

            <div className={`h-2 w-32 mt-2 bg-black dark:bg-white/20 transition-colors duration-300`} />

            {backButton && <div className="mt-6">{backButton}</div>}
        </div>
        {actions && <div className="flex items-center justify-end gap-3">{actions}</div>}
    </header>
  );
};

const calculateBudgetRemaining = (
  setup: SavedBudgetSetup,
  transactions: SupabaseTransaction[],
  selectedYear: number
): number => {
  if (!setup.data) return -setup.totalAmount;
  const actualStr = setup.data._actualSalary;
  const projectedStr = setup.data._projectedSalary;
  const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
  const projectedValue = parseFloat(projectedStr || '0') || 0;
  
  const currentMonthIndex = MONTHS.indexOf(setup.month);
  const allIncomeTxs = transactions.filter(tx => {
    if (tx.transaction_type !== 'cash_in') return false;
    
    const isTaggedIncome = tx.notes?.startsWith('Income Record');
    const nameLower = tx.name.trim().toLowerCase();
    const isLegacyIncome = nameLower === 'salary' || nameLower === 'income';
    
    if (!isTaggedIncome && !isLegacyIncome) return false;

    const txDate = new Date(tx.date);
    if (txDate.getMonth() !== currentMonthIndex || txDate.getFullYear() !== selectedYear) return false;

    let matchesTiming = false;
    if (tx.notes?.includes(' - 1/2') || tx.notes?.includes(' - 2/2')) {
      matchesTiming = tx.notes.includes(` - ${setup.timing}`);
    } else {
      const estimatedTiming = txDate.getDate() <= 15 ? '1/2' : '2/2';
      matchesTiming = estimatedTiming === setup.timing;
    }

    return matchesTiming;
  });

  const otherIncomeTxs = allIncomeTxs.filter(tx => {
    const nameLower = tx.name.trim().toLowerCase();
    return nameLower !== 'salary' && nameLower !== 'income';
  });

  const totalOtherIncome = otherIncomeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const hasIncomeRecords = allIncomeTxs.length > 0;

  let salaryToUse = 0;
  if (actualValue !== null && !isNaN(actualValue)) {
    salaryToUse = actualValue;
  } else if (hasIncomeRecords) {
    salaryToUse = 0;
  } else {
    salaryToUse = projectedValue;
  }

  const netIncome = salaryToUse + totalOtherIncome;
  return netIncome - setup.totalAmount;
};

const Budget: React.FC<BudgetProps> = ({ accounts, billers, categories, savedSetups, setSavedSetups, onUpdateBiller, onMoveToTrash, onReloadSetups, onReloadBillers, onUpdateInstallment, installments = [], onTransactionCreated, onTransactionDeleted, onArchiveBudget, onReopenBudget, userProfile }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const viewParam = searchParams.get('view');
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const timingParam = searchParams.get('timing');

    if (viewParam === 'setup') {
      if (monthParam) setSelectedMonth(monthParam);
      if (yearParam) setSelectedYear(parseInt(yearParam, 10));
      if (timingParam === '1/2' || timingParam === '2/2') setSelectedTiming(timingParam);
      
      setView('setup');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view === 'setup') {
      params.set('view', 'setup');
      params.set('month', selectedMonth);
      params.set('year', String(selectedYear));
      params.set('timing', selectedTiming);
      navigate(`?${params.toString()}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [view, selectedMonth, selectedYear, selectedTiming, navigate]);

  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  const isFocusedRef = useRef(false);

  const [excludedInstallmentIds, setExcludedInstallmentIds] = useState<Set<string>>(new Set());

  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');
  const [isProjectedFocused, setIsProjectedFocused] = useState(false);
  const [isActualFocused, setIsActualFocused] = useState(false);

  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [stashTopUps, setStashTopUps] = useState<SupabaseTransaction[]>([]);
  const [excludedWalletIds, setExcludedWalletIds] = useState<Set<string>>(new Set());

  const [fundModal, setFundModal] = useState<{ wallet: Wallet } | null>(null);
  const [fundForm, setFundForm] = useState({ amount: '', date: '', notes: '' });
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [stashInfoModal, setStashInfoModal] = useState<{ wallet: Wallet } | null>(null);
  const [stashStatusMsg, setStashStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [archiveStatusMsg, setArchiveStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  const [showArchived, setShowArchived] = useState(false);

  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);

  useEffect(() => {
    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    if (existingSetup && existingSetup.data) {
      const incomingData = existingSetup.data;
      const currentDataStr = JSON.stringify(setupData);
      const incomingDataStr = JSON.stringify(Object.fromEntries(
        Object.entries(incomingData).filter(([key]) => !key.startsWith('_'))
      ));

      if (currentDataStr !== incomingDataStr) {
        setSetupData(incomingData as any);
      }

      const newProjected = incomingData._projectedSalary ?? '11000';
      const newActual = incomingData._actualSalary ?? '';
      if (newProjected !== projectedSalary) setProjectedSalary(newProjected);
      if (newActual !== actualSalary) setActualSalary(newActual);

      if (Array.isArray(existingSetup.data._excludedInstallmentIds)) {
        setExcludedInstallmentIds(new Set(existingSetup.data._excludedInstallmentIds));
      } else {
        setExcludedInstallmentIds(new Set());
      }
      if (Array.isArray(existingSetup.data._excludedWalletIds)) {
        setExcludedWalletIds(new Set(existingSetup.data._excludedWalletIds));
      } else {
        setExcludedWalletIds(new Set());
      }
    } else {
      setProjectedSalary('11000');
      setActualSalary('');
      setExcludedInstallmentIds(new Set());
      setExcludedWalletIds(new Set());
    }
  }, [selectedMonth, selectedTiming, savedSetups]);

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const { data, error } = await getAllTransactions();
        if (error) {
          console.error('[Budget] Failed to load transactions:', error);
        } else if (data) {
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          
          const recentTransactions = data.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= twoYearsAgo;
          });
          
          setTransactions(recentTransactions);
        }
      } catch (error) {
        console.error('[Budget] Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, []);

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

  const getStashTopUps = useCallback((walletId: string): SupabaseTransaction[] => {
    const monthIndex = MONTHS.indexOf(selectedMonth);
    return stashTopUps.filter(tx => {
      if (tx.wallet_id !== walletId) return false;
      const txDate = new Date(tx.date);
      return txDate.getMonth() === monthIndex && txDate.getFullYear() === selectedYear;
    });
  }, [stashTopUps, selectedMonth, selectedYear]);

  const getStashAggregates = useCallback((wallet: Wallet) => {
    const topUps = getStashTopUps(wallet.id);
    const funded = topUps.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const remaining = Math.max(0, wallet.amount - funded);
    const isFunded = funded >= wallet.amount;
    return { funded, remaining, isFunded, topUps };
  }, [getStashTopUps]);

  const handleOpenFundModal = useCallback((wallet: Wallet) => {
    const { remaining } = getStashAggregates(wallet);
    const now = new Date();
    const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
    const isCurrentPeriod =
      now.getFullYear() === selectedYear && now.getMonth() === selectedMonthIndex;
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

  const handleFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundModal) return;
    const amount = parseFloat(fundForm.amount);
    if (isNaN(amount) || amount <= 0) return;
    const walletId = fundModal.wallet.id;
    const walletName = fundModal.wallet.name;
    const walletAccountId = fundModal.wallet.accountId;
    setFundSubmitting(true);
    try {
      const stashTxBase = {
        name: `Stash top-up - ${walletName} (${selectedMonth} ${selectedYear})`,
        amount: -amount,
        date: combineDateWithCurrentTime(fundForm.date),
        payment_method_id: walletAccountId,
        transaction_type: 'cash_in' as const,
        notes: fundForm.notes || null,
        payment_schedule_id: null,
        related_transaction_id: null,
        receipt_url: null,
      };
      let creationResult = await createTransaction({ ...stashTxBase, wallet_id: walletId });
      if (creationResult.error) {
        const errMsg = JSON.stringify(creationResult.error).toLowerCase();
        if (errMsg.includes('wallet_id') || errMsg.includes('42703') || errMsg.includes('column')) {
          creationResult = await createTransaction(stashTxBase);
        }
      }
      const { data: newTx, error } = creationResult;
      if (error) throw error;
      const safeNewTx: SupabaseTransaction | null = newTx
        ? { ...(newTx as SupabaseTransaction), wallet_id: walletId }
        : null;
      if (safeNewTx) {
        setStashTopUps(prev => [safeNewTx, ...prev.filter(t => t.id !== safeNewTx.id)]);
      }
      setFundModal(null);
      setStashStatusMsg({ msg: `Funded stash '${walletName}' by ${formatCurrency(amount)}`, type: 'success' });
      setTimeout(() => setStashStatusMsg(null), 3000);
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
      const [stashResult] = await Promise.all([
        getAllStashTransactions(),
        reloadTransactions(),
      ]);
      const { data: freshData, error: reloadError } = stashResult;
      if (!reloadError && freshData !== null) {
        const freshTopUps = freshData as SupabaseTransaction[];
        if (safeNewTx && !freshTopUps.some(t => t.id === safeNewTx.id)) {
          setStashTopUps([safeNewTx, ...freshTopUps]);
        } else {
          setStashTopUps(freshTopUps);
        }
      }
      if (onTransactionCreated) onTransactionCreated();
    } catch (err) {
      console.error('[Budget] Error funding stash:', err);
      setStashStatusMsg({ msg: 'Failed to fund stash. Please try again.', type: 'error' });
      setTimeout(() => setStashStatusMsg(null), 3000);
    } finally {
      setFundSubmitting(false);
    }
  };

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
          await Promise.all([reloadStashTopUps(), reloadTransactions()]);
          if (onTransactionDeleted) onTransactionDeleted();
        }
        setTimeout(() => setStashStatusMsg(null), 3000);
      },
    });
  };
  
  useEffect(() => {
    const loadPaymentSchedules = async () => {
      try {
        const { data, error } = await getPaymentSchedulesByPeriod(selectedMonth, selectedYear);
        
        if (error) {
          console.error('[Budget] Failed to load payment schedules:', error);
        } else if (data) {
          setPaymentSchedules(data);
        }
      } catch (error) {
        console.error('[Budget] Error loading payment schedules:', error);
      }
    };
    
    loadPaymentSchedules();
  }, [selectedMonth, selectedYear]);

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');

  const [showPayModal, setShowPayModal] = useState<{
    biller: Biller,
    schedule: PaymentSchedule;
    expectedAmount?: number;
  } | null>(null);
  const [payFormData, setPayFormData] = useState({
    transactionId: '',
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  const getDefaultTransactionFormData = () => ({
    id: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    accountId: accounts[0]?.id || '',
    paymentScheduleId: ''
  });
  
  const [transactionFormData, setTransactionFormData] = useState(getDefaultTransactionFormData());

  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showIncomeRecordsModal, setShowIncomeRecordsModal] = useState(false);
  const [salaryFormData, setSalaryFormData] = useState({
    name: 'Income',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    accountId: ''
  });

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

  const [schedulePaymentsModal, setSchedulePaymentsModal] = useState<{ label: string; scheduleId: string | null; transactions: BudgetScheduleTx[] } | null>(null);
  const [loadingScheduleTx, setLoadingScheduleTx] = useState(false);
  const [scheduleSignedUrls, setScheduleSignedUrls] = useState<Record<string, string | null>>({});
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);

  const getLinkedInstallmentsAmount = useCallback((biller: Biller): number | null => {
    if (!biller.category.startsWith('Loans')) return null;
    const linked = installments.filter(inst => inst.billerId === biller.id);
    if (linked.length === 0) return null;
    return linked.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
  }, [installments]);

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

          const filteredExisting = newData[cat.name].filter(item => {
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              return biller &&
                biller.timing === selectedTiming &&
                isBillerActiveForPeriod(biller, selectedMonth, selectedYear);
            }
            return true;
          }).map(item => {
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              if (biller) {
                const instAmount = getLinkedInstallmentsAmount(biller);
                if (instAmount !== null) {
                  return { ...item, amount: instAmount.toFixed(2) };
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
                    amount: calculatedAmount.toFixed(2)
                  };
                }
              }
            }
            return item;
          }).filter(item => {
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
              
              let amount: number;
              const instAmount = getLinkedInstallmentsAmount(b);
              if (instAmount !== null) {
                amount = instAmount;
              } else if (schedule) {
                const { amount: calculatedAmount } = getScheduleExpectedAmount(b, schedule, accounts, transactions);
                amount = calculatedAmount;
              } else {
                const dateStr = `${selectedYear}-${String(MONTHS.indexOf(selectedMonth) + 1).padStart(2, '0')}-01`;
                amount = getBillerAmountForDate(b, dateStr);
              }
              
              return {
                id: b.id,
                name: b.name,
                amount: amount.toFixed(2),
                included: true,
                timing: b.timing,
                isBiller: true
              };
            })
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

  const shouldShowInstallment = useCallback((installment: Installment, month: string, year?: number): boolean => {
    if (!installment.startDate) return true;
    
    const [startYear, startMonth] = installment.startDate.split('-').map(Number);
    
    const selectedMonthIndex = MONTHS.indexOf(month);
    if (selectedMonthIndex === -1) return false;
    
    const targetYear = year || new Date().getFullYear();

    const startMonthAbs = startYear * 12 + (startMonth - 1);
    const selectedMonthAbs = targetYear * 12 + selectedMonthIndex;

    if (startMonthAbs > selectedMonthAbs) return false;

    const termMonths = parseInt(installment.termDuration, 10);
    if (!isNaN(termMonths) && termMonths > 0) {
      const lastPaymentMonthAbs = startMonthAbs + (termMonths - 1);
      if (selectedMonthAbs > lastPaymentMonthAbs) return false;
    }

    return true;
  }, []);

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
  
  const checkIfPaidBySchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId);
    if (!schedule) return false;
    return schedule.status === 'paid';
  }, [getPaymentSchedule]);

  const checkIfPartialBySchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId);
    if (!schedule) return false;
    return schedule.status === 'partial' && schedule.amount_paid > 0;
  }, [getPaymentSchedule]);

  const checkIfPaidByTransaction = useCallback((
    itemName: string,
    itemAmount: string | number,
    month: string,
    year?: number
  ): boolean => {
    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return false;

    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;

    const targetYear = year || new Date().getFullYear();

    const matchingTransaction = transactions.find(tx => {
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
      
      let dateMatch = false;
      
      if (txMonth === monthIndex && txYear === targetYear) {
        dateMatch = true;
      }
      else if (monthIndex === 0 && txMonth === 11 && txYear === targetYear - 1) {
        dateMatch = true;
      }
      else if (txMonth === (monthIndex + 1) % 12) {
        const budgetMonthEnd = new Date(targetYear, monthIndex + 1, 0);
        const daysDifference = Math.floor((txDate.getTime() - budgetMonthEnd.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDifference > 0 && daysDifference <= TRANSACTION_DATE_GRACE_DAYS) {
          const expectedYear = monthIndex === 11 ? targetYear + 1 : targetYear;
          if (txYear === expectedYear) {
            dateMatch = true;
          }
        }
      }

      return nameMatch && amountMatch && dateMatch;
    });

    return !!matchingTransaction;
  }, [transactions]);

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

  const reloadTransactions = useCallback(async () => {
    try {
      const { data, error } = await getAllTransactions();
      if (error) {
        console.error('[Budget] Failed to reload transactions:', error);
      } else if (data) {
        setTransactions(data);
      }
    } catch (error) {
      console.error('[Budget] Error reloading transactions:', error);
    }
  }, []);

  const reloadPaymentSchedules = useCallback(async () => {
    try {
      const { data, error } = await getPaymentSchedulesByPeriod(selectedMonth, selectedYear);
      if (error) {
        console.error('[Budget] Failed to reload payment schedules:', error);
      } else if (data) {
        setPaymentSchedules(data);
      }
    } catch (error) {
      console.error('[Budget] Error reloading payment schedules:', error);
    }
  }, [selectedMonth, selectedYear]);

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

  const handleDeleteScheduleTx = async (txId: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Payment Record',
      message: 'Are you sure you want to delete this payment record? This cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const { error } = await deleteTransactionAndRevertSchedule(txId);
          if (error) throw error;
          if (schedulePaymentsModal?.scheduleId) {
            await openSchedulePaymentsModal(schedulePaymentsModal.scheduleId, schedulePaymentsModal.label);
          } else {
            setSchedulePaymentsModal(null);
          }
        } catch (err) {
          console.error('[Budget] Error deleting schedule transaction:', err);
          alert('Failed to delete transaction. Please try again.');
        }
      }
    });
  };

  const autoSave = useCallback(async () => {
    if (view !== 'setup') return;
    
    const dataToSave = {
      ...structuredClone(setupData),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary,
      _excludedInstallmentIds: [...excludedInstallmentIds],
      _excludedWalletIds: [...excludedWalletIds]
    };
    
    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      return;
    }
    
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

    const installmentsTotal = installments
      .filter(inst => {
        if (inst.isArchived) return false;
        const timingMatch = !inst.timing || inst.timing === selectedTiming;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
    const total = regularItemsTotal + installmentsTotal + stashTotal;
    
    try {
      setAutoSaveStatus('saving');
      
      const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
      
      if (existingSetup) {
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: 'Saved'
        };
        
        const { error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      } else {
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      }
      
      lastSavedDataRef.current = currentDataString;
      
      if (onReloadSetups) {
        await onReloadSetups();
      }
      
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[Budget] Error in auto-save:', error);
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
    }
  }, [view, setupData, projectedSalary, actualSalary, selectedMonth, selectedTiming, savedSetups, excludedInstallmentIds, excludedWalletIds, wallets, getStashAggregates, onReloadSetups, installments, getPaymentSchedule, shouldShowInstallment]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [autoSave]);

  useEffect(() => {
    if (view === 'setup') {
      triggerAutoSave();
    }
  }, [setupData, projectedSalary, actualSalary, excludedInstallmentIds, excludedWalletIds, view, triggerAutoSave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

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

  const handleSaveSetup = async () => {
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

    const installmentsTotal = installments
      .filter(inst => {
        if (inst.isArchived) return false;
        const timingMatch = !inst.timing || inst.timing === selectedTiming;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
    const total = regularItemsTotal + installmentsTotal + stashTotal;

    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    
    const dataToSave = {
      ...JSON.parse(JSON.stringify(setupData)),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary,
      _excludedInstallmentIds: [...excludedInstallmentIds],
      _excludedWalletIds: [...excludedWalletIds]
    };
    
    try {
      if (existingSetup) {
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: BUDGET_SETUP_STATUS.SAVED
        };
        
        const { error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          alert(`Failed to save budget setup: ${error?.message || 'Unknown error occurred'}`);
          return;
        }
        
        if (onReloadSetups) {
          await onReloadSetups();
        }
      } else {
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          alert(`Failed to save budget setup: ${error?.message || 'Unknown error occurred'}`);
          return;
        }
        
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      setView('summary');
    } catch (error) {
      alert(`Failed to save budget setup: ${(error as any)?.message || 'Unknown error occurred'}`);
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isEditing = !!transactionFormData.id;
    const paymentScheduleId = transactionFormData.paymentScheduleId;
    
    try {
      let transactionData, transactionError;
      
      let finalAmount = parseFloat(transactionFormData.amount);
      if (transactionFormData.transactionType === 'cash_in' || transactionFormData.transactionType === 'loan_payment') {
        finalAmount = -Math.abs(finalAmount);
      } else {
        finalAmount = Math.abs(finalAmount);
      }

      if (isEditing) {
        const transaction = {
          name: transactionFormData.name,
          date: combineDateWithCurrentTime(transactionFormData.date),
          amount: finalAmount,
          payment_method_id: transactionFormData.accountId
        };
        const result = await updateTransactionAndSyncSchedule(transactionFormData.id, transaction);
        transactionData = result.data;
        transactionError = result.error;
      } else if (paymentScheduleId) {
        const result = await createPaymentScheduleTransaction(
          paymentScheduleId,
          {
            name: transactionFormData.name,
            date: combineDateWithCurrentTime(transactionFormData.date),
            amount: finalAmount,
            paymentMethodId: transactionFormData.accountId
          }
        );
        transactionData = result.data;
        transactionError = result.error;
        
        if (!transactionError && transactionData) {
          const { error: scheduleError } = await recordPaymentViaTransaction(
            paymentScheduleId,
            {
              transactionName: transactionFormData.name,
              amountPaid: Math.abs(finalAmount),
              datePaid: transactionFormData.date,
              accountId: transactionFormData.accountId,
              receipt: undefined
            }
          );
          
          if (scheduleError) {
            console.error('[Budget] Failed to update payment schedule:', scheduleError);
          }

          const linkedSchedule = paymentSchedules.find(s => s.id === paymentScheduleId);
          if (linkedSchedule?.source_type === 'installment') {
            const inst = installments.find(i => i.id === linkedSchedule.source_id);
            const amountPaidDelta = parseFloat(transactionFormData.amount);
            if (inst && !isNaN(amountPaidDelta) && onUpdateInstallment) {
              await onUpdateInstallment({
                ...inst,
                paidAmount: inst.paidAmount + amountPaidDelta
              });
            } else if (!onUpdateInstallment) {
              console.warn('[Budget] onUpdateInstallment callback not provided; installment paidAmount will not be synced');
            }
          }
        }
      } else {
        const transaction = {
          name: transactionFormData.name,
          date: combineDateWithCurrentTime(transactionFormData.date),
          amount: finalAmount,
          payment_method_id: transactionFormData.accountId
        };
        const result = await createTransaction(transaction);
        transactionData = result.data;
        transactionError = result.error;
      }
      
      if (transactionError) {
        alert(`Failed to ${isEditing ? 'update' : 'save'} transaction. Please try again.`);
        return;
      }
      
      await reloadTransactions();
      await reloadPaymentSchedules();
      
      setShowTransactionModal(false);
      setTransactionFormData(getDefaultTransactionFormData());
    } catch (e) {
      alert('Failed to save transaction. Please try again.');
    }
  };

  const handleSalaryCashIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(salaryFormData.amount);
    if (isNaN(amount) || amount <= 0) return;

    const transaction = {
      name: salaryFormData.name,
      amount: -Math.abs(amount),
      date: combineDateWithCurrentTime(salaryFormData.date),
      payment_method_id: salaryFormData.accountId,
      transaction_type: 'cash_in' as const,
      notes: `Income Record - ${selectedTiming}`
    };

    try {
      const { error } = await createTransaction(transaction);
      if (error) throw error;
      
      setShowSalaryModal(false);
      await reloadTransactions();
      if (onTransactionCreated) onTransactionCreated();
    } catch (error) {
      alert('Failed to record salary. Please try again.');
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    
    try {
      const { biller, schedule } = showPayModal;
      const isEditing = !!payFormData.transactionId;
      const paymentScheduleId = schedule.id;
      
      let transactionData, transactionError;
      
      if (isEditing) {
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
        alert(`Failed to ${isEditing ? 'update' : 'create'} transaction. Please try again.`);
        return;
      }
      
      if (payReceiptFile && transactionData?.id) {
        const { path, error: uploadError } = await uploadTransactionReceipt(transactionData.id, payReceiptFile);
        if (uploadError || !path) {
          alert('Payment saved, but receipt upload failed. You can re-attach it from the transaction details.');
        } else {
          await updateTransaction(transactionData.id, { receipt_url: path });
        }
      }

      if (!isEditing && biller.linkedAccountId && transactionData?.id) {
        const linkedAccount = accounts.find(a => a.id === biller.linkedAccountId);
        if (linkedAccount?.type === 'Credit') {
          await createTransaction({
            name: `${biller.name} - ${schedule.month} ${schedule.year}`,
            date: combineDateWithCurrentTime(payFormData.datePaid),
            amount: -Math.abs(parseFloat(payFormData.amount)),
            payment_method_id: biller.linkedAccountId,
            transaction_type: 'credit_payment',
            notes: null,
            payment_schedule_id: null,
            related_transaction_id: transactionData.id,
            receipt_url: null,
          });
        }
      }
      
      if (paymentScheduleId) {
        await recordPaymentViaTransaction(
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
      }
      
      const updatedSchedules = biller.schedules.map(s => {
        const isMatch = (schedule.id != null) ?
          (s.id === schedule.id) :
          (s.month === schedule.month && s.year === schedule.year);
          
        if (isMatch) {
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
      
      await onUpdateBiller({ ...biller, schedules: updatedSchedules });
      
      if (biller.category.startsWith('Loans') && installments && installments.length > 0) {
        const linkedInstallment = installments.find(inst => inst.billerId === biller.id);
        if (linkedInstallment && onUpdateInstallment) {
          const updatedInstallment: Installment = {
            ...linkedInstallment,
            paidAmount: linkedInstallment.paidAmount + parseFloat(payFormData.amount)
          };
          await onUpdateInstallment(updatedInstallment);
        }
      }
      
      const existingSetup = savedSetups.find(s =>
        s.month === schedule.month && s.timing === selectedTiming
      );
      if (existingSetup) {
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          status: BUDGET_SETUP_STATUS.ACTIVE
        };
        await updateBudgetSetupFrontend(updatedSetup);
        
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      await reloadTransactions();
      await reloadPaymentSchedules();
      
      if (onReloadBillers) {
        await onReloadBillers();
      }
      
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
      alert('Failed to process payment. Please try again.');
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
    if (typeof setup.data !== 'object' || setup.data === null || Array.isArray(setup.data)) {
      alert('Cannot load this setup: data structure is invalid');
      return;
    }
    
    const loadedData = JSON.parse(JSON.stringify(setup.data));
    
    setSetupData(loadedData);
    setRemovedIds(new Set());
    if (Array.isArray(loadedData._excludedInstallmentIds)) {
      setExcludedInstallmentIds(new Set(loadedData._excludedInstallmentIds));
    } else {
      setExcludedInstallmentIds(new Set());
    }
    setSelectedMonth(setup.month);
    setSelectedTiming(setup.timing as '1/2' | '2/2');
    setView('setup');
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

    return (
        <div className={`space-y-8 animate-in fade-in duration-500 w-full max-w-7xl mx-auto ${isMobile ? 'pt-10' : ''}`}>
            <PageHeader
              title="Budget"
              subtitle="Vibe check for the Month"
              icon={
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
                  <WalletIcon className="w-7 h-7" />
                </div>
              }
              actions={
                <button type="button" onClick={handleOpenNew} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')}`}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Open New</span>
                </button>
              }
            />

            {archiveStatusMsg && (
              <div className={`flex items-center space-x-3 px-6 py-4 rounded-2xl text-sm font-bold mb-6 ${archiveStatusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {archiveStatusMsg.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                <span>{archiveStatusMsg.msg}</span>
              </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                <BudgetSetupsList
                  setups={activeSetups}
                  title="Active Budgets"
                  isArchived={false}
                  onLoadSetup={handleLoadSetup}
                  onArchiveSetup={handleArchiveSetup}
                  onMoveToTrash={(setup) => {
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
                  formatCurrency={formatCurrency}
                  calculateBudgetRemaining={(setup) => calculateBudgetRemaining(setup, transactions, selectedYear)}
                  archiveSubmitting={archiveSubmitting}
                />
            </div>



            {archivedSetups.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                <button
                    type="button"
                    onClick={() => setShowArchived(prev => !prev)}
                    className="w-full flex items-center justify-between p-8 pl-12 pr-12 hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors rounded-[2.5rem]"
                  >
                    <div className="flex items-center space-x-3">
                      <Archive className="w-5 h-5 text-amber-500" />
                      <span className="text-xs font-black text-amber-700 dark:text-amber-500 uppercase tracking-[0.25em]">Archived Budgets ({archivedSetups.length})</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-amber-400 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                  </button>
                  {showArchived && (
                    <BudgetSetupsList
                      setups={archivedSetups}
                      title="Archived Budgets"
                      isArchived={true}
                      onLoadSetup={handleLoadSetup}
                      onReopenSetup={handleReopenSetup}
                      formatCurrency={formatCurrency}
                      calculateBudgetRemaining={(setup) => calculateBudgetRemaining(setup, transactions, selectedYear)}
                      archiveSubmitting={archiveSubmitting}
                    />
                  )}
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
      if (inst.isArchived) return false;
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

      let installmentsTotal = 0;
      if (cat.name === 'Loans') {
        installmentsTotal = installments
          .filter(inst => {
            if (inst.isArchived) return false;
            const timingMatch = !inst.timing || inst.timing === selectedTiming;
            const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
            const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
            const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
            const notExcluded = !excludedInstallmentIds.has(inst.id);
            return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
          })
          .reduce((s, inst) => s + inst.monthlyAmount, 0);
      }

      return { category: cat.name, total: itemsTotal + installmentsTotal };
    });
  const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
  const grandTotal = categorySummary.reduce((sum, cat) => sum + cat.total, 0) + stashTotal;

  const totalSpend = grandTotal;
  
  const currentMonthIndex = MONTHS.indexOf(selectedMonth);
  const allIncomeTxs = transactions.filter(tx => {
    if (tx.transaction_type !== 'cash_in') return false;
    
    const isTaggedIncome = tx.notes?.startsWith('Income Record');
    const nameLower = tx.name.trim().toLowerCase();
    const isLegacyIncome = nameLower === 'salary' || nameLower === 'income';
    
    if (!isTaggedIncome && !isLegacyIncome) return false;

    const txDate = new Date(tx.date);
    if (txDate.getMonth() !== currentMonthIndex || txDate.getFullYear() !== selectedYear) return false;

    let matchesTiming = false;
    if (tx.notes?.includes(' - 1/2') || tx.notes?.includes(' - 2/2')) {
      matchesTiming = tx.notes.includes(` - ${selectedTiming}`);
    } else {
      const estimatedTiming = txDate.getDate() <= 15 ? '1/2' : '2/2';
      matchesTiming = estimatedTiming === selectedTiming;
    }

    return matchesTiming;
  });

  const otherIncomeTxs = allIncomeTxs.filter(tx => {
    const nameLower = tx.name.trim().toLowerCase();
    return nameLower !== 'salary' && nameLower !== 'income';
  });

  const totalOtherIncome = otherIncomeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const hasIncomeRecords = allIncomeTxs.length > 0;

  const actualSalaryValue = actualSalary.trim() !== '' ? parseFloat(actualSalary) : null;
  const projectedSalaryValue = parseFloat(projectedSalary) || 0;
  
  let salaryToUse = 0;
  if (actualSalaryValue !== null && !isNaN(actualSalaryValue)) {
    salaryToUse = actualSalaryValue;
  } else if (hasIncomeRecords) {
    salaryToUse = 0;
  } else {
    salaryToUse = projectedSalaryValue;
  }

  const netIncome = salaryToUse + totalOtherIncome;

  const remaining = netIncome - totalSpend;

  const currentSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
  const isReadOnly = currentSetup?.isArchived ?? false;
  const legacyMode = isLegacyBudget(selectedYear, selectedMonth);

  return (
    <div className={`space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20 w-full ${isMobile ? 'pt-10' : ''}`}>
      <div className="flex flex-col space-y-6">
        <PageHeader
          title="Budget Setup"
          subtitle={isReadOnly ? 'Archived — Read Only' : 'Your Money-Pie for the month of:'}
          icon={
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
              <WalletIcon className="w-7 h-7" />
            </div>
          }
          actions={isMobile ? null : (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {!isReadOnly && autoSaveStatus !== 'idle' && ( <div className="flex items-center space-x-2 text-xs font-bold mr-2"> {autoSaveStatus === 'saving' && (<><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><span className="text-black/50 dark:text-white/50">Saving...</span></>)} {autoSaveStatus === 'saved' && <Check className="w-4 h-4 text-green-600" />} {autoSaveStatus === 'error' && (<><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-red-600">Error</span></>)} </div> )}
              {currentSetup && isReadOnly && (<PinProtectedAction featureId="budget_modifications" onVerified={() => handleReopenSetup(currentSetup)} actionLabel="Reopen Budget"><button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-5 py-3 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all disabled:opacity-50"><RotateCcw className="w-4 h-4" /><span className="hidden sm:inline">Reopen</span></button></PinProtectedAction>)}
              {currentSetup && !isReadOnly && (<PinProtectedAction featureId="budget_modifications" onVerified={() => handleArchiveSetup(currentSetup)} actionLabel="Close Budget"><button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center gap-2 bg-amber-50 text-amber-700 px-5 py-3 rounded-xl font-bold text-sm hover:bg-amber-100 transition-all disabled:opacity-50"><Archive className="w-4 h-4" /><span className="hidden sm:inline">Close</span></button></PinProtectedAction>)}
              {!isReadOnly && (<PinProtectedAction featureId="budget_modifications" onVerified={handleSaveSetup} actionLabel="Save Budget"><button onClick={(e) => e.preventDefault()} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md dark:shadow-none text-sm ${getAccentClasses('bg')} ${getAccentClasses('shadow')}`}><Save className="w-4 h-4" /><span className="hidden sm:inline">Save</span></button></PinProtectedAction>)}
            </div>
          )}
        />

        <div className="flex items-center justify-between w-full md:justify-center mb-6 md:relative">
            <div className="flex-none md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2">
                <button
                    onClick={() => setView('summary')}
                    className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-grow flex justify-center items-center space-x-2 md:flex-grow-0">
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={isReadOnly} className={`bg-white dark:bg-gray-900 dark:border-black border-[3px] border-black rounded-2xl h-12 px-4 font-bold text-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] text-center appearance-none ${getAccentClasses('text')}`}>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={selectedTiming} onChange={(e) => setSelectedTiming(e.target.value as '1/2' | '2/2')} disabled={isReadOnly} className={`bg-white dark:bg-gray-900 dark:border-black border-[3px] border-black rounded-2xl h-12 px-4 font-bold text-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] ${getAccentClasses('text')}`}>
                    <option value="1/2">1/2</option>
                    <option value="2/2">2/2</option>
                </select>
            </div>

            <div className="flex-none flex items-center gap-2 md:hidden">
              {currentSetup && !isReadOnly && (
                <PinProtectedAction featureId="budget_modifications" onVerified={() => handleArchiveSetup(currentSetup)} actionLabel="Close Budget">
                  <button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px]" aria-label="Close">
                    <Archive className="w-5 h-5" />
                  </button>
                </PinProtectedAction>
              )}
              {!isReadOnly && (
                <PinProtectedAction featureId="budget_modifications" onVerified={handleSaveSetup} actionLabel="Save Budget">
                  <button onClick={(e) => e.preventDefault()} className={`flex items-center justify-center w-12 h-12 rounded-2xl text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] ${getAccentClasses('bg')}`} aria-label="Save">
                    <Save className="w-5 h-5" />
                  </button>
                </PinProtectedAction>
              )}
            </div>
        </div>
      </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="p-4 border-b-2 border-black bg-gray-50/30 dark:bg-gray-800/30"><h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] text-center">BUDGET SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800"><th className="p-3 pl-6">Category</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {categorySummary.map((item) => (
                <tr key={item.category}><td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">{item.category}</td><td className="p-3 pr-6 text-right font-black text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(item.total)}</td></tr>
              ))}
              {stashTotal > 0 && (
                <tr><td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Stash</td><td className="p-3 pr-6 text-right font-black text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(stashTotal)}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50/30 dark:bg-indigo-900/20"><td className="p-3 pl-6 text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">Grand Total</td><td className="p-3 pr-6 text-right text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(grandTotal)}</td></tr>
            </tfoot>
          </table>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="p-4 border-b-2 border-black bg-gray-50/30 dark:bg-gray-800/30"><h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] text-center">MONTH SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800"><th className="p-3 pl-6">Item</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Projected Income</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end">
                    {!isProjectedFocused ? (
                      <span
                        className={`text-sm font-black text-gray-900 dark:text-gray-100 ${!isReadOnly ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''} transition-colors`}
                        onClick={() => !isReadOnly && setIsProjectedFocused(true)}
                      >
                        {formatCurrency(parseFloat(projectedSalary || '0'))}
                      </span>
                    ) : (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="0.01"
                          value={projectedSalary}
                          onChange={(e) => setProjectedSalary(e.target.value)}
                          onFocus={() => { isFocusedRef.current = true; }}
                          onBlur={() => { isFocusedRef.current = false; setIsProjectedFocused(false); }}
                          disabled={isReadOnly}
                          className="bg-transparent border-none text-sm font-black text-gray-900 dark:text-gray-100 w-28 text-right outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/30 rounded px-1 disabled:opacity-60 disabled:cursor-not-allowed"
                          aria-label="Projected Income"
                        />
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Actual Income</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {!isActualFocused ? (
                      <span
                        className={`text-sm font-black ${actualSalary ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 italic'} ${!isReadOnly ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''} transition-colors`}
                        onClick={() => !isReadOnly && setIsActualFocused(true)}
                      >
                        {actualSalary ? formatCurrency(parseFloat(actualSalary)) : 'Click to add...'}
                      </span>
                    ) : (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="0.01"
                          value={actualSalary}
                          onChange={(e) => setActualSalary(e.target.value)}
                          onFocus={() => { isFocusedRef.current = true; }}
                          onBlur={() => { isFocusedRef.current = false; setIsActualFocused(false); }}
                          disabled={isReadOnly}
                          placeholder="Enter actual"
                          className="bg-transparent border-none text-sm font-black text-gray-900 dark:text-gray-100 w-28 text-right outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/30 rounded px-1 placeholder:text-gray-300 dark:placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed"
                          aria-label="Actual Income"
                        />
                      </div>
                    )}
                    {!isReadOnly && (
                  hasIncomeRecords ? (
                    <button
                      onClick={() => setShowIncomeRecordsModal(true)}
                      className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm"
                      title="View Income Records"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const debitAccounts = accounts.filter(a => a.type === 'Debit');
                        setSalaryFormData({
                          name: 'Income',
                          amount: actualSalary || projectedSalary || '',
                          date: new Date().toISOString().split('T')[0],
                          accountId: debitAccounts[0]?.id || ''
                        });
                        setShowSalaryModal(true);
                      }}
                      className="p-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors shadow-sm"
                      title="Record as Cash In transaction"
                    >
                      <WalletIcon className="w-4 h-4" />
                    </button>
                  )
                    )}
                  </div>
                </td>
              </tr>
          {totalOtherIncome > 0 && (
            <>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Other Income</td>
                <td className="p-3 pr-6 text-right">
                  <span className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCurrency(totalOtherIncome)}</span>
                </td>
              </tr>
              <tr className="bg-green-50/30 dark:bg-green-900/10">
                <td className="p-3 pl-6 font-bold text-green-700 dark:text-green-400 text-sm">Net Income</td>
                <td className="p-3 pr-6 text-right font-black text-green-700 dark:text-green-400 text-sm">{formatCurrency(netIncome)}</td>
              </tr>
            </>
          )}
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Total Spend</td>
                <td className="p-3 pr-6 text-right font-black text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(totalSpend)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className={`${remaining >= 0 ? 'bg-green-50/30 dark:bg-green-900/10' : 'bg-red-50/30 dark:bg-red-900/10'}`}>
                <td className="p-3 pl-6 text-xs font-black uppercase">Remaining</td>
                <td className={`p-3 pr-6 text-right text-lg font-black ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="space-y-6">
        {categories.map((cat) => {
          const items = setupData[cat.name] || [];
          let relevantInstallments: Installment[] = [];
          if (cat.name === 'Loans') {
            relevantInstallments = installments.filter(inst => {
              if (inst.isArchived) return false;
              const timingMatch = !inst.timing || inst.timing === selectedTiming;
              const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
              const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
              const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
              return timingMatch && isActiveForPeriod && !isFinished;
            });
          }

          const hasData = items.length > 0 || (cat.name === 'Loans' && relevantInstallments.length > 0);
          const shouldRenderCategory = shouldRenderCategorySection(cat, hasData, selectedYear, selectedMonth);
          if (!shouldRenderCategory) return null;

          const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
          const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
          
          const itemsTotal = items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          const installmentsTotal = relevantInstallments
            .filter(inst => !excludedInstallmentIds.has(inst.id))
            .reduce((s, inst) => s + inst.monthlyAmount, 0);
          const categoryTotal = itemsTotal + installmentsTotal;
          
          return (
            <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
              <div className="px-8 py-5 border-b-2 border-black bg-gray-50/30 dark:bg-gray-800/30 flex justify-between items-center transition-colors">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em]">{cat.name}</h3>
                  {(cat.flexiMode ?? true) && <span className="text-[9px] font-black text-green-600 bg-green-50 border border-green-200 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Flexi</span>}
                  {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Legacy</span>}
                </div>
                <span className="text-lg font-black text-indigo-600">{formatCurrency(categoryTotal)}</span>
              </div>
              <div className={isMobile ? "p-4 space-y-4" : "overflow-x-auto"}>
                {isMobile ? (
                  <>
                    {(items.length === 0 && relevantInstallments.length === 0) && (
                      <div className="p-8 text-center text-gray-400 text-sm font-medium">
                        No items yet.
                        {canAddItems && ' Click "Add Item" below to get started.'}
                      </div>
                    )}
                    {items.map(item => {
                        let isPaid = false, isPartial = false, linkedBiller, paymentSchedule;
                        const isBillerItem = item.isBiller || billers.some(b => b.id === item.id);
                        
                        if (isBillerItem) {
                          linkedBiller = billers.find(b => b.id === item.id);
                          paymentSchedule = getPaymentSchedule('biller', item.id);
                          if (paymentSchedule) {
                            isPaid = checkIfPaidBySchedule('biller', item.id);
                            isPartial = checkIfPartialBySchedule('biller', item.id);
                          } else {
                            isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                          }
                        } else {
                          isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                        }
                      return (
                        <div key={item.id} className={`${item.included ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-800/50 opacity-70'} rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 space-y-3`}>
                          <div className="flex justify-between items-start gap-2">
                            <input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-base font-bold w-full disabled:cursor-default dark:text-gray-100 focus:ring-0 p-0" />
                            {!isReadOnly && (
                              <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-10 h-10 rounded-xl border-[3px] border-black transition-all flex items-center justify-center shrink-0 ${item.included ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                                <Check className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-end justify-between gap-2">
                             <div className="flex items-center space-x-1">
                                <span className="text-gray-400 dark:text-gray-500 font-bold">₱</span>
                                <input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} onFocus={() => { isFocusedRef.current = true; }} onBlur={() => { isFocusedRef.current = false; }} disabled={isReadOnly} className="bg-transparent border-none text-lg font-black w-28 disabled:cursor-default dark:text-gray-100 focus:ring-0 p-0" />
                             </div>
                             <div className="flex items-center justify-end space-x-2">
                               {isBillerItem && (
                                isPaid ? (
                                  <>
                                    <CheckCircle2 className="w-5 h-5 text-green-500" aria-label="Payment completed" title="Paid" />
                                    {paymentSchedule && (
                                      <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                        <Info className="w-4 h-4" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {isPartial && paymentSchedule && (
                                      <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50">
                                        <Info className="w-4 h-4" />
                                      </button>
                                    )}
                                  {!isReadOnly && <button 
                                    onClick={() => { 
                                      if(linkedBiller && paymentSchedule) {
                                        const scheduleForModal: PaymentSchedule = {
                                          id: paymentSchedule.id, month: paymentSchedule.month, year: paymentSchedule.year.toString(),
                                          expectedAmount: paymentSchedule.expected_amount, amountPaid: paymentSchedule.amount_paid,
                                          datePaid: paymentSchedule.date_paid, receipt: paymentSchedule.receipt, accountId: paymentSchedule.account_id
                                        };
                                        setShowPayModal({ biller: linkedBiller, schedule: scheduleForModal, expectedAmount: parseFloat(item.amount) });
                                        const amountToPay = isPartial ? Math.max(0, parseFloat(item.amount) - paymentSchedule.amount_paid).toFixed(2) : item.amount;
                                        setPayFormData({
                                            ...payFormData,
                                            amount: amountToPay,
                                            receipt: '',
                                            datePaid: new Date().toISOString().split('T')[0],
                                            transactionId: ''
                                        });
                                      } 
                                    }} 
                                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black uppercase rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                                  >
                                    {isPartial ? 'Pay Rem.' : 'Pay'}
                                  </button>}
                                  </>
                                )
                              )}
                              {!isBillerItem && (cat.flexiMode ?? true) && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
                                isPaid ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500" aria-label="Payment completed" title="Paid" />
                                ) : !isReadOnly ? (
                                  <button
                                    onClick={() => {
                                      setTransactionFormData({ id: '', name: item.name, date: new Date().toISOString().split('T')[0], amount: item.amount, accountId: item.accountId || accounts[0]?.id || '', paymentScheduleId: '' });
                                      setShowTransactionModal(true);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black uppercase rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                                  >Pay</button>
                                ) : null
                              )}
                             </div>
                          </div>
                        </div>
                      )
                    })}
                    {/* FIX: Pay button logic for mobile installments */}
                    {relevantInstallments.map(installment => {
                      const isIncluded = !excludedInstallmentIds.has(installment.id);
                      let isPaid = false, isPartial = false;
                      const installmentSchedule = getPaymentSchedule('installment', installment.id, selectedMonth, selectedYear);
                      if (installmentSchedule) {
                        isPaid = checkIfPaidBySchedule('installment', installment.id);
                        isPartial = checkIfPartialBySchedule('installment', installment.id);
                      }
                      
                      return (
                        <div key={`installment-mob-${installment.id}`} className={`${isIncluded ? 'bg-blue-50/30 dark:bg-blue-900/20' : 'bg-gray-100 dark:bg-gray-800/50 opacity-70'} rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 space-y-3`}>
                          <div className="flex justify-between items-start gap-2">
                            <div>
                               <span className="font-bold text-base text-gray-900 dark:text-gray-100">{installment.name}</span>
                               <div className="flex items-center gap-2 mt-1">
                                 <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded text-blue-600 dark:text-blue-300">INSTALLMENT</span>
                                 {installment.timing && <span className="text-[9px] font-bold text-gray-500">{installment.timing}</span>}
                               </div>
                            </div>
                            {!isReadOnly && (
                              <button onClick={() => setExcludedInstallmentIds(prev => { const n = new Set(prev); if(n.has(installment.id)) n.delete(installment.id); else n.add(installment.id); return n; })} className={`w-10 h-10 rounded-xl border-[3px] border-black transition-all flex items-center justify-center shrink-0 ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                                <Check className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <span className="text-lg font-black text-gray-900 dark:text-gray-100">{formatCurrency(installment.monthlyAmount)}</span>
                            <div className="flex items-center justify-end space-x-2">
                              {isPaid ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : !isReadOnly && (
                                <button
                                  onClick={() => {
                                    setTransactionFormData({ id: '', name: `${installment.name} - ${selectedMonth} ${selectedYear}`, date: new Date().toISOString().split('T')[0], amount: isPartial && installmentSchedule ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2) : installment.monthlyAmount.toFixed(2), accountId: installment.accountId || accounts[0]?.id || '', paymentScheduleId: installmentSchedule?.id || '' });
                                    setShowTransactionModal(true);
                                  }}
                                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-black uppercase rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all"
                                >{isPartial ? 'Pay Rem.' : 'Pay'}</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800/50">
                        <th className="p-4 pl-10">Name</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4 text-center">Actions</th>
                        <th className="p-4 pr-10 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                      {(items.length > 0 || relevantInstallments.length > 0) ? (
                        <>
                          {items.map((item) => {
                            let isPaid = false, isPartial = false, linkedBiller, paymentSchedule;
                            const isBillerItem = item.isBiller || billers.some(b => b.id === item.id);
                            
                            if (isBillerItem) {
                              linkedBiller = billers.find(b => b.id === item.id);
                              paymentSchedule = getPaymentSchedule('biller', item.id);
                              if (paymentSchedule) {
                                isPaid = checkIfPaidBySchedule('biller', item.id);
                                isPartial = checkIfPartialBySchedule('biller', item.id);
                              } else {
                                isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                              }
                            } else {
                              isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                            }
                            return (
                              <tr key={item.id} className={`${item.included ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                                <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-bold w-full disabled:cursor-default dark:text-gray-100" /></td>
                                <td className="p-4">
                                  <div className="flex items-center space-x-1"><span className="text-gray-400 dark:text-gray-500 font-bold">₱</span><input type="number" value={item.amount} 
                                    onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} 
                                    onFocus={() => {}}
                                    onBlur={() => {}}
                                    disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 disabled:cursor-default dark:text-gray-100" 
                                  /></div>
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    {isBillerItem && (
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
                                              const scheduleForModal: PaymentSchedule = {
                                                id: paymentSchedule.id,
                                                month: paymentSchedule.month,
                                                year: paymentSchedule.year.toString(),
                                                expectedAmount: paymentSchedule.expected_amount,
                                                amountPaid: paymentSchedule.amount_paid,
                                                datePaid: paymentSchedule.date_paid || undefined,
                                                receipt: paymentSchedule.receipt || undefined,
                                                accountId: paymentSchedule.account_id || undefined
                                              };
                                              
                                              const linkedTransactions = transactions
                                                .filter(tx => tx.payment_schedule_id === paymentSchedule.id)
                                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                              const existingTx = linkedTransactions[0];
                                              
                                              setShowPayModal({
                                                biller: linkedBiller, 
                                                schedule: scheduleForModal,
                                                expectedAmount: parseFloat(item.amount)
                                              }); 
                                              const today = new Date().toISOString().split('T')[0];
                                              setPayFormData({
                                                transactionId: isPartial ? '' : (existingTx?.id || ''),
                                                amount: isPartial
                                                  ? Math.max(0, parseFloat(item.amount) - paymentSchedule.amount_paid).toFixed(2)
                                                  : existingTx?.amount.toFixed(2) || item.amount,
                                                receipt: (!isPartial && existingTx) ? 'Receipt on file' : '',
                                                datePaid: (!isPartial && existingTx) ? new Date(existingTx.date).toISOString().split('T')[0] : today,
                                                accountId: existingTx?.payment_method_id || ''
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
                                    {!isBillerItem && (cat.flexiMode ?? true) && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
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
                                              paymentScheduleId: ''
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
                          })}
                          {relevantInstallments.map((installment) => {
                            const account = accounts.find(a => a.id === installment.accountId);
                            const isIncluded = !excludedInstallmentIds.has(installment.id);
                            let isPaid = false, isPartial = false;
                            const installmentSchedule = getPaymentSchedule('installment', installment.id, selectedMonth, selectedYear);
                            if (installmentSchedule) {
                              isPaid = checkIfPaidBySchedule('installment', installment.id);
                              isPartial = checkIfPartialBySchedule('installment', installment.id);
                            }

                            return (
                              <tr key={`installment-${installment.id}`} className={`${isIncluded ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                                <td className="p-4 pl-10">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{installment.name}</span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 rounded text-blue-600">INSTALLMENT</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center space-x-1">
                                    <span className="text-gray-400 dark:text-gray-500 font-bold">₱</span>
                                    <span className="text-sm font-black">{formatCurrency(installment.monthlyAmount).replace('₱', '')}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    {isPaid ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                    ) : !isReadOnly && (
                                      <button 
                                        onClick={() => {
                                          setTransactionFormData({ id: '', name: `${installment.name} - ${selectedMonth} ${selectedYear}`, date: new Date().toISOString().split('T')[0], amount: isPartial && installmentSchedule ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2) : installment.monthlyAmount.toFixed(2), accountId: installment.accountId || accounts[0]?.id || '', paymentScheduleId: installmentSchedule?.id || '' });
                                          setShowTransactionModal(true);
                                        }}
                                        className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                      >
                                        {isPartial ? 'Pay Remaining' : 'Pay'}
                                      </button>
                                    )}
                                    {!isReadOnly && <button onClick={() => { setExcludedInstallmentIds(prev => { const newSet = new Set(prev); if (newSet.has(installment.id)) { newSet.delete(installment.id); } else { newSet.add(installment.id); } return newSet; }); }} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>}
                                  </div>
                                </td>
                                <td className="p-4 pr-10 text-right">
                                  {!isReadOnly && <button onClick={() => { setConfirmModal({ show: true, title: 'Exclude Installment', message: `Are you sure you want to exclude "${installment.name}" from this budget period?`, onConfirm: () => { setExcludedInstallmentIds(prev => new Set([...prev, installment.id])); setConfirmModal(prev => ({ ...prev, show: false })); } }); }} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Exclude</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-gray-400 text-sm font-medium">
                            No items yet.
                            {canAddItems && ' Click "Add Item" below to get started.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
