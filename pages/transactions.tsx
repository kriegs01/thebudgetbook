import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft } from 'lucide-react';
import { getAllTransactions, createTransaction, deleteTransaction } from '../src/services/transactionsService';
import { getAllAccountsFrontend } from '../src/services/accountsService';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO
  amount: number;
  paymentMethodId: string; // account id
};

type AccountOption = { id: string; bank: string };

const todayIso = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    date: todayIso(),
    amount: '',
    paymentMethodId: ''
  });

  // Load transactions and accounts from Supabase
  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load accounts
      const { data: accountsData, error: accountsError } = await getAllAccountsFrontend();
      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
      } else if (accountsData) {
        const accountOptions = accountsData.map(a => ({ id: a.id, bank: a.bank }));
        setAccounts(accountOptions);
        
        // Set default payment method if not set
        if (accountOptions.length > 0 && !form.paymentMethodId) {
          setForm(f => ({ ...f, paymentMethodId: accountOptions[0].id }));
        }
      }

      // Load transactions
      const { data: transactionsData, error: transactionsError } = await getAllTransactions();
      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError);
      } else if (transactionsData) {
        const txList = transactionsData.map(t => ({
          id: t.id,
          name: t.name,
          date: t.date,
          amount: t.amount,
          paymentMethodId: t.payment_method_id
        }));
        setTransactions(txList);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // ensure default paymentMethodId when accounts exist
    if (accounts.length > 0 && !form.paymentMethodId) {
      setForm(f => ({ ...f, paymentMethodId: accounts[0].id }));
    }
  }, [accounts]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.amount || !form.paymentMethodId) return;
    
    try {
      const transaction = {
        name: form.name,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(form.amount),
        payment_method_id: form.paymentMethodId
      };
      
      const { data, error } = await createTransaction(transaction);
      
      if (error) {
        console.error('Error creating transaction:', error);
        alert('Failed to create transaction. Please try again.');
        return;
      }
      
      console.log('Transaction created successfully:', data);
      
      // Reload transactions to get fresh data
      await loadData();
      
      setShowForm(false);
      setForm({ name: '', date: todayIso(), amount: '', paymentMethodId: accounts[0]?.id ?? '' });
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('Failed to create transaction. Please try again.');
    }
  };

  const removeTx = async (id: string) => {
    try {
      const { error } = await deleteTransaction(id);
      
      if (error) {
        console.error('Error deleting transaction:', error);
        alert('Failed to delete transaction. Please try again.');
        return;
      }
      
      // Reload transactions after deletion
      await loadData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-black text-gray-900">Transactions</h1>
          <div className="flex items-center space-x-3">
            <a href="/" className="px-3 py-2 rounded-lg bg-white shadow-sm">Back</a>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center space-x-2 hover:bg-indigo-700">
              <Plus className="w-4 h-4" />
              <span>Add Transaction</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase text-gray-600 tracking-widest">All transactions</h2>
            <div className="text-sm text-gray-500">{transactions.length} items</div>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading transactions...</div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Payment Method</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const pm = accounts.find(a => a.id === tx.paymentMethodId);
                      return (
                        <tr key={tx.id} className="border-t border-gray-100">
                          <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{tx.name}</div></td>
                          <td className="px-4 py-3"><div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div></td>
                          <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(tx.amount)}</div></td>
                          <td className="px-4 py-3"><div className="text-sm text-gray-700">{pm ? pm.bank : tx.paymentMethodId}</div></td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeTx(tx.id)} className="text-sm text-red-600">Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-xl p-6 shadow-lg space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
                {accounts.length === 0 ? (
                  <div className="text-sm text-red-600">No payment methods available. Add accounts first.</div>
                ) : (
                  <select value={form.paymentMethodId} onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} className="w-full border rounded-lg px-3 py-2">
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                  </select>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-gray-100">Cancel</button>
                <button type="submit" disabled={accounts.length === 0} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">Save</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
