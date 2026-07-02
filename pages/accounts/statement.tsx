import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, CreditCard, ChevronDown } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getTransactionsByPaymentMethod } from '../../src/services/transactionsService';
import type { SupabaseTransaction } from '../../src/types/supabase';
import { calculateBillingCycles, formatDateRange } from '../../src/utils/billingCycles';
import useMediaQuery from '../../src/hooks/useMediaQuery';
import { useTheme } from '../../src/contexts/ThemeContext';
import { PageHeader } from '../../src/components/PageHeader';

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
}

const StatementPage: React.FC<StatementPageProps> = ({ accounts }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('account');
  const [account, setAccount] = useState<Account | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

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
        const accountTransactions: Transaction[] = (transactionsData || []).map(t => ({
          id: t.id,
          name: t.name,
          date: t.date,
          amount: t.amount,
          paymentMethodId: t.payment_method_id,
          transaction_type: t.transaction_type ?? null
        }));
        
        // Group transactions by cycle
        const billingCycles: BillingCycle[] = cycleData.map((cycle, index) => {
          const cycleTxs = accountTransactions.filter(tx => 
            isInCycle(tx, cycle.startDate, cycle.endDate)
          );
          
          return {
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            label: formatDateRange(cycle.startDate, cycle.endDate),
            transactions: cycleTxs
          };
        });
        
        setCycles(billingCycles);
        const today = new Date();
        const currentCycleIndex = billingCycles.findIndex(cycle => today >= cycle.startDate && today <= cycle.endDate);
        setSelectedCycleIndex(currentCycleIndex >= 0 ? currentCycleIndex : 0);
      } catch (error) {
        console.error('Error loading transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAccountAndTransactions();
  }, [accountId, accounts]);

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
  // Exclude credit_payment transactions from the charge total — payments reduce
  // the outstanding balance but are not charges for historical record-keeping.
  const totalAmount = selectedCycle?.transactions
    .filter(tx => tx.transaction_type !== 'credit_payment')
    .reduce((sum, tx) => sum + tx.amount, 0) ?? 0;

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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Statement Period</p>
                  <p className="text-lg font-bold text-gray-900 transition-colors dark:text-gray-100">{selectedCycle.label}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Total Charges</p>
                  <p className="text-lg font-bold text-red-600 transition-colors dark:text-red-400">{formatCurrency(totalAmount)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-400 transition-colors dark:text-gray-500">Credit Limit</p>
                  <p className="text-lg font-bold text-gray-900 transition-colors dark:text-gray-100">{formatCurrency(account.creditLimit ?? 0)}</p>
                </div>
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
                          <p className={`text-right text-sm font-black transition-colors ${tx.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {formatCurrency(Math.abs(tx.amount))}
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
                              <div className={`text-sm font-semibold transition-colors ${tx.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {formatCurrency(Math.abs(tx.amount))}
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
