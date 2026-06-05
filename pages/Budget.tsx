// pages/Budget.tsx
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory, Installment, Wallet } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, Wallet as WalletIcon, ArrowLeft, Upload, CheckCircle2, X, AlertTriangle, Info, Archive, RotateCcw, List } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend } from '../src/services/budgetSetupsService';
import { createTransaction, getAllTransactions, updateTransaction, updateTransactionAndSyncSchedule, createPaymentScheduleTransaction, uploadTransactionReceipt, getTransactionsByPaymentSchedule, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, getAllStashTransactions } from '../src/services/transactionsService';
import type { SupabaseTransaction, SupabaseMonthlyPaymentSchedule } from '../src/types/supabase';
import { aggregateCreditCardPurchases } from '../src/utils/paymentStatus';
import { getScheduleExpectedAmount } from '../src/utils/linkedAccountUtils';
import { getBillerAmountForDate } from '../src/utils/billers';
import { getPaymentSchedulesByPeriod, recordPaymentViaTransaction } from '../src/services/paymentSchedulesService';
import { combineDateWithCurrentTime, getTodayIso, toLocalDateInputValue } from '../src/utils/dateUtils';
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
                <div ref={titleContainerRef} className="flex items-center gap-4">
                    {icon && <div className="z-10 shrink-0">{icon}</div>}
                    <h1 className={`font-titan text-[clamp(2rem,7.5vw,3.75rem)] normal-case tracking-tighter leading-none relative z-10 [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${icon ? getAccentClasses('text') : 'text-black dark:text-white'}`}>
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
                    <p className="text-[clamp(1rem,3vw,1.25rem)] font-bold italic text-black/50 dark:text-gray-400 transition-colors duration-300">
                        {subtitle}
                    </p>
                )}
            </div>

            <div className="h-2 w-32 mt-2 bg-black dark:bg-white/20 transition-colors duration-300" />

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

const Budget: React.FC<BudgetProps> = ({ accounts, billers, categories, savedSetups, setSavedSetups, onUpdateBiller, onMoveToTrash, onReloadSetups, onReloadBillers, onUpdateInstallment, installments = [], onTransactionCreated, onTransactionDeleted, onArchiveBudget, onReopenBudget }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [searchParams] = useSearchParams();
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
  }, [searchParams]);

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
    const isCurrentPeriod = now.getFullYear() === selectedYear && now.getMonth() === selectedMonthIndex;
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
      const safeNewTx: SupabaseTransaction | null = newTx ? { ...(newTx as SupabaseTransaction), wallet_id: walletId } : null;
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
    datePaid: getTodayIso(),
    accountId: accounts[0]?.id || ''
  });
  const [payReceiptFile, setPayReceiptFile] = useState<File | null>(null);

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const getDefaultTransactionFormData = () => ({
    id: '',
    name: '',
    date: getTodayIso(),
    amount: '',
    accountId: accounts[0]?.id || '',
    paymentScheduleId: '',
    transactionType: 'cash_out'
  });
  const [transactionFormData, setTransactionFormData] = useState(getDefaultTransactionFormData());

  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showIncomeRecordsModal, setShowIncomeRecordsModal] = useState(false);
  const [salaryFormData, setSalaryFormData] = useState({
    name: 'Income',
    amount: '',
    date: getTodayIso(),
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
  const [, setScheduleSignedUrls] = useState<Record<string, string | null>>({});

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
  }, [selectedMonth, selectedTiming, selectedYear, billers, view, removedIds, categories, getLinkedInstallmentsAmount, accounts, transactions]);

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
    sourceId: string,
    month: string = selectedMonth,
    year: number = selectedYear
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId, month, year);
    if (!schedule) return false;
    return schedule.status === 'paid';
  }, [getPaymentSchedule, selectedMonth, selectedYear]);

  const checkIfPartialBySchedule = useCallback((
    sourceType: 'biller' | 'installment',
    sourceId: string,
    month: string = selectedMonth,
    year: number = selectedYear
  ): boolean => {
    const schedule = getPaymentSchedule(sourceType, sourceId, month, year);
    if (!schedule) return false;
    return schedule.status === 'partial' && schedule.amount_paid > 0;
  }, [getPaymentSchedule, selectedMonth, selectedYear]);

  const checkIfPaidByTransaction = useCallback((
    itemName: string, 
    itemAmount: string | number, 
    month: string,
    year?: number,
    timing?: '1/2' | '2/2'
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
      let dateMatchType: 'same' | 'prev_dec_for_jan' | 'grace_next' | null = null;
      
      if (txMonth === monthIndex && txYear === targetYear) {
        dateMatch = true;
        dateMatchType = 'same';
      } else if (monthIndex === 0 && txMonth === 11 && txYear === targetYear - 1) {
        dateMatch = true;
        dateMatchType = 'prev_dec_for_jan';
      } else if (txMonth === (monthIndex + 1) % 12) {
        const budgetMonthEnd = new Date(targetYear, monthIndex + 1, 0);
        const daysDifference = Math.floor((txDate.getTime() - budgetMonthEnd.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDifference > 0 && daysDifference <= TRANSACTION_DATE_GRACE_DAYS) {
          const expectedYear = monthIndex === 11 ? targetYear + 1 : targetYear;
          if (txYear === expectedYear) {
            dateMatch = true;
            dateMatchType = 'grace_next';
          }
        }
      }

      const normalizedTxNotes = (tx.notes || '').toLowerCase();
      const notesTimingMatch = normalizedTxNotes.match(/budget timing:\s*(1\/2|2\/2)/);
      const notesTiming = notesTimingMatch?.[1] as ('1/2' | '2/2' | undefined);

      let txTiming: '1/2' | '2/2' | undefined;
      if (notesTiming) {
        txTiming = notesTiming;
      } else if (dateMatchType === 'same') {
        txTiming = txDate.getDate() <= 15 ? '1/2' : '2/2';
      } else if (dateMatchType === 'grace_next') {
        txTiming = '2/2';
      } else if (dateMatchType === 'prev_dec_for_jan') {
        txTiming = '1/2';
      }

      const timingMatch = !timing || txTiming === timing;

      return nameMatch && amountMatch && dateMatch && timingMatch;
    });

    return !!matchingTransaction;
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

      const selectedAccountForTx = accounts.find(a => a.id === transactionFormData.accountId);
      const txTypeForForm = selectedAccountForTx?.type === 'Credit'
        ? (finalAmount < 0 ? 'credit_payment' : 'cash_out')
        : (finalAmount < 0 ? 'cash_in' : 'cash_out');

      if (isEditing) {
        const transaction = {
          name: transactionFormData.name,
          date: combineDateWithCurrentTime(transactionFormData.date),
          amount: finalAmount,
          payment_method_id: transactionFormData.accountId,
          transaction_type: txTypeForForm as any,
          notes: `Budget Timing: ${selectedTiming}`
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
            paymentMethodId: transactionFormData.accountId,
            notes: `Budget Timing: ${selectedTiming}`,
            transaction_type: txTypeForForm
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
          payment_method_id: transactionFormData.accountId,
          transaction_type: txTypeForForm as any,
          notes: `Budget Timing: ${selectedTiming}`
        };
        const result = await createTransaction(transaction as any);
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
      
      const parsedAmount = parseFloat(payFormData.amount) || 0;
      const selectedAccount = accounts.find(a => a.id === payFormData.accountId);
      const finalAmount = selectedAccount && selectedAccount.type === 'Credit' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
      const payTransactionType = selectedAccount?.type === 'Credit'
        ? 'credit_payment'
        : 'payment';
      
      console.log('[Budget] handlePaySubmit starting:', {
        billerId: biller.id,
        billerName: biller.name,
        isEditing,
        paymentScheduleId,
        accountId: payFormData.accountId,
        selectedAccountType: selectedAccount?.type,
        parsedAmount,
        finalAmount,
        payTransactionType
      });

      if (isEditing) {
        console.log('[Budget] Updating existing transaction:', payFormData.transactionId);
        const transaction = {
          name: `${biller.name} - ${schedule.month} ${schedule.year}`,
          date: combineDateWithCurrentTime(payFormData.datePaid),
          amount: finalAmount,
          payment_method_id: payFormData.accountId,
          notes: `Budget Timing: ${selectedTiming}`
        };
        const result = await updateTransaction(payFormData.transactionId, transaction);
        transactionData = result.data;
        transactionError = result.error;
        console.log('[Budget] Update result:', { transactionData, transactionError });
      } else if (paymentScheduleId) {
        console.log('[Budget] Creating payment schedule transaction:', {
          paymentScheduleId,
          amount: finalAmount,
          transaction_type: payTransactionType
        });
        const result = await createPaymentScheduleTransaction(
          paymentScheduleId,
          {
            name: `${biller.name} - ${schedule.month} ${schedule.year}`,
            date: combineDateWithCurrentTime(payFormData.datePaid),
            amount: finalAmount,
            paymentMethodId: payFormData.accountId,
            notes: `Budget Timing: ${selectedTiming}`,
            transaction_type: payTransactionType
          } as any
        );
        transactionData = result.data;
        transactionError = result.error;
        console.log('[Budget] Create payment schedule result:', { transactionData, transactionError });
      } else {
        console.log('[Budget] Creating standalone transaction:', { amount: finalAmount, transaction_type: payTransactionType });
        const transaction = {
          name: `${biller.name} - ${schedule.month} ${schedule.year}`,
          date: combineDateWithCurrentTime(payFormData.datePaid),
          amount: finalAmount,
          payment_method_id: payFormData.accountId,
          notes: `Budget Timing: ${selectedTiming}`
        };
        const result = await createTransaction({ ...transaction, transaction_type: payTransactionType } as any);
        transactionData = result.data;
        transactionError = result.error;
        console.log('[Budget] Create standalone result:', { transactionData, transactionError });
      }
      
      if (transactionError) {
        console.error('[Budget] Transaction error:', transactionError);
        alert(`Failed to ${isEditing ? 'update' : 'create'} transaction. Please try again.`);
        return;
      }
      
      console.log('[Budget] Transaction created successfully:', transactionData?.id);
      
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
        datePaid: getTodayIso(),
        accountId: accounts[0]?.id || ''
      });
      setPayReceiptFile(null);
    } catch (error) {
      console.error('[Budget] handlePaySubmit error:', error);
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
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);
    
        onArchiveBudget?.(setup)
          .then(() => setArchiveStatusMsg({ msg: 'Budget closed and archived.', type: 'success' }))
          .catch(() => setArchiveStatusMsg({ msg: 'Could not close budget. Please try again.', type: 'error' }))
          .finally(() => {
            setArchiveSubmitting(false);
            setTimeout(() => setArchiveStatusMsg(null), 3000);
          });
      }
    });
  };

  const handleReopenSetup = (setup: SavedBudgetSetup) => {
    setConfirmModal({
      show: true,
      title: 'Reopen Budget',
      message: `Reopen the ${setup.month} (${setup.timing}) budget? You'll be able to make changes again. This may affect your projections.`,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);
        onReopenBudget?.(setup)
          .then(() => setArchiveStatusMsg({ msg: 'Budget reopened. You can edit this budget again.', type: 'success' }))
          .catch(() => setArchiveStatusMsg({ msg: 'Could not reopen budget. Please try again.', type: 'error' }))
          .finally(() => {
            setArchiveSubmitting(false);
            setTimeout(() => setArchiveStatusMsg(null), 3000);
          });
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
              {!isReadOnly && autoSaveStatus !== 'idle' && ( 
                <div className="flex items-center space-x-2 text-xs font-bold mr-2"> 
                  {autoSaveStatus === 'saving' && (<><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><span className="text-black/50 dark:text-white/50">Saving...</span></>)} 
                  {autoSaveStatus === 'saved' && <Check className="w-4 h-4 text-green-600" />} 
                  {autoSaveStatus === 'error' && (<><AlertTriangle className="w-4 h-4 text-red-600" /><span className="text-red-600">Error</span></>)} 
                </div> 
              )}
              {currentSetup && isReadOnly && (<PinProtectedAction featureId="budget_modifications" onVerified={() => handleReopenSetup(currentSetup)} actionLabel="Reopen Budget"><button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-5 py-3 rounded-xl font-bold text-sm border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"><RotateCcw className="w-4 h-4" /><span className="hidden sm:inline">Reopen</span></button></PinProtectedAction>)}
              {currentSetup && !isReadOnly && (<PinProtectedAction featureId="budget_modifications" onVerified={() => handleArchiveSetup(currentSetup)} actionLabel="Close Budget"><button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center gap-2 bg-amber-50 text-amber-700 px-5 py-3 rounded-xl font-bold text-sm border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"><Archive className="w-4 h-4" /><span className="hidden sm:inline">Close</span></button></PinProtectedAction>)}
              {!isReadOnly && (
                <PinProtectedAction featureId="budget_modifications" onVerified={handleSaveSetup} actionLabel="Save Budget">
                  <button onClick={(e) => e.preventDefault()} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold transition-all border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] text-sm ${getAccentClasses('bg')}`}>
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Save</span>
                  </button>
                </PinProtectedAction>
              )}
            </div>
          )}
        />

        <div className="flex items-center justify-between w-full md:justify-center mb-6 md:relative">
            <div className="flex-none md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2">
                <button onClick={() => setView('summary')} className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-grow flex justify-center items-center space-x-2 md:flex-grow-0">
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} disabled={isReadOnly} className={`bg-white dark:bg-gray-900 border-2 border-black rounded-xl md:rounded-[1.5rem] h-10 md:h-auto px-3 md:px-8 md:py-4 font-black text-xs md:text-base shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-center appearance-none ${getAccentClasses('text')}`}>
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={selectedTiming} onChange={(e) => setSelectedTiming(e.target.value as '1/2' | '2/2')} disabled={isReadOnly} className={`bg-white dark:bg-gray-900 border-2 border-black rounded-xl md:rounded-[1.5rem] h-10 md:h-auto px-3 md:px-8 md:py-4 font-black text-xs md:text-base shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${getAccentClasses('text')}`}>
                    <option value="1/2">1/2</option>
                    <option value="2/2">2/2</option>
                </select>
                {legacyMode && (
                  <span className="hidden md:block text-[10px] font-black text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-2 border-black px-4 py-2 rounded-full uppercase tracking-widest">Legacy Budget</span>
                )}
            </div>

            <div className="flex-none flex items-center gap-2 md:hidden">
              {currentSetup && !isReadOnly && (
                <PinProtectedAction featureId="budget_modifications" onVerified={() => handleArchiveSetup(currentSetup)} actionLabel="Close Budget">
                  <button onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all disabled:opacity-50" aria-label="Close">
                    <Archive className="w-4 h-4" />
                  </button>
                </PinProtectedAction>
              )}
              {!isReadOnly && (
                <PinProtectedAction featureId="budget_modifications" onVerified={handleSaveSetup} actionLabel="Save Budget">
                  <button onClick={(e) => e.preventDefault()} className={`flex items-center justify-center w-10 h-10 rounded-xl text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] ${getAccentClasses('bg')}`} aria-label="Save">
                    <Save className="w-4 h-4" />
                  </button>
                </PinProtectedAction>
              )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="p-4 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30"><h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] text-center">BUDGET SUMMARY</h3></div>
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
              <tr className="bg-indigo-50/30 dark:bg-indigo-900/20 border-t-2 border-black"><td className="p-3 pl-6 text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">Grand Total</td><td className="p-3 pr-6 text-right text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(grandTotal)}</td></tr>
            </tfoot>
          </table>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="p-4 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30"><h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] text-center">MONTH SUMMARY</h3></div>
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
                          className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all"
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
                              date: getTodayIso(),
                              accountId: debitAccounts[0]?.id || ''
                            });
                            setShowSalaryModal(true);
                          }}
                          className="p-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all"
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
              <tr className={`${remaining >= 0 ? 'bg-green-50/30 dark:bg-green-900/10' : 'bg-red-50/30 dark:bg-red-900/10'} border-t-2 border-black`}>
                <td className="p-3 pl-6 text-xs font-black uppercase">Remaining</td>
                <td className={`p-3 pr-6 text-right text-lg font-black ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-6">
        {wallets.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="px-8 py-5 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30 flex justify-between items-center transition-colors">
            <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em]">Stash</h3>
            <div className="flex items-center space-x-3">
              {stashStatusMsg && (
                <span className={`text-xs font-bold px-3 py-1 rounded-xl ${stashStatusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {stashStatusMsg.msg}
                </span>
              )}
              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrency(wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0))}
              </span>
            </div>
          </div>
          <div className="w-full">
            {isMobile ? (
              <div className="p-4 space-y-4 bg-gray-50/30 dark:bg-gray-955/10">
                {wallets.map((wallet) => {
                  const linkedAccount = accounts.find(a => a.id === wallet.accountId);
                  const { funded, isFunded } = getStashAggregates(wallet);
                  const isIncluded = !excludedWalletIds.has(wallet.id);
                  const isOverFunded = funded > wallet.amount && wallet.amount > 0;
                  const isExactlyFunded = funded === wallet.amount && wallet.amount > 0;
                  return (
                    <div key={wallet.id} className={`p-4 rounded-xl border-2 border-black bg-white dark:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 transition-all ${isIncluded ? 'opacity-100' : 'opacity-60'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-sm font-black text-gray-900 dark:text-gray-100 block">{wallet.name}</span>
                          {linkedAccount && <span className="text-[10px] text-gray-400 font-bold block mt-0.5">{linkedAccount.bank} ({linkedAccount.classification})</span>}
                        </div>
                        {!isReadOnly && (
                          <button 
                            onClick={() => handleWalletIncludeToggle(wallet.id)} 
                            className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] flex items-center justify-center transition-all ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-transparent'}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border-2 border-black">
                        <div>
                          <span className="text-[10px] font-black uppercase text-gray-400 block tracking-widest">Target</span>
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(wallet.amount)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {isOverFunded ? (
                            <span className="text-[9px] font-black text-blue-600 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded">Over +{formatCurrency(funded - wallet.amount)}</span>
                          ) : isExactlyFunded ? (
                            <span className="text-[9px] font-black text-green-600 px-2 py-0.5 bg-green-50 border border-green-200 rounded">Funded</span>
                          ) : null}
                          <button onClick={() => setStashInfoModal({ wallet })} className="text-gray-400 border border-transparent p-1 hover:bg-indigo-50 rounded-full"><Info className="w-4 h-4" /></button>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <button 
                          onClick={() => handleOpenFundModal(wallet)} 
                          className="w-full flex items-center justify-center space-x-1 py-2.5 rounded-xl bg-indigo-50 border-2 border-black text-indigo-600 font-black uppercase tracking-wider text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                        >
                          <Plus className="w-4 h-4" /> <span>{isFunded ? 'Add More' : 'Fund Stash'}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50"><th className="p-4 pl-10">Name</th><th className="p-4">Target</th><th className="p-4">Account</th><th className="p-4 text-center">Info</th><th className="p-4 text-center">Actions</th><th className="p-4 pr-10 text-right"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {wallets.map((wallet) => {
                      const linkedAccount = accounts.find(a => a.id === wallet.accountId);
                      const { funded, isFunded } = getStashAggregates(wallet);
                      const isIncluded = !excludedWalletIds.has(wallet.id);
                      const isOverFunded = funded > wallet.amount && wallet.amount > 0;
                      const isExactlyFunded = funded === wallet.amount && wallet.amount > 0;
                      return (
                        <tr key={wallet.id} className={`${isIncluded ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                          <td className="p-4 pl-10"><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{wallet.name}</span></td>
                          <td className="p-4"><span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(wallet.amount)}</span></td>
                          <td className="p-4"><span className="text-sm text-gray-600 dark:text-gray-400">{linkedAccount ? `${linkedAccount.bank} (${linkedAccount.classification})` : wallet.accountId}</span></td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {isOverFunded ? (
                                <span className="text-xs font-black text-blue-600 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">Overfunded +{formatCurrency(funded - wallet.amount)}</span>
                              ) : isExactlyFunded ? (
                                <span className="text-xs font-black text-green-600 px-2 py-1 bg-green-50 border border-green-200 rounded-lg">Funded</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                              <button onClick={() => setStashInfoModal({ wallet })} title="View stash details" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {!isReadOnly && (
                              <button 
                                onClick={() => handleOpenFundModal(wallet)} 
                                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-50 border-2 border-black text-indigo-600 hover:bg-indigo-100 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                <Plus className="w-3 h-3" /> <span>{isFunded ? 'More' : 'Fund'}</span>
                              </button>
                            )}
                          </td>
                          <td className="p-4 pr-10 text-right">
                            {!isReadOnly && (
                              <button onClick={() => handleWalletIncludeToggle(wallet.id)} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-transparent'}`}><Check className="w-4 h-4" /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}

        {categories.filter(cat => cat.name === 'Fixed').map((cat) => {
          const items = setupData[cat.name] || [];
          const shouldRenderCategory = shouldRenderCategorySection(cat, items.length > 0, selectedYear, selectedMonth);
          if (!shouldRenderCategory) return null;
          const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
          const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
          return (
            <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
              <div className="px-8 py-5 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30 flex justify-between items-center transition-colors">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em]"> {cat.name}</h3>
                  {(cat.flexiMode ?? true) && <span className="text-[9px] font-black text-green-600 bg-green-50 border-2 border-black px-2 py-0.5 rounded-md uppercase tracking-wider">Flexi</span>}
                  {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border-2 border-black px-2 py-0.5 rounded-md uppercase tracking-wider">Legacy</span>}
                </div>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}</span>
              </div>
              <div className="w-full">
                {isMobile ? (
                  <div className="p-4 space-y-4 bg-gray-50/30 dark:bg-gray-955/10">
                    {items.length > 0 ? items.map((item) => (
                      <div key={item.id} className={`p-4 rounded-xl border-2 border-black bg-white dark:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 transition-all ${item.included ? 'opacity-100' : 'opacity-60 bg-gray-50'}`}>
                        <div className="flex justify-between items-center gap-2">
                          <input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-full outline-none focus:bg-indigo-50/55 dark:focus:bg-indigo-900/30 rounded px-1 dark:text-gray-100" />
                          {!isReadOnly && (
                            <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] flex items-center justify-center transition-all ${item.included ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-transparent'}`}><Check className="w-4 h-4" /></button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border-2 border-black">
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                            <input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 outline-none dark:text-gray-100" />
                          </div>
                          <select value={item.accountId || ''} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'accountId', e.target.value)} disabled={isReadOnly} className="bg-white dark:bg-gray-800 border-2 border-black rounded-lg px-2 py-1 text-xs font-black text-gray-700 dark:text-gray-300 outline-none">
                            <option value="">Select Account</option>
                            {accounts.filter(acc => acc.type === 'Debit').map(acc => (<option key={acc.id} value={acc.id}>{acc.bank}</option>))}
                          </select>
                        </div>
                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          {item.settled ? (
                            <span className="text-xs font-black text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Settled</span>
                          ) : !isReadOnly ? (
                            <button onClick={() => handleSetupUpdate(cat.name, item.id, 'settled', true)} className="px-3 py-1 bg-green-600 text-white text-[9px] font-black uppercase rounded-lg border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all">Settle</button>
                          ) : null}
                          {!isReadOnly && (
                            <button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[10px] font-black text-red-500 uppercase tracking-widest border-2 border-black bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Exclude</button>
                          )}
                        </div>
                      </div>
                    )) : <p className="text-center py-6 text-gray-400 text-xs font-bold italic">No items added yet.</p>}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50"><th className="p-4 pl-10">Name</th><th className="p-4">Amount</th><th className="p-4">Account</th><th className="p-4 text-center">Actions</th><th className="p-4 pr-10 text-right"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {items.length > 0 ? items.map((item) => (
                            <tr key={item.id} className={`${item.included ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                              <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-bold w-full outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded p-1 dark:text-gray-100" /></td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1"><span className="text-gray-400 dark:text-gray-500 font-bold">₱</span><input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} onFocus={() => { isFocusedRef.current = true; }} onBlur={() => { isFocusedRef.current = false; }} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 outline-none dark:text-gray-100" /></div>
                              </td>
                              <td className="p-4">
                                <select value={item.accountId || ''} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'accountId', e.target.value)} disabled={isReadOnly} className="bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-lg px-3 py-1.5 text-xs font-black text-gray-700 dark:text-gray-300 outline-none">
                                  <option value="">Select Account</option>
                                  {accounts.filter(acc => acc.type === 'Debit').map(acc => (<option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>))}
                                </select>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {item.settled ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Item settled" title="Settled" />
                                  ) : !isReadOnly ? (
                                    <button onClick={() => handleSetupUpdate(cat.name, item.id, 'settled', true)} className="px-3 py-1 bg-green-600 text-white text-[9px] font-black uppercase rounded-lg border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all">Settle</button>
                                  ) : null}
                                  {!isReadOnly && (
                                    <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right">
                                {!isReadOnly && (
                                  <button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[10px] font-black text-red-500 uppercase tracking-widest border-2 border-black bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Exclude</button>
                                )}
                              </td>
                            </tr>
                        )) : <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm font-medium">No items yet. Click "Add Item" below to get started.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {canAddItems && <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[11px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest hover:text-indigo-600 dark:hover:text-indigo-400 border-t-4 border-black bg-gray-50/50 dark:bg-gray-800/20 transition-colors text-center">+ Add Item</button>}
              </div>
            </div>
          );
        })}

        {categories.filter(cat => cat.name !== 'Fixed').map((cat) => {
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
            <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
              <div className="px-8 py-5 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30 flex justify-between items-center transition-colors">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em]">{cat.name}</h3>
                  {(cat.flexiMode ?? true) && <span className="text-[9px] font-black text-green-600 bg-green-50 border-2 border-black px-2 py-0.5 rounded-md uppercase tracking-wider">Flexi</span>}
                  {isLegacyCategory && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border-2 border-black px-2 py-0.5 rounded-md uppercase tracking-wider">Legacy</span>}
                </div>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(categoryTotal)}</span>
              </div>
              <div className="w-full">
                {isMobile ? (
                  <div className="p-4 space-y-4 bg-gray-50/30 dark:bg-gray-955/10">
                    {items.length > 0 && items.map((item) => {
                      let isPaid = false, isPartial = false, linkedBiller, paymentSchedule;
                      const isBillerItem = item.isBiller || billers.some(b => b.id === item.id);
                      const effectiveTiming = (item.timing as any) || selectedTiming;
                      if (isBillerItem) {
                        linkedBiller = billers.find(b => b.id === item.id);
                        paymentSchedule = getPaymentSchedule('biller', item.id, selectedMonth, selectedYear);
                        if (paymentSchedule) {
                          isPaid = checkIfPaidBySchedule('biller', item.id);
                          isPartial = checkIfPartialBySchedule('biller', item.id);
                        } else {
                          isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth, selectedYear, effectiveTiming);
                        }
                      } else {
                        isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth, selectedYear, effectiveTiming);
                      }
                      return (
                        <div key={item.id} className={`p-4 rounded-xl border-2 border-black bg-white dark:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 transition-all ${item.included ? 'opacity-100' : 'opacity-60 bg-gray-50'}`}>
                          <div className="flex justify-between items-center gap-2">
                            <input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-full outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded p-1 dark:text-gray-100" />
                            {!isReadOnly && (
                              <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] flex items-center justify-center transition-all ${item.included ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-transparent'}`}><Check className="w-4 h-4" /></button>
                            )}
                          </div>
                          <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border-2 border-black">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                              <input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 outline-none dark:text-gray-100" />
                            </div>
                            <div className="flex items-center space-x-2">
                              {isBillerItem && isPaid && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                              {isBillerItem && isPartial && <span className="text-[9px] font-black bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded border border-black">Partial</span>}
                              {!isBillerItem && isPaid && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            </div>
                          </div>
                          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            {isBillerItem && !isPaid && !isReadOnly && (
                              <button 
                                onClick={() => {
                                  if(linkedBiller && paymentSchedule) {
                                    const scheduleForModal: PaymentSchedule = {
                                      id: paymentSchedule.id, month: paymentSchedule.month, year: paymentSchedule.year.toString(),
                                      expectedAmount: paymentSchedule.expected_amount, amountPaid: paymentSchedule.amount_paid,
                                      datePaid: paymentSchedule.date_paid || undefined, receipt: paymentSchedule.receipt || undefined, accountId: paymentSchedule.account_id || undefined
                                    };
                                    const linkedTransactions = transactions.filter(tx => tx.payment_schedule_id === paymentSchedule.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                    const existingTx = linkedTransactions[0];
                                    setShowPayModal({ biller: linkedBiller, schedule: scheduleForModal, expectedAmount: parseFloat(item.amount) });
                                    setPayFormData({
                                      transactionId: isPartial ? '' : (existingTx?.id || ''),
                                      amount: isPartial ? Math.max(0, parseFloat(item.amount) - paymentSchedule.amount_paid).toFixed(2) : existingTx?.amount.toFixed(2) || item.amount,
                                      receipt: (!isPartial && existingTx) ? 'Receipt on file' : '',
                                      datePaid: (!isPartial && existingTx) ? toLocalDateInputValue(existingTx.date) : getTodayIso(),
                                      accountId: existingTx?.payment_method_id || payFormData.accountId
                                    });
                                  }
                                }}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                {isPartial ? 'Pay Remaining' : 'Pay'}
                              </button>
                            )}
                            {!isBillerItem && !isPaid && !isReadOnly && (cat.flexiMode ?? true) && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
                              <button
                                onClick={() => {
                                  setTransactionFormData({
                                    id: '',
                                    name: item.name,
                                    date: getTodayIso(),
                                    amount: item.amount,
                                    accountId: accounts[0]?.id || '',
                                    paymentScheduleId: '',
                                    transactionType: 'cash_out'
                                  });
                                  setShowTransactionModal(true);
                                }}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                Pay
                              </button>
                            )}
                            {!isReadOnly && (
                              <button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[10px] font-black text-red-500 uppercase tracking-widest border-2 border-black bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Exclude</button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {cat.name === 'Loans' && relevantInstallments.length > 0 && relevantInstallments.map((installment) => {
                      const isIncluded = !excludedInstallmentIds.has(installment.id);
                      let isPaid = false, isPartial = false;
                      const installmentSchedule = getPaymentSchedule('installment', installment.id, selectedMonth, selectedYear);
                      if (installmentSchedule) {
                        isPaid = checkIfPaidBySchedule('installment', installment.id);
                        isPartial = checkIfPartialBySchedule('installment', installment.id);
                      }
                      return (
                        <div key={`installment-${installment.id}`} className={`p-4 rounded-xl border-2 border-black bg-blue-50/20 dark:bg-blue-900/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 transition-all ${isIncluded ? 'opacity-100' : 'opacity-60 bg-gray-50'}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-sm font-black text-gray-900 dark:text-gray-100 block">{installment.name}</span>
                              <span className="text-[9px] font-black px-2 py-0.5 bg-blue-100 border border-black text-blue-600 rounded inline-block mt-1">INSTALLMENT</span>
                            </div>
                            {!isReadOnly && (
                              <button onClick={() => setExcludedInstallmentIds(prev => { const next = new Set(prev); if(next.has(installment.id)) next.delete(installment.id); else next.add(installment.id); return next; })} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-transparent'}`}><Check className="w-4 h-4" /></button>
                            )}
                          </div>
                          <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border-2 border-black">
                            <span className="text-sm font-black">{formatCurrency(installment.monthlyAmount)}</span>
                            {isPaid && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          </div>
                          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                            {!isPaid && !isReadOnly && (
                              <button 
                                onClick={() => {
                                  setTransactionFormData({
                                    id: '', name: `${installment.name} - ${selectedMonth} ${new Date().getFullYear()}`, date: getTodayIso(),
                                    amount: isPartial && installmentSchedule ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2) : installment.monthlyAmount.toFixed(2),
                                    accountId: installment.accountId || accounts[0]?.id || '', paymentScheduleId: installmentSchedule?.id || '',
                                    transactionType: 'loan_payment'
                                  });
                                  setShowTransactionModal(true);
                                }}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50"><th className="p-4 pl-10">Name</th><th className="p-4">Amount</th><th className="p-4 text-center">Actions</th><th className="p-4 pr-10 text-right"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {items.length > 0 ? items.map((item) => {
                          let isPaid = false, isPartial = false, linkedBiller, paymentSchedule;
                          const isBillerItem = item.isBiller || billers.some(b => b.id === item.id);
                          const effectiveTiming = (item.timing as any) || selectedTiming;
                          if (isBillerItem) {
                            linkedBiller = billers.find(b => b.id === item.id);
                            paymentSchedule = getPaymentSchedule('biller', item.id, selectedMonth, selectedYear);
                            if (paymentSchedule) {
                              isPaid = checkIfPaidBySchedule('biller', item.id);
                              isPartial = checkIfPartialBySchedule('biller', item.id);
                            } else {
                              isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth, selectedYear, effectiveTiming);
                            }
                          } else {
                            isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth, selectedYear, effectiveTiming);
                          }
                          return (
                            <tr key={item.id} className={`${item.included ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                              <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} disabled={isReadOnly} className="bg-transparent border-none text-sm font-bold w-full outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded p-1 dark:text-gray-100" /></td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1">
                                  <span className="text-gray-400 dark:text-gray-500 font-bold">₱</span>
                                  <input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} onFocus={() => { isFocusedRef.current = true; }} onBlur={() => { isFocusedRef.current = false; }} disabled={isReadOnly} className="bg-transparent border-none text-sm font-black w-24 outline-none dark:text-gray-100" />
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isBillerItem && (isPaid ? (
                                      <>
                                        <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                        {paymentSchedule && (
                                          <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-3.5 h-3.5" /></button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {isPartial && paymentSchedule && (
                                          <>
                                            <span className="text-[9px] font-bold px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded uppercase" title={`Paid ₱${paymentSchedule.amount_paid} of ₱${parseFloat(item.amount)}`}>Partial</span>
                                            <button onClick={() => openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} title="View payment records" className="text-gray-400 hover:text-indigo-600 transition-colors rounded-full p-1 hover:bg-indigo-50"><Info className="w-3.5 h-3.5" /></button>
                                          </>
                                        )}
                                      {!isReadOnly && (
                                        <button 
                                          onClick={() => { 
                                            if(linkedBiller && paymentSchedule) {
                                              const scheduleForModal: PaymentSchedule = {
                                                id: paymentSchedule.id, month: paymentSchedule.month, year: paymentSchedule.year.toString(),
                                                expectedAmount: paymentSchedule.expected_amount, amountPaid: paymentSchedule.amount_paid,
                                                datePaid: paymentSchedule.date_paid || undefined, receipt: paymentSchedule.receipt || undefined, accountId: paymentSchedule.account_id || undefined
                                              };
                                              const linkedTransactions = transactions.filter(tx => tx.payment_schedule_id === paymentSchedule.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                              const existingTx = linkedTransactions[0];
                                              setShowPayModal({ biller: linkedBiller, schedule: scheduleForModal, expectedAmount: parseFloat(item.amount) });
                                              setPayFormData({
                                                transactionId: isPartial ? '' : (existingTx?.id || ''),
                                                amount: isPartial ? Math.max(0, parseFloat(item.amount) - paymentSchedule.amount_paid).toFixed(2) : existingTx?.amount.toFixed(2) || item.amount,
                                                receipt: (!isPartial && existingTx) ? 'Receipt on file' : '',
                                                datePaid: (!isPartial && existingTx) ? toLocalDateInputValue(existingTx.date) : getTodayIso(),
                                                accountId: existingTx?.payment_method_id || payFormData.accountId
                                              });
                                            } 
                                          }} 
                                          className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                        >
                                          {isPartial ? 'Pay Remaining' : 'Pay'}
                                        </button>
                                      )}
                                      </>
                                    )
                                  )}
                                  {!isBillerItem && (cat.flexiMode ?? true) && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
                                    isPaid ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                    ) : !isReadOnly ? (
                                      <button
                                        onClick={() => {
                                          setTransactionFormData({
                                            id: '',
                                            name: item.name,
                                            date: getTodayIso(),
                                            amount: item.amount,
                                            accountId: accounts[0]?.id || '',
                                            paymentScheduleId: '',
                                            transactionType: 'cash_out'
                                          });
                                          setShowTransactionModal(true);
                                        }}
                                        className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                      >
                                        Pay
                                      </button>
                                    ) : null
                                  )}
                                  {!isReadOnly && <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'text-transparent border-gray-200'}`}><Check className="w-4 h-4" /></button>}
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right">{!isReadOnly && <button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[10px] font-black text-red-500 uppercase tracking-widest border-2 border-black bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Exclude</button>}</td>
                            </tr>
                          );
                        }) : (cat.name === 'Loans' && relevantInstallments.length > 0) ? null : <tr><td colSpan={4} className="p-8 text-center text-gray-400 text-sm font-medium">No items yet. Click "Add Item" below to get started.</td></tr>}
                        
                        {cat.name === 'Loans' && relevantInstallments.length > 0 && relevantInstallments.map((installment) => {
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
                              <td className="p-4 text-sm font-black">{formatCurrency(installment.monthlyAmount)}</td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isPaid ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : (
                                    !isReadOnly && (
                                      <button 
                                        onClick={() => {
                                          setTransactionFormData({
                                            id: '', name: `${installment.name} - ${selectedMonth} ${new Date().getFullYear()}`, date: getTodayIso(),
                                            amount: isPartial && installmentSchedule ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2) : installment.monthlyAmount.toFixed(2),
                                            accountId: installment.accountId || accounts[0]?.id || '', paymentScheduleId: installmentSchedule?.id || '',
                                            transactionType: 'loan_payment'
                                          });
                                          setShowTransactionModal(true);
                                        }}
                                        className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                      >
                                        Pay
                                      </button>
                                    )
                                  )}
                                  {!isReadOnly && <button onClick={() => setExcludedInstallmentIds(prev => { const next = new Set(prev); if(next.has(installment.id)) next.delete(installment.id); else next.add(installment.id); return next; })} className={`w-8 h-8 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 text-white' : 'text-transparent border-gray-200'}`}><Check className="w-4 h-4" /></button>}
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right">
                                {!isReadOnly && <button onClick={() => setConfirmModal({ show: true, title: 'Exclude Installment', message: `Exclude "${installment.name}"?`, onConfirm: () => { setExcludedInstallmentIds(prev => new Set([...prev, installment.id])); setConfirmModal(p => ({...p, show: false})); } })} className="text-[10px] font-black text-red-500 uppercase tracking-widest border-2 border-black bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Exclude</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {canAddItems && <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[11px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest hover:text-indigo-600 dark:hover:text-indigo-400 border-t-4 border-black bg-gray-50/50 dark:bg-gray-800/20 transition-colors text-center">+ Add Item</button>}
              </div>
            </div>
          );
        })}

        {(() => {
          const creditCardAccounts = accounts.filter(acc => acc.classification === 'Credit Card' && acc.billingDate);
          if (creditCardAccounts.length === 0) return null;
          const monthIndex = MONTHS.indexOf(selectedMonth);
          const currentYear = new Date().getFullYear();

          return creditCardAccounts.map(account => {
            const cycleSummaries = aggregateCreditCardPurchases(account, transactions, installments);
            const relevantCycle = cycleSummaries.find(cycle => {
              const cycleMonth = cycle.cycleStart.getMonth();
              const cycleYear = cycle.cycleStart.getFullYear();
              return (cycleMonth === monthIndex && cycleYear === currentYear) || (cycle.cycleEnd.getMonth() === monthIndex && cycle.cycleEnd.getFullYear() === currentYear);
            });

            if (!relevantCycle || relevantCycle.transactionCount === 0) return null;
            return (
              <div key={`cc-${account.id}`} className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
                <div className="px-8 py-5 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30 flex justify-between items-center transition-colors">
                  <div>
                    <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em]">Credit Card Purchases</h3>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">{account.bank} • {relevantCycle.cycleLabel}</p>
                  </div>
                  <span className="text-lg font-black text-purple-600">{formatCurrency(relevantCycle.totalAmount)}</span>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50"><th className="p-4 pl-10">Transaction</th><th className="p-4">Date</th><th className="p-4">Amount</th><th className="p-4 pr-10 text-right"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      {relevantCycle.transactions.map((tx) => (
                        <tr key={tx.id} className="bg-purple-50/20 dark:bg-purple-900/10">
                          <td className="p-4 pl-10"><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{tx.name}</span></td>
                          <td className="p-4"><span className="text-xs text-gray-500 font-medium">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                          <td className="p-4 text-sm font-black">₱ {tx.amount.toFixed(2)}</td>
                          <td className="p-4 pr-10 text-right">
                            <button
                              onClick={() => {
                                const dateStr = tx.date.split('T')[0];
                                setTransactionFormData({ id: tx.id, name: tx.name, date: dateStr, amount: tx.amount.toFixed(2), accountId: tx.payment_method_id, paymentScheduleId: tx.payment_schedule_id || '', transactionType: 'cash_out' });
                                setShowTransactionModal(true);
                              }}
                              className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-2 border-black bg-white px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in zoom-in-95">
            <button onClick={() => setShowPayModal(null)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">Pay {showPayModal.biller.name}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">{payFormData.transactionId ? `Updating payment for ${showPayModal.schedule.month}` : `Recording payment for ${showPayModal.schedule.month}`}</p>
            <form onSubmit={handlePaySubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">₱</span>
                  <input required type="number" step="0.01" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 pl-7 outline-none text-base font-black focus:ring-2 focus:ring-indigo-500 transition-all dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date Paid</label>
                  <input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Payment Method</label>
                  <select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs appearance-none dark:text-gray-100">
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Upload Receipt (Optional)</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0] || null; setPayReceiptFile(f); setPayFormData({...payFormData, receipt: f?.name || ''}); }} />
                  <div className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-black rounded-xl p-4 text-center text-xs text-gray-500 hover:bg-indigo-50 flex flex-col items-center">
                    <Upload className="w-6 h-6 mb-1 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload'}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-black py-2.5 rounded-xl font-black text-xs text-gray-500 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
                  {payFormData.transactionId ? 'Update' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransactionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-sm p-6 relative transition-colors">
            <button onClick={() => setShowTransactionModal(false)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-4">{transactionFormData.id ? `Edit Payment` : `Pay ${transactionFormData.name || 'Item'}`}</h2>
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input required type="number" min="0" step="0.01" value={transactionFormData.amount} onChange={(e) => setTransactionFormData({...transactionFormData, amount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 pl-7 outline-none text-base font-black dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date Paid</label>
                  <input required type="date" value={transactionFormData.date} onChange={(e) => setTransactionFormData({...transactionFormData, date: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Payment Method</label>
                  <select value={transactionFormData.accountId} onChange={(e) => setTransactionFormData({...transactionFormData, accountId: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100">
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-black py-2.5 rounded-xl font-black text-xs text-gray-500 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fundModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setFundModal(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFundModal(null)} className="absolute top-4 right-4 text-gray-400 p-1.5 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-black text-indigo-600 rounded-xl flex items-center justify-center"><Plus className="w-5 h-5" /></div>
              <div><h2 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Fund Stash</h2><p className="text-[11px] text-gray-500 font-medium">{fundModal.wallet.name}</p></div>
            </div>
            <form onSubmit={handleFundSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount <span className="text-red-500">*</span></label>
                <div className="flex items-center border-2 border-black rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800"><span className="text-gray-400 font-bold mr-2 text-xs">₱</span><input type="number" min="0.01" step="0.01" value={fundForm.amount} onChange={e => setFundForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required className="flex-1 bg-transparent outline-none text-sm font-black text-indigo-600" /></div>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={fundForm.date} onChange={e => setFundForm(f => ({ ...f, date: e.target.value }))} required className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-100 outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Notes <span className="text-gray-300">(optional)</span></label>
                <input type="text" value={fundForm.notes} onChange={e => setFundForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Monthly allocation" className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 text-xs text-gray-700 dark:text-gray-300 outline-none" />
              </div>
              <div className="flex flex-col space-y-2 pt-1">
                <button type="submit" disabled={fundSubmitting} className="w-full bg-indigo-600 text-white border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">{fundSubmitting ? 'Funding…' : 'Fund Stash'}</button>
                <button type="button" onClick={() => setFundModal(null)} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stashInfoModal && (() => {
        const { funded, remaining, topUps } = getStashAggregates(stashInfoModal.wallet);
        const linkedAccount = accounts.find(a => a.id === stashInfoModal.wallet.accountId);
        return (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setStashInfoModal(null)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-2xl p-6 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <button onClick={() => setStashInfoModal(null)} className="absolute top-4 right-4 text-gray-400 p-1.5 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-10 h-10 bg-indigo-50 border-2 border-black text-indigo-600 rounded-xl flex items-center justify-center"><Info className="w-5 h-5" /></div>
                <div><h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Stash Info</h2><p className="text-xs text-gray-500 font-medium">{stashInfoModal.wallet.name} · {selectedMonth} {selectedYear}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-gray-50 border-2 border-black rounded-xl p-2.5 text-center">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Target</p>
                  <p className="text-xs font-black text-indigo-600">{formatCurrency(stashInfoModal.wallet.amount)}</p>
                </div>
                <div className="bg-green-50 border-2 border-black rounded-xl p-2.5 text-center">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Funded</p>
                  <p className="text-xs font-black text-green-600">{formatCurrency(funded)}</p>
                </div>
                <div className="bg-orange-50 border-2 border-black rounded-xl p-2.5 text-center">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Left</p>
                  <p className="text-xs font-black text-orange-600">{formatCurrency(remaining)}</p>
                </div>
              </div>
              {linkedAccount && (<p className="text-xs text-gray-500 mb-4 font-medium">Account: <span className="text-gray-700 font-bold">{linkedAccount.bank} ({linkedAccount.classification})</span></p>)}
              <h3 className="text-[9px] font-black text-gray-400 tracking-widest uppercase mb-2">Top-ups this month</h3>
              {topUps.length === 0 ? <p className="text-xs text-gray-400 italic py-2 text-center">No top-ups found.</p> : (
                <div className="space-y-2">
                  {topUps.map(tx => (
                    <div key={tx.id} className="bg-gray-50 border-2 border-black rounded-xl p-3 flex items-center justify-between">
                      <div><p className="text-xs font-bold text-gray-900">{tx.name}</p><p className="text-[10px] text-gray-500">{new Date(tx.date).toLocaleDateString()}</p></div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-indigo-600">{formatCurrency(Math.abs(tx.amount))}</span>
                        <PinProtectedAction featureId="transaction_deletions" onVerified={() => handleDeleteStashTopUp(tx.id, tx.amount)} actionLabel="Delete Top-up">
                          <button onClick={(e) => e.preventDefault()} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        </PinProtectedAction>
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
          <div className="w-full max-w-sm bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-2xl p-6 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSchedulePaymentsModal(null)} className="absolute top-4 right-4 text-gray-400 p-1.5 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black text-gray-900 mb-0.5">Payment Records</h2>
            <p className="text-gray-500 text-xs mb-4">{schedulePaymentsModal.label}</p>
            {loadingScheduleTx ? <div className="text-center py-6 text-gray-400 text-xs">Loading...</div> : schedulePaymentsModal.transactions.length === 0 ? <div className="text-center py-6 text-gray-400 text-xs italic">No records.</div> : (
              <div className="space-y-3">
                {schedulePaymentsModal.transactions.map(tx => (
                  <div key={tx.id} className="bg-gray-50 border-2 border-black rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Amount</span><span className="font-bold text-red-600">{formatCurrency(tx.amount)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</span><span className="text-gray-700">{new Date(tx.date).toLocaleDateString()}</span></div>
                    <div className="flex justify-end pt-1">
                      <PinProtectedAction featureId="transaction_deletions" onVerified={() => handleDeleteScheduleTx(tx.id)} actionLabel="Delete Record">
                        <button onClick={(e) => e.preventDefault()} className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 border-2 border-black text-[10px] font-bold shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all"><Trash2 className="w-3 h-3" /><span>Delete</span></button>
                      </PinProtectedAction>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showSalaryModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowSalaryModal(false)}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-sm p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSalaryModal(false)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-4">Record Income</h2>
            <form onSubmit={handleSalaryCashIn} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Transaction Name</label>
                <input required type="text" value={salaryFormData.name} onChange={(e) => setSalaryFormData({...salaryFormData, name: e.target.value})} className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 text-xs font-bold outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-sm">₱</span>
                  <input required type="number" min="0.01" step="0.01" value={salaryFormData.amount} onChange={(e) => setSalaryFormData({...salaryFormData, amount: e.target.value})} className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 pl-7 outline-none text-base font-black" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date Received</label>
                  <input required type="date" value={salaryFormData.date} onChange={(e) => setSalaryFormData({...salaryFormData, date: e.target.value})} className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-2 py-2 outline-none font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Deposit Account</label>
                  <select required value={salaryFormData.accountId} onChange={(e) => setSalaryFormData({...salaryFormData, accountId: e.target.value})} className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-2 py-2 outline-none font-bold text-xs appearance-none">
                    <option value="" disabled>Select Account</option>
                    {accounts.filter(a => a.type === 'Debit').map(acc => <option key={acc.id} value={acc.id}>{acc.bank}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowSalaryModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-black py-2.5 rounded-xl font-bold text-xs text-gray-500 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white border-2 border-black py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showIncomeRecordsModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowIncomeRecordsModal(false)}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-sm p-6 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowIncomeRecordsModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-0.5">Income</h2><p className="text-gray-500 text-xs">{selectedMonth} {selectedYear}</p></div>
              <button onClick={() => { setShowIncomeRecordsModal(false); const debitAccounts = accounts.filter(a => a.type === 'Debit'); setSalaryFormData({ name: 'Income', amount: '', date: getTodayIso(), accountId: debitAccounts[0]?.id || '' }); setShowSalaryModal(true); }} className="flex items-center gap-1 bg-indigo-50 border-2 border-black text-indigo-600 px-2.5 py-1.5 rounded-xl font-bold shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all text-xs"><Plus className="w-3.5 h-3.5" />Add</button>
            </div>
            {allIncomeTxs.length === 0 ? <div className="text-center py-6 text-gray-400 text-xs italic">No income records found.</div> : (
              <div className="space-y-3">
                {allIncomeTxs.map(tx => {
                  const pmName = accounts.find(a => a.id === tx.payment_method_id)?.bank || tx.payment_method_id;
                  return (
                    <div key={tx.id} className="bg-gray-50 dark:bg-gray-800/50 border-2 border-black rounded-xl p-3 space-y-1">
                      <div className="flex justify-between items-start"><div className="min-w-0 flex-1"><p className="text-xs font-black text-gray-900 dark:text-gray-100 truncate">{tx.name}</p><p className="text-[10px] text-gray-500 truncate">{pmName} • {new Date(tx.date).toLocaleDateString()}</p></div><span className="text-xs font-black text-green-600 ml-2">{formatCurrency(Math.abs(tx.amount))}</span></div>
                      <div className="flex justify-end pt-1">
                        <PinProtectedAction featureId="transaction_deletions" onVerified={async () => { try { const { error } = await deleteTransactionAndRevertSchedule(tx.id); if (error) throw error; if (tx.name.trim().toLowerCase() === 'salary') setActualSalary(''); await reloadTransactions(); if (onTransactionDeleted) onTransactionDeleted(); } catch { alert('Error deleting transaction.'); } }} actionLabel="Delete Record">
                          <button onClick={(e) => e.preventDefault()} className="text-[9px] font-black text-red-500 border-2 border-black bg-white px-2 py-0.5 rounded-lg shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none">Delete</button>
                        </PinProtectedAction>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
<div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
<div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black w-full max-w-xs p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center transition-colors">
  <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 border-2 border-black text-red-600 rounded-xl flex items-center justify-center mb-4 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]"><AlertTriangle className="w-6 h-6" /></div>
  <h3 className="text-base font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">{title}</h3>
  <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 font-medium leading-relaxed">{message}</p>
  <div className="flex flex-col w-full space-y-2">
    <button onClick={onConfirm} className="w-full bg-red-600 text-white border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Proceed</button>
    <button onClick={onClose} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
  </div>
</div>
</div>
);

export default Budget;
