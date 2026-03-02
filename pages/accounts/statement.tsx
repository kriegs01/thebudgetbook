import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, CreditCard } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getTransactionsByPaymentMethod } from '../../src/services/transactionsService';
import type { SupabaseTransaction } from '../../src/types/supabase';
import { calculateBillingCycles, formatDateRange } from '../../src/utils/billingCycles';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
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
          paymentMethodId: t.payment_method_id
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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading statement...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!accountId || !account) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-gray-500">Account not found or not a credit account.</p>
            <Link to="/accounts" className="mt-4 inline-block text-indigo-600 hover:text-indigo-700">
              Return to Accounts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!account.billingDate) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center space-x-4">
            <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <h1 className="text-2xl font-black text-gray-900">{account.bank} Statement</h1>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-gray-500">No billing date set for this credit account.</p>
            <p className="text-sm text-gray-400 mt-2">Please edit the account and set a billing date to view statements.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedCycle = cycles[selectedCycleIndex];
  const totalAmount = selectedCycle?.transactions.reduce((sum, tx) => sum + tx.amount, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-gray-900">{account.bank}</h1>
              <p className="text-sm text-gray-500">Credit Card Statement</p>
            </div>
          </div>
          <div className="bg-purple-50 text-purple-600 p-3 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        {/* Cycle Selector */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Billing Cycle</h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {cycles.map((cycle, index) => (
              <button
                key={index}
                onClick={() => setSelectedCycleIndex(index)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  selectedCycleIndex === index
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-100 hover:border-purple-200'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900">{cycle.label}</div>
                <div className="text-xs text-gray-500 mt-1">{cycle.transactions.length} transactions</div>
              </button>
            ))}
          </div>
        </div>

        {/* Statement Summary */}
        {selectedCycle && (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="text-sm font-bold uppercase text-gray-600 tracking-widest mb-4">Statement Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Statement Period</p>
                  <p className="text-lg font-bold text-gray-900">{selectedCycle.label}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Total Charges</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-1">Credit Limit</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(account.creditLimit ?? 0)}</p>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
                <div className="text-sm text-gray-500">{selectedCycle.transactions.length} items</div>
              </div>
              <div className="p-4">
                <div className="w-full overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCycle.transactions.map(tx => (
                        <tr key={tx.id} className="border-t border-gray-100">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{tx.name}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-500">
                              {new Date(tx.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(Math.abs(tx.amount))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {selectedCycle.transactions.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                            No transactions in this billing cycle.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StatementPage;
