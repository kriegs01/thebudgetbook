// pages/Budget.tsx
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory, Installment, Wallet } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, Wallet as WalletIcon, ArrowLeft, Upload, CheckCircle2, X, AlertTriangle, Info, Archive, RotateCcw, List, Hand } from 'lucide-react';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend } from '../src/services/budgetSetupsService';
import { createTransaction, getAllTransactions, updateTransaction, updateTransactionAndSyncSchedule, createPaymentScheduleTransaction, uploadTransactionReceipt, getTransactionsByPaymentSchedule, getReceiptSignedUrl, deleteTransactionAndRevertSchedule, getAllStashTransactions, createTransfer } from '../src/services/transactionsService';
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
import { PageHeader } from '../src/components/PageHeader';
import { guardFundStashOverdraft } from '../pages/transactions';
import { useIncomeSlicer } from '../src/components/useIncomeSlicer'; 
import { recordCreditPayment } from '../src/services/transactionsService';
import { calculateBillingCycles } from '../src/utils/billingCycles';
import { getPayScheduleRules, PayScheduleRule } from '../src/services/payScheduleService';
import { getActiveRuleForMonth, generatePayPeriodsForMonth, findPayPeriodForDueDate, PayPeriod } from '../src/utils/payPeriodUtils';
import { getPayPeriodLabel } from '../src/utils/payPeriodUtils'; // Or ensure it's imported correctly from your utils path
import { fetchPaySchedules } from '../src/services/payScheduleService'; 
import { SandboxView } from '../src/components/SandboxView';
import { processBudeeTransaction } from '../src/services/budeeService';
import { determineItemPeriod } from '../src/utils/budgetEngine';


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
  // 🟢 NEW: Allow the component to receive the people table
  people?: { id: string; name: string; [key: string]: any }[]; 
}


const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const getNextAvailableDate = (existingSetups: SavedBudgetSetup[]) => {
  // 1. If no budgets exist, default to the current real-world month
  if (!existingSetups || existingSetups.length === 0) {
    const now = new Date();
    return { 
      month: MONTHS[now.getMonth()], 
      year: now.getFullYear() 
    };
  }

  // 2. Find the absolute latest setup
  const latestSetup = existingSetups.reduce((latest, current) => {
    const currentYear = current.data?._year || new Date().getFullYear();
    const currentMonthIdx = MONTHS.indexOf(current.month);
    
    const latestYear = latest.data?._year || new Date().getFullYear();
    const latestMonthIdx = MONTHS.indexOf(latest.month);

    if (currentYear > latestYear) return current;
    if (currentYear === latestYear && currentMonthIdx > latestMonthIdx) return current;
    return latest;
  });

  const latestYear = latestSetup.data?._year || new Date().getFullYear();
  const latestMonthIdx = MONTHS.indexOf(latestSetup.month);

  // 3. Calculate the next month (handling the December -> January rollover)
  let nextMonthIdx = latestMonthIdx + 1;
  let nextYear = latestYear;

  if (nextMonthIdx > 11) {
    nextMonthIdx = 0;
    nextYear += 1;
  }

  return { 
    month: MONTHS[nextMonthIdx], 
    year: nextYear 
  };
};


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


const parseIsoMonthStart = (iso: any): Date | null => {
  if (!iso || typeof iso !== 'string' || !iso.includes('-')) return null;
  try {
    const parts = iso.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(y) || isNaN(m)) return null;
    return new Date(y, m - 1, 1);
  } catch (e) {
    return null;
  }
};


const isCategoryActiveForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  try {
    if (!cat) return false;
    const monthIndex = MONTHS.indexOf(selectedMonthName);
    if (monthIndex < 0) return cat.active !== false;

    const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
    const deactivationDate = cat.deactivatedAt ? parseIsoMonthStart(cat.deactivatedAt) : null;
    const reactivationDate = cat.reactivatedFrom ? parseIsoMonthStart(cat.reactivatedFrom) : null;
    
    if (!deactivationDate && !reactivationDate) return cat.active !== false;
    if (deactivationDate && !reactivationDate) return budgetMonthStart < deactivationDate;
    if (!deactivationDate && reactivationDate) return budgetMonthStart >= reactivationDate;

    if (deactivationDate && budgetMonthStart < deactivationDate) return true;
    if (reactivationDate && budgetMonthStart >= reactivationDate) return true;
    return false;
  } catch (e) {
    return true; 
  }
};

const shouldRenderCategorySection = (
  cat: BudgetCategory,
  hasData: boolean,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  try {
    if (!cat) return false;
    const isActive = isCategoryActiveForBudget(cat, selectedYear, selectedMonthName);
    
    if (cat.deactivatedAt) {
      const monthIndex = MONTHS.indexOf(selectedMonthName);
      if (monthIndex >= 0) {
        const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
        const deactivationDate = parseIsoMonthStart(cat.deactivatedAt);
        const reactivationDate = cat.reactivatedFrom ? parseIsoMonthStart(cat.reactivatedFrom) : null;
        
        if (deactivationDate) {
          const inGap = budgetMonthStart >= deactivationDate && (!reactivationDate || budgetMonthStart < reactivationDate);
          if (inGap) return false;
        }
      }
    }

    if (cat.flexiMode === false && !hasData) return false;
    return isActive || hasData;
  } catch (e) {
    return true; 
  }
};

const isCategoryLegacyForBudget = (
  cat: BudgetCategory,
  selectedYear: number,
  selectedMonthName: string
): boolean => {
  try {
    if (!cat || !cat.deactivatedAt) return false;
    const monthIndex = MONTHS.indexOf(selectedMonthName);
    if (monthIndex < 0) return false;

    const budgetMonthStart = new Date(selectedYear, monthIndex, 1);
    const deactivationDate = parseIsoMonthStart(cat.deactivatedAt);

    if (deactivationDate && budgetMonthStart >= deactivationDate) return false;

    if (cat.legacyFrom) {
      const legacyFromDate = parseIsoMonthStart(cat.legacyFrom);
      if (legacyFromDate) return budgetMonthStart >= legacyFromDate;
    }

    return true;
  } catch (e) {
    return false;
  }
};

const calculateBudgetRemaining = (
  setup: SavedBudgetSetup,
  transactions: SupabaseTransaction[],
  selectedYear: number
): number => {
  try {
    if (!setup || !setup.data) return 0;
    const totalSpend = setup.totalAmount || 0;
    
    const actualStr = setup.data._actualSalary;
    const projectedStr = setup.data._projectedSalary;
    
    const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
    const projectedValue = parseFloat(projectedStr || '0');
    const baseSalary = projectedStr !== undefined ? parseFloat(projectedStr) || 0 : 0;
    const incomeToUse = actualValue !== null && !isNaN(actualValue) ? actualValue : baseSalary;

    return incomeToUse - totalSpend;
  } catch (e) {
    return 0;
  }
};

const Budget: React.FC<BudgetProps> = ({ 
  accounts = [], 
  billers = [], 
  categories = [], 
  savedSetups = [], 
  setSavedSetups, 
  onUpdateBiller, 
  onMoveToTrash, 
  onReloadSetups, 
  onReloadBillers, 
  onUpdateInstallment, 
  installments = [], 
  onTransactionCreated, 
  onTransactionDeleted, 
  onArchiveBudget, 
  onReopenBudget, 
  userProfile,
  people = [] 
}) => {
// Safe console log
console.log("Budget Setup Categories:", (categories || []).map(c => c?.name));

const { getAccentClasses } = useTheme();
const isMobile = useMediaQuery('(max-width: 767px)');
const [view, setView] = useState<'summary' | 'setup'>('summary');
const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

const [showSandbox, setShowSandbox] = useState(false);

const [isSlicerExpanded, setIsSlicerExpanded] = useState(false);


const sortedSetups = React.useMemo(() => {
  return [...(savedSetups || [])].sort((a, b) => {
    const yearA = parseInt(a.data?._year || new Date().getFullYear().toString());
    const yearB = parseInt(b.data?._year || new Date().getFullYear().toString());
    
    if (yearA !== yearB) return yearA - yearB;
    return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
  });
}, [savedSetups]);

{/* TO: Expand the filter to include Loans and Liabilities */}
const creditBudgetAccounts = React.useMemo(() => {
  return (accounts || [])
    .filter(acc => 
      acc?.type === 'Credit' || 
      acc?.classification === 'Credit Card' || 
      acc?.type === 'Loan' || 
      acc?.classification === 'Loan' || 
      acc?.type === 'Liability'
    );
}, [accounts]); 


const effectiveCategories = React.useMemo(() => {
  const list = [...(categories || [])];
  
  if (!list.some(c => c?.name === 'Credit')) {
    list.push({
      id: 'system-credit-category',
      name: 'Credit',
      active: true,
      flexiMode: false
    });
  }
  
  // 🟢 NEW: Inject the Budee category
  if (!list.some(c => c?.name === 'Budee')) {
    list.push({
      id: 'system-budee-category',
      name: 'Budee',
      active: true,
      flexiMode: false
    });
  }
  
  return list;
}, [categories]);

  
  
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
  }, []);

  useEffect(() => {
    if (view === 'setup') {
      const params = new URLSearchParams();
      params.set('view', 'setup');
      params.set('month', selectedMonth);
      params.set('year', String(selectedYear));
      params.set('timing', selectedTiming);
      
      // 🟢 GUARD 1: Only update the URL if the parameters actually changed
      if (searchParams.toString() !== params.toString()) {
        navigate(`?${params.toString()}`, { replace: true });
      }
    } else {
      // 🟢 GUARD 2: Only clear the URL if we are actively leaving a setup view.
      // This stops the Budget page from cancelling your clicks to other pages!
      if (searchParams.has('view')) {
        navigate('', { replace: true });
      }
    }
  }, [view, selectedMonth, selectedYear, selectedTiming, navigate, searchParams]);


  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  const [showCreditPayModal, setShowCreditPayModal] = useState<{ 
    accountId: string; 
    amount: number; 
    bank: string; 
  } | null>(null);
  
  // Around line 316
  const [excludedCreditIds, setExcludedCreditIds] = useState<Set<string>>(new Set());

  const isFocusedRef = useRef(false);
  const [excludedInstallmentIds, setExcludedInstallmentIds] = useState<Set<string>>(new Set());

  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');

// The new tab-mapped income states
const [projectedSalaryByPeriod, setProjectedSalaryByPeriod] = useState<Record<number, string>>({ 1: '11000' });
const [actualSalaryByPeriod, setActualSalaryByPeriod] = useState<Record<number, string>>({});

// The master control for which tab is currently active
const [activePeriodIndex, setActivePeriodIndex] = useState<number>(1);

  // 🟢 ENGINE ADAPTER: Catches any leftover old function calls and safely routes them to the new unified engine!
  const getAccountPeriodIndex = (item: any) => {
    if (!item) return 1;
    return determineItemPeriod(item, currentPeriods, selectedMonth, selectedYear);
  };


  const [isProjectedFocused, setIsProjectedFocused] = useState(false);
  const [isActualFocused, setIsActualFocused] = useState(false);

  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [stashTopUps, setStashTopUps] = useState<SupabaseTransaction[]>([]);
  const [excludedWalletIds, setExcludedWalletIds] = useState<Set<string>>(new Set());

  const [fundModal, setFundModal] = useState<{ wallet: Wallet } | null>(null);
  const [fundForm, setFundForm] = useState({ amount: '', date: '', notes: '', sourceAccountId: '' });
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [stashInfoModal, setStashInfoModal] = useState<{ wallet: Wallet } | null>(null);
  const [stashRepairModal, setStashRepairModal] = useState<{ wallet: Wallet; tx: SupabaseTransaction } | null>(null);
  const [stashRepairForm, setStashRepairForm] = useState({ sourceAccountId: '' });
  const [stashRepairSubmitting, setStashRepairSubmitting] = useState(false);
  const [stashStatusMsg, setStashStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [creditInfoModal, setCreditInfoModal] = useState<{ account: Account } | null>(null);

  // Overdraft prompt state for Fund Stash operations
  const [overdraftPrompt, setOverdraftPrompt] = useState<{
    mode: 'block' | 'warn';
    accountId: string;
    accountName: string;
    currentBalance: number;
    transactionAmount: number;
    projectedBalance: number;
  } | null>(null);
  const [pendingFundAction, setPendingFundAction] = useState<(() => Promise<void>) | null>(null);

  const [archiveStatusMsg, setArchiveStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  const [showArchived, setShowArchived] = useState(false);

  const [paymentSchedules, setPaymentSchedules] = useState<SupabaseMonthlyPaymentSchedule[]>([]);

  // 🟢 Rollover Prompt State for Budget Page
  const [rolloverPrompt, setRolloverPrompt] = useState<{
    show: boolean;
    accountId: string;
    accountName: string;
    remainingBalance: number;
    interestRate: number;
  }>({
    show: false,
    accountId: '',
    accountName: '',
    remainingBalance: 0,
    interestRate: 0
  });


 //Dynamic budget item distribution by due date
  const [payRules, setPayRules] = useState<PayScheduleRule[]>([]);
  const [currentPeriods, setCurrentPeriods] = useState<PayPeriod[]>([]);

        
    
  
    // 🟢 THE UNIFIED BUDGET ENGINE
    const processedBudgetMap = React.useMemo(() => {
      const periodMap: Record<number, Record<string, CategorizedSetupItem[]>> = {
        1: {}, 2: {}, 3: {}, 4: {}
      };
  
      if (Array.isArray(effectiveCategories)) {
        effectiveCategories.forEach(cat => {
          periodMap[1][cat.name] = [];
          periodMap[2][cat.name] = [];
          periodMap[3][cat.name] = [];
          periodMap[4][cat.name] = [];
        });
      }
  
      if (setupData && typeof setupData === 'object') {
        Object.entries(setupData).forEach(([categoryName, items]) => {
          if (categoryName.startsWith('_') || !Array.isArray(items)) return;
  
          items.forEach(item => {
            if (!item) return; // 🟢 Let unchecked items pass through to the UI

  
            const linkedBiller = item.isBiller && Array.isArray(billers) ? billers.find(b => b.id === item.id) : null;
            const linkedInstallment = Array.isArray(installments) ? installments.find(i => i.id === item.id) : null;
            
            // Give the engine the best possible item data to work with
            const itemWithLinks = { ...item, ...linkedBiller, ...linkedInstallment };
            const targetPeriod = determineItemPeriod(itemWithLinks, currentPeriods, selectedMonth, selectedYear);



  
            if (!periodMap[targetPeriod]) periodMap[targetPeriod] = {};
            if (!periodMap[targetPeriod][categoryName]) periodMap[targetPeriod][categoryName] = [];
  
            periodMap[targetPeriod][categoryName].push(item);
          });
        });
      }
  
      return periodMap;
    }, [setupData, effectiveCategories, billers, installments, currentPeriods, selectedMonth, selectedYear]);
  

  // Fetch pay rules on mount
  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await getPayScheduleRules();
      if (data && data.length > 0) {
        setPayRules(data);
      } else {
        // Fallback default rule if none created yet (Standard semi-monthly 1st and 15th anchor)
        setPayRules([{
          effectiveFromDate: '2000-01-01',
          frequency: 'semi-monthly',
          firstPaycheckDate: `${selectedYear}-01-15`
        }]);
      }
    };
    fetchRules();
  }, [selectedYear]);

  const timingOptions = React.useMemo(() => {
    const safePeriods = currentPeriods || [];
    return safePeriods.map((period, index) => {
      const periodNumber = index + 1;
      const totalPeriods = safePeriods.length;
      
      // Format the dates nicely (e.g., "Aug 1")
      const formattedStart = period?.startDate ? new Date(period.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const formattedEnd = period?.endDate ? new Date(period.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      
      return {
        value: `${periodNumber}/${totalPeriods}`,
        label: getPayPeriodLabel ? getPayPeriodLabel(index, totalPeriods) : `Period ${periodNumber}`,
        dateRange: formattedStart && formattedEnd ? `${formattedStart} to ${formattedEnd}` : ''
      };
    });
  }, [currentPeriods]);


  // Load dynamic periods safely via useEffect
  useEffect(() => {
    let isMounted = true;
    async function loadDynamicPeriods() {
      const monthIndex = MONTHS.indexOf(selectedMonth);
      try {
        // 1. Fetch the rules directly from the database!
        // (Make sure to pass userProfile.user_id if your function requires it)
        const response = await getPayScheduleRules(); // Add userProfile?.user_id inside the () if needed
        const rulesArray = response.data || [];
        
        console.log("Fetched Rules Array:", rulesArray);
        
        // 2. Pass the fetched array into your active rule checker
        const activeRule = getActiveRuleForMonth(selectedYear, monthIndex, rulesArray);
        const periods = generatePayPeriodsForMonth(selectedYear, monthIndex, activeRule);
        
        if (isMounted) {
          if (periods && periods.length > 0) {
            setCurrentPeriods(periods);
            if (!periods.some((_, idx) => `${idx + 1}/${periods.length}` === selectedTiming)) {
              setSelectedTiming('1/4'); // Or '1/2' depending on what you want the default to be
            }
          } else {
            setCurrentPeriods([
              { startDate: '', endDate: '', label: 'First Pay' },
              { startDate: '', endDate: '', label: 'Second Pay' }
            ]);
          }
        }
      } catch (e) {
        console.error("Failed to load active pay rules for month:", e);
      }
    }
    loadDynamicPeriods();
    return () => { isMounted = false; };
  }, [selectedMonth, selectedYear]);



  useEffect(() => {
    // 1. Find ALL setups for the currently selected month & year
    const setupsForMonth = savedSetups.filter(s => 
      s.month === selectedMonth && 
      parseInt(s.data?._year || new Date().getFullYear().toString()) === selectedYear
    );
  
    // Helper to inject active billers into a category map if missing
    const injectActiveBillers = (baseData: { [key: string]: CategorizedSetupItem[] }) => {
      const merged = { ...baseData };
      effectiveCategories.forEach(c => {
        if (!merged[c.name]) merged[c.name] = [];
      });

      // 1. Inject active non-zero billers
      (billers || []).forEach(biller => {
        if (biller.isArchived) return;
        if (isBillerActiveForPeriod(biller, selectedMonth, selectedYear)) {
          
          let resolvedAmount = biller.amount || biller.monthlyAmount || biller.expectedAmount || 0;
          if (!resolvedAmount && Array.isArray(biller.schedules) && biller.schedules.length > 0) {
            const matchingSchedule = biller.schedules.find(s => s.month === selectedMonth && Number(s.year) === selectedYear);
            resolvedAmount = matchingSchedule?.expectedAmount || biller.schedules[biller.schedules.length - 1]?.expectedAmount || 0;
          }

          if (resolvedAmount <= 0) return;

          let targetCat = biller.category;
          if (!merged[targetCat]) {
            const matchedCat = effectiveCategories.find(c => c.name.toLowerCase() === targetCat?.toLowerCase());
            targetCat = matchedCat ? matchedCat.name : 'Fixed';
          }
          if (!merged[targetCat]) merged[targetCat] = [];

          const existingItemIndex = merged[targetCat].findIndex(item => item.id === biller.id || item.name.toLowerCase() === biller.name.toLowerCase());
          
          if (existingItemIndex === -1) {
            merged[targetCat].push({
              id: biller.id,
              name: biller.name,
              amount: String(resolvedAmount),
              included: true,
              isBiller: true,
              timing: biller.timing,
              dueDay: biller.dueDate
            });
          } else if (Number(merged[targetCat][existingItemIndex].amount) === 0) {
            merged[targetCat][existingItemIndex].amount = String(resolvedAmount);
          }
        }
      });

      // 2. 🔥 Clean up: Remove any biller items that ended up with 0 or empty amounts
      Object.keys(merged).forEach(cat => {
        merged[cat] = merged[cat].filter(item => {
          if (item.isBiller) {
            const val = parseFloat(item.amount || '0');
            return !isNaN(val) && val > 0;
          }
          return true; // Keep regular non-biller items intact
        });
      });

      return merged;
    };




    // 🟢 Check for _periodTotals so the loader knows this is an upgraded multi-tab budget!
const unifiedSetup = setupsForMonth.find(s => s.timing === 'unified' || s.data?._periodTotals);

  
    if (unifiedSetup && unifiedSetup.data) {
      // 🟢 PATH A: Load Unified Setup with auto-injected active billers
      const rawData = Object.fromEntries(
        Object.entries(unifiedSetup.data).filter(([key]) => !key.startsWith('_'))
      );
      const incomingData = injectActiveBillers(rawData);
      
      setSetupData(incomingData);
      setProjectedSalary(unifiedSetup.data._projectedSalary ?? '11000');
      setActualSalary(unifiedSetup.data._actualSalary ?? '');
      setProjectedSalaryByPeriod(unifiedSetup.data._projectedSalaryByPeriod || { 1: unifiedSetup.data._projectedSalary ?? '11000' });
      setActualSalaryByPeriod(unifiedSetup.data._actualSalaryByPeriod || { 1: unifiedSetup.data._actualSalary ?? '' });
  
      setExcludedInstallmentIds(new Set(unifiedSetup.data._excludedInstallmentIds || []));
      setExcludedWalletIds(new Set(unifiedSetup.data._excludedWalletIds || []));
      setExcludedCreditIds(new Set(unifiedSetup.data._excludedCreditIds || []));
  
    } else if (setupsForMonth.length > 0) {
      // 🟡 PATH B: LAZY MERGE with auto-injected active billers
      const mergedData: { [key: string]: CategorizedSetupItem[] } = {};
      const mergedProjected: Record<number, string> = {};
      const mergedActual: Record<number, string> = {};
      
      effectiveCategories.forEach(c => mergedData[c.name] = []);
  
      setupsForMonth.forEach(setup => {
        const periodIndex = setup.timing === '1/2' ? 1 : setup.timing === '2/2' ? 2 : parseInt(setup.timing?.split('/')[0] || '1');
        
        mergedProjected[periodIndex] = setup.data._projectedSalary ?? '11000';
        if (setup.data._actualSalary) {
            mergedActual[periodIndex] = setup.data._actualSalary;
        }
 
        Object.entries(setup.data).forEach(([category, items]) => {
          if (category.startsWith('_') || !Array.isArray(items)) return;
          if (!mergedData[category]) mergedData[category] = [];
          
          items.forEach((oldItem: any) => {
            let existingItem = mergedData[category].find(i => i.id === oldItem.id || i.name === oldItem.name);
            if (!existingItem) {
              // 🟢 Safely copy over any existing amountsByPeriod from the saved item
              existingItem = { ...oldItem, amountsByPeriod: { ...(oldItem.amountsByPeriod || {}) } };
              mergedData[category].push(existingItem);
            } else if (oldItem.amountsByPeriod) {
              // 🟢 Merge them together so we don't lose data from other tabs during Auto-Save!
              existingItem.amountsByPeriod = { ...existingItem.amountsByPeriod, ...oldItem.amountsByPeriod };
            }
            
            // 🟢 Only use the legacy fallback if the period map is totally empty
            if (!existingItem.amountsByPeriod[periodIndex]) {
                existingItem.amountsByPeriod[periodIndex] = oldItem.amount || '0';
            }
            
            if (periodIndex === activePeriodIndex) {
                existingItem.amount = existingItem.amountsByPeriod[activePeriodIndex] || oldItem.amount || '0';
            }
          });
        });
     });


      const finalMergedData = injectActiveBillers(mergedData);
      setSetupData(finalMergedData);
      
      setProjectedSalaryByPeriod(mergedProjected);
      setActualSalaryByPeriod(mergedActual);
      setProjectedSalary(mergedProjected[1] || '11000');
      setActualSalary(mergedActual[1] || '');
  
      const baseSetup = setupsForMonth[0].data;
      setExcludedInstallmentIds(new Set(baseSetup._excludedInstallmentIds || []));
      setExcludedWalletIds(new Set(baseSetup._excludedWalletIds || []));
      setExcludedCreditIds(new Set(baseSetup._excludedCreditIds || []));
  
    } else {
      // ⚪ PATH C: Empty State with auto-injected active billers
      const initialEmpty: { [key: string]: CategorizedSetupItem[] } = {};
      effectiveCategories.forEach(c => initialEmpty[c.name] = []);
      const finalEmptyData = injectActiveBillers(initialEmpty);

      setSetupData(finalEmptyData);
      setProjectedSalary('11000');
      setActualSalary('');
      setProjectedSalaryByPeriod({ 1: '11000' });
      setActualSalaryByPeriod({});
      setExcludedInstallmentIds(new Set());
      setExcludedWalletIds(new Set());
      setExcludedCreditIds(new Set()); 
    }
  }, [selectedMonth, selectedYear, savedSetups, effectiveCategories, activePeriodIndex, billers]);

  

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

  const isLegacyStashTopUp = useCallback((tx: SupabaseTransaction) => {
    return tx.transaction_type === 'cash_in' && tx.amount < 0;
  }, []);

  const getDefaultStashSourceAccountId = useCallback((wallet: Wallet, tx?: SupabaseTransaction) => {
    const fundingAccounts = accounts.filter(a => a.type === 'Debit');
    const preferredId = tx?.payment_method_id || wallet.accountId;
    if (fundingAccounts.some(a => a.id === preferredId)) return preferredId;
    if (fundingAccounts.some(a => a.id === wallet.accountId)) return wallet.accountId;
    return fundingAccounts[0]?.id || '';
  }, [accounts]);

  const handleOpenFundModal = useCallback((wallet: Wallet) => {
    const { remaining } = getStashAggregates(wallet);
    const defaultSourceAccountId = getDefaultStashSourceAccountId(wallet);
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
      sourceAccountId: defaultSourceAccountId,
    });
    setFundModal({ wallet });
  }, [getDefaultStashSourceAccountId, getStashAggregates, selectedMonth, selectedYear]);

  const handleOpenStashRepairModal = useCallback((wallet: Wallet, tx: SupabaseTransaction) => {
    setStashRepairForm({
      sourceAccountId: getDefaultStashSourceAccountId(wallet, tx),
    });
    setStashRepairModal({ wallet, tx });
  }, [getDefaultStashSourceAccountId]);

  const handleRepairStashTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stashRepairModal) return;
    if (!stashRepairForm.sourceAccountId) return;

    setStashRepairSubmitting(true);
    try {
      const correctedAmount = Math.abs(stashRepairModal.tx.amount);
      const { error } = await updateTransaction(stashRepairModal.tx.id, {
        payment_method_id: stashRepairForm.sourceAccountId,
        amount: correctedAmount,
        transaction_type: 'withdraw',
      });
      if (error) throw error;

      await Promise.all([reloadStashTopUps(), reloadTransactions()]);
      setStashRepairModal(null);
      setStashStatusMsg({ msg: `Repaired stash top-up '${stashRepairModal.tx.name}'`, type: 'success' });
      setTimeout(() => setStashStatusMsg(null), 3000);
      if (onTransactionCreated) onTransactionCreated();
    } catch (err) {
      console.error('[Budget] Error repairing stash top-up:', err);
      setStashStatusMsg({ msg: 'Failed to repair stash top-up. Please try again.', type: 'error' });
      setTimeout(() => setStashStatusMsg(null), 3000);
    } finally {
      setStashRepairSubmitting(false);
    }
  };

    // Helper: Calculate current balance for an account
    const calculateCurrentBalance = (account: Account): number => {
      const accountTxs = transactions.filter(tx => tx.payment_method_id === account.id);
      const startingBalance = account.openingBalance || 0;
      
      {/* TO: Expand the isCredit check */}
const balance = accountTxs.reduce((sum, tx) => {
  const isCredit = account.type === 'Credit' || 
                   account.classification === 'Credit Card' || 
                   account.type === 'Loan' || 
                   account.classification === 'Loan' || 
                   account.type === 'Liability';
  if (isCredit) {

          return sum + tx.amount; 
        } else {
          return tx.amount < 0 ? sum + Math.abs(tx.amount) : sum - tx.amount;
        }
      }, startingBalance);
      
      // Return the absolute value so it displays as a positive amount owed
      return Math.abs(balance);
    };

            // Reverse-engineered cycle aggregator for budget setups
    const getFrozenCycleAmount = (account: Account): number => {
      if (!account.billingDate) {
        const liveBal = calculateCurrentBalance(account);
        return liveBal > 0 ? liveBal : Math.abs(account.openingBalance || 0);
      }

      // 1. Call the master aggregator to perfectly sync with the Accounts page
      const cycleSummaries = typeof aggregateCreditCardPurchases === 'function' 
        ? aggregateCreditCardPurchases(account, transactions || [], installments || []) 
        : [];
        
      const monthIndex = MONTHS.indexOf(selectedMonth);

      // 2. Find the cycle that ENDS in the current budget month
      // e.g., "Jul 4 - Aug 3" ends in August (monthIndex 7)
      const targetCycle = cycleSummaries.find(cycle => {
        if (!cycle || !cycle.cycleEnd) return false;
        const endMonth = cycle.cycleEnd.getMonth();
        const endYear = cycle.cycleEnd.getFullYear();
        return endMonth === monthIndex && endYear === selectedYear;
      });

      // 3. Extract the true "New Charges" for the budget!
      // We sum the cycle's transactions (which includes your installments) 
      // but filter out unpaid carry-over balances so we don't double-count them.
      if (targetCycle && Array.isArray(targetCycle.transactions)) {
        const freshSpend = targetCycle.transactions
          .filter((tx: any) => {
            const nameStr = (tx.name || '').toLowerCase();
            return !nameStr.includes('statement balance') && !nameStr.includes('previous balance');
          })
          .reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
          
        if (freshSpend > 0) return freshSpend;
        if (targetCycle.totalAmount > 0) return targetCycle.totalAmount;
      }

      // 4. Fallback if no matching cycle window is found
      const fallbackCharges = transactions
        .filter(tx => tx?.payment_method_id === account.id)
        .filter(tx => {
          if (!tx?.date) return false;
          const txDate = new Date(tx.date);
          return txDate.getMonth() === monthIndex && 
                 txDate.getFullYear() === selectedYear &&
                 tx.transaction_type !== 'credit_payment' &&
                 tx.amount > 0;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

      if (fallbackCharges > 0) return fallbackCharges;
      
      const liveBal = calculateCurrentBalance(account);
      return liveBal > 0 ? liveBal : Math.abs(account.openingBalance || 0);
    };

    


            // Helper: Get payments made towards the card this month
    const getPaymentsThisMonth = (account: Account): number => {
      const monthIndex = MONTHS.indexOf(selectedMonth);
      return transactions
        .filter(tx => {
          if (!tx?.date || tx?.payment_method_id !== account.id) return false;
          const txDate = new Date(tx.date);
          return txDate.getMonth() === monthIndex && 
                 txDate.getFullYear() === selectedYear &&
                 tx.transaction_type === 'credit_payment';
        })
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    };

    // Helper: Calculate how much of the statement is left to pay
    const getRemainingCycleAmount = (account: Account): number => {
      const frozenTarget = getFrozenCycleAmount(account);
      const payments = getPaymentsThisMonth(account);
      return Math.max(0, frozenTarget - payments);
    };

        // Helper: Determine credit payment status for the month
        const getCreditPaymentStatus = (account: Account): 'paid' | 'partial' | 'unpaid' => {
          const frozenTarget = getFrozenCycleAmount(account);
          const payments = getPaymentsThisMonth(account);
          
          if (frozenTarget <= 0) return 'unpaid';
          if (payments >= frozenTarget) return 'paid';
          if (payments > 0) return 'partial';
          return 'unpaid';
        };
    

  // Guard function: Check for overdraft before funding stash
  const guardFundStashOverdraft = (sourceAccountId: string, fundAmount: number, action: () => Promise<void>) => {
    const sourceAccount = accounts.find(a => a.id === sourceAccountId);
    if (!sourceAccount || sourceAccount.type !== 'Debit' || fundAmount <= 0) {
      action();
      return;
    }

    const overdraftMode = sourceAccount.overdraftMode || 'allow';
    const currentBalance = calculateCurrentBalance(sourceAccount);
    const projectedBalance = currentBalance - fundAmount;

    if (projectedBalance >= 0 || overdraftMode === 'allow') {
      action();
      return;
    }

    setOverdraftPrompt({
      mode: overdraftMode === 'block' ? 'block' : 'warn',
      accountId: sourceAccountId,
      accountName: sourceAccount.bank,
      currentBalance,
      transactionAmount: fundAmount,
      projectedBalance,
    });
    setPendingFundAction(() => action);
  };

  const closeOverdraftPrompt = () => {
    setOverdraftPrompt(null);
    setPendingFundAction(null);
  };

  const confirmFundDespiteOverdraft = async () => {
    if (pendingFundAction) {
      await pendingFundAction();
    }
    closeOverdraftPrompt();
  };

  const handleFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundModal) return;
    const amount = parseFloat(fundForm.amount);
    if (isNaN(amount) || amount <= 0) return;
    const sourceAccountId = fundForm.sourceAccountId;
    if (!sourceAccountId) return;

    // Guard against overdraft
    const performFund = async () => {
      setFundSubmitting(true);
      try {
        await guardFundStashOverdraft(sourceAccountId, amount, async () => {
          await executeFundStash(amount, sourceAccountId);
        });
      } catch (err) {
        console.error('[Budget] Error funding stash:', err);
        setStashStatusMsg({ msg: 'Failed to fund stash. Please try again.', type: 'error' });
        setTimeout(() => setStashStatusMsg(null), 3000);
      } finally {
        setFundSubmitting(false);
      }
    };

    performFund();
  };

  const processBudgetPayment = async (
    accountId: string, 
    amount: number, 
    description: string, 
    date: string
  ) => {
    // This matches the pattern in Accounts.tsx:
    // It creates a transaction record linked to a specific account[span_4](start_span)[span_4](end_span)
    const transaction = {
      name: description,
      amount: amount, // Positive for outgoing payment/reduction
      date: date,
      payment_method_id: accountId,
      transaction_type: 'payment', // Or 'credit_payment' based on account type
      notes: `Budget Payment: ${description}`
    };
  
    const { data, error } = await createTransaction(transaction as any);
    if (error) throw error;
    
    // Refresh data just like the Accounts page does
    await reloadTransactions();
    if (onTransactionCreated) onTransactionCreated();
  };
  

  const executeFundStash = async (amount: number, sourceAccountId: string) => {
    if (!fundModal) return;
    const walletId = fundModal.wallet.id;
    const walletName = fundModal.wallet.name;
    
    const destAccountId = fundModal.wallet.accountId;
    const walletTxDate = combineDateWithCurrentTime(fundForm.date);
    let incomingTx: SupabaseTransaction | null = null;

    if (destAccountId && destAccountId !== sourceAccountId) {
      const transferResult = await createTransfer(
        sourceAccountId,
        destAccountId,
        amount,
        walletTxDate,
        0,
        walletId
      );
      if (transferResult.error) throw transferResult.error;
      incomingTx = transferResult.data?.incoming || null;
    } else {
      const stashTxBase = {
        name: `Stash top-up - ${walletName} (${selectedMonth} ${selectedYear})`,
        amount,
        date: walletTxDate,
        payment_method_id: sourceAccountId,
        transaction_type: 'withdraw' as const,
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
      incomingTx = newTx ? { ...(newTx as SupabaseTransaction), wallet_id: walletId } : null;
    }

    const safeNewTx: SupabaseTransaction | null = incomingTx;
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

  const getDynamicDate = (fakeDateStr: string | undefined, monthStr: string, yearNum: number) => {
    if (!fakeDateStr) return 'Not set';
    
    // Extract the day number from the "2000-01-DD" string
    const day = new Date(fakeDateStr).getDate();
    const paddedDay = day.toString().padStart(2, '0');
    
    // Get the numerical month based on your selectedMonth string
    const monthIndex = MONTHS.indexOf(monthStr) + 1; 
    const paddedMonth = monthIndex.toString().padStart(2, '0');
    
    // Return it in YYYY-MM-DD format (or you can adjust this to 'MMM DD, YYYY')
    return `${yearNum}-${paddedMonth}-${paddedDay}`;
  };


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

  const handleAmountUpdate = (category: string, id: string, periodIndex: number, value: string) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === id 
          ? { 
              ...item, 
              amount: value, // 🟢 Keeps the legacy fallback happy!
              amountsByPeriod: {
                ...(item.amountsByPeriod || {}),
                [periodIndex]: value
              }
            } 
          : item
      )
    }));
  };



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
    transactionType: 'payment'
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

  const formatDueDate = (due: string | number | null | undefined) => {
    if (!due) return ''; // Safely exit if missing
    
    // Force it into a string so .toLowerCase() never crashes!
    const dueStr = String(due).toLowerCase();
    const isNextMonth = dueStr.includes('n') || dueStr.includes('next');
    const day = String(due).replace(/[^0-9]/g, ''); 
    
    if (!day) return String(due);
  
    const d = parseInt(day);
    const suffix = (d % 10 === 1 && d !== 11) ? 'st' : 
                   (d % 10 === 2 && d !== 12) ? 'nd' : 
                   (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
                   
    const dateStr = `${d}${suffix}`;
    return isNextMonth ? `${dateStr} Next Month` : dateStr;
  };

  
  const currentBudgetPeriodIso = `${selectedYear}-${(MONTHS.indexOf(selectedMonth) + 1).toString().padStart(2, '0')}`;
  

    // =========================================================
  // ⚡ STEP 2: THE INCOME SLICER HOOK (Wired with real state)
  // =========================================================
    
      // ⚡ MASTER BUDGET AGGREGATOR FOR THE SLICER
  const flattenedBudgetItems = React.useMemo(() => {
    // 1. STANDARD ITEMS & BILLERS (From the Budget Engine)
    const currentPeriodItems = processedBudgetMap[activePeriodIndex] || {};
    const baseItems = Object.values(currentPeriodItems)
      .flat()
      .filter((item): item is BudgetItem => !!(item && typeof item === 'object' && item.id && item.included))
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        amount: item.amountsByPeriod?.[activePeriodIndex] !== undefined 
          ? item.amountsByPeriod[activePeriodIndex] 
          : item.amount
      }));

        // 2. INSTALLMENTS (Loans)
        const installmentItems = (installments || [])
        .filter(inst => {
          if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
          
                    // 🔴 NEW: Exclude "To Collect" from the Slicer tray
                    if (inst.debtor_friend_id) return false;
  
                    const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
                    
                    if (targetPeriod !== activePeriodIndex) return false;
          
  
          // INLINED: Find Payment Schedule safely
          const scheduleForMonth = paymentSchedules.find(
              s => s.source_type === 'installment' && 
                   s.source_id === inst.id && 
                   s.month === selectedMonth && 
                   s.year === selectedYear
          );
  

        // INLINED: Check if the date is active
        let isDateActive = true;
        if (inst.startDate) {
            const [startYear, startMonth] = inst.startDate.split('-').map(Number);
            const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
            const startMonthAbs = startYear * 12 + (startMonth - 1);
            const selectedMonthAbs = selectedYear * 12 + selectedMonthIndex;
            
            if (selectedMonthIndex !== -1 && startMonthAbs > selectedMonthAbs) {
                isDateActive = false;
            } else {
                const termMonths = parseInt(inst.termDuration, 10);
                if (!isNaN(termMonths) && termMonths > 0) {
                    const lastPaymentMonthAbs = startMonthAbs + (termMonths - 1);
                    if (selectedMonthAbs > lastPaymentMonthAbs) isDateActive = false;
                }
            }
        }

        const isActiveForPeriod = scheduleForMonth !== undefined || isDateActive;
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        
        return isActiveForPeriod && !isFinished;
      })
      .map(inst => ({
        id: inst.id,
        name: inst.name,
        amount: inst.monthlyAmount
      }));

    // 3. CREDIT CARDS
    const creditItems = creditBudgetAccounts
      .filter(acc => {
        if (excludedCreditIds.has(acc.id)) return false;
        return determineItemPeriod(acc, currentPeriods, selectedMonth, selectedYear) === activePeriodIndex;
      })
      .map(acc => ({
        id: acc.id,
        name: `${acc.bank} (Credit)`,
        amount: getFrozenCycleAmount(acc)
      }))
      .filter(item => item.amount >= 0.01);

    // 4. STASH (Wallets)
    const stashItems = wallets
      .filter(w => !excludedWalletIds.has(w.id))
      .map(w => ({
        id: w.id,
        name: `${w.name} (Stash)`,
        amount: w.amount
      }))
      .filter(item => item.amount > 0);

    // 5. MERGE ALL ACTIVE ITEMS
    return [...baseItems, ...installmentItems, ...creditItems, ...stashItems];
  }, [
    processedBudgetMap, 
    activePeriodIndex, 
    installments, 
    excludedInstallmentIds,
    paymentSchedules, 
    selectedMonth, 
    selectedYear,
    creditBudgetAccounts, 
    excludedCreditIds, 
    wallets, 
    excludedWalletIds,
    transactions // 🟢 Added this so credit balances still update live!
  ]);


    // Call the hook and destructure everything cleanly in one go
    const { 
      availableIncomes, 
      trayTxIds, 
      totalTrayPool, 
      remainingToAllocate, 
      allocations, 
      toggleTrayTransaction, 
      updateAllocation, 
      executeSlice 
    } = useIncomeSlicer({
      transactions: transactions,
      currentBudgetPeriod: currentBudgetPeriodIso,
      currentBudgetTiming: `${activePeriodIndex}/${(typeof currentPeriods !== 'undefined' && currentPeriods?.length > 0) ? currentPeriods.length : 2}`,
      budgetItems: flattenedBudgetItems || [], // 👈 Pass the array variable directly (no parentheses!)
      accounts: accounts
    });
  
  // =========================================================
  // ⚡ STEP 3: THE EXECUTION HANDLER FOR THE SLICER
  // =========================================================
    // 🟢 Make sure the "async" keyword is right here!
      // ⚡ STEP 3: THE EXECUTION HANDLER FOR THE SLICER
  const handleSliceSubmit = async () => {
    if (trayTxIds.length === 0) {
      alert("Your distribution tray is empty! Add some income transactions first.");
      return;
    }

    // Wrap the actual processing logic in a helper function
    const processSlice = async () => {
      await executeSlice(
        async (params: { sourceAccountId: string, destinationAccountId: string, amount: number, description: string, date: string }) => {
          const result = await createTransfer(
            params.sourceAccountId,
            params.destinationAccountId,
            params.amount,
            params.date,
            0 
          );
          if (result && result.error) {
            throw new Error(`Transfer failed: ${result.error.message || 'Unknown database error'}`);
          }
          return result;
        }, 
        async (ids: string[], status: boolean) => {
          const updatePromises = ids.map(id => updateTransaction(id, { is_sliced: status }));
          const results = await Promise.all(updatePromises);
          const failedUpdate = results.find(res => res && res.error);
          if (failedUpdate) {
            throw new Error(`Failed to update transaction status: ${failedUpdate.error.message}`);
          }
        }
      );

      // Refresh transactions
      const { data, error } = await getAllTransactions();
      if (!error && data) {
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const recentTransactions = data.filter(tx => new Date(tx.date) >= twoYearsAgo);
        setTransactions(recentTransactions);
      }
    };

    // 🟢 THE GUARD: Check if there are unallocated funds
    if (remainingToAllocate > 0) {
      setConfirmModal({
        show: true,
        title: 'Unallocated Funds',
        message: "Some items' account are not yet allocated. Sure you want to proceed?",
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, show: false }));
          await processSlice();
        }
      });
    } else {
      // If perfectly allocated, proceed instantly
      await processSlice();
    }
  };

  // =========================================================

  const getLinkedInstallmentsAmount = useCallback((biller: Biller): number | null => {
    if (!biller.category.startsWith('Loans')) return null;
    const linked = installments.filter(inst => inst.billerId === biller.id);
    if (linked.length === 0) return null;
    return linked.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
  }, [installments]);

  const matchesCurrentPayPeriod = useCallback((dueDayValue: string | number | undefined): boolean => {
    if (!dueDayValue || currentPeriods.length === 0) return true;
    const dayNum = typeof dueDayValue === 'string' ? parseInt(dueDayValue.replace(/[^0-9]/g, ''), 10) : dueDayValue;
    if (isNaN(dayNum)) return true;

    const monthIndex = MONTHS.indexOf(selectedMonth);
    const matchedPeriod = findPayPeriodForDueDate(dayNum, selectedYear, monthIndex, currentPeriods);
    
    const activeIndex = parseInt(selectedTiming.split('/')[0], 10) || 1;
    return matchedPeriod?.periodIndex === activeIndex;
  }, [currentPeriods, selectedMonth, selectedYear, selectedTiming]);

  useEffect(() => {
  
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
    // 1. Instantly exit if the item somehow lost its name
    if (!itemName) return false; 

    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return false;

    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;

    const targetYear = year || new Date().getFullYear();

    const matchingTransaction = transactions.find(tx => {
      // 2. Instantly skip transactions that are missing names
      if (!tx || !tx.name) return false; 

      // 3. Safely cast both to strings before comparing
      const itemNameLower = String(itemName).toLowerCase();
      const txNameLower = String(tx.name).toLowerCase();
      
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

    // Removed the useCallback to ensure we are not hitting a stale cached version 
  // if something in the outer scope changed, though usually keeping it is fine 
  // if you have the correct dependencies.
  const reloadTransactions = async () => {
    try {
      console.log("[Budget] Manually reloading transactions...");
      const { data, error } = await getAllTransactions();
      if (error) {
        console.error('[Budget] Failed to reload transactions:', error);
      } else if (data) {
        // Explicitly update the state with the new data
        setTransactions(data);
      }
    } catch (error) {
      console.error('[Budget] Error reloading transactions:', error);
    }
  };


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
    
        // 🟢 NEW UNIFIED MATH PAYLOAD
        const _periodTotals: Record<number, number> = {};
    
        [1, 2, 3, 4].forEach(period => {
          // 1. Regular Items
          let itemsTotal = 0;
          if (processedBudgetMap[period]) {
            Object.values(processedBudgetMap[period]).forEach(catItems => {
              catItems.forEach(item => {
                if (item.included) {
                  const val = item.amountsByPeriod?.[period] !== undefined ? item.amountsByPeriod[period] : item.amount;
                  itemsTotal += (parseFloat(val) || 0);
                }
              });
            });
          }
    
          // 2. Installments
          const instTotal = (installments || [])
            .filter(inst => {
              if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
              let targetPeriod = 1;
              if (inst.timing === '1/2') targetPeriod = 1;
              else if (inst.timing === '2/2') targetPeriod = 2;
              else {
                const dueDay = inst.dueDate || inst.due_date || 1;
                targetPeriod = getAccountPeriodIndex({ dueDate: dueDay });
              }
              if (targetPeriod !== period) return false;
              
              const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
              const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
              const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
              return isActiveForPeriod && !isFinished;
            })
            .reduce((s, inst) => s + inst.monthlyAmount, 0);
    
          // 3. Credit Cards
          const creditTotal = creditBudgetAccounts
            .filter(acc => !excludedCreditIds.has(acc.id) && getAccountPeriodIndex(acc) === period)
            .reduce((sum, account) => {
              const amt = getFrozenCycleAmount(account);
              return amt >= 0.01 ? sum + amt : sum;
            }, 0);
    
          // Attach stash funding target to period 1
               // Attach stash funding target to match UI behavior
      _periodTotals[period] = itemsTotal + instTotal + creditTotal + stashTotal;

        });
    
        {/* TO: We dynamically calculate the true transaction total before saving */}
        const dynamicActualByPeriod = { ...actualSalaryByPeriod };
        const currentMonthIdx = MONTHS.indexOf(selectedMonth);
        
        [1, 2, 3, 4, 5].forEach(periodNum => {
          const pName = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1] ? `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1]} Paycheck` : `Paycheck ${periodNum}`;
          const targetLabel = `Income - ${selectedMonth} (${pName})`;
          const legacyLabel = periodNum === 1 ? '1/2' : '2/2';
          
          const incomesForPeriod = (transactions || []).filter(tx => {
            if (tx.transaction_type !== 'income') return false;
            const txDate = new Date(tx.date);
            if (txDate.getMonth() !== currentMonthIdx || txDate.getFullYear() !== selectedYear) return false;
            
            const isTaggedIncome = tx.notes?.startsWith('Income -') || tx.notes?.startsWith('Income Record');
            const nameLower = (tx.name || '').trim().toLowerCase(); 
            const isPrimaryIncome = isTaggedIncome || nameLower === 'salary' || nameLower === 'income';

            if (isPrimaryIncome) {
              if (isTaggedIncome) return tx.notes === targetLabel || tx.notes.includes(`- ${legacyLabel}`);
              return getPeriodIndexForDate(txDate.getDate()) === periodNum;
            } else {
              return getPeriodIndexForDate(txDate.getDate()) === periodNum;
            }
          });

          if (incomesForPeriod.length > 0) {
            const sum = incomesForPeriod.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0);
            dynamicActualByPeriod[periodNum] = sum.toString();
          }
        });

        const dataToSave = {
          ...JSON.parse(JSON.stringify(setupData)),
          _year: selectedYear,
          _projectedSalary: projectedSalary,
          _actualSalary: actualSalary,
          _projectedSalaryByPeriod: projectedSalaryByPeriod,
          _actualSalaryByPeriod: dynamicActualByPeriod,
          _periodTotals: _periodTotals,
          _excludedInstallmentIds: [...excludedInstallmentIds],
          _excludedWalletIds: [...excludedWalletIds],
          _excludedCreditIds: [...excludedCreditIds]
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
        
        // 🔴 NEW: Prevent "To Collect" from inflating the saved database total!
        if (inst.debtor_friend_id) return false;

        const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
        const selectedPeriod = selectedTiming === '1/2' ? 1 : selectedTiming === '2/2' ? 2 : parseInt(selectedTiming.split('/')[0] || '1');
        const timingMatch = targetPeriod === selectedPeriod;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    const creditTotal = creditBudgetAccounts
    .filter(acc => !excludedCreditIds.has(acc.id))
    .reduce((sum, account) => {
      const amt = getFrozenCycleAmount(account);
      return amt >= 0.01 ? sum + amt : sum;
    }, 0);

    const total = regularItemsTotal + installmentsTotal + stashTotal + creditTotal;
    
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
  }, [view, setupData, projectedSalary, actualSalary, selectedMonth, selectedTiming, savedSetups, excludedInstallmentIds, excludedWalletIds, excludedCreditIds,wallets, getStashAggregates, onReloadSetups, installments, getPaymentSchedule, shouldShowInstallment]);

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
  }, [setupData, projectedSalary, actualSalary, excludedInstallmentIds, excludedWalletIds, excludedCreditIds,view, triggerAutoSave]);

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
      // 🟢 Force the item into the currently active tab!
      timing: `${activePeriodIndex}/${currentPeriods.length || 2}`,
      amountsByPeriod: {
        [activePeriodIndex]: '0'
      }
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
        
        // 🔴 NEW: Prevent "To Collect" from inflating the saved database total!
        if (inst.debtor_friend_id) return false;

        const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
        const selectedPeriod = selectedTiming === '1/2' ? 1 : selectedTiming === '2/2' ? 2 : parseInt(selectedTiming.split('/')[0] || '1');
        const timingMatch = targetPeriod === selectedPeriod;
        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
        const notExcluded = !excludedInstallmentIds.has(inst.id);
        return timingMatch && isActiveForPeriod && !isFinished && notExcluded;
      })
      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

    const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
    const creditTotal = creditBudgetAccounts
    .filter(acc => !excludedCreditIds.has(acc.id))
    .reduce((sum, account) => {
      const amt = getFrozenCycleAmount(account);
      return amt >= 0.01 ? sum + amt : sum;
    }, 0);

    const total = regularItemsTotal + installmentsTotal + stashTotal + creditTotal;

    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    {/* TO: Matches auto-save perfectly to prevent data loss on manual saves */}
    const dynamicActualByPeriod = { ...actualSalaryByPeriod };
    const currentMonthIdx = MONTHS.indexOf(selectedMonth);
    
    [1, 2, 3, 4, 5].forEach(periodNum => {
      const pName = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1] ? `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1]} Paycheck` : `Paycheck ${periodNum}`;
      const targetLabel = `Income - ${selectedMonth} (${pName})`;
      const legacyLabel = periodNum === 1 ? '1/2' : '2/2';
      
      const incomesForPeriod = (transactions || []).filter(tx => {
        if (tx.transaction_type !== 'income') return false;
        const txDate = new Date(tx.date);
        if (txDate.getMonth() !== currentMonthIdx || txDate.getFullYear() !== selectedYear) return false;
        
        const isTaggedIncome = tx.notes?.startsWith('Income -') || tx.notes?.startsWith('Income Record');
        const nameLower = (tx.name || '').trim().toLowerCase(); 
        const isPrimaryIncome = isTaggedIncome || nameLower === 'salary' || nameLower === 'income';

        if (isPrimaryIncome) {
          if (isTaggedIncome) return tx.notes === targetLabel || tx.notes.includes(`- ${legacyLabel}`);
          return getPeriodIndexForDate(txDate.getDate()) === periodNum;
        } else {
          return getPeriodIndexForDate(txDate.getDate()) === periodNum;
        }
      });

      if (incomesForPeriod.length > 0) {
        const sum = incomesForPeriod.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0);
        dynamicActualByPeriod[periodNum] = sum.toString();
      }
    });

    const _periodTotals = {};
    [1, 2, 3, 4].forEach(period => {
      let itemsTotal = 0;
      if (processedBudgetMap[period]) {
        Object.values(processedBudgetMap[period]).forEach(catItems => {
          catItems.forEach(item => {
            if (item.included) {
              const val = item.amountsByPeriod?.[period] !== undefined ? item.amountsByPeriod[period] : item.amount;
              itemsTotal += (parseFloat(val) || 0);
            }
          });
        });
      }
      const instTotal = (installments || []).filter(inst => {
          if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
          let targetPeriod = inst.timing === '1/2' ? 1 : inst.timing === '2/2' ? 2 : getAccountPeriodIndex({ dueDate: inst.dueDate || inst.due_date || 1 });
          if (targetPeriod !== period) return false;
          const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
          const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
          const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
          return isActiveForPeriod && !isFinished;
        }).reduce((s, inst) => s + inst.monthlyAmount, 0);
        
      const creditTotal = creditBudgetAccounts.filter(acc => !excludedCreditIds.has(acc.id) && getAccountPeriodIndex(acc) === period).reduce((sum, account) => {
          const amt = getFrozenCycleAmount(account);
          return amt >= 0.01 ? sum + amt : sum;
        }, 0);
        
      _periodTotals[period] = itemsTotal + instTotal + creditTotal + stashTotal;
    });

    const dataToSave = {
      ...JSON.parse(JSON.stringify(setupData)),
      _year: selectedYear,
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary,
      _projectedSalaryByPeriod: projectedSalaryByPeriod,
      _actualSalaryByPeriod: dynamicActualByPeriod,
      _periodTotals: _periodTotals,
      _excludedInstallmentIds: [...excludedInstallmentIds],
      _excludedWalletIds: [...excludedWalletIds],
      _excludedCreditIds: [...excludedCreditIds]
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
      if (transactionFormData.transactionType === 'cash_in') {
        finalAmount = -Math.abs(finalAmount);
      } else {
        finalAmount = Math.abs(finalAmount);
      }

      const txTypeForForm = transactionFormData.transactionType === 'cash_in'
        ? 'cash_in'
        : 'payment';

      // 🚀 BUDEE FORK: Check if this transaction belongs to a Budee installment
      let isBudeeTransfer = false;
      let budeeInstallment = null;
      let targetBudeeId = null;

      if (paymentScheduleId) {
        // Find the installment that owns this schedule
        budeeInstallment = (installments || []).find(inst => {
          const schedule = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
          return schedule && schedule.id === paymentScheduleId;
        });

        if (budeeInstallment) {
          targetBudeeId = budeeInstallment.funding_friend_id || budeeInstallment.debtor_friend_id || (budeeInstallment as any).friend_user_id;
          if (targetBudeeId) isBudeeTransfer = true;
        }
      }

      // 1. IF IT IS A BUDEE TRANSFER
      if (isBudeeTransfer && !isEditing && budeeInstallment) {
        // Lookup the name
        const personProfile = (people || []).find(p => p.id === targetBudeeId || p.friend_user_id === targetBudeeId);
        const displayBudeeName = personProfile && personProfile.name ? personProfile.name : 'Budee User';

        // Process via our dedicated Budee Manager
        const result = await processBudeeTransaction({
          installmentId: budeeInstallment.id,
          scheduleId: paymentScheduleId,
          budeeId: targetBudeeId,
          budeeName: displayBudeeName,
          accountId: transactionFormData.accountId,
          amount: Math.abs(finalAmount), // Service formats it based on type
          date: combineDateWithCurrentTime(transactionFormData.date),
          transactionType: txTypeForForm as 'payment' | 'cash_in',
          description: transactionFormData.name
        });

        if (!result.success) throw result.error;
        transactionData = result.transaction;
      } 
      // 2. IF WE ARE EDITING AN EXISTING TRANSACTION
      else if (isEditing) {
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
      } 
      // 3. IF IT IS A STANDARD SCHEDULED PAYMENT (Appliance loan, biller, etc)
      else if (paymentScheduleId) {
        const result = await createPaymentScheduleTransaction(
          paymentScheduleId,
          {
            name: transactionFormData.name,
            date: combineDateWithCurrentTime(transactionFormData.date),
            amount: finalAmount,
            paymentMethodId: transactionFormData.accountId,
            notes: `Budget Timing: ${selectedTiming}`,
            transactionType: txTypeForForm,
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
      } 
      // 4. FALLBACK: STANDARD UNLINKED TRANSACTION
      else {
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
        const code = (transactionError as any)?.code;
        if (code === '23514') {
          alert('Failed to save transaction: your database is rejecting the transaction type. Please run the latest Supabase migrations (including credit_payment transaction type).');
          return;
        }
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
    
    if (!salaryFormData.accountId) {
      alert("Please select an account to receive this income.");
      return;
    }
    
    const rawAmount = parseFloat(salaryFormData.amount);
    if (isNaN(rawAmount) || rawAmount <= 0) return;

    const periodNames = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    const pIndex = Number(activePeriodIndex) - 1;
    const pName = periodNames[pIndex] ? `${periodNames[pIndex]} Paycheck` : `Paycheck ${activePeriodIndex}`;
    const targetLabel = `Income - ${selectedMonth} (${pName})`;

    const transaction = {
      name: salaryFormData.name,
      amount: -Math.abs(rawAmount), 
      date: combineDateWithCurrentTime(salaryFormData.date),
      payment_method_id: salaryFormData.accountId,
      transaction_type: 'income' as const,
      notes: targetLabel
    };

    try {
      // 1. Send the data to Supabase
      await createTransaction(transaction as any);
      
        } catch (err) {
      // We will silently catch any false-alarm errors here since we know the DB saves it successfully!
      console.warn("Caught a post-save warning, continuing safely...", err);
    } finally {
      // 2. ALWAYS close the modal, reset the form, and refresh the data (even if a false alarm fired)
      setShowSalaryModal(false);
      
      // Keep the current date, but clear the amount
      setSalaryFormData(prev => ({ 
        ...prev, 
        name: 'Salary', 
        amount: '' 
      }));

      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 🟢 THE FIX: Call your actual local refresh function
      await reloadTransactions();
      
      // Notify parent components if they need to update
      if (onTransactionCreated) {
        onTransactionCreated();
      }
    }
  }




  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    try {
      const { biller, schedule } = showPayModal;
      const isEditing = !!payFormData.transactionId;
      const paymentScheduleId = schedule.id;
      
      let transactionData, transactionError;
      
      {/* TO: Force all biller payments to act as positive expenses */}
      const parsedAmount = parseFloat(payFormData.amount) || 0;
      const selectedAccount = accounts.find(a => a.id === payFormData.accountId);
      
      const finalAmount = Math.abs(parsedAmount); 
      const payTransactionType = 'payment';

      
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

      {/* TO: Include Loans and Liabilities */}
      if (!isEditing && biller.linkedAccountId && transactionData?.id) {
        const linkedAccount = accounts.find(a => a.id === biller.linkedAccountId);
        if (linkedAccount?.type === 'Credit' || linkedAccount?.classification === 'Credit Card' || linkedAccount?.type === 'Loan' || linkedAccount?.classification === 'Loan') {

          const { error: creditPaymentError } = await createTransaction({
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
          const code = (creditPaymentError as any)?.code;
          if (code === '23514') {
            alert('Payment saved, but the credit card adjustment transaction failed because your database does not allow the credit_payment transaction type. Please run the latest Supabase migrations.');
          }
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
    // 1. Calculate the next available date based on your existing setups
    const { month, year } = getNextAvailableDate(savedSetups); 
  
    // 2. Update your component's state so the UI dropdowns reflect this new date
    // (Note: Replace these with whatever your actual state setter functions are named!)
    setSelectedMonth(month); 
    setSelectedYear(year);
  
    // 3. Keep your existing initialization code
    const initialSetup: { [key: string]: CategorizedSetupItem[] } = {};
  
    // 1. Initialize empty arrays for all categories
    effectiveCategories.forEach(c => {
      initialSetup[c.name] = [];
    });
  

    // 2. Map and inject your active recurring billers directly into their categories
    (billers || []).forEach(biller => {
      if (biller.isArchived) return;
      
      // Check if active for the selected month/year
      if (isBillerActiveForPeriod(biller, month, year)) {
        // Match biller category name to category list, defaulting to 'Utilities' or 'Fixed' if unmatched
        let targetCat = biller.category;
        if (!initialSetup[targetCat]) {
          // Find closest category match if exact string differs
          const matchedCat = effectiveCategories.find(c => c.name.toLowerCase() === targetCat?.toLowerCase());
          targetCat = matchedCat ? matchedCat.name : 'Fixed';
        }

        if (!initialSetup[targetCat]) {
          initialSetup[targetCat] = [];
        }

        // Push the biller into the setup template
        initialSetup[targetCat].push({
          id: biller.id,
          name: biller.name,
          amount: String(biller.amount || '0'),
          included: true,
          isBiller: true,
          timing: biller.timing,
          dueDay: biller.dueDate
        });
      }
    });

    setSetupData(initialSetup);
    setRemovedIds(new Set());
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

  const handleArchiveSetup = (setupData: SavedBudgetSetup | SavedBudgetSetup[]) => {
    const setupsToProcess = Array.isArray(setupData) ? setupData : [setupData];
    const mainSetup = setupsToProcess[0];

    setConfirmModal({
      show: true,
      title: 'Close Budget',
      message: `Close the ${mainSetup.month} budget and move it to archives?`,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);

        Promise.all(setupsToProcess.map(setup => onArchiveBudget?.(setup)))
          .then(() => setArchiveStatusMsg({ msg: 'Budget closed and archived.', type: 'success' }))
          .catch(() => setArchiveStatusMsg({ msg: 'Could not close budget. Please try again.', type: 'error' }))
          .finally(() => {
            setArchiveSubmitting(false);
            setTimeout(() => setArchiveStatusMsg(null), 3000);
          });
      }
    });
  };


  const handleReopenSetup = (setupData: SavedBudgetSetup | SavedBudgetSetup[]) => {
    // 1. Force into an array to handle groups
    const setupsToProcess = Array.isArray(setupData) ? setupData : [setupData];
    const mainSetup = setupsToProcess[0]; // For the modal text

    setConfirmModal({
      show: true,
      title: 'Reopen Budget',
      message: `Reopen the ${mainSetup.month} budget? You'll be able to make changes again. This may affect your projections.`,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        setArchiveSubmitting(true);

        // 2. Loop through all setups in the group
        Promise.all(setupsToProcess.map(setup => onReopenBudget?.(setup)))
          .then(() => setArchiveStatusMsg({ msg: 'Budget reopened. You can edit this budget again.', type: 'success' }))
          .catch(() => setArchiveStatusMsg({ msg: 'Could not reopen budget. Please try again.', type: 'error' }))
          .finally(() => {
            setArchiveSubmitting(false);
            setTimeout(() => setArchiveStatusMsg(null), 3000);
          });
      }
    });
  };

  if (showSandbox) {
    const sandboxSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    const sandboxIncomes = transactions.filter(tx => 
      tx.transaction_type === 'income' && 
      new Date(tx.date).getMonth() === MONTHS.indexOf(selectedMonth) && 
      new Date(tx.date).getFullYear() === selectedYear
    );

    return (
      <SandboxView 
        onClose={() => setShowSandbox(false)}
        liveIncomeTxs={sandboxIncomes}
        liveSpendTxs={transactions.filter(t => t.transaction_type === 'cash_out')}
        activeSetup={sandboxSetup}
        allSetups={savedSetups} 
        currentYear={selectedYear}
        accounts={accounts}
      />
    );
  }


  // ... then, update these lines in the 'summary' view block
  if (view === 'summary') {
    // ⚡ DYNAMIC SELF-REFRESH LOGIC: Recalculate totals on the fly before rendering
    const dynamicallyUpdatedSetups = sortedSetups.map(setup => {
      const setupYear = parseInt(setup.data?._year || new Date().getFullYear().toString());
      const setupMonthIndex = MONTHS.indexOf(setup.month);

      // 1. Regular items
      let regularItemsTotal = 0;
      if (setup.data && typeof setup.data === 'object' && !Array.isArray(setup.data)) {
        Object.entries(setup.data).forEach(([key, catItems]) => {
          if (!key.startsWith('_') && Array.isArray(catItems)) {
            catItems.forEach((item: any) => {
              if (item && item.included && !isNaN(parseFloat(item.amount))) {
                regularItemsTotal += parseFloat(item.amount);
              }
            });
          }
        });
      }

            // 2. Installments
            const excludedInstallments = new Set(setup.data?._excludedInstallmentIds || []);
            const installmentsTotal = installments.filter(inst => {
              if (inst.isArchived) return false;
              
              // 🔴 NEW: Prevent "To Collect" from inflating the dashboard card total!
              if (inst.debtor_friend_id) return false;
      
              const targetPeriod = determineItemPeriod(inst, currentPeriods, setup.month, setupYear);
              const setupPeriod = setup.timing === '1/2' ? 1 : setup.timing === '2/2' ? 2 : parseInt(setup.timing.split('/')[0] || '1');
              const timingMatch = targetPeriod === setupPeriod;
              const scheduleForMonth = getPaymentSchedule('installment', inst.id, setup.month, setupYear);
              const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, setup.month, setupYear);
              const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
              return timingMatch && isActiveForPeriod && !isFinished && !excludedInstallments.has(inst.id);
            }).reduce((sum, inst) => sum + inst.monthlyAmount, 0);
      

      // 3. Stash
      const excludedWallets = new Set(setup.data?._excludedWalletIds || []);
      const stashTotal = wallets.filter(w => !excludedWallets.has(w.id)).reduce((s, w) => {
        const topUps = stashTopUps.filter(tx => tx.wallet_id === w.id && new Date(tx.date).getMonth() === setupMonthIndex && new Date(tx.date).getFullYear() === setupYear);
        const funded = topUps.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        return s + Math.max(w.amount, funded);
      }, 0);

      // 4. Credit Cards
      const excludedCredits = new Set(setup.data?._excludedCreditIds || []);
      const creditTotal = accounts.filter(acc => (acc.type === 'Credit' || acc.classification === 'Credit Card') && !excludedCredits.has(acc.id)).reduce((sum, account) => {
        const accountTxs = transactions.filter(tx => tx?.payment_method_id === account.id);
        let cycleCharges = 0;
        if (account.billingDate && typeof calculateBillingCycles === 'function') {
          const cycles = calculateBillingCycles(account.billingDate, 12, false);
          const targetCycle = cycles.find(cycle => {
            if (!cycle?.startDate || !cycle?.endDate) return false;
            return (new Date(cycle.startDate).getMonth() === setupMonthIndex && new Date(cycle.startDate).getFullYear() === setupYear) ||
                   (new Date(cycle.endDate).getMonth() === setupMonthIndex && new Date(cycle.endDate).getFullYear() === setupYear);
          });
          if (targetCycle) {
            cycleCharges = accountTxs.filter(tx => new Date(tx.date) >= targetCycle.startDate && new Date(tx.date) <= targetCycle.endDate && tx.transaction_type !== 'credit_payment' && tx.amount > 0).reduce((cSum, tx) => cSum + tx.amount, 0);
          }
        }
        if (cycleCharges > 0) return sum + cycleCharges;
        
        const fallbackCharges = accountTxs.filter(tx => new Date(tx.date).getMonth() === setupMonthIndex && new Date(tx.date).getFullYear() === setupYear && tx.transaction_type !== 'credit_payment' && tx.amount > 0).reduce((cSum, tx) => cSum + tx.amount, 0);
        if (fallbackCharges > 0) return sum + fallbackCharges;
        
        const liveBal = calculateCurrentBalance(account);
        const amt = liveBal > 0 ? liveBal : Math.abs(account.openingBalance || 0);
        return amt >= 0.01 ? sum + amt : sum;
      }, 0);

      // Return the setup with the perfectly synced, real-time dynamic total
      {/* TO: */}
      // 🟢 INJECT REAL INCOME FOR THE DASHBOARD CARDS
      const dynamicActualByPeriod = { ...(setup.data?._actualSalaryByPeriod || {}) };
      
      [1, 2, 3, 4, 5].forEach(periodNum => {
        const pName = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1] ? `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][periodNum - 1]} Paycheck` : `Paycheck ${periodNum}`;
        const targetLabel = `Income - ${setup.month} (${pName})`;
        const legacyLabel = periodNum === 1 ? '1/2' : '2/2';
        
        const incomesForPeriod = (transactions || []).filter(tx => {
          if (tx.transaction_type !== 'income') return false;
          const txDate = new Date(tx.date);
          if (txDate.getMonth() !== setupMonthIndex || txDate.getFullYear() !== setupYear) return false;
          
          const isTaggedIncome = tx.notes?.startsWith('Income -') || tx.notes?.startsWith('Income Record');
          const nameLower = (tx.name || '').trim().toLowerCase(); 
          const isPrimaryIncome = isTaggedIncome || nameLower === 'salary' || nameLower === 'income';

          if (isPrimaryIncome) {
            if (isTaggedIncome) return tx.notes === targetLabel || tx.notes.includes(`- ${legacyLabel}`);
            return getPeriodIndexForDate(txDate.getDate()) === periodNum;
          } else {
            return getPeriodIndexForDate(txDate.getDate()) === periodNum;
          }
        });

        if (incomesForPeriod.length > 0) {
          const sum = incomesForPeriod.reduce((s, tx) => s + Math.abs(parseFloat(tx.amount) || 0), 0);
          dynamicActualByPeriod[periodNum] = sum.toString();
        }
      });

      // Return the setup with perfectly synced spend AND income totals
      return {
        ...setup,
        totalAmount: regularItemsTotal + installmentsTotal + stashTotal + creditTotal,
        data: {
          ...setup.data,
          _actualSalaryByPeriod: dynamicActualByPeriod
        }
      };

    });

    const activeSetups = dynamicallyUpdatedSetups.filter(s => !s.isArchived);
    const archivedSetups = dynamicallyUpdatedSetups.filter(s => s.isArchived);

    return (
// ... keep everything else underneath the exact same (the <div className="space-y-8... block)
<div className="space-y-3 lg:space-y-8 animate-in fade-in duration-500 w-full max-w-7xl mx-auto pt-2 lg:pt-10">

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
                      {/* Add this inside your header actions area! */}
                      <button 
  type="button" // 🟢 Add this to prevent any default form behavior
  onClick={() => {
    console.log("Sandbox button clicked!"); // 🟢 Let's force a log to see if it fires
    setShowSandbox(true);
  }}
  className="hidden lg:block px-4 py-2 bg-amber-100 text-amber-700 border-2 border-black rounded-lg font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all mr-2">
  🔮 Crystal Ball
</button>

{/* 📱 MOBILE-ONLY 3-WAY TAB BAR */}
{/* TO: */}
{/* 📱 MOBILE-ONLY 3-WAY TAB BAR */}
<div className="flex lg:hidden w-full border-[3px] border-black rounded-xl overflow-hidden mb-2 bg-white dark:bg-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs sm:text-sm font-black uppercase tracking-wider transition-colors">
  
  {/* ACTIVE TAB */}
  <button 
    onClick={() => setShowArchived(false)}
    className={`flex-1 py-3 transition-colors ${
      !showArchived 
        ? 'bg-indigo-200 dark:bg-indigo-600 text-indigo-900 dark:text-white' 
        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`}
  >
    Active
  </button>
  
  {/* ARCHIVED TAB */}
  <button 
    onClick={() => setShowArchived(true)}
    className={`flex-1 py-3 border-l-[3px] border-black transition-colors ${
      showArchived 
        ? 'bg-indigo-200 dark:bg-indigo-600 text-indigo-900 dark:text-white' 
        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`}
  >
    Archived
  </button>
  
  {/* CRYSTAL BALL TRIGGER */}
  <button 
    onClick={() => setShowSandbox(true)}
    className="flex-1 py-3 border-l-[3px] border-black bg-[#F4F3EF] dark:bg-gray-800 text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5 transition-colors"
  >
    <span>🔮</span>
    <span className="hidden sm:inline">Forecast</span>
  </button>

</div>


            {archiveStatusMsg && (
              <div className={`flex items-center space-x-3 px-6 py-4 rounded-2xl text-sm font-bold mb-6 ${archiveStatusMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {archiveStatusMsg.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                <span>{archiveStatusMsg.msg}</span>
              </div>
            )}

            {/* --- BUDGET LISTS WRAPPER --- */}
<div className="w-full flex flex-col gap-0 lg:gap-8">
  
  {/* 1. ACTIVE BUDGETS */}
  <div className={showArchived ? 'hidden lg:block' : 'block'}>
    <BudgetSetupsList
      setups={activeSetups}
      title="Active Budgets"
      isArchived={false}
      onLoadSetup={handleLoadSetup}
      onArchiveSetup={handleArchiveSetup}
      onMoveToTrash={(setupData) => {
        const setupsToProcess = Array.isArray(setupData) ? setupData : [setupData];
        const mainSetup = setupsToProcess[0];

        setConfirmModal({
          show: true,
          title: 'Move to Trash',
          message: `Are you sure you want to move the ${mainSetup.month} budget history entry to Trash?`,
          onConfirm: () => {
            setupsToProcess.forEach(setup => {
              onMoveToTrash?.(setup);
            });
            setConfirmModal(prev => ({ ...prev, show: false }));
          }
        });
      }}
      formatCurrency={formatCurrency}
      calculateBudgetRemaining={(setup) => calculateBudgetRemaining(setup, transactions, selectedYear)}
      archiveSubmitting={archiveSubmitting}
    />
  </div>

  {/* 2. ARCHIVED BUDGETS */}
  {archivedSetups.length > 0 && (
    <div className={showArchived ? 'block' : 'hidden lg:block'}>
      
      {/* Desktop Accordion Button (Hidden on Mobile) */}
      <button
        type="button"
        onClick={() => setShowArchived(prev => !prev)}
        className="hidden lg:flex w-full items-center justify-between p-8 pl-12 pr-12 bg-white dark:bg-gray-900 border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-50/40 dark:hover:bg-amber-900/20 transition-colors rounded-[2.5rem]"
      >
        <div className="flex items-center space-x-3">
          <Archive className="w-5 h-5 text-amber-500" />
          <span className="text-xs font-black text-amber-700 dark:text-amber-500 uppercase tracking-[0.25em]">Archived Budgets ({archivedSetups.length})</span>
        </div>
        <ChevronDown className={`w-5 h-5 text-amber-400 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
      </button>
      
      {/* The Actual Archived List */}
      <div className={`lg:mt-8 ${showArchived ? 'block' : 'hidden'}`}>
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
      </div>
      
    </div>
  )}
  
</div>
{/* --- END BUDGET LISTS WRAPPER --- */}

            

        
            {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
        </div>
    );
  }

      // 🟢 STEP 1: ENGINE-POWERED CATEGORY SUMMARY
      const categorySummary = effectiveCategories
      .filter(cat => {
        const hasRegularData = processedBudgetMap[activePeriodIndex]?.[cat.name]?.length > 0;
        
        // 🟢 FIX 1: Tell the system to evaluate Budee alongside Loans so it doesn't return 0!
        const hasLoansData = (cat.name === 'Loans' || cat.name === 'Budee') && installments.some(inst => !inst.isArchived);
        const hasCreditData = cat.name === 'Credit' && creditBudgetAccounts.length > 0;
        
        return shouldRenderCategorySection(cat, hasRegularData || hasLoansData || hasCreditData, selectedYear, selectedMonth);
      })
      .map((cat) => {
    
    // 1. Regular Setup Items (Pulled from Engine)
    const periodItems = processedBudgetMap[activePeriodIndex]?.[cat.name] || [];
    const itemsTotal = periodItems.reduce((sum, item) => {
      // 🟢 Ignore unchecked items in the math!
      if (!item.included) return sum; 
      
      const val = item.amountsByPeriod?.[activePeriodIndex] !== undefined 
        ? item.amountsByPeriod[activePeriodIndex] 
        : item.amount;
      return sum + (parseFloat(val) || 0);
    }, 0);


                                // 2. Installments (Loans & Budee) - MATCHES UI ROWS EXACTLY
        let installmentsTotal = 0;
        if (cat.name === 'Loans' || cat.name === 'Budee') {
          installmentsTotal = (installments || [])
            .filter(inst => {
              if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
              
              // 🔴 FIX: Completely exclude "To Collect" items from your expense math!
              if (cat.name === 'Budee' && inst.debtor_friend_id) return false;

              // Ensure Budee items stay with Budee and Loans stay with Loans
              const isBudee = !!(inst.funding_friend_id || inst.debtor_friend_id || (inst as any).friend_user_id);
              if (cat.name === 'Loans' && isBudee) return false;
              if (cat.name === 'Budee' && !isBudee) return false;

              // Prevent double counting if swallowed by credit card
              const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
              const isSwallowedByCreditAccount = creditBudgetAccounts.some(acc => acc.id === linkedId);
              // 🟢 FIX: Never swallow Budee items, only swallow standard Loans!
              if (cat.name === 'Loans' && isSwallowedByCreditAccount) return false;

    
              // Enforce Tab Timing Match!
              const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
              if (targetPeriod !== activePeriodIndex) return false;
    
              // Active for Month Match
              const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
              const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
              const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
              
              return isActiveForPeriod && !isFinished;
            })
            .reduce((s, inst) => s + inst.monthlyAmount, 0);
        }
    

        // 3. Credit Cards - MATCHES UI ROWS EXACTLY
        let creditTotal = 0;
        if (cat.name === 'Credit') {
          creditTotal = creditBudgetAccounts
            .filter(acc => !excludedCreditIds.has(acc.id))
            .reduce((sum, account) => {
              const isLoanBundle = account.subtype === 'Loan_Bundle';

    
                            // 🟢 LOAN BUNDLES: Sum up the active children for this pay period!
                            if (isLoanBundle) {
                              const bundleInstallments = (installments || []).filter(inst => {
                                if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
                                
                                // 🟢 FIX: Completely exclude Budee items from the Credit expense math!
                                const isBudee = !!(inst.funding_friend_id || inst.debtor_friend_id || (inst as any).friend_user_id);
                                if (isBudee) return false;
              
                                if (inst.accountId !== account.id && inst.account_id !== account.id && inst.linkedAccountId !== account.id && inst.linked_account_id !== account.id) return false;
                                
                                let targetPeriod = 1;
                                if (inst.timing === '1/2') targetPeriod = 1;
                                else if (inst.timing === '2/2') targetPeriod = 2;
                                else targetPeriod = getAccountPeriodIndex({ dueDate: inst.dueDate || inst.due_date || 1 });
                                
                                if (targetPeriod !== activePeriodIndex) return false;
                                
                                const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
                                const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
                                const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
                                
                                return isActiveForPeriod && !isFinished;
                              });
                              return sum + bundleInstallments.reduce((s, inst) => s + inst.monthlyAmount, 0);
                            }
              
    
              // 🔴 STANDARD CC: Check master due date and get frozen amount
              if (determineItemPeriod(account, currentPeriods, selectedMonth, selectedYear) === activePeriodIndex) {
                const amt = getFrozenCycleAmount(account);
                return amt >= 0.01 ? sum + amt : sum;
              }
              return sum;
            }, 0);
        }
        
        // 🟢 PUT THIS RETURN STATEMENT BACK IN!
        return { 
          category: cat.name, 
          total: itemsTotal + installmentsTotal + creditTotal 
        };
            
        });
        
        

  const stashTotal = wallets.filter(w => !excludedWalletIds.has(w.id)).reduce((s, w) => s + Math.max(w.amount, getStashAggregates(w).funded), 0);
  const grandTotal = categorySummary.reduce((sum, cat) => sum + cat.total, 0) + stashTotal;
  const totalSpend = grandTotal;
  
  
  const currentMonthIndex = MONTHS.indexOf(selectedMonth);
  const allIncomeTxs = (transactions || []).filter(tx => {
    // 🟢 1. STRICT DB TYPE CHECK
    if (tx.transaction_type !== 'income') return false; 
    
    const txDate = new Date(tx.date);
    if (txDate.getMonth() !== currentMonthIndex || txDate.getFullYear() !== selectedYear) return false;

    // 🟢 2. ISOLATE BY TAB: Push this income into the correct tab based on its explicit notes or date
    const periodNames = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    const pIndex = Number(activePeriodIndex) - 1;
    const pName = periodNames[pIndex] ? `${periodNames[pIndex]} Paycheck` : `Paycheck ${activePeriodIndex}`;
    const targetLabel = `Income - ${selectedMonth} (${pName})`;
    const legacyLabel = Number(activePeriodIndex) === 1 ? '1/2' : '2/2'; 

    if (tx.notes?.startsWith('Income -') || tx.notes?.startsWith('Income Record')) {
      return tx.notes === targetLabel || tx.notes.includes(`- ${legacyLabel}`);
    } else {
      return getPeriodIndexForDate(txDate.getDate()) === Number(activePeriodIndex);
    }
  });


    // 🟢 NEW ENGINE: Independent Other Income (Side hustles, refunds, etc.)
        // 🟢 Independent Other Income (Side hustles, refunds, etc.)
        const otherIncomeTxs = (transactions || []).filter(tx => {
          // 1. MUST be the new dedicated 'income' type!
          if (tx.transaction_type !== 'income') return false;
      
          // 2. Must be in the currently selected month and year
          const txDate = new Date(tx.date);
          if (txDate.getMonth() !== currentMonthIndex || txDate.getFullYear() !== selectedYear) return false;
      
          // 3. EXPLICITLY EXCLUDE PRIMARY PAYCHECKS (so they don't get counted twice)
          const isTaggedIncome = tx.notes?.startsWith('Income -') || tx.notes?.startsWith('Income Record');
          const nameLower = (tx.name || '').trim().toLowerCase(); 
          
          const isPrimaryIncome = isTaggedIncome || nameLower === 'salary' || nameLower === 'income';
          
          if (isPrimaryIncome) return false;
      
          // 4. ISOLATE BY TAB: Push this extra income into the correct tab based on its date
          return getPeriodIndexForDate(txDate.getDate()) === Number(activePeriodIndex);
        });
    

  const totalOtherIncome = otherIncomeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const hasIncomeRecords = allIncomeTxs.length > 0;
  const actualSalaryValue = actualSalary.trim() !== '' ? parseFloat(actualSalary) : null;
  const projectedSalaryValue = parseFloat(projectedSalary) || 0;
  
    // 🟢 LIVE INCOME CALCULATOR (Tab-Aware)
    let salaryToUse = 0;
  
    if (allIncomeTxs && allIncomeTxs.length > 0) {
      // 1. First Priority: If we have live transactions, force the math to use their exact sum
      salaryToUse = allIncomeTxs.reduce((sum, tx) => sum + (parseFloat(tx.amount as any) || 0), 0);
    } else {
      // 2. Fallback: Use the manual input for this specific tab, or the projected amount
      const actualTab = parseFloat(actualSalaryByPeriod[activePeriodIndex]);
      const projectedTab = parseFloat(projectedSalaryByPeriod[activePeriodIndex]);
      salaryToUse = !isNaN(actualTab) ? actualTab : (projectedTab || 0);
    }
  
    const netIncome = Math.abs(salaryToUse) + totalOtherIncome;
    const remaining = netIncome - totalSpend;
  
  const currentSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
  const isReadOnly = currentSetup?.isArchived ?? false;
  const legacyMode = isLegacyBudget(selectedYear, selectedMonth);


  return (
    <div className={`space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20 w-full ${isMobile ? 'p-2' : 'p-4 md:p-8'} relative`}>
      <div className="flex flex-col space-y-6">
        <PageHeader 
          title="Budget Setup"
          subtitle={isReadOnly ? 'Archived – Read Only' : 'Your Money-Pie for the month'}
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
            <button 
              onClick={async () => {
                if (!isReadOnly) {
                  await autoSave();
                }
                setView('summary');
              }} 
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
  
          <div className="flex-grow flex justify-center items-center space-x-2 md:flex-grow-0">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              disabled={isReadOnly} 
              className={`bg-white dark:bg-gray-900 border-2 border-black rounded-xl md:rounded-[1.5rem] h-10 md:h-auto px-3 md:px-8 md:py-4 font-black text-xs md:text-base shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-center appearance-none ${getAccentClasses('text')}`}
            >
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
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
  
{/* 2. THE DYNAMIC TABS */}

<div className="flex space-x-2 overflow-x-auto pb-1 max-w-full scrollbar-hide">
  {currentPeriods.map((period, index) => {
    const periodNum = index + 1;
    const isActive = activePeriodIndex === periodNum;
    
    // Format dates for the sub-label
    const formattedStart = period?.startDate ? new Date(period.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const formattedEnd = period?.endDate ? new Date(period.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    
    return (
      <button
        key={periodNum}
        onClick={() => setActivePeriodIndex(periodNum)}
        disabled={isReadOnly}
        type="button"
        className={`flex-shrink-0 px-4 py-2 font-black uppercase text-xs tracking-wider border-2 rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60 disabled:cursor-not-allowed ${
          isActive 
            ? 'bg-indigo-600 text-white border-black translate-x-[1px] translate-y-[1px] shadow-none' 
            : 'bg-white dark:bg-gray-900 text-gray-500 border-black hover:bg-gray-100 dark:hover:bg-gray-800 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
        }`}
      >
        {period.label || `Period ${periodNum}`}
        {formattedStart && formattedEnd && (
          <span className={`block text-[9px] font-medium mt-1 ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>
            {formattedStart} - {formattedEnd}
          </span>
        )}
      </button>
    );
  })}
</div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">  
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden w-full transition-colors">
          <div className="p-4 border-b-4 border-black bg-gray-50/30 dark:bg-gray-800/30"><h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] text-center">BUDGET SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800"><th className="p-3 pl-6">Category</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {/* 🟢 NEW: Added .filter() to completely hide categories with 0 amounts */}
              {categorySummary
                .filter((item) => item.total >= 0.01)
                .map((item) => (
                <tr key={item.category}>
                  <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">{item.category}</td>
                  <td className="p-3 pr-6 text-right font-black text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(item.total)}</td>
                </tr>
              ))}
              {stashTotal > 0 && (
                <tr>
                  <td className="p-3 pl-6 font-bold text-gray-700 dark:text-gray-300 text-sm">Stash</td>
                  <td className="p-3 pr-6 text-right font-black text-gray-900 dark:text-gray-100 text-sm">{formatCurrency(stashTotal)}</td>
                </tr>
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
                        {formatCurrency(parseFloat(projectedSalaryByPeriod[activePeriodIndex] || '0'))}
                      </span>
                    ) : (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                        <input 
                          autoFocus
                          type="number" 
                          min="0"
                          step="0.01"
                          value={projectedSalaryByPeriod[activePeriodIndex] || ''} 
                          onChange={(e) => setProjectedSalaryByPeriod(prev => ({ ...prev, [activePeriodIndex]: e.target.value }))} 
                          onFocus={() => { isFocusedRef.current = true; }}
                          onBlur={() => { isFocusedRef.current = false; setIsProjectedFocused(false); }}
                          disabled={isReadOnly}
                          className="bg-transparent border-none text-sm font-black text-gray-900 dark:text-gray-100 w-28 text-right outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/30 rounded px-1 disabled:opacity-60 disabled:cursor-not-allowed"
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
                        className={`text-sm font-black ${
                          allIncomeTxs.length > 0 || actualSalaryByPeriod[activePeriodIndex] 
                            ? 'text-gray-900 dark:text-gray-100' 
                            : 'text-gray-400 dark:text-gray-500 italic'
                        } ${!isReadOnly && allIncomeTxs.length === 0 ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''} transition-colors`}
                        onClick={() => {
                          // Only allow manual editing if there are no recorded transactions
                          if (!isReadOnly && allIncomeTxs.length === 0) setIsActualFocused(true);
                        }}
                        title={allIncomeTxs.length > 0 ? "Locked to recorded transactions" : ""}
                      >
                        {allIncomeTxs.length > 0 
                          // 🟢 DERIVED MATH: If transactions exist, forcefully sum them up and display them!
                          ? formatCurrency(allIncomeTxs.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount as any) || 0), 0))
                          // Fallback to manual input if no transactions exist
                          : (actualSalaryByPeriod[activePeriodIndex] ? formatCurrency(parseFloat(actualSalaryByPeriod[activePeriodIndex])) : 'Click to add...')
                        }
                      </span>
                    ) : (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-gray-400 dark:text-gray-500 font-bold text-sm">₱</span>
                        <input 
                          autoFocus
                          type="number" 
                          min="0"
                          step="0.01"
                          value={actualSalaryByPeriod[activePeriodIndex] || ''} 
                          onChange={(e) => setActualSalaryByPeriod(prev => ({ ...prev, [activePeriodIndex]: e.target.value }))} 
                          onFocus={() => { isFocusedRef.current = true; }}
                          onBlur={() => { isFocusedRef.current = false; setIsActualFocused(false); }}
                          disabled={isReadOnly}
                          placeholder="Enter actual"
                          className="bg-transparent border-none text-sm font-black text-gray-900 dark:text-gray-100 w-28 text-right outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/30 rounded px-1 placeholder:text-gray-300 dark:placeholder:text-gray-600 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}
                    
                    {/* The Wallet / List Buttons */}
                    {!isReadOnly && (
                      allIncomeTxs.length > 0 ? (
                        <button onClick={() => setShowIncomeRecordsModal(true)} className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all" title="View Income Records">
                          <List className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => {
                            const debitAccounts = accounts.filter(a => a.type === 'Debit');
                            
                            const yyyy = selectedYear;
                            const mm = String(MONTHS.indexOf(selectedMonth) + 1).padStart(2, '0');
                            const dd = activePeriodIndex === 1 ? '01' : '16';
                            
                            setSalaryFormData({
                              name: 'Income',
                              amount: actualSalaryByPeriod[activePeriodIndex] || projectedSalaryByPeriod[activePeriodIndex] || '',
                              date: `${yyyy}-${mm}-${dd}`, 
                              accountId: debitAccounts[0]?.id || ''
                            });
                            setShowSalaryModal(true);
                          }}
                          className="p-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all" title="Record as Cash In transaction">
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
      
                          {/* ========================================================= */}
          {/* ⚡ INCOME SLICER WORKSPACE PANEL                          */}
          {/* ========================================================= */}
          {(availableIncomes || []).length > 0 && (
            <div className="mt-8 bg-[#F4F3EF] dark:bg-gray-900 border-4 border-black p-6 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors">
              
              {/* Header Section - 🟢 NOW CLICKABLE */}
              <div 
                className="flex flex-col md:flex-row md:items-center justify-between border-b-4 border-black pb-4 mb-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors -mx-2 px-2"
                onClick={() => setIsSlicerExpanded(!isSlicerExpanded)}
              >
                <div>
                  <span className="bg-amber-300 text-black border-2 border-black px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    Slicer Active
                  </span>
                  <div className="flex items-center gap-3 mt-2">
                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">
                      Distribute Income
                    </h2>
                    <ChevronDown className={`w-6 h-6 text-gray-900 dark:text-gray-100 transition-transform duration-300 ${isSlicerExpanded ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                    Select which recorded income transactions to slice and allocate to your budgets.
                  </p>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center space-x-4 mt-4 md:mt-0">
                  <div className="bg-white dark:bg-gray-800 border-2 border-black p-3 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Selected Pool</p>
                    <p className="text-lg font-black text-emerald-600">₱{totalTrayPool.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 border-2 border-black p-3 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Remaining</p>
                    <p className={`text-lg font-black ${remainingToAllocate === 0 ? 'text-blue-500' : 'text-red-500'}`}>
                      ₱{remainingToAllocate.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* 🟢 THE EXPANDABLE CONTENT */}
              {isSlicerExpanded && (
                <div className="animate-in slide-in-from-top-4 fade-in duration-300 pt-2">
                  {/* STEP 1: Select Income Transactions to Load Into Tray */}
                  <div className="mb-6">
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">
                      1. Select Income to Slice
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {availableIncomes.map((tx) => {
                        const isSelected = trayTxIds.includes(tx.id);
                        const account = accounts.find(a => a.id === tx.payment_method_id);
                        const accountName = account ? `${account.bank} (${account.classification})` : 'Unknown Account';
                        
                        return (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() => toggleTrayTransaction(tx.id)}
                            className={`w-full text-left p-4 border-2 border-black rounded-xl flex items-center justify-between transition-all transform active:scale-[0.98] ${
                              isSelected
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                            }`}
                          >
                            <div>
                              <p className="font-black text-sm text-gray-900 dark:text-gray-100">{tx.notes || 'Income Record'}</p>
                              <p className="text-[10px] font-bold uppercase text-gray-400 mt-0.5">Origin: {accountName}</p>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className="font-black text-emerald-600">₱{Math.abs(tx.amount).toLocaleString()}</span>
                              <div className={`w-6 h-6 border-2 border-black rounded-md flex items-center justify-center ${isSelected ? 'bg-emerald-500' : 'bg-white'}`}>
                                {isSelected && <Check className="w-4 h-4 text-white stroke-[4]" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 2: Allocate to Setup Items */}
                  {trayTxIds.length > 0 && (
                    <div className="space-y-4 border-t-2 border-dashed border-gray-400 pt-6">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                        2. Distribute to Budget Items
                      </h3>
                      
                      <div className="overflow-x-auto border-2 border-black rounded-xl bg-white dark:bg-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-100 dark:bg-gray-700 border-b-2 border-black text-xs font-black uppercase text-gray-600 dark:text-gray-300">
                              <th className="p-3">Budget Line Item</th>
                              <th className="p-3">Target Amount</th>
                              <th className="p-3">Allocate Amount</th>
                              <th className="p-3">Destination Account</th>
                              <th className="p-3">Transfer Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm font-medium">
                            {flattenedBudgetItems.map((item) => {
                              const currentAlloc = allocations.find(a => a.budgetItemId === item.id) || { amount: 0, targetAccountId: '' };
                              
                              // Determine if we need an actual bank transfer
                              const activeIncomesInTray = transactions.filter(t => trayTxIds.includes(t.id));
                              const matchesAllSources = activeIncomesInTray.every(t => t.payment_method_id === currentAlloc.targetAccountId);
                              const isLocal = activeIncomesInTray.length > 0 && matchesAllSources;

                              return (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                                  {/* Item Name */}
                                  <td className="p-3 font-black text-gray-900 dark:text-gray-100">
                                    {item.name}
                                  </td>

                                  {/* Target/Goal */}
                                  <td className="p-3 text-gray-500">
                                    ₱{(item.amount || 0).toLocaleString()}
                                  </td>

                                  {/* Allocation Input */}
                                  <td className="p-3">
                                    <div className="relative max-w-[140px]">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400 text-xs">₱</span>
                                      <input
                                        type="number"
                                        value={currentAlloc.amount || ''}
                                        onChange={(e) => updateAllocation(item.id, item.name, { amount: Number(e.target.value) })}
                                        placeholder="0"
                                        className="w-full pl-6 pr-2 py-1.5 border-2 border-black rounded-lg text-sm font-black focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white dark:bg-gray-900"
                                      />
                                    </div>
                                  </td>

                                  {/* Destination Account Selection */}
                                  <td className="p-3">
                                    <select 
                                      value={currentAlloc.targetAccountId || ""} 
                                      onChange={(e) => updateAllocation(item.id, item.name, { targetAccountId: e.target.value })}
                                      className="w-full bg-white dark:bg-gray-900 border-2 border-black rounded-lg text-sm font-black px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                    >
                                      <option value="" disabled>Select Account</option>
                                      {accounts
                                        .filter(a => a.type !== 'Credit')
                                        .map(acc => (
                                          <option key={acc.id} value={acc.id}>
                                            {acc.bank} ({acc.classification})
                                          </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Local vs Transfer Indicator */}
                                  <td className="p-3">
                                    {currentAlloc.amount > 0 ? (
                                      isLocal ? (
                                        <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] px-2 py-0.5 rounded font-black uppercase">
                                          ⚡ Local (No Swap)
                                        </span>
                                      ) : (
                                        <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-2 py-0.5 rounded font-black uppercase">
                                          💸 Auto Transfer
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-gray-300 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={handleSliceSubmit}
                          // Disable ONLY if tray is empty OR no valid allocation exists
                          disabled={
                            trayTxIds.length === 0 || 
                            !allocations.some(a => a.amount > 0 && a.targetAccountId)
                          }
                          className={`px-6 py-3 rounded-xl font-black uppercase tracking-wider text-xs border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all ${
                            // Apply active styling if there is a valid allocation
                            trayTxIds.length > 0 && allocations.some(a => a.amount > 0 && a.targetAccountId)
                              ? 'bg-emerald-400 text-black hover:bg-emerald-500 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed border-gray-300 dark:border-gray-600 shadow-none'
                          }`}
                        >
                          Execute Slice & Fund
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


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
                                    <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50">
                                      <th className="p-4 pl-10">Name</th>
                                      <th className="p-4">Target</th>
                                      <th className="p-4">Account</th>
                                      <th className="p-4 text-center">Status</th>
                                      <th className="p-4 pr-10 text-center w-48">Actions</th>
                                    </tr>
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
                                          <td className="p-4 pl-10">
                                            <div className="flex items-center gap-3">
                                              {!isReadOnly && (
                                                <button 
                                                  onClick={() => handleWalletIncludeToggle(wallet.id)} 
                                                  className={`w-8 h-8 rounded-xl border-2 border-black flex items-center justify-center transition-all flex-shrink-0 ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-transparent'}`}
                                                >
                                                  <Check className="w-4 h-4" />
                                                </button>
                                              )}
                                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{wallet.name}</span>
                                            </div>
                                          </td>
                                          
                                          <td className="p-4">
                                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                              {formatCurrency(wallet.amount)}
                                            </span>
                                          </td>
                                          
                                          <td className="p-4">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                              {linkedAccount ? `${linkedAccount.bank} (${linkedAccount.classification})` : wallet.accountId}
                                            </span>
                                          </td>
                                          
                                          <td className="p-4 text-center">
                                            {isOverFunded ? (
                                              <span className="inline-block px-2 py-1 text-[9px] font-black bg-blue-100 text-blue-700 border border-black rounded-lg uppercase tracking-wider text-center">
                                                Over +{formatCurrency(funded - wallet.amount)}
                                              </span>
                                            ) : isExactlyFunded ? (
                                              <span className="inline-block w-16 px-2 py-1 text-[9px] font-black bg-green-100 text-green-700 border border-black rounded-lg uppercase tracking-wider text-center">
                                                Funded
                                              </span>
                                            ) : (
                                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                            )}
                                          </td>
                                          
                                          <td className="p-4 pr-10">
                                            <div className="flex items-center justify-center space-x-2">
                                              <button 
                                                onClick={() => setStashInfoModal({ wallet })} 
                                                title="View stash details" 
                                                className="p-1.5 bg-white dark:bg-gray-800 border-2 border-black rounded-lg text-gray-400 hover:text-indigo-600 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all"
                                              >
                                                <Info className="w-4 h-4" />
                                              </button>
                                              
                                              {!isReadOnly && (
                                                <button 
                                                  onClick={() => handleOpenFundModal(wallet)} 
                                                  className="px-4 py-2 text-xs font-black uppercase rounded-xl border-2 border-black bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                                >
                                                  {isFunded ? 'More' : 'Fund'}
                                                </button>
                                              )}
                                            </div>
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


{effectiveCategories.filter(cat => cat.name !== 'Fixed').map((cat) => {
  const items = processedBudgetMap[activePeriodIndex]?.[cat.name] || [];
  const matchingSummary = categorySummary.find(s => s.category === cat.name);
const displayTotal = matchingSummary ? matchingSummary.total : 0;

let relevantInstallments: Installment[] = [];
if (cat.name === 'Loans' || cat.name === 'Budee') {
  relevantInstallments = (installments || []).filter(inst => {
    if (inst.isArchived) return false;
    
    const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
    const isSwallowedByCreditAccount = creditBudgetAccounts.some(acc => acc.id === linkedId);
    // 🟢 FIX: Never swallow Budee items, only swallow standard Loans!
    if (cat.name === 'Loans' && isSwallowedByCreditAccount) return false;


    const isBudee = !!(inst.funding_friend_id || inst.debtor_friend_id || (inst as any).friend_user_id);
    if (cat.name === 'Loans' && isBudee) return false;
    if (cat.name === 'Budee' && !isBudee) return false;

        // 🔥 NEW: Pure Proximity Rule! (Removed legacy 1/2 and 2/2 hardcodes)
        const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
    
        if (targetPeriod !== activePeriodIndex) return false;
    

    const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
    const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
    const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
    return isActiveForPeriod && !isFinished; 
  });
}



// Update hasData to track Budee as well
const hasData = items.length > 0 || 
  ((cat.name === 'Loans' || cat.name === 'Budee') && relevantInstallments.length > 0) || 
  (cat.name === 'Credit' && creditBudgetAccounts.length > 0);


        const shouldRenderCategory = shouldRenderCategorySection(cat, hasData, selectedYear, selectedMonth);
        if (!shouldRenderCategory) return null;

        const canAddItems = !isReadOnly && (cat.flexiMode ?? true) && isCategoryActiveForBudget(cat, selectedYear, selectedMonth);
        const isLegacyCategory = isCategoryLegacyForBudget(cat, selectedYear, selectedMonth);
        console.log(`[Tab Debug] Active Period: ${activePeriodIndex} | Category: ${cat.name}`, {
          items: items.map(i => ({ name: i.name, due: i.dueDay || i.dueDate, periodVal: i.amountsByPeriod?.[activePeriodIndex] })),
          installments: relevantInstallments.map(inst => ({ name: inst.name, due: inst.dueDate || inst.due_date }))
        });
        
        const itemsTotal = items
  .filter(item => {
    if (!item || !item.included) return false;
    const isBillerItem = item.isBiller || billers?.some(b => b.id === item.id);
    const isInstallmentItem = item.isInstallment || installments?.some(i => i.id === item.id);

    if (isBillerItem || isInstallmentItem || item.isCredit) {
      const linkedBiller = billers?.find(b => b.id === item.id);
      const linkedInstallment = installments?.find(i => i.id === item.id);
      const actualTiming = item.timing || linkedBiller?.timing || linkedInstallment?.timing;

      if (actualTiming === '1/2') return activePeriodIndex === 1;
      if (actualTiming === '2/2') return activePeriodIndex === 2;

      const dueDay = item.dueDay || item.dueDate || linkedBiller?.dueDate || linkedInstallment?.due_date || 1;
return getAccountPeriodIndex({ dueDate: dueDay }) === activePeriodIndex;
    }

    const periodVal = item.amountsByPeriod?.[activePeriodIndex];
    return periodVal !== undefined && periodVal !== '' && periodVal !== '0';
  })
  .reduce((s, i) => {
    const val = i.amountsByPeriod?.[activePeriodIndex] !== undefined 
      ? i.amountsByPeriod[activePeriodIndex] 
      : i.amount;
    return s + (parseFloat(val) || 0);
  }, 0);

        const installmentsTotal = relevantInstallments
          .filter(inst => !excludedInstallmentIds.has(inst.id))
          .reduce((s, inst) => s + inst.monthlyAmount, 0);
        
        // 1. PERFECTLY SYNCED CATEGORY TOTAL MATH
        let creditTotal = 0;
if (cat.name === 'Credit') {
  creditTotal = creditBudgetAccounts
    .filter(acc => {
      if (excludedCreditIds.has(acc.id)) return false;
      return getAccountPeriodIndex(acc) === activePeriodIndex; // 👈 Unified check
    })
    .reduce((sum, account) => {
      const amt = getFrozenCycleAmount(account);
      return amt >= 0.01 ? sum + amt : sum;
    }, 0);
}




// Dynamically sum what is ACTUALLY checked and rendering inside the card:
const categoryTotal = itemsTotal + installmentsTotal + creditTotal;
              
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
  
            {cat.name === 'Credit' && creditBudgetAccounts.length > 0 && (
              <div className="p-4 space-y-4 bg-gray-50/30 dark:bg-gray-955/10">
                {creditBudgetAccounts.filter(account => {
                  if (excludedCreditIds.has(account.id)) return false;
                  
                  // 1. LOAN BUNDLES: Check if the folder has any installments due this period
                  if (account.subtype === 'Loan_Bundle') {
                     return (installments || []).some(inst => {
                         if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
                         if (inst.accountId !== account.id && inst.account_id !== account.id && inst.linkedAccountId !== account.id && inst.linked_account_id !== account.id) return false;                         
                         let targetPeriod = 1;
                         if (inst.timing === '1/2') targetPeriod = 1;
                         else if (inst.timing === '2/2') targetPeriod = 2;
                         else {
                           const dueDay = inst.dueDate || inst.due_date || 1;
                           targetPeriod = getAccountPeriodIndex({ dueDate: dueDay });
                         }
                         return targetPeriod === activePeriodIndex;
                     });
                  }
                  
                  // 2. STANDARD CC: Check master due date
                  return getAccountPeriodIndex(account) === activePeriodIndex;
                }).map(account => {
                  const isIncluded = !excludedCreditIds.has(account.id);
                  const isLoanBundle = account.subtype === 'Loan_Bundle';

                                    // 🟢 GROUPED LOAN BUNDLE UI
                                    if (isLoanBundle) {
                                      const bundleInstallments = (installments || []).filter(inst => {
                                        if (inst.isArchived || excludedInstallmentIds.has(inst.id)) return false;
                                        
                                        // 🟢 FIX: Hide Budee items from the Credit section so they only appear under the Budee card!
                                        const isBudee = !!(inst.funding_friend_id || inst.debtor_friend_id || (inst as any).friend_user_id);
                                        if (isBudee) return false;
                  
                                        if (inst.accountId !== account.id && inst.account_id !== account.id && inst.linkedAccountId !== account.id && inst.linked_account_id !== account.id) return false;                      
                                        
                                        let targetPeriod = 1;
                                        if (inst.timing === '1/2') targetPeriod = 1;
                                        else if (inst.timing === '2/2') targetPeriod = 2;
                                        else {
                                          const dueDay = inst.dueDate || inst.due_date || 1;
                                          targetPeriod = getAccountPeriodIndex({ dueDate: dueDay });
                                        }
                                        if (targetPeriod !== activePeriodIndex) return false;
                                        
                                        const scheduleForMonth = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
                                        const isActiveForPeriod = scheduleForMonth !== undefined || shouldShowInstallment(inst, selectedMonth, selectedYear);
                                        const isFinished = !scheduleForMonth && inst.totalAmount > 0 && inst.paidAmount >= inst.totalAmount;
                                        
                                        return isActiveForPeriod && !isFinished;
                                      });
                  

                    if (bundleInstallments.length === 0) return null;
                    const bundleTotal = bundleInstallments.reduce((sum, inst) => sum + inst.monthlyAmount, 0);

                    return (
                      <div key={account.id} className={`p-4 border-2 border-black rounded-xl bg-blue-50/20 dark:bg-blue-900/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex flex-col gap-3 ${isIncluded ? 'opacity-100' : 'opacity-60'}`}>
                        <div className="flex items-center justify-between border-b-2 border-black/10 pb-3">
                          <div className="flex items-center gap-4">
                            <button 
                              onClick={() => setExcludedCreditIds(prev => {
                                const next = new Set(prev);
                                if (next.has(account.id)) next.delete(account.id);
                                else next.add(account.id);
                                return next;
                              })}
                              className={`w-8 h-8 rounded-xl border-2 border-black flex items-center justify-center transition-all ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white'}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-gray-100">{account.bank}</p>
                              <span className="text-[9px] font-black px-2 py-0.5 bg-blue-100 border border-black text-blue-600 rounded inline-block mt-1 uppercase">Loan Bundle</span>
                            </div>
                          </div>
                          <div className="text-right">
                             <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Due</p>
                             <p className="text-sm font-black text-blue-600">{formatCurrency(bundleTotal)}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pl-4 md:pl-12">
                          {bundleInstallments.map(inst => {
                            let isPaid = false, isPartial = false;
                            const instSchedule = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
                            if (instSchedule) {
                              isPaid = checkIfPaidBySchedule('installment', inst.id);
                              isPartial = checkIfPartialBySchedule('installment', inst.id);
                            }

                            return (
                              <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 border-2 border-black/20 shadow-sm">
                                <div>
                                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{inst.name}</p>
                                  <p className="text-[10px] font-black text-gray-500">
                                    Due: {inst.dueDate || inst.due_date ? formatDueDate(inst.dueDate || inst.due_date) : 'N/A'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCurrency(inst.monthlyAmount)}</p>
                                    {isPaid ? (
                                      <span className="text-[9px] font-black px-2 py-1 bg-green-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase mt-0.5 inline-block">Paid</span>
                                    ) : isPartial ? (
                                      <span className="text-[9px] font-black px-2 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase mt-0.5 inline-block">Partial</span>
                                    ) : null}
                                  </div>

                                  {!isPaid && !isReadOnly && (
                                    <button 
                                      onClick={() => {
                                        setTransactionFormData({ 
                                          id: '', name: `${inst.name} - ${selectedMonth}`, date: getTodayIso(), 
                                          amount: isPartial && instSchedule ? Math.max(0, instSchedule.expected_amount - instSchedule.amount_paid).toFixed(2) : inst.monthlyAmount.toFixed(2), 
                                          accountId: account.id || accounts[0]?.id || '', paymentScheduleId: instSchedule?.id || '', transactionType: 'payment' 
                                        });
                                        setShowTransactionModal(true);
                                      }}
                                      className="px-3 py-1.5 text-[10px] font-black uppercase rounded-xl border-2 border-black bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                    >
                                      Pay
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  
                  let calculatedDueDate = 'N/A';
                  if (account.dueDate && account.billingDate) {
                    const gracePeriodDays = new Date(account.dueDate).getDate();
                    const stmtDay = new Date(account.billingDate).getDate();
                    const calcDate = new Date(2024, 0, stmtDay); 
                    calcDate.setDate(calcDate.getDate() + gracePeriodDays); 
                    const isNextMonth = calcDate.getMonth() !== 0; 
                    calculatedDueDate = `${calcDate.getDate()}${isNextMonth ? ' next' : ''}`;
                  } else if (account.dueDate) {
                    calculatedDueDate = String(new Date(account.dueDate).getDate());
                  }
                  const displayAmount = getFrozenCycleAmount(account);
                  const cycleRemaining = getRemainingCycleAmount(account);
                  

                  if (displayAmount < 0.01) return null; 
                  return (
                    <div key={account.id} className={`p-4 border-2 border-black rounded-xl bg-purple-50 dark:bg-purple-900/20 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between transition-all ${isIncluded ? 'opacity-100' : 'opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setExcludedCreditIds(prev => {
                            const next = new Set(prev);
                            if (next.has(account.id)) next.delete(account.id);
                            else next.add(account.id);
                            return next;
                          })}
                          className={`w-8 h-8 rounded-xl border-2 border-black flex items-center justify-center transition-all ${isIncluded ? 'bg-indigo-600 text-white' : 'bg-white'}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        
                        <div>
                          <p className="text-sm font-black text-gray-900 dark:text-gray-100">{account.bank}</p>
                          <p className="text-[10px] font-black text-purple-600">
                            Due: {calculatedDueDate !== 'N/A' ? formatDueDate(calculatedDueDate) : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                         <div className="flex flex-col items-end">
                           <p className="text-sm font-black text-purple-600">{formatCurrency(displayAmount)}</p>
                           {(() => {
                             const status = getCreditPaymentStatus(account);
                             if (status === 'paid') return <span className="text-[9px] font-black px-2 py-1 bg-green-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase mt-0.5">Paid</span>;
                             if (status === 'partial') return <span className="text-[9px] font-black px-2 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase mt-0.5">Partial</span>;
                             return <span className="text-[9px] font-black px-2 py-1 bg-red-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase mt-0.5">Unpaid</span>;
                           })()}
                         </div>
                         
                         <button onClick={(e) => { e.stopPropagation(); setCreditInfoModal({ account: account }); }} className="text-gray-400 hover:text-indigo-600 transition-colors p-1">
                            <Info className="w-4 h-4" />
                         </button>

                         {!isReadOnly && (() => {
                          const status = getCreditPaymentStatus(account);
                          const isPaidInFull = status === 'paid';
                          return (
                            <button 
                              disabled={isPaidInFull}
                              onClick={(e) => {
                                if (isPaidInFull) return;
                                e.preventDefault(); e.stopPropagation();
                                setShowCreditPayModal({ accountId: account.id, amount: cycleRemaining, bank: account.bank });
                              }} 
                              className={`px-4 py-2 text-xs font-black uppercase rounded-xl border-2 border-black transition-all ${
                                isPaidInFull ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                              }`}
                            >
                              {isPaidInFull ? 'Paid' : 'Pay'}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

                                    {/* --- BUDEE (NESTED LOAN BUNDLE STYLE) --- */}
            {cat.name === 'Budee' && (() => {
              const filteredBudee = relevantInstallments.filter(inst => {
                const dueDay = inst.dueDate || inst.due_date || 1;
                return getAccountPeriodIndex({ dueDate: dueDay }) === activePeriodIndex;
              });

              if (filteredBudee.length === 0) return null;

              return (
                <div className="p-4 space-y-4 bg-gray-50/30 dark:bg-gray-955/10">
                  {Object.entries(
                    filteredBudee.reduce((acc, inst) => {
                      const budeeId = inst.funding_friend_id || inst.debtor_friend_id || (inst as any).friend_user_id || 'Unknown_Budee';
                      if (!acc[budeeId]) acc[budeeId] = [];
                      acc[budeeId].push(inst);
                      return acc;
                    }, {} as Record<string, Installment[]>)
                  ).map(([budeeId, budeeInstallments]) => {
                    
                    const personProfile = (people || []).find(p => p.id === budeeId || p.friend_user_id === budeeId);
                    const displayBudeeName = personProfile && personProfile.name 
                      ? personProfile.name 
                      : (budeeId === 'Unknown_Budee' ? 'Unknown Profile' : `Budee (${budeeId.slice(0, 8)})`);

                    // 🟢 SPLIT THE ITEMS INTO PAYABLES AND RECEIVABLES
                    const toCollectItems = budeeInstallments.filter(inst => !!inst.debtor_friend_id);
                    const toPayItems = budeeInstallments.filter(inst => !inst.debtor_friend_id);

                    // 🟢 ONLY SUM "TO PAY" FOR THE CARD HEADER
                    const budeeTotal = toPayItems
                      .filter(inst => !excludedInstallmentIds.has(inst.id))
                      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);
                      
                    const collectTotal = toCollectItems
                      .filter(inst => !excludedInstallmentIds.has(inst.id))
                      .reduce((sum, inst) => sum + inst.monthlyAmount, 0);

                    // Helper to render an item row
                    const renderItem = (inst: Installment, isReceivable: boolean) => {
                      const isIncluded = !excludedInstallmentIds.has(inst.id);
                      let isPaid = false, isPartial = false;
                      const instSchedule = getPaymentSchedule('installment', inst.id, selectedMonth, selectedYear);
                      
                      if (instSchedule) {
                        isPaid = checkIfPaidBySchedule('installment', inst.id);
                        isPartial = checkIfPartialBySchedule('installment', inst.id);
                      }

                      // Theme colors based on Pay vs Collect
                      const themeColor = isReceivable ? 'emerald' : 'indigo';

                      return (
                        <div key={inst.id} className={`flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 border-2 border-black/20 shadow-sm transition-opacity ${isIncluded ? 'opacity-100' : 'opacity-50'}`}>
                          <div className="flex items-center gap-3">
                            <button 
                              disabled={isReadOnly}
                              onClick={() => !isReadOnly && setExcludedInstallmentIds(prev => {
                                const next = new Set(prev);
                                if(next.has(inst.id)) next.delete(inst.id); else next.add(inst.id);
                                return next;
                              })}
                              className={`w-8 h-8 rounded-xl border-2 border-black flex items-center justify-center transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] ${isIncluded ? `bg-${themeColor}-600 text-white` : 'bg-white text-transparent'}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{inst.name}</p>
                              <p className="text-[10px] font-black text-gray-500">
                                Due: {inst.dueDate || inst.due_date ? formatDueDate(inst.dueDate || inst.due_date) : 'N/A'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right flex items-center gap-2">
                              <p className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCurrency(inst.monthlyAmount)}</p>
                              {isPaid ? (
                                <span className="text-[9px] font-black px-2 py-1 bg-green-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase inline-block">Paid</span>
                              ) : isPartial ? (
                                <span className="text-[9px] font-black px-2 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase inline-block">Partial</span>
                              ) : (
                                <span className="text-[9px] font-black px-2 py-1 bg-red-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase inline-block">Unpaid</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!isPaid && !isReadOnly && (
                                <button 
                                  onClick={() => {
                                    setTransactionFormData({ 
                                      id: '', name: `${inst.name} - ${selectedMonth}`, date: getTodayIso(), 
                                      amount: isPartial && instSchedule ? Math.max(0, instSchedule.expected_amount - instSchedule.amount_paid).toFixed(2) : inst.monthlyAmount.toFixed(2), 
                                      accountId: inst.accountId || accounts[0]?.id || '', paymentScheduleId: instSchedule?.id || '', transactionType: isReceivable ? 'cash_in' : 'payment' 
                                    });
                                    setShowTransactionModal(true);
                                  }}
                                  className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg border-2 border-black bg-${themeColor}-600 text-white shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all`}
                                >
                                  {isReceivable ? 'Collect' : 'Pay'}
                                </button>
                              )}

                              {!isReadOnly && (
                                <button 
                                  onClick={() => setConfirmModal({ show: true, title: 'Exclude Installment', message: `Exclude "${inst.name}"?`, onConfirm: () => { setExcludedInstallmentIds(prev => new Set([...prev, inst.id])); setConfirmModal(p => ({...p, show: false})); } })}
                                  className="p-1.5 rounded-lg border-2 border-black bg-white text-red-500 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div key={`budee-group-${budeeId}`} className="p-4 border-2 border-black rounded-xl bg-blue-50/20 dark:bg-blue-900/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex flex-col gap-3">
                        
                        {/* Person Header (The Parent) */}
                        <div className="flex items-center justify-between border-b-2 border-black/10 pb-3">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-sm font-black text-gray-900 dark:text-gray-100">{displayBudeeName}</p>
                              <span className="text-[9px] font-black px-2 py-0.5 bg-blue-100 border border-black text-blue-600 rounded inline-block mt-1 uppercase">Budee Account</span>
                            </div>
                          </div>
                          <div className="text-right">
                             <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Owed</p>
                             <p className="text-sm font-black text-blue-600">{formatCurrency(budeeTotal)}</p>
                          </div>
                        </div>

                        {/* TO PAY SECTION */}
                        {toPayItems.length > 0 && (
                          <div className="flex flex-col gap-2 pl-4 md:pl-12">
                            {toPayItems.map(inst => renderItem(inst, false))}
                          </div>
                        )}

                        {/* TO COLLECT SECTION */}
                        {toCollectItems.length > 0 && (
                          <div className="flex flex-col gap-2 pl-4 md:pl-12 mt-2 border-t-2 border-dashed border-emerald-200/50 pt-3">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600">To Collect</h4>
                              <span className="text-xs font-black text-emerald-600">{formatCurrency(collectTotal)}</span>
                            </div>
                            {toCollectItems.map(inst => renderItem(inst, true))}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              );
            })()}



                      {/* Render Standard Flexi/Loan Items */}
          {!((cat.name === 'Credit' || cat.name === 'Budee') && items.length === 0) && (
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

{cat.name === 'Loans' && relevantInstallments.length > 0 && relevantInstallments.filter((installment) => {
  const dueDay = installment.dueDate || installment.due_date || 1;
  return getAccountPeriodIndex({ dueDate: dueDay }) === activePeriodIndex;
}).map((installment) => {



  // 🛡️ RESTORED VARIABLES:
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
                                    transactionType: 'payment'
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
                        <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50">
                          <th className="p-4 pl-10 text-center w-16">Include</th>
                          <th className="p-4">Name</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4 text-center">Due</th>
                          <th className="p-4 text-center">Status</th>
                          <th className="p-4 pr-10 text-center">Actions</th>
                        </tr>
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
                              
                              {/* 1. INCLUDE */}
                              <td className="p-4 pl-10 text-center">
                                <button 
                                  disabled={isReadOnly}
                                  onClick={() => !isReadOnly && handleSetupToggle(cat.name, item.id)} 
                                  className={`w-8 h-8 rounded-xl border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center mx-auto shrink-0 
                                    ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-transparent border-gray-200'}
                                    ${isReadOnly ? 'cursor-not-allowed opacity-50 shadow-none hover:translate-x-0 hover:translate-y-0' : 'hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'}`}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </td>
                
                              {/* 2. NAME */}
                              <td className="p-4">
                                <div className="flex flex-col items-start gap-1 w-full">
                                  <input 
                                    type="text" 
                                    value={item.name} 
                                    onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} 
                                    disabled={isReadOnly} 
                                    className="bg-transparent border-none text-sm font-bold w-full outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded p-1 dark:text-gray-100" 
                                  />
                                  {isBillerItem && <span className="text-[9px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded uppercase ml-1">Biller</span>}
                                </div>
                              </td>

                
                              {/* 3. AMOUNT */}
                              {/* 3. AMOUNT */}
<td className="p-4">
  <div className="flex items-center space-x-1">
    <span className="text-gray-400 dark:text-gray-500 font-bold">₱</span>
    <input 
      type="number" 
      // 🟢 Add the fallback to item.amount here!
      value={item.amountsByPeriod?.[activePeriodIndex] || item.amount || ''} 
      onChange={(e) => handleAmountUpdate(cat.name, item.id, activePeriodIndex, e.target.value)} 
      onFocus={() => { isFocusedRef.current = true; }} 
      onBlur={() => { isFocusedRef.current = false; }} 
      disabled={isReadOnly} 
      className="bg-transparent border-none text-sm font-black w-24 outline-none dark:text-gray-100" 
    />
  </div>
</td>


                
                              {/* 4. DUE */}
                              <td className="p-4 text-center">
                                  {isBillerItem && linkedBiller?.dueDate ? (
                                  <span className="text-[10px] font-black bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                                  {formatDueDate(linkedBiller.dueDate)}
                                  </span>
                                  ) : (
                                  <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                  )}
                              </td>
                
                              {/* 5. STATUS */}
                              <td className="p-4 text-center">
                                {isPaid ? (
                                  <span className="text-[9px] font-black px-2 py-1 bg-green-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">Paid</span>
                                ) : isPartial ? (
                                  <span className="text-[9px] font-black px-2 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase" title={paymentSchedule ? `Paid ₱${paymentSchedule.amount_paid} of ₱${parseFloat(item.amount)}` : 'Partial Payment'}>Partial</span>
                                ) : (
                                  <span className="text-[9px] font-black px-2 py-1 bg-red-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">Unpaid</span>
                                )}
                              </td>
                
                              {/* 6. ACTIONS */}
                              <td className="p-4 pr-10">
                                <div className="flex items-center justify-end space-x-2 min-w-[120px]">
                                  
                                  {/* Info Icon (Sticker Theme) */}
                                  <button 
                                    disabled={!paymentSchedule}
                                    onClick={() => paymentSchedule && openSchedulePaymentsModal(paymentSchedule.id, `${item.name} - ${selectedMonth}`)} 
                                    title={paymentSchedule ? "View payment records" : "No payment records"} 
                                    className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
                                      paymentSchedule 
                                        ? 'bg-white dark:bg-gray-800 text-indigo-600 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]' 
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none'
                                    }`}
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                
                                  {/* Pay Button - Biller */}
                                  {isBillerItem ? (
                                    <button 
                                      disabled={isPaid || isReadOnly}
                                      onClick={() => { 
                                        if(!isPaid && !isReadOnly && linkedBiller && paymentSchedule) {
                                          const scheduleForModal = {
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
                                      className={`w-14 h-8 px-2 flex items-center justify-center text-[10px] font-black uppercase rounded-xl border-2 transition-all shrink-0 ${
                                        isPaid 
                                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none' 
                                          : 'bg-indigo-600 text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                                      }`}
                                    >
                                      Pay
                                    </button>
                                  ) : (cat.flexiMode ?? true) ? (
                                    /* Pay Button - Standard Flexi */
                                    <button
                                      disabled={isPaid || isReadOnly || item.name === 'New Item' || parseFloat(item.amount) <= 0}
                                      onClick={() => {
                                        if (!isPaid && !isReadOnly && item.name !== 'New Item' && parseFloat(item.amount) > 0) {
                                          setTransactionFormData({ id: '', name: item.name, date: getTodayIso(), amount: item.amount, accountId: accounts[0]?.id || '', paymentScheduleId: '', transactionType: 'cash_out' });
                                          setShowTransactionModal(true);
                                        }
                                      }}
                                      className={`w-14 h-8 px-2 flex items-center justify-center text-[10px] font-black uppercase rounded-xl border-2 transition-all shrink-0 ${
                                        (isPaid || item.name === 'New Item' || parseFloat(item.amount) <= 0)
                                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none' 
                                          : 'bg-indigo-600 text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                                      }`}
                                    >
                                      Pay
                                    </button>
                                  ) : (
                                     <div className="w-14 shrink-0"></div>
                                  )}
                
                                  {/* Trash Icon (Sticker Theme) */}
                                  <button 
                                    disabled={isReadOnly}
                                    onClick={() => !isReadOnly && removeItemFromCategory(cat.name, item.id, item.name)} 
                                    title="Exclude Item" 
                                    className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
                                      !isReadOnly 
                                        ? 'bg-white dark:bg-gray-800 text-red-500 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-red-50 dark:hover:bg-red-900/20' 
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none'
                                    }`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }) : (cat.name === 'Loans' && relevantInstallments.length > 0) ? null : <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-sm font-medium">No items yet. Click "Add Item" below to get started.</td></tr>}
                        
                      
                        {/* --- INSTALLMENTS --- */}
{cat.name === 'Loans' && relevantInstallments.length > 0 && relevantInstallments.filter((installment) => {  if (installment.timing === '1/2') return activePeriodIndex === 1;
  if (installment.timing === '2/2') return activePeriodIndex === 2;
  const dueDay = installment.dueDate || installment.due_date || 1;
return getAccountPeriodIndex({ dueDate: dueDay }) === activePeriodIndex;
}).map((installment) => {
  // 🛡️ RESTORED VARIABLES:
  const isIncluded = !excludedInstallmentIds.has(installment.id);
  let isPaid = false, isPartial = false;
  const installmentSchedule = getPaymentSchedule('installment', installment.id, selectedMonth, selectedYear);
  if (installmentSchedule) {
    isPaid = checkIfPaidBySchedule('installment', installment.id);
    isPartial = checkIfPartialBySchedule('installment', installment.id);
  }

  return (
    <tr key={`installment-${installment.id}`} className={`${isIncluded ? 'bg-blue-50/30 dark:bg-blue-900/10' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>

                              
                              {/* 1. INCLUDE */}
                              <td className="p-4 pl-10 text-center">
                                <button 
                                  disabled={isReadOnly}
                                  onClick={() => !isReadOnly && setExcludedInstallmentIds(prev => { const next = new Set(prev); if(next.has(installment.id)) next.delete(installment.id); else next.add(installment.id); return next; })} 
                                  className={`w-8 h-8 rounded-xl border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center mx-auto shrink-0
                                    ${isIncluded ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-transparent border-gray-200'}
                                    ${isReadOnly ? 'cursor-not-allowed opacity-50 shadow-none hover:translate-x-0 hover:translate-y-0' : 'hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'}`}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </td>
                
                              {/* 2. NAME (Badge stacked underneath) */}
                              <td className="p-4">
                                <div className="flex flex-col items-start gap-1 w-full">
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-full truncate p-1">{installment.name}</span>
                                  <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded uppercase ml-1">INSTALLMENT</span>
                                </div>
                              </td>
                
                              {/* 3. AMOUNT */}
                              <td className="p-4 text-sm font-black">{formatCurrency(installment.monthlyAmount)}</td>
                              
                              {/* 4. DUE DATE */}
                              <td className="p-4 text-center">
                                  {installment.dueDate || installment.due_date ? (
                              <span className="text-[10px] font-black bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                              {formatDueDate(installment.dueDate || installment.due_date)}
                              </span>
                          ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                )}
                            </td>
                              {/* 5. STATUS */}
                              <td className="p-4 text-center">
                                {isPaid ? (
                                  <span className="text-[9px] font-black px-2 py-1 bg-green-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">Paid</span>
                                ) : isPartial ? (
                                  <span className="text-[9px] font-black px-2 py-1 bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">Partial</span>
                                ) : (
                                  <span className="text-[9px] font-black px-2 py-1 bg-red-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">Unpaid</span>
                                )}
                              </td>
                
                              {/* 6. ACTIONS */}
                              <td className="p-4 pr-10">
                                <div className="flex items-center justify-end space-x-2 min-w-[120px]">
                                  
                                  {/* Info Icon (Sticker Theme) */}
                                  <button 
                                    disabled={!installmentSchedule}
                                    onClick={() => installmentSchedule && openSchedulePaymentsModal(installmentSchedule.id, `${installment.name} - ${selectedMonth}`)} 
                                    title={installmentSchedule ? "View payment records" : "No payment records"} 
                                    className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
                                      installmentSchedule 
                                        ? 'bg-white dark:bg-gray-800 text-indigo-600 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]' 
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none'
                                    }`}
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                
                                  {/* Pay Button */}
                                  <button 
                                    disabled={isPaid || isReadOnly}
                                    onClick={() => {
                                      if (!isPaid && !isReadOnly) {
                                        setTransactionFormData({ id: '', name: `${installment.name} - ${selectedMonth} ${new Date().getFullYear()}`, date: getTodayIso(), amount: isPartial && installmentSchedule ? Math.max(0, installmentSchedule.expected_amount - installmentSchedule.amount_paid).toFixed(2) : installment.monthlyAmount.toFixed(2), accountId: installment.accountId || accounts[0]?.id || '', paymentScheduleId: installmentSchedule?.id || '', transactionType: 'payment' });
                                        setShowTransactionModal(true);
                                      }
                                    }}
                                    className={`w-14 h-8 px-2 flex items-center justify-center text-[10px] font-black uppercase rounded-xl border-2 transition-all shrink-0 ${
                                      isPaid 
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none' 
                                        : 'bg-indigo-600 text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]'
                                    }`}
                                  >
                                    Pay
                                  </button>
                
                                  {/* Trash Icon (Sticker Theme) */}
                                  <button 
                                    disabled={isReadOnly}
                                    onClick={() => !isReadOnly && setConfirmModal({ show: true, title: 'Exclude Installment', message: `Exclude "${installment.name}"?`, onConfirm: () => { setExcludedInstallmentIds(prev => new Set([...prev, installment.id])); setConfirmModal(p => ({...p, show: false})); } })} 
                                    title="Exclude Installment" 
                                    className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-all shrink-0 ${
                                      !isReadOnly 
                                        ? 'bg-white dark:bg-gray-800 text-red-500 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-red-50 dark:hover:bg-red-900/20' 
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 cursor-not-allowed shadow-none'
                                    }`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                  </button>
                                </div>
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
                            )}
                                      
                
          </div>
        );
      })}

{(() => {
          // 🟢 Bulletproof filter ensures we only map actual Credit accounts
          const creditCardAccounts = (accounts || []).filter(acc => 
            (acc.type === 'Credit' || acc.classification === 'Credit Card')
          );
          
          if (creditCardAccounts.length === 0) return null;
          const monthIndex = MONTHS.indexOf(selectedMonth);
          const currentYear = new Date().getFullYear();

          return creditCardAccounts.map(account => {
            try {
              // 🟢 Safe aggregator call: Falls back to empty array if undefined
              const cycleSummaries = typeof aggregateCreditCardPurchases === 'function' 
                ? aggregateCreditCardPurchases(account, transactions || [], installments || []) 
                : [];
                
              const relevantCycle = (cycleSummaries || []).find(cycle => {
                if (!cycle || !cycle.cycleStart || !cycle.cycleEnd) return false;
                const cycleMonth = cycle.cycleStart.getMonth();
                const cycleYear = cycle.cycleStart.getFullYear();
                return (cycleMonth === monthIndex && cycleYear === currentYear) || 
                       (cycle.cycleEnd.getMonth() === monthIndex && cycle.cycleEnd.getFullYear() === currentYear);
              });

              // 🟢 Safety check to ensure transactions exist before rendering the table
              if (!relevantCycle || !relevantCycle.transactions || relevantCycle.transactionCount === 0) return null;
              
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
                        <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-50 dark:border-gray-800/50">
                          <th className="p-4 pl-10">Transaction</th>
                          <th className="p-4">Date</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4 pr-10 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                        {(relevantCycle.transactions || []).map((tx) => {
                          try {
                            const safeAmount = Number(tx?.amount || 0).toFixed(2);
                            const safeDateStr = tx?.date ? String(tx.date).split('T')[0] : getTodayIso();
                            const displayDate = tx?.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                            const safeName = tx?.name || 'Unnamed Transaction';

                            return (
                              <tr key={tx.id} className="bg-purple-50/20 dark:bg-purple-900/10">
                                <td className="p-4 pl-10"><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{safeName}</span></td>
                                <td className="p-4"><span className="text-xs text-gray-500 font-medium">{displayDate}</span></td>
                                <td className="p-4 text-sm font-black">₱ {safeAmount}</td>
                                <td className="p-4 pr-10 text-right">
                                  <button
                                    onClick={() => {
                                      setTransactionFormData({ id: tx.id, name: safeName, date: safeDateStr, amount: safeAmount, accountId: tx.payment_method_id, paymentScheduleId: tx.payment_schedule_id || '', transactionType: 'cash_out' });
                                      setShowTransactionModal(true);
                                    }}
                                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-2 border-black bg-white px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          } catch (e) {
                            return null;
                          }
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            } catch (e) {
              console.warn("Skipping rendering for credit card table due to missing cycle data.");
              return null;
            }
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
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Source Account <span className="text-red-500">*</span></label>
                <select
                  value={fundForm.sourceAccountId}
                  onChange={e => setFundForm(f => ({ ...f, sourceAccountId: e.target.value }))}
                  required
                  className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-100 outline-none"
                >
                  {accounts.filter(a => a.type === 'Debit').map(account => (
                    <option key={account.id} value={account.id}>
                      {account.bank} ({account.classification})
                    </option>
                  ))}
                </select>
              </div>
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
        const legacyTopUps = topUps.filter(isLegacyStashTopUp);
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
              {legacyTopUps.length > 0 && (
                <div className="mb-4 rounded-xl border-2 border-black bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Historical Repair Needed</p>
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    {legacyTopUps.length} older stash top-up{legacyTopUps.length === 1 ? '' : 's'} still use the old math format. Repair them below to fix account balance history.
                  </p>
                </div>
              )}
              <h3 className="text-[9px] font-black text-gray-400 tracking-widest uppercase mb-2">Top-ups this month</h3>
              {topUps.length === 0 ? <p className="text-xs text-gray-400 italic py-2 text-center">No top-ups found.</p> : (
                <div className="space-y-2">
                  {topUps.map(tx => (
                    <div key={tx.id} className="bg-gray-50 border-2 border-black rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-gray-900">{tx.name}</p>
                        <p className="text-[10px] text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
                        {isLegacyStashTopUp(tx) && (
                          <span className="mt-1 inline-flex rounded-lg border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700">
                            Legacy Format
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-indigo-600">{formatCurrency(Math.abs(tx.amount))}</span>
                        {isLegacyStashTopUp(tx) && (
                          <button
                            type="button"
                            onClick={() => handleOpenStashRepairModal(stashInfoModal.wallet, tx)}
                            className="rounded-lg border-2 border-black bg-amber-100 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-700 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px]"
                          >
                            Repair
                          </button>
                        )}
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

      {stashRepairModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setStashRepairModal(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setStashRepairModal(null)} className="absolute top-4 right-4 text-gray-400 p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4">
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Repair Stash Top-up</h2>
              <p className="mt-1 text-xs font-medium text-gray-500">
                Convert this older stash record into the new source-account outflow format.
              </p>
            </div>
            <div className="mb-4 rounded-xl border-2 border-black bg-gray-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Transaction</p>
              <p className="mt-1 text-sm font-black text-gray-900 dark:text-gray-100">{stashRepairModal.tx.name}</p>
              <p className="mt-1 text-xs font-bold text-indigo-600">{formatCurrency(Math.abs(stashRepairModal.tx.amount))}</p>
            </div>
            <form onSubmit={handleRepairStashTopUp} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Correct Source Account <span className="text-red-500">*</span></label>
                <select
                  value={stashRepairForm.sourceAccountId}
                  onChange={e => setStashRepairForm({ sourceAccountId: e.target.value })}
                  required
                  className="w-full bg-white dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-100 outline-none"
                >
                  {accounts.filter(a => a.type === 'Debit').map(account => (
                    <option key={account.id} value={account.id}>
                      {account.bank} ({account.classification})
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border-2 border-black bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">What This Does</p>
                <p className="mt-1 text-xs font-medium text-amber-800">
                  This changes the old negative cash-in record into a normal stash funding outflow so account balances recalculate correctly.
                </p>
              </div>
              <div className="flex flex-col space-y-2 pt-1">
                <button type="submit" disabled={stashRepairSubmitting} className="w-full bg-amber-500 text-white border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
                  {stashRepairSubmitting ? 'Repairing…' : 'Repair Top-up'}
                </button>
                <button type="button" onClick={() => setStashRepairModal(null)} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 border-2 border-black py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

{showIncomeRecordsModal && (
  <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowIncomeRecordsModal(false)}>
    <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-sm p-6 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setShowIncomeRecordsModal(false)} className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-0.5">Income</h2>
          <p className="text-gray-500 text-xs">{selectedMonth} {selectedYear}</p>
        </div>
        <button 
          type="button" 
          onClick={() => { 
            setShowIncomeRecordsModal(false); 
            const debitAccounts = accounts.filter(a => a.type === 'Debit'); 
            setSalaryFormData({ name: 'Income', amount: '', date: getTodayIso(), accountId: debitAccounts[0]?.id || '' }); 
            setShowSalaryModal(true); 
          }} 
          className="flex items-center gap-1 bg-indigo-50 border-2 border-black text-indigo-600 px-2.5 py-1.5 rounded-xl font-bold shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[0.5px] hover:translate-y-[0.5px] transition-all text-xs"
        >
          <Plus className="w-3.5 h-3.5" />Add
        </button>
      </div>
      {(!allIncomeTxs || allIncomeTxs.filter(Boolean).length === 0) ? (
        <div className="text-center py-6 text-gray-400 text-xs italic">No income records found.</div>
      ) : (
        <div className="space-y-3">
          {allIncomeTxs.filter(Boolean).map(tx => {
            if (!tx || !tx.id) return null;
            const pmName = accounts?.find(a => a?.id === tx?.payment_method_id)?.bank || tx?.payment_method_id || 'Unknown';
            const displayDate = tx?.date ? new Date(tx.date).toLocaleDateString() : 'No Date';
            const displayName = tx?.name || 'Income Record';
            const displayAmount = formatCurrency(Math.abs(tx?.amount || 0));

            return (
              <div key={tx.id} className="bg-gray-50 dark:bg-gray-800/50 border-2 border-black rounded-xl p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
                    <p className="text-[10px] text-gray-500 truncate">{pmName} • {displayDate}</p>
                  </div>
                  <span className="text-xs font-black text-green-600 ml-2">{displayAmount}</span>
                </div>
                <div className="flex justify-end pt-1">
                  <PinProtectedAction 
                    featureId="transaction_deletions" 
                    onVerified={async () => { 
                      try { 
                        const { error } = await deleteTransactionAndRevertSchedule(tx.id); 
                        if (error) throw error; 
                        if (displayName.trim().toLowerCase() === 'salary') setActualSalary(''); 
                        await reloadTransactions(); 
                        if (onTransactionDeleted) onTransactionDeleted(); 
                      } catch (e) { 
                        console.error(e);
                        alert('Error deleting transaction.'); 
                      } 
                    }} 
                    actionLabel="Delete Record"
                  >
                    <button type="button" onClick={(e) => e.preventDefault()} className="text-[9px] font-black text-red-500 border-2 border-black bg-white px-2 py-0.5 rounded-lg shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none">Delete</button>
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

{showSalaryModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowSalaryModal(false)}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-sm p-6 relative transition-colors" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSalaryModal(false)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-4">Record Income</h2>
            <form onSubmit={handleSalaryCashIn} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input required type="number" min="0" step="0.01" value={salaryFormData.amount} onChange={(e) => setSalaryFormData({...salaryFormData, amount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 pl-7 outline-none text-base font-black dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</label>
                  <input required type="date" value={salaryFormData.date} onChange={(e) => setSalaryFormData({...salaryFormData, date: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Account</label>
                  <select value={salaryFormData.accountId} onChange={(e) => setSalaryFormData({...salaryFormData, accountId: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100">
                    {accounts.filter(a => a.type === 'Debit').map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowSalaryModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-black py-2.5 rounded-xl font-black text-xs text-gray-500 uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}


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
                    onClick={confirmFundDespiteOverdraft}
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

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}

      {showCreditPayModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in zoom-in-95">
            <button onClick={() => setShowCreditPayModal(null)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">Pay {showCreditPayModal.bank}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">Recording credit payment for {selectedMonth}</p>
            
            <form               onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const amount = parseFloat(formData.get('amount') as string);
                const date = formData.get('date') as string;
                const sourceAccountId = formData.get('sourceAccountId') as string;

                try {
                  const { data: debitTx, error: debitError } = await createTransaction({
                    name: `${showCreditPayModal.bank} Payment - ${selectedMonth}`,
                    amount: Math.abs(amount),
                    date: combineDateWithCurrentTime(date),
                    payment_method_id: sourceAccountId,
                    transaction_type: 'payment',
                    notes: `Budget Timing: ${selectedTiming}`
                  } as any);

                  if (debitError) throw debitError;

                  const { error: creditError } = await createTransaction({
                    name: `${showCreditPayModal.bank} Payment - ${selectedMonth}`,
                    amount: -Math.abs(amount),
                    date: combineDateWithCurrentTime(date),
                    payment_method_id: showCreditPayModal.accountId,
                    transaction_type: 'credit_payment',
                    related_transaction_id: debitTx?.id,
                    notes: `Budget Timing: ${selectedTiming}`
                  } as any);

                  if (creditError) {
                    await recordCreditPayment(
                      showCreditPayModal.accountId,
                      amount,
                      `${showCreditPayModal.bank} Payment - ${selectedMonth}`,
                      date
                    );
                  }
                  
                  await reloadTransactions();
                  if (onTransactionCreated) onTransactionCreated();
                  
                  const targetAccount = accounts.find(a => a.id === showCreditPayModal.accountId);
                  const cycleRem = getRemainingCycleAmount(targetAccount!) - amountValue;

                  setShowCreditPayModal(null);

                  // 🟢 TRIGGER ROLLOVER PROMPT IF PARTIAL
                  if (cycleRem > 0) {
                    setRolloverPrompt({
                      show: true,
                      accountId: showCreditPayModal.accountId,
                      accountName: showCreditPayModal.bank,
                      remainingBalance: cycleRem,
                      interestRate: targetAccount?.interestRate || 3
                    });
                  } else {
                    alert('Payment recorded successfully!');
                  }
                } catch (err) {
                  console.error("Credit Payment Error:", err);
                  alert('Failed to record payment. Check console for details.');
                }
              }}
 className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                <input required name="amount" type="number" step="0.01" defaultValue={showCreditPayModal.amount.toFixed(2)} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-base font-black dark:text-gray-100" />
              </div>
              
              {/* 🟢 NEW: Source Account Field */}
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Pay From (Source Account)</label>
                <select required name="sourceAccountId" defaultValue={accounts.find(a => a.type === 'Debit')?.id || ''} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2.5 outline-none font-bold text-sm dark:text-gray-100">
                  {accounts.filter(a => a.type === 'Debit').map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</label>
                <input required name="date" type="date" defaultValue={getTodayIso()} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2 outline-none font-bold text-xs dark:text-gray-100" />
              </div>

              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setShowCreditPayModal(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-black py-2.5 rounded-xl font-black text-xs text-gray-500 uppercase tracking-wider hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">Pay</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {creditInfoModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setCreditInfoModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in zoom-in-95 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setCreditInfoModal(null)} className="absolute right-4 top-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">{creditInfoModal.account.bank}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">Payment History — {selectedMonth} {selectedYear}</p>
            
            <div className="space-y-2">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-black mb-4">
                <div className="flex justify-between items-center mb-2 pb-2 border-b-2 border-black/10">
                  <p className="text-[10px] font-black text-purple-700 uppercase">Frozen Target</p>
                  <p className="text-sm font-black text-purple-700">{formatCurrency(getFrozenCycleAmount(creditInfoModal.account))}</p>
                </div>
                <div className="flex justify-between items-center mb-2 pb-2 border-b-2 border-black/10">
                  <p className="text-[10px] font-black text-purple-700 uppercase">Remaining to Pay</p>
                  <p className="text-sm font-black text-purple-700">{formatCurrency(getRemainingCycleAmount(creditInfoModal.account))}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-gray-500 uppercase">Total Live Balance</p>
                  <p className="text-lg font-black text-gray-500">{formatCurrency(calculateCurrentBalance(creditInfoModal.account))}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Recent Payments</p>
                {transactions
                  .filter(tx => tx.payment_method_id === creditInfoModal.account.id && tx.transaction_type === 'credit_payment' && new Date(tx.date).getMonth() === MONTHS.indexOf(selectedMonth) && new Date(tx.date).getFullYear() === selectedYear)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(tx => (
                    <div key={tx.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-black/10">
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{tx.name}</p>
                        <p className="text-[10px] text-gray-500">{new Date(tx.date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-black text-red-600">{formatCurrency(Math.abs(tx.amount))}</span>
                        <PinProtectedAction featureId="transaction_deletions" onVerified={async () => { try { await deleteTransactionAndRevertSchedule(tx.id); await reloadTransactions(); if (onTransactionDeleted) onTransactionDeleted(); } catch { alert('Error.'); } }} actionLabel="Delete Record">
                          <button onClick={(e) => e.preventDefault()} className="text-gray-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                        </PinProtectedAction>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Rollover Prompt Modal for Budget Page */}
      {rolloverPrompt.show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#fff7e8] dark:bg-gray-900 rounded-[2rem] border-[4px] border-black w-full max-w-md p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative flex flex-col text-center">
            
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-[3px] border-black bg-purple-200 text-purple-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-2xl font-black">💸</span>
            </div>
            
            <h2 className="mb-2 text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-gray-100">
              Partial Payment Detected
            </h2>
            
            <p className="mb-6 text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-400">
              You still have a remaining balance of <strong className="text-red-600 dark:text-red-400">{formatCurrency(rolloverPrompt.remainingBalance)}</strong> on your {rolloverPrompt.accountName}. Would you like to roll this over and apply the monthly finance charge?
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
            <button 
                onClick={() => {
                  localStorage.setItem(`pending_rollover_${rolloverPrompt.accountId}`, JSON.stringify({
                    remainingBalance: rolloverPrompt.remainingBalance,
                    interestRate: rolloverPrompt.interestRate, // 🟢 ADD THIS LINE
                    timestamp: new Date().toISOString()
                  }));
                  setRolloverPrompt(prev => ({ ...prev, show: false }));
                }}
                className="flex-1 rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800 py-4 text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
              >
                Later
              </button>

              
              <button 
                onClick={async () => {
                  const interestAmount = rolloverPrompt.remainingBalance * (rolloverPrompt.interestRate / 100);
                  
                  await createTransaction({
                    name: 'Finance Charge (Interest)',
                    date: combineDateWithCurrentTime(getTodayIso()),
                    amount: interestAmount,
                    payment_method_id: rolloverPrompt.accountId,
                    transaction_type: 'payment',
                    notes: 'Automated rollover finance charge'
                  } as any);

                  localStorage.removeItem(`pending_rollover_${rolloverPrompt.accountId}`);
                  setRolloverPrompt(prev => ({ ...prev, show: false }));
                  await reloadTransactions();
                }}
                className="flex-1 rounded-2xl border-[3px] border-black bg-purple-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
              >
                Yep!
              </button>
            </div>
          </div>
        </div>
      )}


    </div> // This closes the main div for the Budget component
  );
}; // This closes the Budget component

// Separate component definition
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

