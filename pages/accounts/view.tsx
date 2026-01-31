import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Account } from '../../types';
import { getAllTransactions } from '../../src/services/transactionsService';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO string
  amount: number;
  paymentMethodId: string;
};

type AccountMeta = { bank?: string };

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTransactionsAndAccount = async () => {
      if (typeof window === "undefined") return;
      
      setIsLoading(true);
      setError(null);
      
      // Load all transactions from Supabase and filter to this account
      const { data: transactionsData, error: txError } = await getAllTransactions();
      if (txError) {
        console.error('[AccountView] Failed to load transactions:', txError);
        setError('Failed to load transactions. Please try again.');
        setIsLoading(false);
        return;
      }
      
      if (transactionsData) {
        // Convert to local Transaction type
        const allTx: Transaction[] = transactionsData.map(t => ({
          id: t.id,
          name: t.name,
          date: t.date,
          amount: t.amount,
          paymentMethodId: t.payment_method_id
        }));
        
        const filtered = accountId ? allTx.filter(tx => tx.paymentMethodId === accountId) : [];
        setTransactions(filtered);
      }

      // Get account name from the passed accounts prop
      if (accountId) {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
          setAccountName(account.bank);
        }
      }
      
      setIsLoading(false);
    };
    
    loadTransactionsAndAccount();
  }, [accountId, accounts]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <Link to="/accounts" className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-black text-gray-900">
            {accountName ? accountName : `Account ${accountId}`}
          </h1>
        </div>
        
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
        )}
        
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">Transactions</h2>
            <div className="text-sm text-gray-500">{transactions.length} items</div>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="py-8 text-center">
                <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-sm text-gray-500">Loading transactions...</p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountFilteredTransactions;
