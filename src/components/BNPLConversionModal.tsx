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
  const [status, setStatus] = useState<'pending' | 'approved'>('approved');
  const [months, setMonths] = useState<number>(3);
  const [customMonthly, setCustomMonthly] = useState<number | ''>('');
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [itemOverrides, setItemOverrides] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (mode === 'review') {
      setItemOverrides({});
      const savedStartDate = (currentGroupInstallment as (Installment & { start_date?: string | null }) | undefined)?.start_date
        || currentGroupInstallment?.startDateExact;
      if (savedStartDate) setSelectedCycle(savedStartDate.split('T')[0]);
    }
  }, [mode, reviewIndex, currentGroupInstallment]);

  const statementOptions = useMemo(() => {
    const now = new Date();
    // Look back one month to ensure we don't truncate the currently active/recent billing cycle
    const referenceDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetDate = new Date(now.getFullYear(), now.getMonth() + 4, 1);
    const structuralAccount = {
      ...account,
      openingBalanceDate: referenceDate.toISOString().slice(0, 10),
    };

    const buckets = generateCreditBuckets(
      structuralAccount,
      [],
      [],
      targetDate.getFullYear(),
      targetDate.toLocaleString('en-US', { month: 'long' })
    );

    return buckets
      .filter(bucket => bucket.targetYear > now.getFullYear() || (
        bucket.targetYear === now.getFullYear() &&
        new Date(bucket.targetYear, new Date(`${bucket.targetMonth} 1`).getMonth(), 1) >= referenceDate
      ))
      .slice(0, 5)
      .map(bucket => {
        const year = bucket.cycleStart.getFullYear();
        const month = String(bucket.cycleStart.getMonth() + 1).padStart(2, '0');
        const day = String(bucket.cycleStart.getDate()).padStart(2, '0');

        return {
          id: `${year}-${month}-${day}`,
          label: bucket.cycleLabel,
        };
      });
  }, [account]);



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
  const baseMonthly = totalPrincipal / activeTerm;
  const activeMonthlyAmount = mode === 'review'
    ? selectedTransactions.reduce((sum, tx) => sum + getTxMonthly(tx, activeTerm), 0)
    : customMonthly !== '' ? Number(customMonthly) : baseMonthly;
  const totalAmountToRepay = activeMonthlyAmount * activeTerm;
  const totalInterestAndFees = totalAmountToRepay - totalPrincipal;

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

        if (!selectedCycle) {
      return alert('Please select a starting Statement Month from the dropdown.');
    }

    if (selectedTransactions.length === 0) return alert('No transactions are available for this conversion.');
    
    setIsSubmitting(true);
        try {
      if (mode === 'review') {
        const conversionGroupId = activeReviewGroup[0]?.conversion_group_id;
        if (!conversionGroupId) throw new Error('Pending conversion group is missing an ID.');

        const safeStartDate = selectedCycle.includes('T') ? selectedCycle : `${selectedCycle}T12:00:00`;
        const { error: installmentError } = await supabase
          .from('installments')
          .update({
            principal_amount: totalPrincipal,
            total_amount: totalAmountToRepay,
            monthly_amount: activeMonthlyAmount,
            term_duration: activeTerm,
            start_date: safeStartDate,
            status: 'active'
          })
          .eq('conversion_group_id', conversionGroupId);

        if (installmentError) throw installmentError;

        const { error: transactionError } = await supabase
          .from('transactions')
          .update({ conversion_status: 'approved' })
          .eq('conversion_group_id', conversionGroupId);

        if (transactionError) throw transactionError;

        await queryClient.invalidateQueries({ queryKey: ['transactions'] });

        if (reviewIndex < reviewGroups.length - 1) {
          setReviewIndex(currentIndex => currentIndex + 1);
          setCustomMonthly('');
          setIsSubmitting(false);
        } else {
          await onSuccess();
          onClose();
        }
      } else {
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

        await convertMultipleToBNPL(
          selectedTransactions,
          status,
          {
            months,
            statementId: selectedCycle || new Date().toISOString().slice(0, 10),
            monthlyAmount: activeMonthlyAmount,
            principalAmount: totalPrincipal,
            totalAmount: totalAmountToRepay,
            dueDate: calculatedDueDay
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
        <div className="flex-1 min-h-[120px] overflow-y-auto mb-6 space-y-2 rounded-xl border-2 border-black bg-gray-50 p-2 dark:bg-gray-800/50">
          {displayTransactions.length === 0 ? (
            <p className="text-xs text-center p-4 text-gray-400">No eligible transactions available.</p>
          ) : (
            displayTransactions.map(tx => (
              <label key={tx.id} className="flex items-center space-x-2 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-indigo-400 transition-colors">                {mode === 'create' && (
                  <input
                    type="checkbox"
                    checked={selectedTxIds.has(tx.id)}
                    onChange={() => toggleSelection(tx.id)}
                    className="w-4 h-4 rounded border-black accent-indigo-600 cursor-pointer"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{tx.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {mode === 'review'
                      ? `₱${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${tx.date ? `| ${new Date(tx.date).toLocaleDateString()}` : ''}`
                      : (tx.date ? new Date(tx.date).toLocaleDateString() : '')
                    }
                  </p>
                </div>
                {mode === 'review' ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemOverrides[tx.id] ?? ''}
                    onChange={(event) => setItemOverrides(previous => ({
                      ...previous,
                      [tx.id]: event.target.value
                    }))}
                    placeholder={`₱${getTxMonthly(tx, activeTerm).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    aria-label={`Monthly amount for ${tx.name}`}
                    className="w-32 rounded-lg border-2 border-black dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-right text-sm font-black outline-none"                  />
                ) : (
                  <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                    ₱{Math.abs(tx.amount).toLocaleString()}
                  </p>
                )}
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
        <form onSubmit={handleSubmit} className="space-y-4 shrink-0">
          {mode === 'create' && <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-black">
            <button type="button" onClick={() => setStatus('pending')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1 transition-all ${status === 'pending' ? 'bg-amber-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500'}`}>
              <Clock className="w-4 h-4" /> Pending
            </button>
            <button type="button" onClick={() => setStatus('approved')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1 transition-all ${status === 'approved' ? 'bg-green-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500'}`}>
              <CheckCircle2 className="w-4 h-4" /> Approved
            </button>
          </div>}

          <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Term Duration</label>
                  <select value={mode === 'review' ? activeTerm : months} onChange={(e) => setMonths(Number(e.target.value))} disabled={mode === 'review'} className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-black dark:border-gray-600 rounded-xl px-2 py-2 font-bold text-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed">
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>12 Months</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Starts On</label>
                  <select value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-black dark:border-gray-600 rounded-xl px-2 py-2 font-bold text-sm outline-none">
                    <option value="" disabled>Select Statement</option>
                    {statementOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Actual Monthly Amortization</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mode === 'review' ? Number(activeMonthlyAmount.toFixed(2)) : customMonthly}
                  onChange={(e) => setCustomMonthly(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={mode === 'review'}
                  placeholder={`₱${baseMonthly.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  className="w-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-black dark:border-gray-600 rounded-xl px-3 py-2 font-bold text-sm outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

          {mode === 'review' ? (
            <div className="flex space-x-3 mt-6">
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
              disabled={isSubmitting || selectedTransactions.length === 0 || (status === 'approved' && !selectedCycle)}
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
