// components/MultiBNPLConversionModal.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Account, Installment, Transaction } from '../types';
import { convertMultipleToBNPL } from '../services/bnplService';
import { deleteInstallmentFrontend } from '../services/installmentsService';
import { generateCreditBuckets } from '../utils/bucketEngine';
import { X, Clock, CheckCircle2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabaseClient';
import { createPortal } from 'react-dom';
import { createPaymentSchedulesBulk } from '../services/paymentSchedulesService';



interface MultiBNPLConversionModalProps {
  availableTransactions: Transaction[];
  installments?: Installment[];
  mode?: 'create' | 'review';
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  account: Account;
}

export const MultiBNPLConversionModal: React.FC<MultiBNPLConversionModalProps> = ({ 
  availableTransactions, 
  installments = [],
  mode = 'create',
  onClose, 
  onSuccess,
  account
}) => {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(
    () => mode === 'review' ? new Set(availableTransactions.map(tx => tx.id)) : new Set()
  );
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');
  const [months, setMonths] = useState<number>(3);
  const [customMonthly, setCustomMonthly] = useState<number | ''>('');
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [itemOverrides, setItemOverrides] = useState<Record<string, { monthly?: string; startCycle?: string }>>({});

  const [cancelledGroupIds, setCancelledGroupIds] = useState<Set<string>>(new Set());

  const reviewGroups = useMemo(() => {
    if (mode !== 'review') return [];

    const grouped = availableTransactions.reduce<Record<string, Transaction[]>>((groups, transaction) => {
      const groupId = transaction.conversion_group_id;
      if (!groupId) return groups;
      (groups[groupId] ||= []).push(transaction);
      return groups;
    }, {});

    return Object.values(grouped).filter(group => !cancelledGroupIds.has(group[0]?.conversion_group_id || ''));
  }, [availableTransactions, cancelledGroupIds, mode]);

  const activeReviewGroup = reviewGroups[reviewIndex] || [];
  const activeGroupId = activeReviewGroup[0]?.conversion_group_id;
  const currentGroupInstallment = installments.find(installment => installment.conversion_group_id === activeGroupId);


  const statementOptions = useMemo(() => {
    const now = new Date();
    
    // 1. Find the oldest transaction date in the batch to prevent time travel
    const earliestTxDate = availableTransactions?.length > 0 
      ? availableTransactions.reduce((min, tx) => {
          if (!tx.date) return min;
          const txDate = new Date(tx.date);
          return txDate < min ? txDate : min;
        }, new Date())
      : now;

    // Clear the time for a clean calendar-day comparison
    earliestTxDate.setHours(0, 0, 0, 0);

    const targetDate = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    
    const structuralAccount = {
      ...account,
      openingBalanceDate: earliestTxDate.toISOString().slice(0, 10),
    };

    const buckets = generateCreditBuckets(
      structuralAccount,
      [],
      [],
      targetDate.getFullYear(),
      targetDate.toLocaleString('en-US', { month: 'long' })
    );

    const monthMap: Record<string, string> = {
      January: '01', February: '02', March: '03', April: '04',
      May: '05', June: '06', July: '07', August: '08',
      September: '09', October: '10', November: '11', December: '12'
    };

    return buckets
      .filter(bucket => {
        const cycleEndDate = new Date(bucket.cycleEnd);
        cycleEndDate.setHours(23, 59, 59, 999);
        // 2. Only allow cycles that close ON or AFTER the transaction date!
        return cycleEndDate >= earliestTxDate;
      })
      .slice(0, 5)
      .map(bucket => {
        const startYr = bucket.cycleStart.getFullYear();
        const startMo = String(bucket.cycleStart.getMonth() + 1).padStart(2, '0');
        const startDay = String(bucket.cycleStart.getDate()).padStart(2, '0');

        const startStr = bucket.cycleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = bucket.cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return {
          id: `${startYr}-${startMo}-${startDay}`,
          // 🟢 Store bucket metadata directly in the key
          cycleKey: `${bucket.targetYear}-${monthMap[bucket.targetMonth] || startMo}`, 
          targetMonth: bucket.targetMonth,
          targetYear: bucket.targetYear,
          cycleStartDate: bucket.cycleStart.toISOString(),
          label: `${bucket.targetMonth} ${bucket.targetYear} (${startStr} - ${endStr})`,
        };
      });


  }, [account, availableTransactions]); // 👈 Added availableTransactions to dependencies


   // Track whether we have initialized this group so we don't clobber user changes
   const initializedGroupRef = React.useRef<string | null>(null);

   useEffect(() => {
     // 🛑 If we are submitting or have already initialized this active group, DO NOT overwrite!
     if (isSubmitting) return;
     if (!activeGroupId || initializedGroupRef.current === activeGroupId) return;
 
     if (mode === 'review' && activeReviewGroup.length > 0) {
       initializedGroupRef.current = activeGroupId;
 
       // 1. Extract Parent Cycle Key (e.g., '2026-10') from start_date
       const savedStartDate = (currentGroupInstallment as any)?.start_date || currentGroupInstallment?.startDateExact;
       let parentCycleKey = '';
       if (savedStartDate) {
         const [year, month] = String(savedStartDate).split('T')[0].split('-');
         parentCycleKey = `${year}-${month}`;
       }
       
       // 2. Find matching statement option
       const matchedOption = statementOptions.find(opt => opt.cycleKey === parentCycleKey) || statementOptions[0];
       const targetCycleKey = matchedOption?.cycleKey || statementOptions[0]?.cycleKey || '';
       const targetCycleId = matchedOption?.id || statementOptions[0]?.id || '';
 
       if (targetCycleId) {
         setSelectedCycle(targetCycleId);
       }
 
       // 3. Restore the Months (Tenure)
       const savedTenure = parseInt(String(currentGroupInstallment?.term_duration || '3').replace(/\D/g, ''), 10);
       if (savedTenure) {
         setMonths(savedTenure);
       }
 
       // 4. Set overrides once without wiping on subsequent renders
       setItemOverrides(prev => {
         const next = { ...prev };
         activeReviewGroup.forEach(tx => {
           if (!next[tx.id]) {
             next[tx.id] = {
               monthly: '',
               startCycle: targetCycleKey
             };
           }
         });
         return next;
       });
     }
   }, [mode, activeGroupId, activeReviewGroup, currentGroupInstallment, statementOptions, isSubmitting]);
 


  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedTxIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTxIds(newSet);
  };

  const selectedTransactions = mode === 'review'
    ? activeReviewGroup
    : availableTransactions.filter(tx => selectedTxIds.has(tx.id));
  const totalPrincipal = selectedTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const activeTerm = mode === 'review'
    ? parseInt(String((currentGroupInstallment as (Installment & { term_duration?: number }) | undefined)?.term_duration || currentGroupInstallment?.termDuration || '3').replace(/\D/g, ''), 10) || 3
    : months;
  const getTxMonthly = (tx: Transaction, term: number) => {
    if (itemOverrides[tx.id] !== undefined && itemOverrides[tx.id] !== '') {
      return Number(itemOverrides[tx.id]);
    }
    return Math.abs(tx.amount) / term;
  };
    // Sum monthly amounts across all selected transactions, respecting per-item inputs
    const activeMonthlyAmount = useMemo(() => {
      return selectedTransactions.reduce((sum, tx) => {
        const override = itemOverrides[tx.id];
        const fallbackMonthly = Math.abs(tx.amount) / activeTerm;
        const parsedOverride = override?.monthly !== undefined && override.monthly !== ''
          ? Number(override.monthly)
          : fallbackMonthly;
        const safeMonthly = isNaN(parsedOverride) ? fallbackMonthly : parsedOverride;
        return sum + safeMonthly;
      }, 0);
    }, [selectedTransactions, itemOverrides, activeTerm]);
  
    const totalAmountToRepay = activeMonthlyAmount * activeTerm;
    const totalInterestAndFees = Math.max(0, totalAmountToRepay - totalPrincipal);
  

  const handleCancelPending = async () => {
    if (mode !== 'review') return;

    const installmentId = currentGroupInstallment?.id;
    if (!installmentId || !activeGroupId) {
      alert('The pending installment could not be found. Please refresh and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await deleteInstallmentFrontend(installmentId);
      if (error) throw error;

      setCancelledGroupIds(previous => {
        const next = new Set(previous);
        next.add(activeGroupId);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await onSuccess();

      if (reviewGroups.length <= 1) {
        onClose();
      } else {
        setReviewIndex(currentIndex => Math.min(currentIndex, reviewGroups.length - 2));
        setCustomMonthly('');
        setIsSubmitting(false);
      }
    } catch (error) {
      alert('Failed to cancel the pending conversion. Please try again.');
      setIsSubmitting(false);
    }
  };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🟢 NEW: The Truth Teller
    console.log("SUBMIT INITIATED. Payload data:", { 
      txCount: selectedTxIds.size, 
      status, 
      months, 
      selectedCycle, 
      totalPrincipal,
      activeMonthlyAmount,
      totalAmountToRepay,
      totalInterestAndFees
    });


    if (selectedTransactions.length === 0) return alert('No transactions are available for this conversion.');
    
    setIsSubmitting(true);
        try {
          if (mode === 'review') {
            const conversionGroupId = activeReviewGroup[0]?.conversion_group_id || currentGroupInstallment?.conversion_group_id;
            const targetInstallmentId = currentGroupInstallment?.id;
    
            if (!conversionGroupId && !targetInstallmentId) {
              throw new Error('Pending conversion group is missing an ID.');
            }
    
            const MONTH_NAMES = [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            const fallbackCycle = statementOptions[0]?.cycleKey || new Date().toISOString().substring(0, 7);
            const scheduleCurve: Record<string, number> = {};
    
                        // 🟢 Calculate schedules using profile-aligned target months
                        selectedTransactions.forEach(tx => {
                          const override = itemOverrides[tx.id];
                          const itemCycle = override?.startCycle || fallbackCycle;
                          
                          const itemMonthly = override?.monthly !== undefined && override.monthly !== ''
                            ? Number(override.monthly)
                            : (Math.abs(tx.amount) / activeTerm);
                
                          const itemTenure = months || activeTerm || 3;
                          const [startYear, startMonth] = itemCycle.split('-').map(Number);
                          
                          for (let i = 0; i < itemTenure; i++) {
                            const targetDate = new Date(startYear, startMonth - 1 + i, 1);
                            const cycleKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
                            scheduleCurve[cycleKey] = (scheduleCurve[cycleKey] || 0) + itemMonthly;
                          }
                        });
                
                        const sortedCycles = Object.keys(scheduleCurve).sort();
                        const earliestCycle = sortedCycles[0] || fallbackCycle;
                        const initialMonthlyAmount = scheduleCurve[earliestCycle] || activeMonthlyAmount;
                        const computedTotalRepayment = Object.values(scheduleCurve).reduce((sum, amt) => sum + amt, 0);
                        
                        // 🟢 Anchor the start date to the 15th of the start cycle month to prevent premature activation
                        const safeStartDate = `${earliestCycle}-15T12:00:00`;
            
    
            console.log('APPROVING BNPL BATCH:', {
              targetInstallmentId,
              conversionGroupId,
              sortedCycles,
              scheduleCurve,
              computedTotalRepayment
            });
    
            // 1. Update parent installment to active using its explicit ID
                    // ✅ Change to:
        let installmentQuery = supabase.from('installments').update({
          principal_amount: totalPrincipal,
          total_amount: computedTotalRepayment > 0 ? computedTotalRepayment : totalAmountToRepay,
          monthly_amount: initialMonthlyAmount,
          term_duration: sortedCycles.length || activeTerm, // 👈 Pure integer!
          start_date: safeStartDate,
          status: 'active'
        });

    
            if (targetInstallmentId) {
              installmentQuery = installmentQuery.eq('id', targetInstallmentId);
            } else {
              installmentQuery = installmentQuery.eq('conversion_group_id', conversionGroupId);
            }
    
            const { data: updatedInstallment, error: installmentError } = await installmentQuery.select().single();
    
            if (installmentError) {
              console.error('Failed to activate installment:', installmentError);
              throw installmentError;
            }
    
            const activeId = updatedInstallment.id;
            const activeAccountId = updatedInstallment.account_id || account.id;
    
            // 2. Mark raw transactions approved
            const { error: transactionError } = await supabase
              .from('transactions')
              .update({ conversion_status: 'approved' })
              .eq('conversion_group_id', conversionGroupId);
    
            if (transactionError) {
              console.error('Failed to update transactions status:', transactionError);
              throw transactionError;
            }
    
            // 3. Delete existing schedules for this installment
            const { error: delError } = await supabase
              .from('monthly_payment_schedules')
              .delete()
              .eq('source_type', 'installment')
              .eq('source_id', activeId);
    
            if (delError) {
              console.warn('Notice on cleaning old schedules:', delError);
            }
    
                    // 4. Build schedules payload
        const { data: authData } = await supabase.auth.getUser();
        const schedulesToInsert = sortedCycles.map((cycleKey, idx) => {
          const [yearStr, monthStr] = cycleKey.split('-');
          const monthIndex = parseInt(monthStr, 10) - 1;
          const expectedAmount = scheduleCurve[cycleKey];

          return {
            source_type: 'installment',
            source_id: activeId,
            month: MONTH_NAMES[monthIndex],
            year: parseInt(yearStr, 10),
            payment_number: idx + 1,
            expected_amount: Number(expectedAmount.toFixed(2)),
            amount_paid: 0,
            status: 'pending', // 👈 SATISFIES CONSTRAINT
            account_id: activeAccountId,
            user_id: authData?.user?.id
          };
        });

        console.log('INSERTING SCHEDULES:', schedulesToInsert);

        if (schedulesToInsert.length > 0) {
          const { error: schedError } = await createPaymentSchedulesBulk(schedulesToInsert as any);
          if (schedError) {
            console.error('Failed to create plotted schedules:', schedError);
            alert(`Schedule insertion error: ${schedError.message || JSON.stringify(schedError)}`);
            throw schedError;
          }
        }

        // Close the modal FIRST so Realtime refetch does not leave the modal hanging
        setIsSubmitting(false);
        onClose();

        // Then refresh queries
        await queryClient.invalidateQueries({ queryKey: ['transactions'] });
        await queryClient.invalidateQueries({ queryKey: ['installments'] });
        await queryClient.invalidateQueries({ queryKey: ['payment_schedules'] });
        await onSuccess();
        return;

    
            if (reviewIndex < reviewGroups.length - 1) {
              setReviewIndex(currentIndex => currentIndex + 1);
              setCustomMonthly('');
              setItemOverrides({});
              setIsSubmitting(false);
            } else {
              await onSuccess();
              onClose();
            }
          }
    
    
     else {
        let calculatedDueDay = '';

        if (account.dueDate) {
          const rawDate = String(account.dueDate);
          const dayPart = rawDate.includes('-') ? rawDate.split('-').pop() : rawDate;
          const parsedDay = parseInt(dayPart || '0', 10);

          if (!isNaN(parsedDay) && parsedDay > 0) {
            calculatedDueDay = String(parsedDay);
          }
        }

        if (!calculatedDueDay) {
          const billDate = parseInt(String(account.billingDate), 10) || 1;
          const daysToPay = parseInt(String(account.daysToPay), 10) || 0;
          const totalDays = billDate + daysToPay;
          const rolledOverDay = totalDays > 30 ? totalDays - 30 : totalDays;

          calculatedDueDay = String(rolledOverDay);
        }

                // Format the overrides dictionary so numbers and cycle strings are clean
                const formattedOverrides: Record<string, { monthly?: number; startCycle?: string }> = {};
                Object.entries(itemOverrides).forEach(([id, val]) => {
                  formattedOverrides[id] = {
                    monthly: val.monthly !== undefined && val.monthly !== '' ? Number(val.monthly) : undefined,
                    startCycle: val.startCycle || (selectedCycle ? selectedCycle.substring(0, 7) : undefined)
                  };
                });
        
                await convertMultipleToBNPL(
                  selectedTransactions,
                  status,
                  {
                    months,
                    statementId: selectedCycle || new Date().toISOString().slice(0, 10),
                    monthlyAmount: activeMonthlyAmount,
                    principalAmount: totalPrincipal,
                    totalAmount: totalAmountToRepay,
                    dueDate: calculatedDueDay,
                    itemOverrides: formattedOverrides
                  },
                  account.id
                );
        

        await queryClient.invalidateQueries({ queryKey: ['transactions'] });
        await onSuccess();
        onClose();
      }
    } catch (error) {
      alert('Failed to convert transactions. Please try again.');
      setIsSubmitting(false);
    }
  };

  const displayTransactions = mode === 'review' ? activeReviewGroup : availableTransactions;

  if (!mounted) return null;

  return createPortal(
    (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="relative flex w-full max-w-md flex-col rounded-3xl border-4 border-black bg-white p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900 max-h-[90vh]">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">
          {mode === 'review'
            ? `Review Pending Conversions (${reviewIndex + 1} of ${reviewGroups.length})`
            : 'Convert to BNPL'}
        </h2>
        {mode === 'review' && (
          <div className="mt-1 inline-block px-3 py-1 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-widest rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            Term: {activeTerm} Months
          </div>
        )}
        <p className="text-xs text-gray-500 mb-6">
          {mode === 'review' ? 'Confirm the terms for this pending conversion.' : 'Select items to group into an installment plan.'}
        </p>

        {/* 1. Transaction Checklist (Scrollable) */}
        <div className="flex-1 min-h-[140px] max-h-[280px] overflow-y-auto mb-4 space-y-2 rounded-xl border-2 border-black bg-gray-50 p-2 dark:bg-gray-800/50">
          {displayTransactions.length === 0 ? (
            <p className="text-xs text-center p-4 text-gray-400">No eligible transactions available.</p>
          ) : (
            displayTransactions.map(tx => (
              <label 
  key={tx.id} 
  className="flex flex-col p-3 bg-white dark:bg-gray-900 rounded-xl border-2 border-black/10 dark:border-gray-700 hover:border-indigo-500 transition-all gap-2"
>
  {/* TOP ROW: Checkbox + Name + (Date) | Amount */}
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center space-x-2 min-w-0 flex-1">
      {mode === 'create' && (
        <input
          type="checkbox"
          checked={selectedTxIds.has(tx.id)}
          onChange={() => toggleSelection(tx.id)}
          className="w-4 h-4 rounded border-black accent-indigo-600 cursor-pointer shrink-0"
        />
      )}
      <div className="flex items-baseline gap-1.5 min-w-0 truncate">
        <span className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">
          {tx.name}
        </span>
        {tx.date && (
          <span className="text-[10px] font-bold text-gray-400 shrink-0">
            ({new Date(tx.date).toLocaleDateString()})
          </span>
        )}
      </div>
    </div>

    {/* Principal Amount Tag */}
    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 shrink-0">
      ₱{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </span>
  </div>

  {/* BOTTOM ROW: Full-width Statement Selector + Compact Monthly Input */}
<div className="flex items-center gap-2 pt-1 border-t border-dashed border-gray-100 dark:border-gray-800">
  <select
    value={itemOverrides[tx.id]?.startCycle || statementOptions[0]?.cycleKey || ''}
    onChange={(e) => {
      const val = e.target.value;
      setItemOverrides(prev => ({
        ...prev,
        [tx.id]: { ...prev[tx.id], startCycle: val }
      }));
    }}
    className="flex-1 min-w-0 text-xs font-bold border-2 border-amber-500 dark:border-amber-400 rounded-lg px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 outline-none truncate animate-pulse focus:animate-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition-all"
  >
    {statementOptions.map(o => (
      <option key={o.id} value={o.cycleKey}>
        {o.label}
      </option>
    ))}
  </select>

  <div className="relative shrink-0">
    <input
      type="number"
      min="0"
      step="0.01"
      value={itemOverrides[tx.id]?.monthly ?? ''}
      onChange={(e) => setItemOverrides(prev => ({
        ...prev,
        [tx.id]: { ...prev[tx.id], monthly: e.target.value }
      }))}
      placeholder={`₱${(Math.abs(tx.amount) / activeTerm).toFixed(2)}`}
      className="w-24 rounded-lg border-2 border-amber-500 dark:border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 px-2 py-1.5 text-right text-xs font-black outline-none animate-pulse focus:animate-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 transition-all"
    />
  </div>
</div>

</label>

            ))
          )}
        </div>


        {/* 2. Math Summary */}
        <div className="shrink-0 flex justify-between items-center mb-4 p-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl">
          <div className="text-xs font-black uppercase text-indigo-800">
            <div>Total Selected</div>
            <div className="mt-2 space-y-1 text-[11px] normal-case tracking-normal text-indigo-700">
              <div className="flex justify-between gap-6"><span>Principal</span><span>₱{totalPrincipal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between gap-6"><span>Interest &amp; Fees</span><span>₱{totalInterestAndFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between gap-6 font-black"><span>Total Repayment</span><span>₱{totalAmountToRepay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>
        </div>

        {/* 3. Conversion Form */}
                {/* 3. Conversion Form Controls */}
                <form onSubmit={handleSubmit} className="space-y-4 shrink-0">
          {mode === 'create' && (
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-black">
              <button 
                type="button" 
                onClick={() => setStatus('pending')} 
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1 transition-all ${status === 'pending' ? 'bg-amber-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500'}`}
              >
                <Clock className="w-4 h-4" /> Pending
              </button>
              <button 
                type="button" 
                onClick={() => setStatus('approved')} 
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1 transition-all ${status === 'approved' ? 'bg-green-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500'}`}
              >
                <CheckCircle2 className="w-4 h-4" /> Approved
              </button>
            </div>
          )}

          {/* Unified Bulk Term / Tenure Selector */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              Term Duration
            </label>
            <select 
              value={mode === 'review' ? activeTerm : months} 
              onChange={(e) => setMonths(Number(e.target.value))} 
              disabled={mode === 'review'} 
              className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-black dark:border-gray-600 rounded-xl px-3 py-2.5 font-bold text-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
            </select>
          </div>

          {mode === 'review' ? (
            <div className="flex space-x-3 mt-4">
              <button
                type="button"
                onClick={handleCancelPending}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border-2 border-black bg-red-500 py-3 font-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedTransactions.length === 0}
                className="flex-1 rounded-xl border-2 border-black bg-green-500 py-3 font-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60"
              >
                {isSubmitting ? 'Processing...' : 'Approve'}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || selectedTransactions.length === 0}
              className="w-full bg-indigo-600 text-white border-2 border-black py-3 rounded-xl font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Processing...' : `Convert ${selectedTxIds.size} Items`}
            </button>
          )}
        </form>

      </div>
      </div>
    ),
    document.body
  );
};
