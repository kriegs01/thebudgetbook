import React, { useState, useRef, useEffect } from 'react';
import { Account, BudgetItem, Installment, Transaction, SavedBudgetSetup } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList } from 'recharts';
import { TrendingUp, TrendingDown, Landmark, ArrowUpRight, CreditCard, Wallet, Calendar, Trophy, Medal, CalendarClock, AlertCircle, ChevronRight, Settings, X, ChevronDown, Plus, Sparkles, Tag} from 'lucide-react';
import type { SupabaseUserProfile } from '../src/types/supabase';
import { useTheme } from '../src/contexts/ThemeContext';
import { DashboardHeader } from '../DashboardHeader';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { generateCreditBuckets } from '../src/utils/bucketEngine';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/utils/supabaseClient';



interface DashboardProps {
  accounts: Account[];
  budget: BudgetItem[];
  installments: Installment[];
  transactions?: Transaction[];
  budgetSetups?: SavedBudgetSetup[];
  userProfile?: SupabaseUserProfile | null;
  theme?: 'light' | 'dark';
}

interface PeriodProjection {
  period: string;
  shortPeriod: string;
  monthYear: string;
  income: number;
  totalBudget: number;  // Total allocated budget (spending)
  remaining: number;
}

interface MonthlyAverage {
  month: string;
  avgRemaining: number;
}

const Dashboard: React.FC<DashboardProps> = ({ accounts, budget, installments, transactions = [], budgetSetups = [], userProfile, theme }) => {
  const navigate = useNavigate();
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isDarkMode = theme === 'dark';
  const tickColor = isDarkMode ? '#6b7280' : '#94a3b8'; // gray-500 dark, gray-400 light
  const gridColor = isDarkMode ? '#374151' : '#f1f5f9'; // gray-700 dark, gray-100 light
  const tooltipBg = isDarkMode ? '#1f2937' : '#ffffff';
  const tooltipColor = isDarkMode ? '#d1d5db' : '#374151';
  const labelListIncomeColor = isDarkMode ? '#34d399' : '#059669'; // emerald-400 dark, green-700 light
  const labelListBudgetColor = isDarkMode ? '#fcd34d' : '#D97706'; // amber-300 dark, amber-600 light
  const labelListRemainingColor = isDarkMode ? '#93c5fd' : '#2563EB'; // blue-300 dark, blue-600 light

  // NEW: State for date range
  const getCurrentMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  };

  const getNextMonth = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState<string>(getCurrentMonth());
  const [endDate, setEndDate] = useState<string>(getNextMonth(getCurrentMonth()));

 // 🟢 NEW: State for the Zero Balance Accordion
 const [showZeroBalanceCredit, setShowZeroBalanceCredit] = useState(false);

   // 🟢 1. TOTAL ASSETS (Debit only)
   const totalBalance = accounts.filter(a => a.type === 'Debit').reduce((acc, a) => acc + (a.balance || 0), 0);

   // 🟢 2. BUDGET USED (Pulling exactly from your unified Budget setups)
   const currentMonthString = new Date().toLocaleDateString('en-US', { month: 'long' });
   const currentYearNum = new Date().getFullYear();
   const currentMonthSetups = budgetSetups.filter(s => 
     s.month === currentMonthString && parseInt(s.data?._year || currentYearNum.toString()) === currentYearNum
   );
   
   let monthlySpending = 0;
   if (currentMonthSetups.length > 0) {
     const unifiedSetup = currentMonthSetups.find(s => s.timing === 'unified' || s.data?._periodTotals);
     monthlySpending = unifiedSetup ? (unifiedSetup.totalAmount || 0) : currentMonthSetups.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
   }
 
      // 🟢 DUE SOON ACCORDION STATE & ANCHORS
  const [isDueSoonExpanded, setIsDueSoonExpanded] = useState(false);
  const dueSoonRef = useRef<HTMLDivElement>(null);
  const dashboardTopRef = useRef<HTMLDivElement>(null); // New anchor for the top!

  const handleToggleDueSoon = () => {
    setIsDueSoonExpanded((prev) => {
      const nextState = !prev;
      
      setTimeout(() => {
        if (nextState) {
          // If opening, snap down to Due Soon
          dueSoonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // If closing, snap back up to the Cards/Quick Actions!
          dashboardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      
      return nextState;
    });
  };

  


   const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

   // 🟢 HELPER: Calculate True Credit Debt (No Double Counting!)
   const getTrueCreditDebt = (account: Account) => {
     // 1. Total Unpaid Installment Principal (Total Borrowed - Paid Amount)
     const activeInstallments = (installments || []).filter(i => 
       (i.accountId === account.id || i.linkedAccountId === account.id) && !i.isArchived
     );
     const installmentsRemaining = activeInstallments.reduce((sum, i) => 
       sum + Math.max(0, (Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0)), 0
     );
 
     // 2. Active Swipes (Statement Balance MINUS Billed Installments)
     let swipesRemaining = account.openingBalance ?? account.balance ?? 0;
     
     const now = new Date();
     const targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
     const buckets = generateCreditBuckets(account, transactions || [], installments || [], targetDate.getFullYear(), monthNames[targetDate.getMonth()]);
     
     if (buckets.length > 0) {
       const currentBucket = buckets[buckets.length - 1];
       
       // Grab the monthly installments currently sitting inside the statement
       const activeMonthlyInstallmentTotal = (currentBucket.personalBreakdown?.activeInstallments || [])
         .reduce((s:any, i:any) => s + (Number(i.monthlyAmount) || Number(i.amount) || 0), 0);
       
       // Isolate the raw swipes by stripping out the monthly installments
       swipesRemaining = Math.max(0, currentBucket.endingBalance - activeMonthlyInstallmentTotal);
       
       // Fix the "Future Bucket" zero-out to make sure we don't lose past-due debt
       const currentRealMonth = now.getMonth();
       const currentRealYear = now.getFullYear();
       const targetMonthIdx = monthNames.indexOf(currentBucket.targetMonth);
       const isFutureBucket = (currentBucket.targetYear > currentRealYear) || 
                              (currentBucket.targetYear === currentRealYear && targetMonthIdx > currentRealMonth);
 
       if (isFutureBucket && buckets.length > 1) {
           const previousBucket = buckets[buckets.length - 2];
           swipesRemaining += Math.max(0, previousBucket.endingBalance);
       }
     }
 
     // True Debt = (All Unpaid Installment Principal) + (All Unpaid Swipes & Past Due Debt)
     return installmentsRemaining + swipesRemaining;
   };
 



  // 🟢 3. TOTAL CREDIT DEBT
  const creditAccounts = accounts.filter(a => a.type === 'Credit' || a.classification === 'Credit Card' || a.type === 'Loan' || a.classification === 'Loan');
  const debitAccounts = accounts.filter(a => a.type === 'Debit');

  const totalDebt = creditAccounts.reduce((sum, acc) => sum + getTrueCreditDebt(acc), 0);


 

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  const chartData = [
    { name: 'Mon', spend: 45 },
    { name: 'Tue', spend: 120 },
    { name: 'Wed', spend: 300 },
    { name: 'Thu', spend: 90 },
    { name: 'Fri', spend: 200 },
    { name: 'Sat', spend: 500 },
    { name: 'Sun', spend: 150 },
  ];

  const COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'];

  const categoryData = budget.reduce((acc: any[], item) => {
    const existing = acc.find(a => a.name === item.category);
    if (existing) existing.value += item.amount;
    else acc.push({ name: item.category, value: item.amount });
    return acc;
  }, []);

  // Helper: Get income from setup
  // Priority: _actualSalary (if entered) > _projectedSalary > 0
  // When actual salary is received, it will automatically replace the projected salary
  const getSetupIncome = (setup: SavedBudgetSetup) => {
    const actualSalary = setup.data._actualSalary;
    const projectedSalary = setup.data._projectedSalary;
    
    // Prioritize actual salary over projected
    if (actualSalary && actualSalary.trim() !== '') {
      return parseFloat(actualSalary) || 0;
    } else if (projectedSalary && projectedSalary.trim() !== '') {
      return parseFloat(projectedSalary) || 0;
    }
    return 0;
  };

  // Helper: Get total budget from setup
  // Uses the totalAmount field which equals grandTotal from Budget page calculation
  // This field includes all budget items AND installments (after the installments fix)
  const getSetupTotalBudget = (setup: SavedBudgetSetup): number => {
    return setup.totalAmount || 0;
  };

  // Main calculation: Get period projections
  const calculatePeriodProjections = (): PeriodProjection[] => {
    const [startYear, startMonth] = startDate.split('-').map(Number);
    const [endYear, endMonth] = endDate.split('-').map(Number);
    const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
    
    if (monthsDiff < 0) return [];
    
    const projections: PeriodProjection[] = [];
    
    for (let i = 0; i <= monthsDiff; i++) {
      const projectedDate = new Date(startYear, startMonth - 1 + i, 1);
      const month = projectedDate.toLocaleDateString('en-US', { month: 'long' });
      const monthShort = projectedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const monthReallyShort = projectedDate.toLocaleDateString('en-US', { month: 'short' });
      
      const setup1_2 = budgetSetups.find(s => s.month === month && s.timing === '1/2');
      const setup2_2 = budgetSetups.find(s => s.month === month && s.timing === '2/2');
      
      if (setup1_2) {
        const income = getSetupIncome(setup1_2);
        const totalBudget = getSetupTotalBudget(setup1_2);
        projections.push({
          period: `${monthShort} - 1/2`,
          shortPeriod: `${monthReallyShort} - 1/2`,
          monthYear: monthShort,
          income,
          totalBudget,
          remaining: income - totalBudget
        });
      }
      
      if (setup2_2) {
        const income = getSetupIncome(setup2_2);
        const totalBudget = getSetupTotalBudget(setup2_2);
        projections.push({
          period: `${monthShort} - 2/2`,
          shortPeriod: `${monthReallyShort} - 2/2`,
          monthYear: monthShort,
          income,
          totalBudget,
          remaining: income - totalBudget
        });
      }
    }
    
    return projections;
  };

  // Calculate monthly averages
  const calculateMonthlyAverages = (periodProjections: PeriodProjection[]): MonthlyAverage[] => {
    const monthGroups = new Map<string, PeriodProjection[]>();
    
    periodProjections.forEach(p => {
      if (!monthGroups.has(p.monthYear)) {
        monthGroups.set(p.monthYear, []);
      }
      monthGroups.get(p.monthYear)!.push(p);
    });
    
    const averages: MonthlyAverage[] = [];
    monthGroups.forEach((periods, monthYear) => {
      const avgRemaining = periods.reduce((sum, p) => sum + p.remaining, 0) / periods.length;
      averages.push({
        month: monthYear,
        avgRemaining
      });
    });
    
    return averages;
  };

  const periodProjections = calculatePeriodProjections();
  const monthlyAverages = calculateMonthlyAverages(periodProjections);

  // Debug logging in development only
  if (import.meta.env.DEV && periodProjections.length > 0) {
    console.log('[Dashboard] Budget Projections Data:', periodProjections);
  }

  // Statistics for cards
  const avgPeriodRemaining = periodProjections.length > 0
    ? periodProjections.reduce((sum, p) => sum + p.remaining, 0) / periodProjections.length
    : 0;

  const avgMonthlyRemaining = monthlyAverages.length > 0
    ? monthlyAverages.reduce((sum, m) => sum + m.avgRemaining, 0) / monthlyAverages.length
    : 0;

  const bestMonth = monthlyAverages.length > 0
    ? monthlyAverages.reduce((best, m) => m.avgRemaining > best.avgRemaining ? m : best)
    : null;

  const worstMonth = monthlyAverages.length > 0
    ? monthlyAverages.reduce((worst, m) => m.avgRemaining < worst.avgRemaining ? m : worst)
    : null;

     // 🟢 CALCULATE & SORT CREDIT ACCOUNTS BY HIGHEST BALANCE
  const sortedCreditAccounts = creditAccounts.map(account => {
    const creditLimit = account.creditLimit ?? 0;
    
    // Call the engine helper!
    const used = getTrueCreditDebt(account);
    
    const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((used / creditLimit) * 100)) : 0;
    const available = Math.max(0, creditLimit - used);

    return { ...account, used, usedPercent, available, creditLimit };
  }).sort((a, b) => {
    // 🟢 Explicitly cast to numbers to prevent any string-math bugs
    const balanceA = Number(a.used) || 0;
    const balanceB = Number(b.used) || 0;
    
    // Primary Sort: Highest Balance First
    if (balanceB !== balanceA) {
        return balanceB - balanceA; 
    }
    
    // Secondary Sort: Alphabetical if balances are exactly the same
    return String(a.bank || '').localeCompare(String(b.bank || ''));
  });


    // 🟢 CALCULATE UPCOMING DUES RADAR
    const extractDay = (dueInput: string | number | undefined) => {
      if (!dueInput) return null;
      const strInput = String(dueInput);
      if (strInput.includes('-')) {
        const parts = strInput.split('-');
        if (parts.length >= 3) return parseInt(parts[2].substring(0, 2), 10);
      }
      return parseInt(strInput.replace(/\D/g, ''), 10);
    };
  
    const getStandardNextDate = (dueInput: string | number | undefined) => {
      if (!dueInput) return null;
      const today = new Date();
      today.setHours(0,0,0,0);
      
      const strInput = String(dueInput);
      if (strInput.includes('-')) {
        const parsedDate = new Date(strInput);
        if (!isNaN(parsedDate.getTime()) && parsedDate >= today) return parsedDate;
      }
      
      const day = extractDay(dueInput);
      if (!day || isNaN(day) || day < 1 || day > 31) return null;
      
      let nextDate = new Date(today.getFullYear(), today.getMonth(), day);
      if (nextDate < today) nextDate.setMonth(nextDate.getMonth() + 1);
      return nextDate;
    };
  
    const upcomingDues: any[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);
  
    // 1. Scan Active Credit Accounts
    creditAccounts.forEach(acc => {
      // 🟢 Fix 1: Ignore "Loan Bundles" like GLoan (their installments handle themselves!)
      if (acc.subtype === 'Loan_Bundle') return;
  
      const debt = getTrueCreditDebt(acc);
      if (debt <= 0) return;
  
      const statementDay = extractDay(acc.billingDate);
      const gracePeriod = extractDay(acc.dueDate);
      let finalDueDate: Date | null = null;
  
      // 🟢 Fix 2: Calculate True Credit Card Due Dates (Statement Day + Grace Period)
      if (statementDay && gracePeriod) {
        let lastStatement = new Date(today.getFullYear(), today.getMonth(), statementDay);
        if (lastStatement > today) lastStatement.setMonth(lastStatement.getMonth() - 1);
        
        finalDueDate = new Date(lastStatement);
        finalDueDate.setDate(finalDueDate.getDate() + gracePeriod);
        
        // If this cycle's due date already passed, calculate for the next statement!
        if (finalDueDate < today) {
          lastStatement.setMonth(lastStatement.getMonth() + 1);
          finalDueDate = new Date(lastStatement);
          finalDueDate.setDate(finalDueDate.getDate() + gracePeriod);
        }
      } else {
        // Fallback for non-standard credit accounts
        finalDueDate = getStandardNextDate(acc.dueDate);
      }
  
      if (finalDueDate) {
        upcomingDues.push({ id: acc.id, name: acc.bank, type: 'Credit Account', dueDate: finalDueDate, route: '/accounts' });
      }
    });
  
    // 2. Scan Active Installments
    (installments || []).forEach(inst => {
      const remaining = Math.max(0, (Number(inst.totalAmount) || 0) - (Number(inst.paidAmount) || 0));
      if (remaining > 0 && !inst.isArchived && (inst.dueDate || inst.due_date)) {
        upcomingDues.push({ id: inst.id, name: inst.name, type: 'Installment', dueDate: getStandardNextDate(inst.dueDate || inst.due_date), route: '/installments' });
      }
    });
  
    // 3. Scan Budget Billers
    (budget || []).forEach(item => {
      if ((item.dueDate || item.due_date) && item.category !== 'Income') {
        upcomingDues.push({ id: item.id, name: item.name || item.category, type: 'Biller', dueDate: getStandardNextDate(item.dueDate || item.due_date), route: '/billers' });
      }
    });
  
    // Sort by nearest date first, and grab the top 5 most urgent
    const sortedDues = upcomingDues
      .filter(item => item.dueDate !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 5);

      const [isAtTop, setIsAtTop] = useState(true);
      const topSentinelRef = useRef<HTMLDivElement>(null);
    
      useEffect(() => {
        const observer = new IntersectionObserver(
          ([entry]) => {
            setIsAtTop(entry.isIntersecting);
          },
          { threshold: 0.1 }
        );
    
        if (topSentinelRef.current) {
          observer.observe(topSentinelRef.current);
        }
    
        return () => observer.disconnect();
      }, []);
    
  
  // 🟢 DUE SOON: Custom Alert Window State (Synced to DB)
  const [showUrgentSettings, setShowUrgentSettings] = useState(false);
  
  // 1. Pull the initial value directly from their loaded profile (fallback to 3)
  const [urgentThreshold, setUrgentThreshold] = useState<number>(
    userProfile?.urgent_alert_threshold ?? 3
  );

       // 2. Sync to Supabase whenever it changes
  const handleThresholdChange = async (days: number) => {
    // Instantly update the UI
    setUrgentThreshold(days); 

    if (!userProfile?.user_id) {
      console.warn("⚠️ No user_id found in profile!");
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ urgent_alert_threshold: days })
        .eq('user_id', userProfile.user_id) // 🟢 Switched to user_id!
        .select();

      if (error) {
        console.error('❌ Supabase Error syncing threshold:', error.message);
      } else if (!data || data.length === 0) {
        console.warn('⚠️ Supabase executed, but NO ROWS were updated! (This is likely an RLS Policy issue)');
      } else {
        console.log('✅ Successfully synced to DB!', data);
      }
    } catch (err) {
      console.error('❌ Unexpected error saving threshold:', err);
    }
  };

  // 🟢 METRICS CAROUSEL STATE (Mobile)
  const [activeMetricIndex, setActiveMetricIndex] = useState(0);
  const metricScrollRef = useRef<HTMLDivElement>(null);

  const handleMetricScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const cardWidth = container.children[0]?.clientWidth || container.clientWidth;
    const newIndex = Math.round(container.scrollLeft / cardWidth);
    if (newIndex !== activeMetricIndex) {
      setActiveMetricIndex(newIndex);
    }
  };

    // 🟢 AUTO-SCROLL EFFECT FOR METRICS CAROUSEL
    useEffect(() => {
      const container = metricScrollRef.current;
      if (!container) return;
  
      const scrollInterval = setInterval(() => {
        // 1. Don't auto-scroll if we are on a desktop/tablet (grid view)
        if (window.innerWidth >= 768) return;
  
        const cardWidth = container.children[0]?.clientWidth || container.clientWidth;
        const maxScroll = container.scrollWidth - container.clientWidth;
        
        let nextScrollLeft = container.scrollLeft + cardWidth;
        
        // 2. If we reach the end of the carousel, loop back to 0
        if (nextScrollLeft >= maxScroll + 10) {
          nextScrollLeft = 0;
        }
  
        // 3. Perform the smooth swipe
        container.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
      }, 4000); // ⏳ 4000 = 4 seconds per slide
  
      // Clean up the timer if they navigate away from the dashboard
      return () => clearInterval(scrollInterval);
    }, []);
  

  return (
    <div className={`animate-in fade-in duration-500 max-w-7xl mx-auto w-full overflow-hidden ${isMobile ? 'pt-2' : 'pt-2'}`}>
    {/* 🟢 Invisible Top Marker for Scroll Detection */}
    <div ref={topSentinelRef} className="h-1 w-full pointer-events-none" />

    {/* Greeting Header */}
    <DashboardHeader name={userProfile?.first_name || 'Budee User'} />


      {/* Main Content Area */}
      <div className={`space-y-8 pb-24 ${isMobile ? 'px-4' : 'px-8'}`}>
           {/* Top Cards */}
            {/* 🟢 TOP METRICS CAROUSEL (Now with anchor!) */}
            <div ref={dashboardTopRef} className="relative w-full -mt-8 scroll-mt-[100px]">

        <div 
          ref={metricScrollRef}
          onScroll={(e: any) => {
            const container = e.currentTarget;
            const cardWidth = container.children[0]?.clientWidth || container.clientWidth;
            const newIndex = Math.round(container.scrollLeft / cardWidth);
            if (newIndex !== activeMetricIndex) {
              setActiveMetricIndex(newIndex);
            }
          }}
          className="flex md:grid md:grid-cols-3 gap-4 md:gap-8 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 md:mx-0 md:pb-4 md:px-1 md:pr-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          
          {/* Card 1: Total Balance */}
          <div className="w-[85vw] md:w-full shrink-0 snap-center bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 bg-teal-400 border-b-[3px] border-black">
              <h3 className="font-['Titan_One'] text-sm sm:text-base text-black uppercase tracking-widest">Total Balance</h3>
            </div>
            <div className="p-4 sm:p-6 flex-grow flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                  <Landmark className="w-6 h-6 sm:w-8 sm:h-8 text-teal-400" />
                </div>
                <span className="px-3 py-1 bg-green-400 border-2 border-black rounded-xl text-black font-black text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  +2.5%
                </span>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight truncate">
                {formatCurrency(totalBalance)}
              </p>
            </div>
          </div>

          {/* Card 2: Budget Used */}
          <div className="w-[85vw] md:w-full shrink-0 snap-center bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 bg-fuchsia-400 border-b-[3px] border-black">
              <h3 className="font-['Titan_One'] text-sm sm:text-base text-black uppercase tracking-widest">Budget Used</h3>
            </div>
            <div className="p-4 sm:p-6 flex-grow flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                  <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-fuchsia-400" />
                </div>
                <span className="px-3 py-1 bg-amber-400 border-2 border-black rounded-xl text-black font-black text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  +12%
                </span>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight truncate">
                {formatCurrency(monthlySpending)}
              </p>
            </div>
          </div>

          {/* Card 3: Credit Debt */}
          <div className="w-[85vw] md:w-full shrink-0 snap-center bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 bg-amber-400 border-b-[3px] border-black">
              <h3 className="font-['Titan_One'] text-sm sm:text-base text-black uppercase tracking-widest">Credit Debt</h3>
            </div>
            <div className="p-4 sm:p-6 flex-grow flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
                  <TrendingDown className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400" />
                </div>
                <span className="px-3 py-1 bg-green-400 border-2 border-black rounded-xl text-black font-black text-xs sm:text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  -5%
                </span>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight truncate">
                {formatCurrency(totalDebt)}
              </p>
            </div>
          </div>

        </div>

        {/* 🟢 Mobile Dot Indicators */}
        <div className="flex justify-center gap-2 mt-0 md:hidden">
          {[0, 1, 2].map((i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-300 ${
                activeMetricIndex === i 
                  ? 'w-6 bg-black dark:bg-white' 
                  : 'w-2 bg-gray-300 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

                    {/* 🟢 3 QUICK ACTIONS */}
        <div className="grid grid-cols-3 gap-3 !mt-3 !mb-2 px-4 md:px-0">
        {[
          { icon: Plus, label: 'Add Transaction', color: 'bg-[#c4a1ff]', route: '/transactions' },
          { icon: Sparkles, label: 'Crystal Ball', color: 'bg-white', route: '/budget' },
          { icon: Tag, label: 'PriceTag', color: 'bg-white', route: '/scanner' },
        ].map((action, idx) => (
          <button 
            key={idx} 
            onClick={() => {
              // 🟢 FIX: Updated the check to match the exact label string!
              if (action.label === 'Add Transaction') {
                navigate('/transactions', { state: { autoOpenAddTray: true } });
              } else {
                navigate(action.route);
              }
            }}
            className={`flex flex-col items-center justify-center p-2 md:p-3 ${action.color} border-[3px] border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all`}
          >

            <action.icon className="w-6 h-6 md:w-8 md:h-8 text-black mb-1" />
            <span className="font-['Titan_One'] text-[9px] md:text-[11px] text-black tracking-wider uppercase text-center leading-tight">{action.label}</span>
          </button>
        ))}
      </div>

                {/* 🟢 UPCOMING DUE DATES BOX (Collapsible) */}
                {sortedDues.length > 0 && (
          <div 
            ref={dueSoonRef} 
            className={`!mt-6 scroll-mt-[120px] w-full transition-all duration-500 md:!mb-2 ${
              isDueSoonExpanded 
                ? '!mb-[55vh]' 
                : isAtTop 
                  ? '!mb-28' 
                  : '!mb-4'
            }`}
          >

 
            {/* Interactive Header (Restored the slim py-2 px-4 padding!) */}
            <div 
              onClick={handleToggleDueSoon}
              className={`py-2 px-4 md:p-6 bg-orange-400 border-[3px] border-black flex justify-between items-center cursor-pointer transition-all duration-300 ${isDueSoonExpanded ? 'rounded-t-3xl' : 'rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'}`}
            >


              <div className="flex items-center gap-3">
                <div className="flex items-center space-x-2">
                  <CalendarClock className="w-5 h-5 md:w-6 md:h-6 text-black" />
                  <h3 className="font-['Titan_One'] text-lg md:text-xl text-black uppercase tracking-tight">Due Soon</h3>
                </div>
                
                {/* 🔴 THE LIVE COUNT BADGE (Calculates based on urgentThreshold) */}
                <span className="px-2 md:px-3 py-0.5 bg-white border-[2px] border-black rounded-full text-black font-black text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  {sortedDues.filter(item => {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const daysLeft = Math.ceil((item.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return daysLeft <= urgentThreshold;
                  }).length} Urgent
                </span>
              </div>

              <div className="flex items-center gap-1 md:gap-3">
                {/* Settings Gear - stopPropagation prevents opening/closing the accordion */}
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowUrgentSettings(true); }}
                  className="p-1.5 md:p-2 bg-black/10 hover:bg-black/20 rounded-xl transition-colors"
                >
                  <Settings className="w-5 h-5 text-black" />
                </button>
                <ChevronDown className={`w-6 h-6 text-black transition-transform duration-300 ${isDueSoonExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* The Expandable Content Area */}
            <div 
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                isDueSoonExpanded 
                  ? 'max-h-[2000px] opacity-100 border-x-[3px] border-b-[3px] border-black rounded-b-3xl bg-white dark:bg-gray-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' 
                  : 'max-h-0 opacity-0 border-x-0 border-b-0 border-transparent'
              }`}
            >
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {/* Your perfectly customized mapping function stays exactly the same! */}
                {sortedDues.map((item, i) => {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const daysLeft = Math.ceil((item.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  
                  let daysText = daysLeft === 0 ? 'Due Today!' : daysLeft === 1 ? 'Due Tomorrow' : `In ${daysLeft} days`;
                  const isUrgent = daysLeft <= urgentThreshold; 

                  return (
                    <div 
                      key={`${item.type}-${item.id}-${i}`} 
                      onClick={() => navigate(item.route)}
                      className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-pointer" 
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-xl border-2 border-black ${isUrgent ? 'bg-orange-400' : 'bg-blue-400'} text-black flex items-center justify-center group-hover:scale-110 group-hover:-rotate-6 transition-all`}>
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-black text-gray-900 dark:text-gray-100 text-sm group-hover:translate-x-1 transition-transform">{item.name}</h4>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{item.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 text-right">
                        <div className="flex flex-col items-end justify-center">
                          <span className="text-sm font-black text-gray-900 dark:text-gray-100">
                            {item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className={`text-[10px] font-bold ${isUrgent ? 'text-orange-500 animate-pulse' : 'text-gray-500'}`}>
                            {daysText}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-black group-hover:text-white transition-colors border-2 border-transparent group-hover:border-black">
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}


             {/* 🟢 RECENT ACTIVITY (Always visible, just gets pushed down!) */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="p-6 bg-white border-b-[3px] border-black flex items-center justify-between">
          <h3 className="font-['Titan_One'] text-2xl text-black uppercase tracking-tight">Recent Activity</h3>
          <button 
            onClick={() => navigate('/transactions')} 
            className={`text-xs font-black uppercase tracking-widest border-2 border-black px-3 py-1 rounded-lg hover:bg-black hover:text-white transition-colors`}
          >
            View All
          </button>
        </div>

        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {transactions.slice(0, 3).map((transaction) => {
            const account = accounts.find(a => a.id === transaction.paymentMethodId);
            return (
              <div key={transaction.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${getAccentClasses('lightBg')}`}>
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{transaction.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(transaction.date).toLocaleDateString()} • {account?.bank || 'Unknown Account'}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900 dark:text-gray-100">-{formatCurrency(transaction.amount)}</p>
              </div>
            );
          })}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500">
              No transactions yet. Start recording your expenses!
            </div>
          )}
        </div>
      </div>


      {/* Budget Projections Section 
      <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="p-4 md:p-6 bg-blue-500 border-b-[3px] border-black">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4">
            <div className="flex items-center space-x-2 self-center md:self-auto">
              <TrendingUp className="w-6 h-6 text-white" />
              <h3 className="font-['Titan_One'] text-xl md:text-2xl text-white uppercase tracking-tight">Budget Projections</h3>
            </div>
            {/* Date range selector 
            <div className="flex flex-row items-center flex-wrap justify-center md:justify-end gap-1 sm:gap-2">
              <input 
                type="month" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-bold border-2 border-black rounded-lg p-1 bg-white"
              />
              <span className="self-center text-white font-black text-xs">TO</span>
              <input 
                type="month" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-bold border-2 border-black rounded-lg p-1 bg-white"
              />
            </div>
          </div>
        </div>
        */}

        {/* Summary Cards 
        <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Card 1: Avg Period Remaining 
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Avg Period</span>
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <p className={`text-lg font-bold ${avgPeriodRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(avgPeriodRemaining)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Per timing period</p>
            </div>
            */}

            {/* Card 2: Monthly Average 
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Monthly Avg</span>
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <p className={`text-lg font-bold ${avgMonthlyRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(avgMonthlyRemaining)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Per month</p>
            </div>
            */}

            {/* Card 3: Best Month 
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Best Month</span>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              {bestMonth ? (
                <>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(bestMonth.avgRemaining)}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{bestMonth.month}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>
            */}

            {/* Card 4: Worst Month 
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Worst Month</span>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              {worstMonth ? (
                <>
                  <p className={`text-lg font-bold ${worstMonth.avgRemaining >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatCurrency(worstMonth.avgRemaining)}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{worstMonth.month}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No data</p>
              )}
            </div>
          </div>
        </div>
        */}

        {/* Chart *
        <div className="p-6">
          <div className="h-80">
            {periodProjections.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodProjections} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis 
                    dataKey={isMobile ? "shortPeriod" : "period"}
                    axisLine={false}
                    tickLine={false}
                    tick={{fill: tickColor, fontSize: 11}}
                    angle={0}
                    height={40}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{fill: tickColor, fontSize: 12}}
                    tickFormatter={(value) => formatCurrency(value)}
                    domain={[0, 'dataMax + 25%']}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: tooltipBg, color: tooltipColor}}
                  />
                  <Legend />
                  <Bar 
                    dataKey="income" 
                    fill="#10B981" 
                    name="Total Budget (Income)"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="income" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListIncomeColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                  <Bar 
                    dataKey="totalBudget" 
                    fill="#F59E0B" 
                    name="Allocated Budget"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="totalBudget" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListBudgetColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                  <Bar 
                    dataKey="remaining" 
                    fill="#3B82F6" 
                    name="Remaining"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList 
                      dataKey="remaining" 
                      position="top" 
                      formatter={(value: number) => formatCurrency(value)}
                      style={{ fill: labelListRemainingColor, fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-center">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 mb-2">No budget setups found</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Create budget setups to see projections</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
*/}

      

      {/* Account Utilization Stats */}
      <div className="space-y-6">
                                {/* Credit Accounts Utilization */}
        {sortedCreditAccounts.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="p-6 bg-purple-500 border-b-[3px] border-black flex items-center space-x-2">
              <CreditCard className="w-6 h-6 text-white" />
              <h3 className="font-['Titan_One'] text-2xl text-white uppercase tracking-tight">Credit Utilization</h3>
            </div>
            <div className="p-6 space-y-4">
              
              {/* 🟢 ACTIVE ACCOUNTS LEADERBOARD (> 0 Balance) */}
              {sortedCreditAccounts.filter(acc => acc.used > 0).length > 0 ? (
                <div className="space-y-4 pt-2">
                  {sortedCreditAccounts.filter(acc => acc.used > 0).map((account, index) => {
                    // 🟢 Retro Sticker Logic (Straight)
                    let emoji = "🏅";
                    let stickerBg = "bg-white dark:bg-gray-700";
                    
                    if (index === 0) {
                      emoji = "🥇";
                      stickerBg = "bg-yellow-400";
                    } else if (index === 1) {
                      emoji = "🥈";
                      stickerBg = "bg-slate-300";
                    } else if (index === 2) {
                      emoji = "🥉";
                      stickerBg = "bg-amber-500";
                    }

                    return (
                      <div key={account.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-2xl border-[3px] border-gray-100 dark:border-gray-800 hover:border-black dark:hover:border-white transition-all group">
                        
                        {/* Left Side: Retro Sticker & Bank Name */}
                        <div className="flex items-center space-x-4">
                          {/* THE STICKER - No Rotation! */}
                          <div className={`w-10 h-10 flex items-center justify-center rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xl ${stickerBg} transform group-hover:scale-110 transition-all duration-300`}>
                            <span className="drop-shadow-md">{emoji}</span>
                          </div>
                          
                          <div>
                            <h4 className="font-black text-gray-900 dark:text-gray-100 text-sm leading-tight group-hover:translate-x-1 transition-transform">{account.bank}</h4>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">{account.classification}</p>
                          </div>
                        </div>

                        {/* Right Side: Running Used | Remaining Balance */}
                        <div className="text-right flex flex-col justify-center">
                          <p className="font-black text-red-500 dark:text-red-400 text-sm">
                            {formatCurrency(account.used)}
                          </p>
                          <div className="flex items-center justify-end space-x-1 mt-0.5">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">|</span>
                            <p className="text-[10px] text-green-600 dark:text-green-400 font-bold">
                              {formatCurrency(account.available)} left
                            </p>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (


                <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                  <p className="text-sm font-black text-gray-400 uppercase tracking-widest">All caught up! 🎉</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">No active credit balances.</p>
                </div>
              )}

              {/* 🟢 PAID OFF ACCOUNTS ACCORDION */}
              {sortedCreditAccounts.filter(acc => acc.used <= 0).length > 0 && (
                <div className="pt-2 mt-4 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => setShowZeroBalanceCredit(!showZeroBalanceCredit)}
                    className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors outline-none"
                  >
                    <span className="font-black text-[10px] text-gray-500 uppercase tracking-widest">
                      Paid Off Accounts ({sortedCreditAccounts.filter(acc => acc.used <= 0).length})
                    </span>
                    <span className="text-gray-500 font-black text-lg leading-none">{showZeroBalanceCredit ? '−' : '+'}</span>
                  </button>
                  
                  {showZeroBalanceCredit && (
                    <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {sortedCreditAccounts.filter(acc => acc.used <= 0).map((account) => (
                        <div key={account.id} className="bg-white dark:bg-gray-800/30 p-4 rounded-xl border-2 border-gray-100 dark:border-gray-800 opacity-60 hover:opacity-100 transition-opacity">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h4 className="font-bold text-gray-900 dark:text-gray-100">{account.bank}</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{account.classification}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Used / Limit</p>
                              <p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(0)} / {formatCurrency(account.creditLimit)}</p>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden mb-2">
                            <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `0%` }} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                            <span>0% utilized</span>
                            <span className="text-green-600 font-medium">{formatCurrency(account.available)} available</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
            </div>
          </div>
        )}





        {/* Debit Accounts Stats 
        {debitAccounts.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            <div className="p-6 bg-teal-500 border-b-[3px] border-black flex items-center space-x-2">
              <Wallet className="w-6 h-6 text-white" />
              <h3 className="font-['Titan_One'] text-2xl text-white uppercase tracking-tight">Debit Overview</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {debitAccounts.map((account) => {
                const balance = account.balance;
                const monthlyExpense = budget
                  .filter(b => b.accountId === account.id)
                  .reduce((sum, b) => sum + b.amount, 0);
                const percentSpent = balance > 0 ? Math.round((monthlyExpense / balance) * 100) : 0;
                const isOverdraft = percentSpent > 100;
                
                return (
                  <div key={account.id} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-gray-100">{account.bank}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{account.classification}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Balance</span>
                        <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(balance)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Monthly Expense</span>
                        <span className="font-bold text-red-600">{formatCurrency(monthlyExpense)}</span>
                      </div>
                      {balance > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
                            <span>Spent this month</span>
                            <span className={`font-medium ${isOverdraft ? 'text-red-600' : ''}`}>
                              {isOverdraft ? 'OVERDRAFT' : `${percentSpent}%`}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${isOverdraft ? 'bg-red-600' : percentSpent >= 90 ? 'bg-red-500' : percentSpent >= 70 ? 'bg-yellow-500' : 'bg-green-600'}`}
                              style={{ width: `${Math.min(percentSpent, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        */}
      </div>

      {/* 🟢 ALERT WINDOW SLIDER MODAL */}
      {showUrgentSettings && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setShowUrgentSettings(false)}>
          <div className="bg-[#fff7e8] dark:bg-gray-900 border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-3xl w-full max-w-sm p-8 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUrgentSettings(false)} className="absolute top-4 right-4 p-1.5 hover:bg-black/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            
            <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">Alert Window</h2>
            <p className="text-xs font-bold text-gray-500 mb-8">How many days in advance should upcoming bills trigger the orange warning?</p>
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Warning Threshold</span>
              <span className="text-2xl font-black text-orange-500">{urgentThreshold} Days</span>
            </div>
            
            <input 
              type="range" 
              min="1" 
              max="14" 
              value={urgentThreshold} 
              onChange={(e) => handleThresholdChange(parseInt(e.target.value, 10))} 
              className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" 
            />
            
            <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2 mb-8">
              <span>1 Day</span>
              <span>14 Days</span>
            </div>

            <button 
              onClick={() => setShowUrgentSettings(false)} 
              className="w-full bg-orange-400 text-black border-[3px] border-black py-4 rounded-2xl font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      
      </div>
    </div>
  );
};

export default Dashboard;
