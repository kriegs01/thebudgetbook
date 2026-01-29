import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
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
  id: string;
  startDate: Date;
  endDate: Date;
  label: string;
  transactions: Transaction[];
  total: number;
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

interface CreditStatementProps {
  accounts: Account[];
}

// Helper function to generate billing cycles
const generateBillingCycles = (
  billingDate: string | undefined,
  transactions: Transaction[]
): BillingCycle[] => {
  if (!billingDate) {
    // If no billing date, create monthly cycles from today going back
    const cycles: BillingCycle[] = [];
    const today = new Date();
    
    for (let i = 0; i < 24; i++) { // Generate 24 months of cycles
      const endDate = new Date(today.getFullYear(), today.getMonth() - i, today.getDate());
      const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, endDate.getDate() + 1);
      
      const cycleTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= startDate && txDate <= endDate;
      });
      
      const total = cycleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      cycles.push({
        id: `cycle-${i}`,
        startDate,
        endDate,
        label: `${formatDate(startDate)} - ${formatDate(endDate)}`,
        transactions: cycleTransactions,
        total
      });
    }
    
    return cycles;
  }
  
  // Parse billing date (e.g., "15th" -> 15)
  const dayOfMonth = parseInt(billingDate.replace(/\D/g, '')) || 1;
  const today = new Date();
  const cycles: BillingCycle[] = [];
  
  // Generate cycles going back from today
  for (let i = 0; i < 24; i++) { // Generate 24 months of cycles
    // Calculate the billing date for this cycle
    const billingMonth = today.getMonth() - i;
    const billingYear = today.getFullYear() + Math.floor(billingMonth / 12);
    const adjustedMonth = ((billingMonth % 12) + 12) % 12;
    
    const endDate = new Date(billingYear, adjustedMonth, dayOfMonth);
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, dayOfMonth + 1);
    
    // Filter transactions for this cycle
    const cycleTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate > startDate && txDate <= endDate;
    });
    
    const total = cycleTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    
    cycles.push({
      id: `cycle-${i}`,
      startDate,
      endDate,
      label: `${formatDate(startDate)} - ${formatDate(endDate)}`,
      transactions: cycleTransactions,
      total
    });
  }
  
  return cycles;
};

const CreditStatement: React.FC<CreditStatementProps> = ({ accounts }) => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account");
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
  const [showPastCycles, setShowPastCycles] = useState(false);

  useEffect(() => {
    if (!accountId || typeof window === 'undefined') return;
    
    // Find the account
    const acc = accounts.find(a => a.id === accountId);
    if (acc) {
      setAccount(acc);
    }
    
    // Fetch all transactions and filter to this account
    const txRaw = localStorage.getItem('transactions');
    let allTx: Transaction[] = [];
    if (txRaw) {
      try { allTx = JSON.parse(txRaw); } catch {}
    }
    const filtered = allTx.filter(tx => tx.paymentMethodId === accountId);
    setTransactions(filtered);
    
    // Generate billing cycles
    const cycles = generateBillingCycles(acc?.billingDate, filtered);
    setBillingCycles(cycles);
  }, [accountId, accounts]);

  // Display only past 12 months by default
  const displayedCycles = showPastCycles ? billingCycles : billingCycles.slice(0, 12);

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-500">Account not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{account.bank} - Statement</h1>
            <p className="text-sm text-gray-500">Billing cycles and transactions</p>
          </div>
        </div>

        {/* Account Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase mb-1">Current Balance</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(account.balance)}</p>
            </div>
            {account.creditLimit && (
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase mb-1">Credit Limit</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(account.creditLimit)}</p>
              </div>
            )}
            {account.creditLimit && (
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase mb-1">Available Credit</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(account.creditLimit - account.balance)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Billing Cycles */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Billing Cycles</h2>
            <div className="text-sm text-gray-500">{displayedCycles.length} cycles</div>
          </div>

          <div className="p-4">
            <div className="space-y-3">
              {displayedCycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{cycle.label}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {cycle.transactions.length} transaction{cycle.transactions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase">Total</p>
                        <p className={`text-lg font-bold ${cycle.total < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(cycle.total)}
                        </p>
                      </div>
                      <Link
                        to={`/accounts/cycle?account=${accountId}&cycle=${cycle.id}&start=${cycle.startDate.toISOString()}&end=${cycle.endDate.toISOString()}`}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              ))}

              {displayedCycles.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No billing cycles available.
                </div>
              )}
            </div>

            {billingCycles.length > 12 && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowPastCycles(!showPastCycles)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  {showPastCycles ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      <span>Hide Past Cycles</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      <span>Show Past Cycles</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditStatement;
