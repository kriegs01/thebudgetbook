import React, { useEffect, useState, useCallback } from 'react';
import { Plus, ArrowLeft } from 'lucide-react';
import { getAllTransactions, createTransaction, deleteTransactionAndRevertSchedule } from '../src/services/transactionsService';
import { getAllAccountsFrontend } from '../src/services/accountsService';
import { combineDateWithCurrentTime, getTodayIso } from '../src/utils/dateUtils';

type Transaction = {
  id: string;
  name: string;
  date: string; // ISO
  amount: number;
  paymentMethodId: string; // account id
};

type AccountOption = { id: string; bank: string };

// Use the utility function from dateUtils
const todayIso = getTodayIso;

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

interface TransactionsPageProps {
  onTransactionDeleted?: () => void;
  onTransactionCreated?: () => void;
}

const TransactionsPage: React.FC<TransactionsPageProps> = ({ onTransactionDeleted, onTransactionCreated }) => {
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
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load accounts
      const { data: accountsData, error: accountsError } = await getAllAccountsFrontend();
      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
      } else if (accountsData) {
        const accountOptions = accountsData.map(a => ({ id: a.id, bank: a.bank }));
        setAccounts(accountOptions);
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Set default paymentMethodId when accounts are loaded and form hasn't been touched
    if (accounts.length > 0 && !form.paymentMethodId) {
      setForm(f => ({ ...f, paymentMethodId: accounts[0].id }));
    }
  }, [accounts, form.paymentMethodId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.amount || !form.paymentMethodId) return;
    
    try {
      const transaction = {
        name: form.name,
        date: combineDateWithCurrentTime(form.date),
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
      
      // Notify parent if callback provided (for refreshing related data like account balances)
      if (onTransactionCreated) {
        console.log('[Transactions Page] Notifying parent of transaction creation');
        onTransactionCreated();
      }
      
      setShowForm(false);
      setForm({ name: '', date: todayIso(), amount: '', paymentMethodId: accounts[0]?.id ?? '' });
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('Failed to create transaction. Please try again.');
    }
  };

  const removeTx = async (id: string) => {
    try {
      console.log('[Transactions Page] Deleting transaction with reversion:', id);
      const { error } = await deleteTransactionAndRevertSchedule(id);
      
      if (error) {
        console.error('Error deleting transaction:', error);
        alert('Failed to delete transaction. Please try again.');
        return;
      }
      
      console.log('[Transactions Page] Transaction deleted successfully');
      // Reload transactions after deletion
      await loadData();
      
      // Notify parent if callback provided (for refreshing related data)
      if (onTransactionDeleted) {
        console.log('[Transactions Page] Notifying parent of transaction deletion');
        onTransactionDeleted();
      }
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
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900">{new Date(tx.date).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-400">{new Date(tx.date).toLocaleTimeString()}</div>
                          </td>
                          <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(-tx.amount)}</div></td>
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

        {/* QA: Consistent Transaction Form - with receipt upload, exclude credit accounts */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl relative">
              <h2 className="text-2xl font-black text-gray-900 mb-2">Add New Transaction</h2>
              <p className="text-gray-500 text-sm mb-8">Record a payment transaction</p>
              <form onSubmit={onSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
                  <input 
                    value={form.name} 
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                    required 
                    placeholder="e.g. Groceries, Gas, etc."
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all" 
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      value={form.amount} 
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} 
                      required 
                      className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                    <input 
                      type="date" 
                      value={form.date} 
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                      required 
                      className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                    {accounts.length === 0 ? (
                      <div className="text-xs text-red-600 p-4">No payment methods available</div>
                    ) : (
                      <select 
                        value={form.paymentMethodId} 
                        onChange={e => setForm(f => ({ ...f, paymentMethodId: e.target.value }))} 
                        className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                      >
                        {accounts.filter(a => a.classification !== 'Credit Card').map(a => <option key={a.id} value={a.id}>{a.bank}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                  <div className="relative">
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                    <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                      <span className="font-bold">Click or drag to upload receipt</span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                  <button type="submit" disabled={accounts.length === 0} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">Submit Payment</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
