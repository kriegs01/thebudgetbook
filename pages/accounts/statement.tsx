import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, CreditCard, ChevronDown, Info } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account, Installment } from '../../types';
import { getTransactionsByPaymentMethod, getTransactionsByPaymentSchedule } from '../../src/services/transactionsService';
import type { SupabaseTransaction } from '../../src/types/supabase';
import { calculateBillingCycles, formatDateRange } from '../../src/utils/billingCycles';
import useMediaQuery from '../../src/hooks/useMediaQuery';
import { useTheme } from '../../src/contexts/ThemeContext';
import { PageHeader } from '../../src/components/PageHeader';
import { getPaymentSchedulesBySource } from '../../src/services/paymentSchedulesService';


type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
  transaction_type: string | null;
};

type BillingCycle = {
  startDate: Date;
  endDate: Date;
  label: string;
  transactions: Transaction[];
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

// Check if transaction falls within a billing cycle
const isInCycle = (transaction: Transaction, cycleStart: Date, cycleEnd: Date): boolean => {
  const txDate = new Date(transaction.date);
  return txDate >= cycleStart && txDate <= cycleEnd;
};

interface StatementPageProps {
  accounts: Account[];
  installments: Istallment[];
}

{/* TO: */}
const StatementPage: React.FC<StatementPageProps> = ({ accounts, installments = [] }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('account');
  const [account, setAccount] = useState<Account | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const [expandedInstallments, setExpandedInstallments] = useState<Record<string, boolean>>({});

  const [dbPaidAmounts, setDbPaidAmounts] = useState<Map<string, number>>(new Map());

  // 🟢 NEW: Fetch actual paid schedules for all installments
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
        // Find the account
        const acc = accounts.find(a => a.id === accountId);
        if (!acc || acc.type !== 'Credit') {
          // If accounts have loaded but this account is missing or not a credit account,
          // stop loading. If accounts haven't loaded yet (empty array), the effect will
          // re-run once the parent finishes loading, so keep the spinner up.
          if (accounts.length > 0) {
            setIsLoading(false);
          }
          return;
        }
        
        setAccount(acc);
        
        // Get billing date
        const billingDate = acc.billingDate;
        if (!billingDate) {
          // No billing date set, can't calculate cycles
          setIsLoading(false);
          return;
        }
        
        // Calculate billing cycles - Generate both past and future cycles to show all transactions
        const cycleData = calculateBillingCycles(billingDate, 12, false);
        
        // Load only this account's transactions from Supabase
        const { data: transactionsData, error: transactionsError } = await getTransactionsByPaymentMethod(accountId);
        
        if (transactionsError) {
          console.error('Error loading transactions:', transactionsError);
          setIsLoading(false);
          return;
        }
        
                // Convert Supabase transactions to local format
                let accountTransactions: Transaction[] = (transactionsData || []).map(t => ({
                  id: t.id,
                  name: t.name,
                  date: t.date,
                  amount: t.amount,
                  paymentMethodId: t.payment_method_id,
                  transaction_type: t.transaction_type ?? null
                }));
        
                // 🟢 NEW: Fetch actual payments made to linked installments and import them!
                const bundleInstallments = (installments || []).filter(inst =>
                    (inst.accountId === accountId || inst.linkedAccountId === accountId) && !inst.isArchived
                );
        
                const instPromises = bundleInstallments.map(async (inst) => {
                    const { data: schedules } = await getPaymentSchedulesBySource('installment', inst.id);
                    if (schedules) {
                        for (const schedule of schedules) {
                            const { data: txs } = await getTransactionsByPaymentSchedule(schedule.id);
                            if (txs) {
                                txs.forEach((tx: any) => {
                                    accountTransactions.push({
                                        id: tx.id,
                                        name: `Payment: ${inst.name}`,
                                        date: tx.date,
                                        amount: -Math.abs(tx.amount), // Negative amount for payments
                                        paymentMethodId: tx.payment_method_id,
                                        transaction_type: 'credit_payment'
                                    });
                                });
                            }
                        }
                    }
                });
                
                await Promise.all(instPromises);
        
                // Sort all transactions chronologically so rollover calculates properly
                accountTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                
                        // 🟢 Include the account's opening balance as the initial starting point
        let accumulatedRollover = account.openingBalance || 0;

        // Group transactions by cycle (Process oldest to newest)
        const sortedCycleData = [...cycleData].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        const chronologicalCycles: BillingCycle[] = sortedCycleData.map((cycle, index) => {
          const cycleTxs = accountTransactions.filter(tx => 
            isInCycle(tx, cycle.startDate, cycle.endDate)
          );
          
          // Auto-inject active installments as statement charges with EXACT precise dates
          if (bundleInstallments.length > 0) {
            bundleInstallments.forEach(inst => {
              if (inst.startDate && !inst.isArchived) {
                const [year, month] = inst.startDate.split('-');
                const startYear = parseInt(year);
                const startMonth = parseInt(month); // 1-12
                const termNum = parseInt(String(inst.termDuration).replace(/\D/g, '')) || 12;
                
                // Fallback to the 1st if no specific due date is set
                const dueDay = parseInt((inst as any).due_date || (inst as any).dueDate || '1'); 

                for (let i = 0; i < termNum; i++) {
                    // Create the exact date for this specific month's charge
                    // Use 12:00 PM to safely avoid midnight timezone shifting
                    const chargeDate = new Date(startYear, startMonth - 1 + i, dueDay, 12, 0, 0);

                    // Only inject if this exact charge date falls inside the current billing cycle window
                    if (chargeDate >= cycle.startDate && chargeDate <= cycle.endDate) {
                        cycleTxs.push({
                            id: `auto-inst-${inst.id}-${i}`,
                            name: `Installment: ${inst.name}`,
                            date: chargeDate.toISOString(),
                            amount: inst.monthlyAmount, // Positive charge
                            paymentMethodId: accountId,
                            transaction_type: 'installment_charge'
                        });
                    }
                }
              }
            });
          }

          // Inject Rollover (Positive)
          if (accumulatedRollover > 0) {
            cycleTxs.unshift({
              id: `rollover-${index}`,
              name: `Previous Balance Carried Over`,
              date: cycle.startDate.toISOString(), // Placed at the top of the statement
              amount: accumulatedRollover, 
              paymentMethodId: accountId,
              transaction_type: 'rollover_carryover'
            });
          }

          // Calculate next month's rollover based on net flow
          const cycleCharges = cycleTxs.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
          const cyclePayments = cycleTxs.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          
          accumulatedRollover = Math.max(0, cycleCharges - cyclePayments);
                  
          // Sort this specific cycle's transactions chronologically before rendering
          cycleTxs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return {
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            label: formatDateRange(cycle.startDate, cycle.endDate),
            transactions: cycleTxs
          };
        });
        
        // Reverse for the UI so newest cycle is on top
        const finalCycles = chronologicalCycles.reverse();
        setCycles(finalCycles);
        const today = new Date();
        const currentCycleIndex = finalCycles.findIndex(cycle => today >= cycle.startDate && today <= cycle.endDate);
        setSelectedCycleIndex(currentCycleIndex >= 0 ? currentCycleIndex : 0);

        

        
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAccountAndTransactions();
  // 🟢 FIX: Ensure calculation runs after paid amounts load
  }, [accountId, accounts, installments, dbPaidAmounts]); 


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

        // 🟢 NEW: LOAN BUNDLE DASHBOARD OVERRIDE
  if (account.subtype === 'Loan_Bundle' ) {
    const bundleInstallments = (installments || []).filter(inst =>
      (inst.accountId === account.id || inst.linkedAccountId === account.id) && !inst.isArchived
    );

            // --- 🟢 NEW: MASTER SUMMARY MATH ---
    let totalUsed = 0; // Tracks the Principal (Item Cost)
    let totalPayableAll = 0; // Tracks the True Debt (Principal + Interest)
    let totalPaidAll = 0; // Tracks Actual Money Paid
    let dueThisMonth = 0;

    const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });
    const currentYear = new Date().getFullYear();
    const currentMonthLabel = `${currentMonthName} ${currentYear}`;

    bundleInstallments.forEach(inst => {
      // 1. Sum up the Principal for the "Total Used" display
      totalUsed += inst.principalAmount || inst.totalAmount || 0;
      
      // 2. Sum up the True Debt for the "Remaining" math
      totalPayableAll += inst.totalAmount || 0;

      // 3. Sum up the actual payments from the database schedules
      const paidForThisInst = dbPaidAmounts.get(inst.id) ?? 0;
      totalPaidAll += paidForThisInst;

      // Project the schedule to find what is due THIS month
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
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const label = `${monthNames[monthIndex]} ${year}`;
        const isPaid = (i + 1) * inst.monthlyAmount <= paidForThisInst;

        // If this specific schedule month matches the current calendar month and isn't paid, add it!
        if (label === currentMonthLabel && !isPaid) {
          dueThisMonth += inst.monthlyAmount || 0;
        }
      }
    });

    // 4. Calculate Remaining based on TOTAL PAYABLE, not Total Used
    const totalRemaining = totalPayableAll - totalPaidAll;
    // ------------------------------------


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
            
            {/* 🟢 NEW: BUNDLE SUMMARY CARD */}
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
                  // Generate the localized schedule
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
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
                      
                      {/* 🟢 NEW: COLLAPSIBLE HEADER */}
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
  
                      {/* 🟢 NEW: HIDDEN SCHEDULE BODY */}
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
          <div className={`${isMobile ? 'mb-5 flex items-start gap-3' : 'mb-6 flex justify-start'}`}>
            {isMobile && (
              <Link to="/accounts" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
          </div>
          <div className="rounded-[1.8rem] border-[4px] border-black bg-white p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
            <p className="text-gray-500 dark:text-gray-400">No billing date set for this credit account.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Please edit the account and set a billing date to view statements.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedCycle = cycles[selectedCycleIndex];

  // 🟢 FIX: Safely fallback to an empty array to prevent the White Screen of Death
  const currentTxs = selectedCycle?.transactions || []; 

  // 🟢 Break down the statement math exactly like a real bank
  const previousBalance = currentTxs.find(tx => tx.transaction_type === 'rollover_carryover')?.amount ?? 0;
  
  const newCharges = currentTxs
    .filter(tx => tx.amount > 0 && tx.transaction_type !== 'rollover_carryover')
    .reduce((sum, tx) => sum + tx.amount, 0);
    
  const totalPayments = currentTxs
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
  const statementBalance = Math.max(0, previousBalance + newCharges - totalPayments);


  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors ${isMobile ? 'overflow-x-hidden px-4 pb-8 pt-6' : 'p-8'}`}>
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

        <div className={`${isMobile ? 'mb-5 flex items-start gap-3' : 'mb-6'}`}>
          {isMobile && (
            <Link to="/accounts" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-900 dark:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
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
                      <option key={cycle.label} value={index}>
                        {cycle.label} ({cycle.transactions.length})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {cycles.map((cycle, index) => (
                    <button
                      key={cycle.label}
                      onClick={() => setSelectedCycleIndex(index)}
                      className={`rounded-[1.3rem] border-[3px] p-4 text-left shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all ${
                        selectedCycleIndex === index
                          ? 'border-black bg-purple-100 dark:bg-purple-900/20'
                          : 'border-black bg-[#fff8ea] hover:-translate-y-0.5 dark:bg-gray-800'
                      }`}
                    >
                      <div className="text-sm font-black text-gray-900 dark:text-gray-100 transition-colors">{cycle.label}</div>
                      <div className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400 transition-colors">{cycle.transactions.length} transactions</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Statement Summary */}
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
                  <p className="text-lg font-bold text-green-600 transition-colors dark:text-green-400">-{formatCurrency(totalPayments)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Credit Limit</p>
                  <p className="text-lg font-bold text-gray-900 transition-colors dark:text-gray-100">{formatCurrency(account.creditLimit ?? 0)}</p>
                </div>
              </div>


            {/* Transactions Table */}
            <div className="overflow-hidden rounded-[1.8rem] border-[4px] border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-900">
              <div className="flex items-center justify-between border-b-[4px] border-black px-6 py-4 transition-colors">
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-600 transition-colors dark:text-gray-400">Transactions</h2>
                <div className="text-sm text-gray-500 transition-colors dark:text-gray-400">{selectedCycle.transactions.length} items</div>
              </div>
              <div className="p-4">
                {isMobile ? (
                  <div className="space-y-3">
                    {selectedCycle.transactions.map(tx => (
                      <div key={tx.id} className="rounded-[1.4rem] border-[3px] border-black bg-[#fff8ea] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors dark:bg-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 dark:text-gray-100">{tx.name}</p>
                            <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          <p className={`text-right text-sm font-black transition-colors ${tx.amount > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>
                            {formatCurrency(tx.amount)}
                          </p>

                        </div>
                      </div>
                    ))}
                    {selectedCycle.transactions.length === 0 && (
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
                        {selectedCycle.transactions.map(tx => (
                          <tr key={tx.id} className="border-t border-gray-100 transition-colors dark:border-gray-800">
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900 transition-colors dark:text-gray-100">{tx.name}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-500 transition-colors dark:text-gray-400">
                                {new Date(tx.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                            <div className={`text-sm font-semibold transition-colors ${tx.amount > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>
                              {formatCurrency(tx.amount)}
                            </div>

                            </td>
                          </tr>
                        ))}
                        {selectedCycle.transactions.length === 0 && (
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
      </div>
    </div>
  );
};

export default StatementPage;
