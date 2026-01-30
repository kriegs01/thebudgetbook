import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getTransactionsByPaymentMethod } from '../../src/services/transactionsService';
import type { SupabaseTransaction } from '../../src/types/supabase';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);

interface AccountFilteredTransactionsProps {
  accounts: Account[];
}

const AccountFilteredTransactions: React.FC<AccountFilteredTransactionsProps> = ({ accounts }) => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || searchParams.get("id");
  const [accountName, setAccountName] = useState<string>("Account");
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }

    loadTransactions();
    
    // Get account name from the passed accounts prop
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setAccountName(account.bank);
    }
  }, [accountId, accounts]);

  const loadTransactions = async () => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await getTransactionsByPaymentMethod(accountId);
      if (fetchError) {
        console.error('Failed to load transactions:', fetchError);
        setError('Failed to load transactions');
      } else if (data) {
        setTransactions(data);
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 flex items-center space-x-4">
          <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-black text-gray-900">
            {accountName ? accountName : `Account ${accountId}`}
          </h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
            <div className="text-sm text-gray-500">{transactions.length} items</div>
          </div>
          <div className="p-4">
            <div className="w-full overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-t border-gray-100">
                      <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{tx.name}</div></td>
                      <td className="px-4 py-3"><div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div></td>
                      <td className="px-4 py-3">
                        <div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(tx.amount)}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No transactions for this account.</td></tr>
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

export default AccountFilteredTransactions;
