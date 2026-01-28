import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';

type Transaction = {
  id: string;
  description: string;
  date: string; // ISO date
  amount: number; // positive for credit in, negative for debit out (presentation is simple)
};

const TransactionsPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const key = `transactions_${id}`;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Transaction[];
        setTransactions(parsed);
      } catch {
        setTransactions([]);
      }
    } else {
      // Fallback demo data when none stored
      const now = new Date();
      const demo: Transaction[] = [
        { id: 't1', description: 'Grocery Store', date: new Date(now.getTime() - 86400 * 1000 * 3).toISOString(), amount: -1250.75 },
        { id: 't2', description: 'Salary', date: new Date(now.getTime() - 86400 * 1000 * 10).toISOString(), amount: 45000 },
        { id: 't3', description: 'Credit Payment', date: new Date(now.getTime() - 86400 * 1000 * 20).toISOString(), amount: -5000 },
      ];
      setTransactions(demo);
    }

    // Optional: try to read account display name from localStorage (if parent stored it)
    const metaKey = `account_meta_${id}`;
    const metaRaw = typeof window !== 'undefined' ? localStorage.getItem(metaKey) : null;
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw) as { bank?: string };
        if (meta.bank) setAccountName(meta.bank);
      } catch {}
    }
  }, [id]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <button onClick={() => router.back()} className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{accountName ? `${accountName}` : `Account ${id}`}</h1>
            <p className="text-sm text-gray-500">Transactions and payments</p>
          </div>
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
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Transactions</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{tx.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(tx.amount)}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-2">
            <button
              onClick={() => {
                // convenience: add a sample transaction to localStorage for this account
                if (!id) return;
                const key = `transactions_${id}`;
                const newTx: Transaction = {
                  id: Math.random().toString(36).substr(2, 9),
                  description: 'Manual Entry',
                  date: new Date().toISOString(),
                  amount: -1000
                };
                const updated = [newTx, ...transactions];
                localStorage.setItem(key, JSON.stringify(updated));
                setTransactions(updated);
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Add Sample
            </button>
            <button onClick={() => {
              // clear stored transactions for this demo route
              if (!id) return;
              localStorage.removeItem(`transactions_${id}`);
              setTransactions([]);
            }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionsPage;