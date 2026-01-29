import React, { useEffect, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface BillingCycleDetailProps {
  accounts: Account[];
}

const BillingCycleDetail: React.FC<BillingCycleDetailProps> = ({ accounts }) => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account");
  const cycleId = searchParams.get("cycle");
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cycleTotal, setCycleTotal] = useState(0);
  const [previousCycleTotal, setPreviousCycleTotal] = useState(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!accountId || !startParam || !endParam || typeof window === 'undefined') return;
    
    // Parse dates
    const start = new Date(startParam);
    const end = new Date(endParam);
    setStartDate(start);
    setEndDate(end);
    
    // Find the account
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      setAccount(acc);
    }
    
    // Fetch all transactions and filter to this account and cycle
    const txRaw = localStorage.getItem('transactions');
    let allTx: Transaction[] = [];
    if (txRaw) {
      try { allTx = JSON.parse(txRaw); } catch {}
    }
    
    // Filter transactions for this cycle
    const cycleTransactions = allTx.filter(tx => {
      if (tx.paymentMethodId !== accountId) return false;
      const txDate = new Date(tx.date);
      return txDate > start && txDate <= end;
    });
    
    setTransactions(cycleTransactions);
    const total = cycleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    setCycleTotal(total);
    
    // Calculate previous cycle total
    const previousStart = new Date(start);
    previousStart.setMonth(previousStart.getMonth() - 1);
    const previousEnd = new Date(start);
    
    const previousCycleTransactions = allTx.filter(tx => {
      if (tx.paymentMethodId !== accountId) return false;
      const txDate = new Date(tx.date);
      return txDate > previousStart && txDate <= previousEnd;
    });
    
    const prevTotal = previousCycleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    setPreviousCycleTotal(prevTotal);
  }, [accountId, startParam, endParam, accounts]);

  const absoluteChange = cycleTotal - previousCycleTotal;
  const percentChange = previousCycleTotal !== 0 
    ? ((cycleTotal - previousCycleTotal) / Math.abs(previousCycleTotal)) * 100 
    : 0;

  if (!account || !startDate || !endDate) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <Link 
            to={`/accounts/statement?account=${accountId}`} 
            className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{account.bank}</h1>
            <p className="text-sm text-gray-500">
              Billing Cycle: {formatDate(startDate)} - {formatDate(endDate)}
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase mb-2">This Cycle</p>
            <p className={`text-2xl font-bold ${cycleTotal < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(cycleTotal)}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase mb-2">Previous Cycle</p>
            <p className={`text-2xl font-bold ${previousCycleTotal < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(previousCycleTotal)}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase mb-2">Change</p>
            <div className="flex items-center space-x-2">
              {absoluteChange >= 0 ? (
                <TrendingUp className="w-5 h-5 text-red-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-green-500" />
              )}
              <p className={`text-2xl font-bold ${absoluteChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(absoluteChange))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase mb-2">% Change</p>
            <div className="flex items-center space-x-2">
              {percentChange >= 0 ? (
                <TrendingUp className="w-5 h-5 text-red-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-green-500" />
              )}
              <p className={`text-2xl font-bold ${percentChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {Math.abs(percentChange).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
            <div className="text-sm text-gray-500">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</div>
          </div>

          <div className="p-4">
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(tx => (
                    <tr key={tx.id} className="border-t border-gray-100 hover:bg-gray-50">
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
                          {formatCurrency(tx.amount)}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                        No transactions in this billing cycle.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingCycleDetail;
