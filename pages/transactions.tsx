import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft } from 'lucide-react';
import { getAllTransactions, createTransaction, deleteTransaction } from '../src/services/transactionsService';
import { getAllAccounts } from '../src/services/accountsService';
import { moveToTrash } from '../src/services/trashService';
import type { SupabaseTransaction, SupabaseAccount } from '../src/types/supabase';

const todayIso = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    date: todayIso(),
    amount: '',
    paymentMethodId: ''
  });

  // Load accounts and transactions from Supabase
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load accounts
      const { data: accountsData, error: accountsError } = await getAllAccounts();
      if (accountsError) {
        console.error('Failed to load accounts:', accountsError);
        setError('Failed to load accounts');
      } else if (accountsData) {
        setAccounts(accountsData);
        // Set default payment method if available
        if (accountsData.length > 0 && !form.paymentMethodId) {
          setForm(f => ({ ...f, paymentMethodId: accountsData[0].id }));
        }
      }

      // Load transactions
      const { data: transactionsData, error: transactionsError } = await getAllTransactions();
      if (transactionsError) {
        console.error('Failed to load transactions:', transactionsError);
        setError('Failed to load transactions');
      } else if (transactionsData) {
        setTransactions(transactionsData);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.amount || !form.paymentMethodId) return;

    try {
      const txData = {
        name: form.name,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(form.amount),
        payment_method_id: form.paymentMethodId
      };

      const { data, error } = await createTransaction(txData);
      if (error) {
        console.error('Failed to create transaction:', error);
        setError('Failed to create transaction');
        return;
      }

      if (data) {
        setTransactions([data, ...transactions]);
        setShowForm(false);
        setForm({ name: '', date: todayIso(), amount: '', paymentMethodId: accounts[0]?.id ?? '' });
      }
    } catch (err) {
      console.error('Error creating transaction:', err);
      setError('Failed to create transaction');
    }
  };

  const removeTx = async (id: string) => {
    if (!window.confirm('Delete this transaction? It will be moved to trash.')) return;

    try {
      // Find the transaction to move to trash
      const txToDelete = transactions.find(t => t.id === id);
      if (!txToDelete) return;

      // Move to trash first
      const { error: trashError } = await moveToTrash({
        type: 'transaction',
        original_id: id,
        data: txToDelete
      });

      if (trashError) {
        console.error('Failed to move to trash:', trashError);
        // Continue with deletion even if trash fails
      }

      // Delete from transactions table
      const { error: deleteError } = await deleteTransaction(id);
      if (deleteError) {
        console.error('Failed to delete transaction:', deleteError);
        setError('Failed to delete transaction');
        return;
      }

      // Update local state
      setTransactions(transactions.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting transaction:', err);
      setError('Failed to delete transaction');
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
      <div className="max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

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
                    const pm = accounts.find(a => a.id === tx.payment_method_id);
                    return (
                      <tr key={tx.id} className="border-t border-gray-100">
                        <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900">{tx.name}</div></td>
                        <td className="px-4 py-3"><div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div></td>
                        <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(tx.amount)}</div></td>
                        <td className="px-4 py-3"><div className="text-sm text-gray-700">{pm ? pm.bank : tx.payment_method_id}</div></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeTx(tx.id)} className="text-sm text-red-600 hover:text-red-800">Delete</button>
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
                <button type="submit" disabled={accounts.length === 0} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">Save</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
