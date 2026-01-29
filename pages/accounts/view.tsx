import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

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

const AccountFilteredTransactions: React.FC = () => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>("Account");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const id = qs.get("id");
    setAccountId(id);

    // Fetch all transactions and filter to this account
    const txRaw = localStorage.getItem('transactions');
    let allTx: Transaction[] = [];
    if (txRaw) {
      try { allTx = JSON.parse(txRaw); } catch {}
    }
    const filtered = id ? allTx.filter(tx => tx.paymentMethodId === id) : [];
    setTransactions(filtered);

    // Fetch account meta for display name
    if (id) {
      const metaRaw = localStorage.getItem(`account_meta_${id}`);
      if (metaRaw) {
        try {
          const meta: AccountMeta = JSON.parse(metaRaw);
          if (meta.bank) setAccountName(meta.bank);
        } catch {}
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center space-x-4">
          <button onClick={() => window.history.back()} className="p-2 rounded-lg bg-white shadow-sm hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
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
