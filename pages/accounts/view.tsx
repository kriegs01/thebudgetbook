import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO date
  amount: number;
  paymentMethodId: string;
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);
};

const AccountView: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    const accId = qs.get('id');
    if (!accId) return;
    setId(accId);

    const rawAll = localStorage.getItem('transactions');
    if (rawAll) {
      try {
        const parsed = JSON.parse(rawAll) as Transaction[];
        const filtered = parsed.filter(t => t.paymentMethodId === accId);
        setTransactions(filtered);
      } catch {
        setTransactions([]);
      }
    } else {
      setTransactions([]);
    }

    // Try to read account name
    const metaRaw = localStorage.getItem(`account_meta_${accId}`);
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw) as { bank?: string };
        if (meta.bank) setAccountName(meta.bank);
      } catch {}
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <button onClick={() => window.history.back()} className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900">{accountName ? `${accountName}` : `Account ${id}`}</h1>
            <p className="text-sm text-gray-500">Transactions (filtered by this account)</p>
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
                      <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(tx.amount)}</div></td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No transactions for this account.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-2">
            <button onClick={() => {
              // helper: add a sample transaction tied to this account
              if (!id) return;
              const key = 'transactions';
              const raw = localStorage.getItem(key);
              const now = new Date();
              const sample = { id: Math.random().toString(36).substr(2,9), name: 'Sample', date: now.toISOString(), amount: -1000, paymentMethodId: id };
              let all = [];
              try {
                all = raw ? JSON.parse(raw) : [];
              } catch { all = []; }
              all = [sample, ...all];
              localStorage.setItem(key, JSON.stringify(all));
              // refresh filtered list
              const filtered = all.filter((t: any) => t.paymentMethodId === id);
              setTransactions(filtered);
            }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Add Sample</button>
            <button onClick={() => {
              if (!id) return;
              const raw = localStorage.getItem('transactions');
              if (!raw) return setTransactions([]);
              try {
                const all = JSON.parse(raw) as Transaction[];
                const remaining = all.filter(t => t.paymentMethodId !== id);
                localStorage.setItem('transactions', JSON.stringify(remaining));
                setTransactions([]);
              } catch {
                setTransactions([]);
              }
            }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountView;
