import React, { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, Calendar } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
};

type BillingCycle = {
  cycleNumber: number;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  transactions: Transaction[];
  totalAmount: number;
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

interface AccountStatementProps {
  accounts: Account[];
}

const AccountStatement: React.FC<AccountStatementProps> = ({ accounts }) => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || searchParams.get("id");
  const [account, setAccount] = useState<Account | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<number | null>(null);

  // Calculate billing cycles based on account start date and billing rules
  const calculateBillingCycles = (account: Account, transactions: Transaction[]): BillingCycle[] => {
    if (!account || account.type !== 'Credit') return [];

    // For prototype: Use a mock billing day (e.g., 15th of each month)
    // In production, this would use account.billingDate
    const billingDayOfMonth = 15; // Mock billing day
    const dueDay = 1; // Mock due date (1st of next month)

    // Get the earliest transaction or use current date minus 6 months as start
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    
    const sortedTx = [...transactions].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    const startDate = sortedTx.length > 0 
      ? new Date(sortedTx[0].date) 
      : sixMonthsAgo;

    // Generate billing cycles from start date to now
    const cycles: BillingCycle[] = [];
    let cycleNumber = 1;
    let currentCycleStart = new Date(startDate.getFullYear(), startDate.getMonth(), billingDayOfMonth);
    
    // If start date is after billing day of that month, start from next month
    if (startDate.getDate() > billingDayOfMonth) {
      currentCycleStart = new Date(startDate.getFullYear(), startDate.getMonth() + 1, billingDayOfMonth);
    }

    while (currentCycleStart <= now) {
      const cycleEnd = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, billingDayOfMonth - 1);
      const dueDate = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, dueDay);

      // Filter transactions for this cycle
      const cycleTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= currentCycleStart && txDate <= cycleEnd;
      });

      const totalAmount = cycleTransactions.reduce((sum, tx) => sum + tx.amount, 0);

      cycles.push({
        cycleNumber,
        startDate: new Date(currentCycleStart),
        endDate: new Date(cycleEnd),
        dueDate: new Date(dueDate),
        transactions: cycleTransactions,
        totalAmount
      });

      // Move to next cycle
      currentCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, billingDayOfMonth);
      cycleNumber++;
    }

    return cycles.reverse(); // Most recent first
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Get account data
    if (accountId) {
      const acc = accounts.find(a => a.id === accountId);
      if (acc) {
        setAccount(acc);
        
        // Fetch transactions for this account
        const txRaw = localStorage.getItem('transactions');
        let allTx: Transaction[] = [];
        if (txRaw) {
          try { 
            allTx = JSON.parse(txRaw); 
          } catch (error) {
            console.error('Failed to parse transactions from localStorage:', error);
          }
        }
        const accountTransactions = allTx.filter(tx => tx.paymentMethodId === accountId);
        
        // Calculate billing cycles
        const billingCycles = calculateBillingCycles(acc, accountTransactions);
        setCycles(billingCycles);
        
        // Expand most recent cycle by default
        if (billingCycles.length > 0) {
          setExpandedCycle(billingCycles[0].cycleNumber);
        }
      }
    }
  }, [accountId, accounts]);

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center space-x-4">
            <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <h1 className="text-2xl font-black text-gray-900">Account Not Found</h1>
          </div>
        </div>
      </div>
    );
  }

  if (account.type !== 'Credit') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center space-x-4">
            <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Link>
            <h1 className="text-2xl font-black text-gray-900">Statements Not Available</h1>
          </div>
          <p className="text-gray-600">Statements are only available for credit accounts.</p>
        </div>
      </div>
    );
  }

  const currentBalance = account.balance || 0;
  const creditLimit = account.creditLimit || 0;
  // Ensure available credit doesn't exceed credit limit or go negative
  const availableCredit = Math.max(0, Math.min(creditLimit, creditLimit - currentBalance));

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
        </div>

        {/* Account Summary Card */}
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl p-8 text-white mb-8 shadow-xl">
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-purple-100">Credit Card</p>
                <p className="text-lg font-bold">{account.bank}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-purple-200 mb-1">Current Balance</p>
              <p className="text-2xl font-black">{formatCurrency(currentBalance)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-purple-200 mb-1">Credit Limit</p>
              <p className="text-2xl font-black">{formatCurrency(creditLimit)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-purple-200 mb-1">Available Credit</p>
              <p className="text-2xl font-black">{formatCurrency(availableCredit)}</p>
            </div>
          </div>
        </div>

        {/* Billing Cycles */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Billing Statements</h2>
          </div>

          {cycles.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No billing cycles found. Add transactions to see statements.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cycles.map(cycle => (
                <div key={cycle.cycleNumber} className="p-6">
                  <button
                    onClick={() => setExpandedCycle(expandedCycle === cycle.cycleNumber ? null : cycle.cycleNumber)}
                    className="w-full flex items-center justify-between hover:bg-gray-50 p-4 rounded-xl transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-purple-50 rounded-xl">
                        <Calendar className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">
                          Cycle #{cycle.cycleNumber}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatDate(cycle.startDate)} - {formatDate(cycle.endDate)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Due: {formatDate(cycle.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-gray-900">{formatCurrency(cycle.totalAmount)}</p>
                      <p className="text-xs text-gray-500">{cycle.transactions.length} transactions</p>
                    </div>
                  </button>

                  {/* Expanded Transaction Details */}
                  {expandedCycle === cycle.cycleNumber && (
                    <div className="mt-4 ml-4 border-l-2 border-purple-100 pl-6">
                      {cycle.transactions.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4">No transactions in this cycle.</p>
                      ) : (
                        <div className="space-y-3">
                          {cycle.transactions.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="font-medium text-gray-900">{tx.name}</p>
                                <p className="text-xs text-gray-500">{formatDate(new Date(tx.date))}</p>
                              </div>
                              <p className={`font-bold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(tx.amount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Note */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Billing cycles are calculated using a prototype logic with a fixed billing date (15th of each month). 
            In production, this would use the actual billing date from your account settings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountStatement;
