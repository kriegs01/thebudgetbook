import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, CreditCard, ChevronDown, Info, ChevronUp, Box, ShoppingBag } from 'lucide-react';
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
        
                // 🟢 FIX: Look one month ahead to always capture the current "running" (unbilled) cycle!
                const targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
                const buckets = generateCreditBuckets(
                  acc,
                  transactions || [],
                  installments || [],
                  targetDate.getFullYear(),
                  monthNames[targetDate.getMonth()]
                );
        
                // Reverse so newest statement is on top for the UI
                const reversedBuckets = [...buckets].reverse();
                setCycles(reversedBuckets);
        
        
        // ONLY reset to 0 if we are on a brand new page load or the selection is out of bounds
        setSelectedCycleIndex(prev => (prev < reversedBuckets.length ? prev : 0));
        
      } catch (error) {
        console.error('Error loading statement buckets:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAccountAndTransactions();
  }, [accountId, accounts, installments, transactions]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8 transition-colors">
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8 transition-colors">
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
      <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors ${isMobile ? 'overflow-x-hidden px-4 pb-8 pt-6' : 'p-8'}`}>
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
      <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors ${isMobile ? 'overflow-x-hidden px-4 pb-8 pt-6' : 'p-8'}`}>
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

  const groupedCurrentTxs = groupBNPLTransactions(currentTxs as any, installments).filter((item) => {
    if (!item.isGroup) {
      const tx = item.transactions[0];
      return !(tx?.conversion_status === 'approved' && tx?.conversion_group_id);
    }
    return true;
  });
  const visibleMobileTxs = currentTxs.filter(tx => !(tx.conversion_status === 'approved' && tx.conversion_group_id));
  const pendingConversions = currentTxs.filter(tx => tx.conversion_status === 'pending');
  const visibleStatementCount = groupedCurrentTxs.length;

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors ${isMobile ? 'overflow-x-hidden px-2 pb-8 pt-6' : 'p-8'}`}>
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

        <div className={`${isMobile ? 'mb-5' : 'mb-6'}`}>
          <div className="min-w-0 flex-1 rounded-[1.8rem] border-[4px] border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
            <div className={`flex items-center gap-3 ${isMobile ? 'justify-center' : 'justify-between'}`}>
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[1.2rem] border-[3px] border-black bg-purple-100 text-purple-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-purple-900/20 dark:text-purple-300">
                  <Calendar className="w-4 h-4" />
                </div>
                <p className={`text-sm font-black tracking-[0.08em] text-gray-800 dark:text-gray-100 ${isMobile ? 'text-center leading-tight' : 'leading-none'}`}>
                  <span className="uppercase tracking-[0.18em]">Billing Cycle:</span>{' '}
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Statement Range</span>
                </p>
              </div>
            </div>

            <div className="mt-4">
              {isMobile ? (
                <div className="relative">
                  <select
                    value={selectedCycleIndex}
                    onChange={(e) => setSelectedCycleIndex(Number(e.target.value))}
                    className="w-full appearance-none rounded-2xl border-[3px] border-black bg-[#fff8ea] px-4 py-3 pr-12 text-sm font-black text-gray-900 outline-none transition-colors dark:bg-gray-800 dark:text-gray-100"
                  >
                    {cycles.map((cycle, index) => (
                      <option key={cycle.cycleLabel} value={index}>
                        {cycle.cycleLabel}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {cycles.map((cycle, index) => (
                    <button
                      key={cycle.cycleLabel}
                      onClick={() => setSelectedCycleIndex(index)}
                      className={`rounded-[1.3rem] border-[3px] p-4 text-left shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all ${
                        selectedCycleIndex === index
                          ? 'border-black bg-purple-100 dark:bg-purple-900/20'
                          : 'border-black bg-[#fff8ea] hover:-translate-y-0.5 dark:bg-gray-800'
                      }`}
                    >
                      <div className="text-sm font-black text-gray-900 dark:text-gray-100 transition-colors">{cycle.cycleLabel}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    onClick={() => setShowMultiBNPLModal(true)}
                    className="whitespace-nowrap rounded-lg border-2 border-black bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    Convert to BNPL
                  </button>
                  {pendingConversions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowReviewModal(true)}
                      className="whitespace-nowrap rounded-lg border-2 border-black bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none animate-pulse"
                    >
                      Review Pending ({pendingConversions.length})
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





      </div>
    </div>
  );
};

export default StatementPage;
