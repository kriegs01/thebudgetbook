import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import { Account, Installment } from '../../types';
import { getTransactionsByPaymentSchedule } from '../../src/services/transactionsService';
import { generateCreditBuckets, CreditBucket } from '../../src/utils/bucketEngine';
import useMediaQuery from '../../src/hooks/useMediaQuery';
import { useTheme } from '../../src/contexts/ThemeContext';
import { PageHeader } from '../../src/components/PageHeader';
import { getPaymentSchedulesBySource } from '../../src/services/paymentSchedulesService';
import { groupBNPLTransactions } from '../../src/utils/creditEngines/transactionGrouper';
import { MultiBNPLConversionModal } from '../../src/components/BNPLConversionModal';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/utils/supabaseClient';
import { saveCreditStatement } from '../../src/services/statementsService';
import { getCreditStatementsByPeriod } from '../../src/services/statementsService';
import { ArrowLeft, Calendar, CreditCard, ChevronDown, Info, ChevronUp, Box, ShoppingBag, X, Pencil, Trash2, Plus } from 'lucide-react';
import { getTodayIso, combineDateWithCurrentTime } from '../../src/utils/dateUtils';
import { createTransaction, updateTransactionAndSyncSchedule, deleteTransactionAndRevertSchedule } from '../../src/services/transactionsService';
import { PinProtectedAction } from '../../src/components/PinProtectedAction';


const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface StatementPageProps {
  accounts: Account[];
  installments: Installment[];
  transactions?: any[];
  onRefreshData?: () => Promise<void>;
}

const StatementPage: React.FC<StatementPageProps> = ({ accounts, installments = [], transactions = [], onRefreshData }) => {
   const queryClient = useQueryClient();

  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('account');
  const [account, setAccount] = useState<Account | null>(null);
  const [cycles, setCycles] = useState<CreditBucket[]>([]);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const [expandedInstallments, setExpandedInstallments] = useState<Record<string, boolean>>({});
  const [dbPaidAmounts, setDbPaidAmounts] = useState<Map<string, number>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

const [showMultiBNPLModal, setShowMultiBNPLModal] = useState(false);
const [showReviewModal, setShowReviewModal] = useState(false);

  // 🟢 NEW: Unified Dashboard States
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  
  // 🟢 NEW: Card Payment & Edit States
  const [showCardPaymentModal, setShowCardPaymentModal] = useState(false);
  const [cardPaymentForm, setCardPaymentForm] = useState({ name: '', amount: '', date: getTodayIso(), notes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showEditTxModal, setShowEditTxModal] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editTxForm, setEditTxForm] = useState({ name: '', amount: '', date: '' });

  // 🟢 NEW: Submission Handlers
  const handleCardPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    const amountValue = Math.abs(parseFloat(cardPaymentForm.amount || '0'));
    if (isNaN(amountValue) || amountValue <= 0) return;

    setIsSubmitting(true);
    try {
      const { error } = await createTransaction({
        name: cardPaymentForm.name.trim() || 'Credit Card Payment',
        date: combineDateWithCurrentTime(cardPaymentForm.date),
        amount: -amountValue,
        payment_method_id: account.id,
        transaction_type: 'credit_payment',
        notes: cardPaymentForm.notes.trim() || null
      } as any);
      if (error) throw error;
      if (onRefreshData) await onRefreshData();
      setShowCardPaymentModal(false);
      setCardPaymentForm({ name: '', amount: '', date: getTodayIso(), notes: '' });
    } catch (error) {
      alert('Failed to record credit card payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setIsSubmitting(true);
    try {
      const sign = editingTx.amount < 0 ? -1 : 1;
      const { error } = await updateTransactionAndSyncSchedule(editingTx.id, {
        name: editTxForm.name,
        date: combineDateWithCurrentTime(editTxForm.date),
        amount: sign * parseFloat(editTxForm.amount)
      });
      if (error) throw error;
      if (onRefreshData) await onRefreshData();
      setShowEditTxModal(false);
      setEditingTx(null);
    } catch (error) {
      alert('Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };


    const [showPushToBudget, setShowPushToBudget] = useState(false);
  const [pushBudgetForm, setPushBudgetForm] = useState({
    amount: '',
    targetMonth: monthNames[new Date().getMonth() + 1 > 11 ? 0 : new Date().getMonth() + 1],
    targetYear: new Date().getMonth() + 1 > 11 ? new Date().getFullYear() + 1 : new Date().getFullYear(),
    targetPeriod: 1 // 🟢 NEW: Added this to track 1st vs 2nd paycheck!
  });
  const [isPushing, setIsPushing] = useState(false);


        const handlePushToBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || !selectedCycle) return;
    setIsPushing(true);

    try {
      console.log("1. Starting Push to Budget...");
      
      // 🟢 THE FIX: Grab the authenticated user FIRST
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be logged in to do this.");
      
      const monthIndex = monthNames.indexOf(selectedCycle.targetMonth) + 1;
      const statementPeriod = `${selectedCycle.targetYear}-${String(monthIndex).padStart(2, '0')}`;
      
      console.log("2. Fetching statement ID for period:", statementPeriod);
      const { data: stmtData, error: stmtError } = await supabase
        .from('credit_statements')
        .select('id')
        .eq('account_id', account.id)
        .eq('statement_period', statementPeriod)
        .single();
        
      if (stmtError || !stmtData) throw new Error("Could not find the saved statement. Please wait for it to sync and try again.");

      console.log("3. Fetching budget securely for user:", userData.user.id);
      const { data: budgetData, error: budgetError } = await supabase
        .from('budget_setups')
        .select('*')
        .eq('month', pushBudgetForm.targetMonth)
        .eq('user_id', userData.user.id); // 🟢 THE FIX: Strictly lock the query to this specific user!
        
      if (budgetError) throw budgetError;
      
      const targetBudget = budgetData?.find(b => parseInt(b.data?._year || new Date().getFullYear()) === pushBudgetForm.targetYear);

            // 🟢 1. Extract the raw paycheck number (e.g., turns "Second Paycheck" into 2)
      const rawTabString = String(pushBudgetForm.targetPeriod || '1');
      const tabMatch = rawTabString.match(/\d+/);
      const targetTab = tabMatch ? parseInt(tabMatch[0]) : 1;

      // 🟢 2. Force the amount into a strict mathematical number
      const parsedAmount = parseFloat(pushBudgetForm.amount);

      const rolloverItem = {
        id: `rollover-${Date.now()}`,
        name: `Leftover ${account.bank} Balance`,
        amount: parsedAmount, // 🟢 Now a strict Number
        amountsByPeriod: { [targetTab]: parsedAmount }, // 🟢 Now strictly { 2: 4025 }
        included: true,
        isRollover: true, 
        isBiller: true, 
        type: 'bill', // 🟢 NEW: Explicitly tells the engine it is a timeline bill
        dueDay: account.dueDate ? String(account.dueDate).replace(/\D/g, '') : '15',
        accountId: account.id,
        statementId: stmtData.id 
      };


      if (targetBudget) {
        console.log("4a. Injecting into YOUR existing budget ID:", targetBudget.id);
        
        const updatedData = JSON.parse(JSON.stringify(targetBudget.data));
        if (!updatedData['Fixed']) updatedData['Fixed'] = []; 
        
        const alreadyExists = updatedData['Fixed'].some((item: any) => item.statementId === stmtData.id);
        if (alreadyExists) throw new Error("This statement balance has already been pushed to that budget!");

        updatedData['Fixed'].push(rolloverItem);
        const newTotal = (targetBudget.total_amount || 0) + parseFloat(pushBudgetForm.amount);

        const { error: updateError } = await supabase
          .from('budget_setups')
          .update({ data: updatedData, total_amount: newTotal })
          .eq('id', targetBudget.id);

        if (updateError) throw updateError;
        console.log("5a. Successfully updated database!");
      } else {
        console.log("4b. Creating brand new budget setup...");
        const newBudgetData = {
          _year: pushBudgetForm.targetYear,
          'Fixed': [rolloverItem] 
        };

        const { error: insertError } = await supabase
          .from('budget_setups')
          .insert([{
            month: pushBudgetForm.targetMonth,
            timing: 'unified',
            status: 'Saved',
            total_amount: parseFloat(pushBudgetForm.amount),
            data: newBudgetData,
            user_id: userData.user.id // 🟢 Already had this part right!
          }]);

        if (insertError) throw insertError;
        console.log("5b. Successfully inserted new database row!");
      }

      if (onRefreshData) {
        await onRefreshData();
      }
      setShowPushToBudget(false);
      alert(`Success! Pushed to ${pushBudgetForm.targetMonth} Paycheck ${targetTab}. Switch to that tab in your budget to view it!`);

    } catch (error: any) {
      console.error("PUSH ERROR:", error);
      alert(error.message || 'Failed to push to budget.');
    } finally {
      setIsPushing(false);
    }
  };





const [isFilterExpanded, setIsFilterExpanded] = useState(false);


const [showAllCyclesModal, setShowAllCyclesModal] = useState(false);


  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // 🟢 Fetch actual paid schedules for all installments
  useEffect(() => {
    const loadAllPaidAmounts = async () => {
      const paidAmountsMap = new Map<string, number>();
      const promises = installments.map(async (installment) => {
        try {
          const { data, error } = await getPaymentSchedulesBySource('installment', installment.id);
          if (!error && data) {
            const totalPaid = data.reduce((sum, schedule) => sum + (schedule.amount_paid || 0), 0);
            paidAmountsMap.set(installment.id, totalPaid);
          } else {
            paidAmountsMap.set(installment.id, 0);
          }
        } catch (err) {
          paidAmountsMap.set(installment.id, 0);
        }
      });
      await Promise.all(promises);
      setDbPaidAmounts(paidAmountsMap);
    };
    
    if (installments.length > 0) {
      loadAllPaidAmounts();
    }
  }, [installments]);

  const toggleInstallment = (id: string) => {
    setExpandedInstallments(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  useEffect(() => {
    const loadAccountAndTransactions = async () => {
      if (!accountId) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const acc = accounts.find(a => a.id === accountId);
        if (!acc || acc.type !== 'Credit') {
          if (accounts.length > 0) setIsLoading(false);
          return;
        }
        
        setAccount(acc);
        
                        // 🟢 Generate chronological buckets using our unified waterfall engine
        const now = new Date();

        // Check if there are transactions beyond today to ensure future cycles are captured
        const latestTxDate = (transactions || [])
          .filter(t => (t.payment_method_id === acc.id || t.paymentMethodId === acc.id) && t.date)
          .map(t => new Date(t.date).getTime())
          .reduce((max, d) => Math.max(max, d), now.getTime());

        const latestRefDate = new Date(Math.max(now.getTime(), latestTxDate));

                // 🟢 FIX: Look 2 months ahead of the latest activity so the active unbilled cycle 
        // (whose due date falls in the following month due to grace period) is always generated!
        const targetDate = new Date(latestRefDate.getFullYear(), latestRefDate.getMonth() + 2, 1);

        // 1. Fetch exact schedules so the bucket engine knows the actual amounts (₱350 vs ₱700)
        const instIds = (installments || []).map(i => i.id);
        let allSchedules: any[] = [];
        if (instIds.length > 0) {
          const { data: schedData } = await supabase
            .from('monthly_payment_schedules')
            .select('*')
            .in('source_id', instIds);
          if (schedData) allSchedules = schedData;
        }

        const buckets = generateCreditBuckets(
          acc,
          transactions || [],
          installments || [],
          targetDate.getFullYear(),
          monthNames[targetDate.getMonth()],
          allSchedules // 👈 Passes the schedules to the engine
        );
        
                        // Reverse so newest statement is on top for the UI
        const reversedBuckets = [...buckets].reverse();
        setCycles(reversedBuckets);

        // 🟢 Find the current active cycle by today's date
        const today = new Date();
        const activeIndex = reversedBuckets.findIndex(bucket => {
          const start = new Date(bucket.cycleStart);
          const end = new Date(bucket.cycleEnd);
          return today >= start && today <= end;
        });

        // Default to active cycle if found, otherwise fallback to the most recent closed statement or 0
        setSelectedCycleIndex(activeIndex !== -1 ? activeIndex : 0);

      } catch (error) {
        console.error('Error loading statement buckets:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAccountAndTransactions();
  }, [accountId, accounts, installments, transactions]);

    // 🟢 BUDGET ENGINE HANDOFF: Silently push the exact dates to the database
    useEffect(() => {
      const pushStatementToDatabase = async () => {
        console.log("[Statement Handoff] Hook fired! Checking requirements...");
        const selectedCycle = cycles[selectedCycleIndex];
        
        if (!selectedCycle || !account || !accountId) {
          console.log("[Statement Handoff] Missing cycle or account data, aborting.");
          return;
        }
  
        const monthIndex = monthNames.indexOf(selectedCycle.targetMonth) + 1;
        const statementPeriod = `${selectedCycle.targetYear}-${String(monthIndex).padStart(2, '0')}`;
  
        const cycleEndDate = new Date(selectedCycle.cycleEnd);
      
      // 🟢 THE FIX: Safely extract grace days so we don't jump 20 million days into the future
      let graceDays = 21;
      if (account.dueDate) {
        const numStr = String(account.dueDate).replace(/\D/g, '');
        // If it grabbed a full date string, take just the last 2 digits, otherwise parse it normally
        const parsed = parseInt(numStr.length >= 8 ? numStr.slice(-2) : numStr, 10);
        graceDays = (parsed > 0 && parsed <= 31) ? parsed : 21;
      }
      
      const exactDueDate = new Date(cycleEndDate);
      exactDueDate.setDate(exactDueDate.getDate() + graceDays);

      const cutoffDateStr = cycleEndDate.toISOString().split('T')[0];
      const dueDateStr = exactDueDate.toISOString().split('T')[0];
  
        console.log(`[Statement Handoff] Attempting to save: ${statementPeriod} | Due: ${dueDateStr}`);
  
        const result = await saveCreditStatement({
          account_id: accountId,
          statement_period: statementPeriod,
          cutoff_date: cutoffDateStr,
          due_date: dueDateStr,
          is_locked: false
        });
        
        if (result.error) {
          console.error("[Statement Handoff] SUPABASE ERROR:", result.error);
        } else {
          console.log("[Statement Handoff] SUCCESS! Saved to database.");
        }
      };
  
      pushStatementToDatabase();
    }, [selectedCycleIndex, cycles, account, accountId]);
  



  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent dark:transparent p-8 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading statement...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!accountId || !account) {
    return (
      <div className="min-h-screen bg-transparent dark:bg-transparent p-8 transition-colors">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-center transition-colors">
            <p className="text-gray-500 dark:text-gray-400">Account not found or not a credit account.</p>
            <Link to="/accounts" className="mt-4 inline-block text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Return to Accounts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 🟢 LOAN BUNDLE DASHBOARD OVERRIDE
  if (account.subtype === 'Loan_Bundle' ) {
    const bundleInstallments = (installments || []).filter(inst =>
      (inst.accountId === account.id || inst.linkedAccountId === account.id) && !inst.isArchived
    );

    let totalUsed = 0; 
    let totalPayableAll = 0; 
    let totalPaidAll = 0; 
    let dueThisMonth = 0;

    const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });
    const currentYear = new Date().getFullYear();
    const currentMonthLabel = `${currentMonthName} ${currentYear}`;

    bundleInstallments.forEach(inst => {
      totalUsed += inst.principalAmount || inst.totalAmount || 0;
      totalPayableAll += inst.totalAmount || 0;

      const paidForThisInst = dbPaidAmounts.get(inst.id) ?? 0;
      totalPaidAll += paidForThisInst;

      const term = parseInt(String(inst.termDuration).replace(/\D/g, '')) || 12;
      let startYear = currentYear;
      let startMonth = new Date().getMonth() + 1;
      
      if (inst.startDate) {
        const parts = inst.startDate.split('-');
        startYear = parseInt(parts[0]);
        startMonth = parseInt(parts[1]);
      }

      for (let i = 0; i < term; i++) {
        const monthIndex = (startMonth - 1 + i) % 12;
        const year = startYear + Math.floor((startMonth - 1 + i) / 12);
        const label = `${monthNames[monthIndex]} ${year}`;
        const isPaid = (i + 1) * inst.monthlyAmount <= paidForThisInst;

        if (label === currentMonthLabel && !isPaid) {
          dueThisMonth += inst.monthlyAmount || 0;
        }
      }
    });

    const totalRemaining = totalPayableAll - totalPaidAll;

    

    return (
      <div className={`min-h-screen bg-transparent dark:bg-transparent transition-colors ${isMobile ? 'overflow-x-hidden px-4 pb-8 pt-6' : 'p-8'}`}>
        <div className="mx-auto max-w-4xl">
          <PageHeader
            title={account.bank}
            subtitle="Loan Bundle Schedule"
            icon={
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
                <Calendar className="w-7 h-7" />
              </div>
            }
            backButton={!isMobile ? (
              <Link to="/accounts" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            ) : undefined}
          />

          <div className="space-y-8 mt-8">
            <div className="bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-600 dark:text-gray-400">Bundle Summary</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Used</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalUsed)}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Total Paid</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPaidAll)}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Remaining</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalRemaining)}</p>
                </div>
                <div className="rounded-xl border-[3px] border-black bg-indigo-50 dark:bg-indigo-900/30 p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -mt-2">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Due {currentMonthName}</p>
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(dueThisMonth)}</p>
                </div>
              </div>
            </div>

            {bundleInstallments.length === 0 ? (
                <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-12 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900">
                  <p className="text-sm font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">No active loans in this bundle.</p>
                </div>
              ) : (
                bundleInstallments.map(inst => {
                  const term = parseInt(String(inst.termDuration).replace(/\D/g, '')) || 12;
                  const schedule = [];
                  let startYear = new Date().getFullYear();
                  let startMonth = new Date().getMonth() + 1;
  
                  if (inst.startDate) {
                    const parts = inst.startDate.split('-');
                    startYear = parseInt(parts[0]);
                    startMonth = parseInt(parts[1]);
                  }
  
                  const paidAmount = dbPaidAmounts.get(inst.id) ?? 0; 
  
                  for (let i = 0; i < term; i++) {
                    const monthIndex = (startMonth - 1 + i) % 12;
                    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
                    const isPaid = (i + 1) * inst.monthlyAmount <= paidAmount;
  
                    schedule.push({
                      id: `${inst.id}-${year}-${monthIndex}`,
                      label: `${monthNames[monthIndex]} ${year}`,
                      isPaid,
                    });
                  }
  
                  const isExpanded = expandedInstallments[inst.id];

                  return (
                    <div key={inst.id} className="bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
                      <button 
                        onClick={() => toggleInstallment(inst.id)}
                        className="w-full flex items-center justify-between mb-6 group outline-none"
                      >
                        <h2 className="text-xl font-black uppercase text-gray-900 dark:text-white tracking-tight pl-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {inst.name}
                        </h2>
                        <div className="p-2 border-2 border-transparent group-hover:border-black group-hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] bg-gray-100 dark:bg-gray-800 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-all">
                          <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
  
                      <div className="grid grid-cols-4 gap-4 bg-[#fff8ea] dark:bg-gray-800 p-5 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center">
                        <div>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Due</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{inst.due_date || inst.dueDate || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(inst.totalAmount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Monthly</p>
                          <p className="font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(inst.monthlyAmount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Duration</p>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{inst.termDuration}</p>
                        </div>
                      </div>
  
                      {isExpanded && (
                        <div className="space-y-3 px-2 mt-8 animate-in slide-in-from-top-2 fade-in duration-200">
                          {schedule.map((month) => (
                            <div key={month.id} className="flex justify-between items-center py-2 border-b-2 border-dashed border-gray-200 dark:border-gray-800 last:border-0">
                              <span className="font-bold text-sm text-gray-700 dark:text-gray-300">{month.label}</span>
                              <div className="flex items-center gap-3">
                                {month.isPaid ? (
                                  <>
                                    <span className="px-3 py-1.5 bg-green-400 text-black text-[10px] font-black uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mt-0.5 inline-block">Paid</span>
                                    <button className="text-gray-400 hover:text-indigo-600 transition-colors p-1" title="View Receipt">
                                      <Info className="w-5 h-5" />
                                    </button>
                                  </>
                                ) : (
                                  <Link to="/installments" className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all mt-0.5 inline-block">
                                    Pay
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );  
                })
              )}
          </div>
        </div>
      </div>
    );
  }

  if (!account.billingDate) {
    return (
      <div className={`min-h-screen bg-transparent dark:bg-transparent transition-colors ${isMobile ? 'overflow-x-hidden px-4 pb-8 pt-6' : 'p-8'}`}>
        <div className="mx-auto max-w-5xl">
          <PageHeader
            title={account.bank}
            subtitle="Credit Card Statement"
            icon={
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
                <CreditCard className="w-7 h-7" />
              </div>
            }
            backButton={!isMobile ? (
              <Link to="/accounts" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            ) : undefined}
          />
          <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
            <p className="text-gray-500 dark:text-gray-400">No billing date set for this credit account.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Please edit the account and set a billing date to view statements.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedCycle = cycles[selectedCycleIndex];
    // 🟢 NEW: Calculate where this statement originally belongs so we can block duplicates
  let originMonth = monthNames[new Date().getMonth()];
  let originYear = new Date().getFullYear();
  let originPeriod = 1;
  
  if (selectedCycle?.calculatedDueDate) {
    const due = new Date(selectedCycle.calculatedDueDate + 'T00:00:00');
    originMonth = monthNames[due.getMonth()];
    originYear = due.getFullYear();
    originPeriod = due.getDate() <= 15 ? 1 : 2;
  }
  
  // 🟢 NEW: The error flag to lock the submit button
  const isSameAsOrigin = pushBudgetForm.targetMonth === originMonth && 
                         pushBudgetForm.targetYear === originYear && 
                         pushBudgetForm.targetPeriod === originPeriod;


  // 🟢 Break down the statement math exactly like a real bank
  const previousBalance = selectedCycle?.startingBalance ?? 0;
  const newCharges = selectedCycle?.newChargesTotal ?? 0;
  const totalPayments = selectedCycle?.paymentsTotal ?? 0;
  const statementBalance = selectedCycle?.endingBalance ?? 0;

  // 🟢 Extract and sort transactions chronologically (Oldest to Newest)
  const currentTxs = selectedCycle ? [
    // 1. The Rollover Balance is ALWAYS first (Beginning of cycle), but only if > 0
    ...(selectedCycle.personalBreakdown.unpaidRollover > 0 ? [{
      id: 'rollover-item',
      name: 'Previous Statement Balance',
      date: selectedCycle.cycleStart.toISOString(),
      amount: selectedCycle.personalBreakdown.unpaidRollover,
      transaction_type: 'rollover'
    }] : []),
    
    // 2. Combine all other items and sort them by date
    ...[
      ...selectedCycle.personalBreakdown.swipes,
      // THE FAILSAFE: Explicitly block future installments from past cycles
      ...selectedCycle.personalBreakdown.activeInstallments
        .filter((inst: any) => {
          if (!inst.start_date) return true;

          const instStart = new Date(inst.start_date);
          instStart.setHours(0, 0, 0, 0);

          // Calculate a safe cycle end boundary (Cycle Start + ~31 days)
          const safeCycleEnd = new Date(selectedCycle.cycleStart);
          safeCycleEnd.setDate(safeCycleEnd.getDate() + 31);
          safeCycleEnd.setHours(23, 59, 59, 999);

          // If the installment starts after this cycle's maximum possible end date, drop it.
          return instStart <= safeCycleEnd;
        })
        .map((i: any) => ({ ...i, transaction_type: 'installment' })),
      ...selectedCycle.budeeBreakdown.map(b => ({ ...b, name: `Budee: ${b.name}`, transaction_type: 'budee' })),
      ...selectedCycle.payments.map(p => ({ ...p, amount: -p.amount, transaction_type: 'payment' }))
    ].sort((a, b) => {
      // If an item has no specific date (like fixed monthly installments), 
      // we default it to the very start of the cycle right after the rollover!
      const dateA = a.date ? new Date(a.date).getTime() : selectedCycle.cycleStart.getTime();
      const dateB = b.date ? new Date(b.date).getTime() : selectedCycle.cycleStart.getTime();
      
      return dateA - dateB; // Sort ascending (Oldest first)
    })
  ] : [];

  const groupedCurrentTxs = groupBNPLTransactions(currentTxs as any, installments).map(item => {
    if (item.isGroup && item.parentInstallment) {
      // Read the true amount (₱350 vs ₱700) calculated by the engine for this specific cycle
      const cycleItem = selectedCycle?.personalBreakdown.activeInstallments.find(
        (inst: any) => inst.id === item.parentInstallment.id
      );
      if (cycleItem) {
        return { ...item, totalAmount: cycleItem.amount };
      }
    }
    return item;
  }).filter((item) => {

    if (!item.isGroup) {
      const tx = item.transactions[0];
      return !(tx?.conversion_status === 'approved' && tx?.conversion_group_id);
    }
    return true;
  });
  const visibleMobileTxs = currentTxs.filter(tx => !(tx.conversion_status === 'approved' && tx.conversion_group_id));
  const pendingConversions = currentTxs.filter(tx => tx.conversion_status === 'pending');
  const visibleStatementCount = groupedCurrentTxs.length;

  console.log(`STATEMENT DIAGNOSTIC [${selectedCycle?.targetMonth}]:`, {
    engineCalculatedAmount: selectedCycle?.personalBreakdown?.activeInstallments?.find(i => i?.name?.includes('BNPL'))?.amount,
    groupedUIAmount: groupedCurrentTxs?.find(i => i?.name?.includes('BNPL'))?.totalAmount,
    schedulesFound: selectedCycle?.personalBreakdown?.activeInstallments
  });

  

  return (
    <div className={`min-h-screen bg-transparent dark:bg-transparent transition-colors ${isMobile ? 'overflow-x-hidden px-2 pb-8 pt-6' : 'p-8'}`}>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title={account.bank}
          subtitle="Credit Card Statement"
          icon={
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
              <CreditCard className="w-7 h-7" />
            </div>
          }
          backButton={!isMobile ? (
            <Link to="/accounts" className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          ) : undefined}
        />

        {/* 🟢 BILLING CYCLE CAROUSEL */}
        <div className={`${isMobile ? 'mb-5' : 'mb-6'}`}>
          <div className="min-w-0 flex-1 rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
            {/* Header: Title + ALL Button */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-[1.1rem] border-[3px] border-black bg-purple-100 text-purple-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-purple-900/20 dark:text-purple-300">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className="text-sm font-black tracking-[0.08em] text-gray-800 dark:text-gray-100 leading-none">
                  <span className="uppercase tracking-[0.18em]">Billing Cycle:</span>{' '}
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Statement Range</span>
                </p>
              </div>

              {/* ALL / History Modal Button */}
              {cycles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllCyclesModal(true)}
                  className="px-3 py-1.5 rounded-xl border-2 border-black bg-[#fff8ea] dark:bg-gray-800 text-[11px] font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                >
                  All ({cycles.length})
                </button>
              )}
            </div>

            {/* Paginator Bar */}
            {selectedCycle && (
              <div className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl border-[3px] border-black bg-[#fff8ea] dark:bg-gray-800 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                {/* Newer Cycle (<) - cycles are reversed so older is higher index */}
                <button
                  type="button"
                  onClick={() => setSelectedCycleIndex(prev => Math.min(cycles.length - 1, prev + 1))}
                  disabled={selectedCycleIndex >= cycles.length - 1}
                  className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center rounded-xl border-2 border-black bg-white dark:bg-gray-900 text-black dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed hover:bg-gray-50 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                  aria-label="Previous Statement"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                {/* Center Content: Statement Month & Range/Due */}
                <div className="flex flex-col items-center justify-center text-center min-w-0 px-2 flex-1">
                  <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
                    {selectedCycle.targetMonth} {selectedCycle.targetYear}
                  </h4>
                  <p className="text-xs sm:text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-full">
                    {selectedCycle.cycleLabel}{' '}
                    {selectedCycle.calculatedDueDate && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-black">
                        | Due: {new Date(selectedCycle.calculatedDueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </p>
                </div>

                {/* Older Cycle (>) */}
                <button
                  type="button"
                  onClick={() => setSelectedCycleIndex(prev => Math.max(0, prev - 1))}
                  disabled={selectedCycleIndex <= 0}
                  className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center rounded-xl border-2 border-black bg-white dark:bg-gray-900 text-black dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed hover:bg-gray-50 active:translate-x-[1px] active:translate-y-[1px] transition-all rotate-180"
                  aria-label="Next Statement"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 🟢 "ALL STATEMENTS" POPUP MODAL */}
        {showAllCyclesModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl rounded-3xl border-4 border-black bg-white p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b-2 border-black">
                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">
                  All Statement Cycles
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAllCyclesModal(false)}
                  className="rounded-xl border-2 border-black p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto py-4 flex-1">
                {cycles.map((cycle, index) => {
                  const dueFormatted = cycle.calculatedDueDate
                    ? new Date(cycle.calculatedDueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : null;

                  return (
                    <button
                      key={cycle.cycleLabel}
                      onClick={() => {
                        setSelectedCycleIndex(index);
                        setShowAllCyclesModal(false);
                      }}
                      className={`rounded-2xl border-[3px] p-3 text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${
                        selectedCycleIndex === index
                          ? 'border-black bg-purple-100 dark:bg-purple-900/40'
                          : 'border-black bg-[#fff8ea] hover:-translate-y-0.5 dark:bg-gray-800'
                      }`}
                    >
                      <div className="text-sm font-black text-gray-900 dark:text-gray-100">
                        {cycle.targetMonth} {cycle.targetYear}
                      </div>
                      <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {cycle.cycleLabel} {dueFormatted && <span className="text-indigo-600 dark:text-indigo-400 font-black">| Due: {dueFormatted}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}



        {selectedCycle && (
          <>
            <div className="mb-6 rounded-[1.8rem] border-[4px] border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-600 transition-colors dark:text-gray-400">Statement Summary</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Statement Balance</p>
                  <p className="text-lg font-bold text-gray-900 transition-colors dark:text-gray-100">{formatCurrency(statementBalance)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">New Charges</p>
                  <p className="text-lg font-bold text-red-600 transition-colors dark:text-red-400">{formatCurrency(newCharges)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Payments</p>
                  <p className="text-lg font-bold text-green-600 transition-colors dark:text-green-400">{totalPayments > 0 ? '-' : ''}{formatCurrency(totalPayments)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Credit Limit</p>
                  <p className="text-lg font-bold text-gray-900 transition-colors dark:text-gray-100">{formatCurrency(account.creditLimit ?? 0)}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.8rem] border-[4px] border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <div className="mb-4 flex flex-row items-start justify-between gap-4 border-b-[4px] border-black px-6 py-4 transition-colors">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <h2 className="truncate text-sm font-black uppercase tracking-widest text-gray-600 transition-colors dark:text-gray-400">Transactions</h2>
                  <span className="shrink-0 text-xs font-bold text-gray-400">{visibleStatementCount} items</span>
                </div>

                <div className="flex shrink-0 flex-row flex-wrap justify-end gap-2 md:gap-3">
                  
                  




                  {/* 🟢 NEW: Push to Budget Button (Only shows if there is an unpaid balance) */}
                  {statementBalance > 0 && (
                                        <button
                      onClick={() => {
                        // Auto-calculate the NEXT paycheck as the default target
                        let targetPeriod = originPeriod === 1 ? 2 : 1;
                        let targetMonthIdx = monthNames.indexOf(originMonth);
                        let targetYear = originYear;

                        if (originPeriod === 2) {
                          targetMonthIdx += 1;
                          if (targetMonthIdx > 11) {
                            targetMonthIdx = 0;
                            targetYear++;
                          }
                        }

                        setPushBudgetForm({ 
                          amount: statementBalance.toFixed(2), // 🟢 Forces a clean 2-decimal string!
                          targetMonth: monthNames[targetMonthIdx],
                          targetYear: targetYear,
                          targetPeriod: targetPeriod
                        });
                        setShowPushToBudget(true);
                      }}
                      className="whitespace-nowrap rounded-lg border-2 border-black bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                    >
                      Push to Budget
                    </button>

                  )}




                  <button
                    onClick={() => setShowMultiBNPLModal(true)}
                    className="whitespace-nowrap rounded-lg border-2 border-black bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    BNPL
                  </button>
                  
                  {pendingConversions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowReviewModal(true)}
                      className="whitespace-nowrap rounded-lg border-2 border-black bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none animate-pulse"
                    >
                      Review ({pendingConversions.length})
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4">
                {isMobile ? (
                  <div className="space-y-3">
                    {groupedCurrentTxs.map(item => {
                      if (!item.isGroup) {
                        const tx = item.transactions[0];
                        return (
                          <div key={tx.id} className="rounded-[1.4rem] border-[3px] border-black bg-[#fff8ea] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-800">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-gray-900 dark:text-gray-100">{tx.name}</p>
                                {(tx.status === 'pending' || tx.conversion_status === 'pending') && (
                                  <div className="mt-1 text-[10px] font-semibold text-amber-500 sm:text-xs">Pending Conversion Approval</div>
                                )}
                                {tx.date && (
                                  <p className="mt-1 truncate text-xs font-bold text-gray-500 dark:text-gray-400">
                                    {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                              <p className={`shrink-0 text-right text-sm font-black transition-colors ${tx.amount > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>
                                {formatCurrency(tx.amount)}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      const isExpanded = expandedGroups.has(item.id);
                      return (
                        <div key={item.id} className="rounded-[1.4rem] border-[3px] border-blue-900 bg-blue-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:border-blue-800 dark:bg-blue-900/20">
                          <div className="flex cursor-pointer items-start justify-between gap-3" onClick={() => toggleGroup(item.id)}>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <ShoppingBag className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-blue-900 dark:text-blue-100">{item.parentInstallment?.name || 'BNPL Converted'}</p>
                                <p className="mt-1 truncate text-xs font-bold text-blue-700 dark:text-blue-400">
                                  {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <div className="mt-1 flex shrink-0 items-center gap-2">
                              <p className="shrink-0 text-right text-sm font-black text-blue-900 dark:text-blue-100">{formatCurrency(item.totalAmount)}</p>
                              {isExpanded ? <ChevronUp className="h-5 w-5 shrink-0 text-blue-600" /> : <ChevronDown className="h-5 w-5 shrink-0 text-blue-600" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-2 border-t-2 border-dashed border-blue-200 pt-3 dark:border-blue-800">
                              {item.transactions.map(subTx => (
                                <div key={subTx.id} className="flex items-start justify-between gap-3 text-xs">
                                  <div className="min-w-0 flex-1 text-gray-600 dark:text-gray-400">
                                    <p className="truncate">↳ {subTx.name}</p>
                                    {(subTx.status === 'pending' || subTx.conversion_status === 'pending') && (
                                      <p className="mt-0.5 text-[10px] text-amber-500">Pending Approval</p>
                                    )}
                                  </div>
                                  <div className="shrink-0 font-medium text-gray-600 dark:text-gray-400">{formatCurrency(subTx.amount)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {groupedCurrentTxs.length === 0 && (
                      <div className="rounded-[1.4rem] border-[3px] border-dashed border-black bg-white p-6 text-center dark:bg-gray-800">
                        <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No transactions in this billing cycle.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 transition-colors dark:text-gray-400">Description</th>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-500 transition-colors dark:text-gray-400">Date</th>
                          <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-gray-500 transition-colors dark:text-gray-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
  {groupedCurrentTxs.map((item) => {
    
    // STANDARD TRANSACTION
    if (!item.isGroup) {
      const tx = item.transactions[0];
      return (
        <tr key={tx.id} className="border-t border-gray-100 transition-colors dark:border-gray-800">
          <td className="px-4 py-3">
            <div className="text-sm font-medium text-gray-900 transition-colors dark:text-gray-100">{tx.name}</div>
            {(tx.status === 'pending' || tx.conversion_status === 'pending') && (
              <div className="mt-1 text-[10px] font-semibold text-amber-500 sm:text-xs">Pending Conversion Approval</div>
            )}
          </td>
          <td className="px-4 py-3">
            <div className="text-sm text-gray-500 transition-colors dark:text-gray-400">
              {tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </div>
          </td>
          <td className="px-4 py-3 text-right">
            <div className={`text-sm font-semibold transition-colors ${tx.amount > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>
              {formatCurrency(tx.amount)}
            </div>
          </td>
        </tr>
      );
    }

    // BNPL ACCORDION
    const isExpanded = expandedGroups.has(item.id);
    return (
      <React.Fragment key={item.id}>
        <tr 
          onClick={() => toggleGroup(item.id)}
          className="border-t border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 cursor-pointer transition-colors dark:border-blue-900 dark:bg-blue-900/10 dark:hover:bg-blue-900/20"
        >
          <td className="px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ShoppingBag className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="min-w-0 truncate text-sm font-bold text-blue-900 dark:text-blue-100">{item.parentInstallment?.name || 'BNPL Converted'}</div>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="text-sm text-blue-600 dark:text-blue-400">
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </td>
          <td className="px-4 py-3 text-right">
            <div className="ml-2 flex flex-none shrink-0 items-center justify-end gap-3">
              <div className="shrink-0 text-sm font-black text-blue-900 dark:text-blue-100">
                {formatCurrency(item.totalAmount)}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" />}
            </div>
          </td>
        </tr>
        
        {/* EXPANDED RECEIPTS */}
        {isExpanded && item.transactions.map(subTx => (
          <tr key={subTx.id} className="bg-gray-50/50 dark:bg-gray-800/30">
            <td className="px-4 py-2 pl-10 border-l-2 border-blue-200 dark:border-blue-800">
              <div className="text-xs text-gray-600 dark:text-gray-400">↳ {subTx.name}</div>
              {(subTx.status === 'pending' || subTx.conversion_status === 'pending') && (
                <div className="mt-1 text-[10px] font-semibold text-amber-500 sm:text-xs">Pending Conversion Approval</div>
              )}
            </td>
            <td className="px-4 py-2 text-xs text-gray-500">
              {subTx.date ? new Date(subTx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
            </td>
            <td className="px-4 py-2 text-right text-xs text-gray-600 dark:text-gray-400">
              {formatCurrency(subTx.amount)}
            </td>
          </tr>
        ))}
      </React.Fragment>
    );
  })}
  {groupedCurrentTxs.length === 0 && (
    <tr>
      <td colSpan={3} className="px-4 py-6 text-center text-gray-400 transition-colors dark:text-gray-500">
        No transactions in this billing cycle.
      </td>
    </tr>
  )}
</tbody>

                    </table>
                  </div>
                )}
              </div>
            </div>
                    </>
        )}

       {/* Mount the Modal here */}
{showMultiBNPLModal && (
  <MultiBNPLConversionModal
    availableTransactions={currentTxs.filter(tx => {
      const isPositive = tx.amount > 0;
      const isValidType = !['credit_payment', 'rollover', 'installment', 'budee'].includes(tx.transaction_type);
      const isNotPending = tx.conversion_status !== 'pending';
      const isNotApproved = tx.conversion_status !== 'approved';
      const isAvailable = isPositive && isValidType && isNotPending && isNotApproved;

      if (!isAvailable && isPositive && isValidType) {
        console.log('\u{1F6A8} REJECTED BY MODAL:', tx.name, {
          status: tx.conversion_status,
          group: tx.conversion_group_id
        });
      }

      return isAvailable;
    })}
    onClose={() => setShowMultiBNPLModal(false)}
    onSuccess={async () => {
      if (onRefreshData) await onRefreshData();
      else await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowMultiBNPLModal(false);
    }}
    account={account}
  />
)}
{showReviewModal && (
  <MultiBNPLConversionModal
    installments={installments}
    mode="review"
    availableTransactions={currentTxs.filter(tx => tx.conversion_status === 'pending')}
    onClose={() => setShowReviewModal(false)}
    onSuccess={async () => {
      if (onRefreshData) await onRefreshData();
      else await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowReviewModal(false);
    }}
    account={account}
  />
)}

      {/* 🟢 FLOATING ACTION BUTTONS */}
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-[90] flex flex-col gap-3 animate-in slide-in-from-bottom-8">
        <button
          onClick={() => setIsLedgerOpen(true)}
          className="flex items-center justify-center w-12 h-12 rounded-full border-[3px] border-black bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          title="View Raw Ledger"
        >
          <Box className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowCardPaymentModal(true)}
          className="flex items-center justify-center w-14 h-14 rounded-full border-[3px] border-black bg-teal-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          title="Make Payment"
        >
          <CreditCard className="w-6 h-6" />
        </button>
      </div>


      {/* ========================================= */}
      {/* 🟢 SIDE-PEEK: RAW TRANSACTION LEDGER      */}
      {/* ========================================= */}
      {isLedgerOpen && createPortal(
        <>
          {/* DIMMED BACKDROP */}
          <div 
            className="fixed inset-0 z-[9990] bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsLedgerOpen(false)}
          />

          {/* SLIDE-IN PANEL */}
          <div className="fixed top-0 right-0 bottom-0 z-[9999] w-full md:w-[600px] lg:w-[700px] bg-[#FCF6E8] dark:bg-gray-950 md:border-l-[4px] border-black shadow-[-8px_0_20px_rgba(0,0,0,0.3)] flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* HEADER NAV */}
            <div className="shrink-0 sticky top-0 z-10 bg-[#FCF6E8]/90 dark:bg-gray-950/90 backdrop-blur-md px-4 py-4 md:px-8 md:py-6 flex items-center justify-between border-b-[3px] border-black shadow-sm">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsLedgerOpen(false)}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-[3px] border-black bg-white dark:bg-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[2px] active:shadow-none transition-all hover:-translate-y-0.5"
                >
                  <X className="w-4 h-4 text-black dark:text-white" strokeWidth={3} />
                </button>
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                    Raw Ledger
                  </h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                    {account.bank} Transactions
                  </p>
                </div>
              </div>
            </div>

            {/* SCROLLABLE WORKSPACE CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 relative custom-scrollbar">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(transactions || [])
                      .filter(tx => tx.payment_method_id === account.id || tx.paymentMethodId === account.id)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((tx) => (
                                                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                          <td className="p-4">
                            <div className="text-sm font-black text-gray-900 dark:text-gray-100">{tx.name}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                              {new Date(tx.date).toLocaleDateString()} • {tx.transaction_type}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <div className={`text-sm font-black ${tx.amount > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>
                              {formatCurrency(tx.amount)}
                            </div>
                          </td>
                          <td className="p-4 pr-6 w-20">
                            {/* 🟢 EDIT & DELETE ACTIONS (Visible on hover) */}
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingTx(tx);
                                  setEditTxForm({ name: tx.name, amount: Math.abs(tx.amount).toString(), date: tx.date.split('T')[0] });
                                  setShowEditTxModal(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <PinProtectedAction
                                featureId="transaction_deletions"
                                onVerified={async () => {
                                  await deleteTransactionAndRevertSchedule(tx.id);
                                  if (onRefreshData) await onRefreshData();
                                }}
                                actionLabel="Delete Record"
                              >
                                <button onClick={(e) => e.preventDefault()} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </PinProtectedAction>
                            </div>
                          </td>
                        </tr>

                    ))}
                    {transactions?.length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                          No transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ========================================= */}
      {/* 🟢 MODAL: PUSH TO BUDGET                  */}
      {/* ========================================= */}
      {showPushToBudget && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowPushToBudget(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative flex flex-col" onClick={e => e.stopPropagation()}>
            
            <button onClick={() => setShowPushToBudget(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border-2 border-black bg-gray-100 dark:bg-gray-800 hover:-translate-y-0.5 active:scale-95 transition-all">
              <X className="w-4 h-4 text-gray-900 dark:text-white" />
            </button>
            
            <div className="mb-6 pr-8">
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Push to Budget</h2>
              <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">Roll over unpaid balance</p>
            </div>

                                    <form onSubmit={handlePushToBudget} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rollover Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400">₱</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={pushBudgetForm.amount} 
                    onChange={e => setPushBudgetForm({...pushBudgetForm, amount: e.target.value})} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 pl-8 outline-none text-lg font-black dark:text-gray-100" 
                  />
                </div>
              </div>

                            <div className="flex flex-col gap-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest -mb-1">Target Budget Period</label>
                <div className="flex gap-2">
                  <select 
                    value={pushBudgetForm.targetMonth} 
                    onChange={e => setPushBudgetForm({...pushBudgetForm, targetMonth: e.target.value})} 
                    className="flex-[2] bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-xs font-black dark:text-gray-100 appearance-none"
                  >
                    {monthNames.map((m, index) => {
                      const currentYear = new Date().getFullYear();
                      const currentMonthIdx = new Date().getMonth();
                      
                      // 🟢 Disable the month if the selected year is in the past, 
                      // OR if it's the current year and the month has already passed!
                      const isDisabled = pushBudgetForm.targetYear < currentYear || 
                                        (pushBudgetForm.targetYear === currentYear && index < currentMonthIdx);
                      
                      return (
                        <option key={m} value={m} disabled={isDisabled}>
                          {m}
                        </option>
                      );
                    })}
                  </select>
                  <input 
                    type="number" 
                    min={new Date().getFullYear()} // 🟢 Blocks past years entirely
                    value={pushBudgetForm.targetYear} 
                    onChange={e => setPushBudgetForm({...pushBudgetForm, targetYear: parseInt(e.target.value) || new Date().getFullYear()})} 
                    className="flex-[1.5] bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-xs font-black dark:text-gray-100 text-center" 
                  />
                </div>

                <select 
                  value={pushBudgetForm.targetPeriod} 
                  onChange={e => setPushBudgetForm({...pushBudgetForm, targetPeriod: parseInt(e.target.value)})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-xs font-black dark:text-gray-100 appearance-none text-center"
                >
                  <option value={1}>First Paycheck (1st Half)</option>
                  <option value={2}>Second Paycheck (2nd Half)</option>
                </select>
              </div>

              {isSameAsOrigin ? (
                <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-400 p-3 rounded-xl mt-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <p className="text-[10px] font-medium text-red-900 dark:text-red-300 leading-relaxed">
                    <strong>Cannot push to origin period.</strong> This statement is already due in the {originMonth} {originYear} (Paycheck {originPeriod}) budget. Please select a future paycheck to roll the balance over.
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-400 p-3 rounded-xl mt-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <p className="text-[10px] font-medium text-emerald-900 dark:text-emerald-300 leading-relaxed">
                    This will inject a <strong>Leftover {account.bank} Balance</strong> line item directly into your <strong>{pushBudgetForm.targetMonth} {pushBudgetForm.targetYear} (Paycheck {pushBudgetForm.targetPeriod})</strong> budget plan to ensure you map out cash to pay it off.
                  </p>
                </div>
              )}

              <div className="pt-2 mt-auto flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowPushToBudget(false)}
                  className="px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-gray-700 bg-gray-100 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isPushing || isSameAsOrigin}
                  className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getAccentClasses('bg')}`}
                >
                  {isPushing ? 'Pushing...' : 'Push to Budget'}
                </button>
              </div>
            </form>

          </div>
        </div>,
        document.body
      )}


      {/* 🟢 MODAL: CARD PAYMENT */}
      {showCardPaymentModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex justify-center bg-black/60 p-4 backdrop-blur-md items-center">
          <div className="w-full max-w-sm rounded-[2rem] border-[4px] border-black bg-[#fff7e8] p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900 relative">
            <button onClick={() => setShowCardPaymentModal(false)} className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-teal-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] h-12 w-12"><CreditCard className="w-6 h-6" /></div>
            <h2 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-gray-100 mb-1">Make Payment</h2>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-5">Record a balance reduction</p>
            <form onSubmit={handleCardPaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input type="number" step="0.01" min="0.01" value={cardPaymentForm.amount} onChange={e => setCardPaymentForm({...cardPaymentForm, amount: e.target.value})} required className="w-full rounded-xl border-[3px] border-black bg-white p-3 pl-8 font-black outline-none transition-colors dark:bg-gray-800 dark:text-gray-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Date</label>
                  <input type="date" value={cardPaymentForm.date} onChange={e => setCardPaymentForm({...cardPaymentForm, date: e.target.value})} required className="relative appearance-none w-full rounded-xl border-[3px] border-black bg-white p-3 font-bold text-xs outline-none transition-colors dark:bg-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Name</label>
                  <input value={cardPaymentForm.name} onChange={e => setCardPaymentForm({...cardPaymentForm, name: e.target.value})} placeholder="Optional" className="w-full rounded-xl border-[3px] border-black bg-white p-3 font-bold text-xs outline-none transition-colors dark:bg-gray-800 dark:text-gray-100" />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isSubmitting} className="w-full rounded-xl border-[3px] border-black bg-teal-500 py-3.5 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-xs transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 🟢 MODAL: EDIT TRANSACTION */}
      {showEditTxModal && editingTx && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] border-[4px] border-black bg-[#fff7e8] p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative dark:bg-gray-900">
            <button onClick={() => { setShowEditTxModal(false); setEditingTx(null); }} className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-black bg-white text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"><X className="w-4 h-4" /></button>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[1.5rem] border-[3px] border-black bg-indigo-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><Pencil className="w-6 h-6" /></div>
            <h2 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-gray-100 mb-5">Edit Transaction</h2>
            <form onSubmit={handleEditTxSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Name</label>
                <input value={editTxForm.name} onChange={e => setEditTxForm({...editTxForm, name: e.target.value})} required className="w-full rounded-xl border-[3px] border-black bg-white p-3 font-bold text-sm outline-none dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Amount</label>
                  <input type="number" step="0.01" min="0" value={editTxForm.amount} onChange={e => setEditTxForm({...editTxForm, amount: e.target.value})} required className="w-full rounded-xl border-[3px] border-black bg-white p-3 font-black text-sm outline-none dark:bg-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Date</label>
                  <input type="date" value={editTxForm.date} onChange={e => setEditTxForm({...editTxForm, date: e.target.value})} required className="w-full rounded-xl border-[3px] border-black bg-white p-3 font-bold text-sm outline-none dark:bg-gray-800 dark:text-gray-100" />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={isSubmitting} className="w-full rounded-xl border-[3px] border-black bg-indigo-600 py-3.5 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-xs transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : 'Update Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      </div>
    </div>
  );
};

export default StatementPage;