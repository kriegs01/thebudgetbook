import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, WalletCards, Plus } from 'lucide-react';
import { Wallet, Account } from '../../types';
import { getWalletById } from '../../src/services/walletsService';
import { supabase, getTableName } from '../../src/utils/supabaseClient';
import type { SupabaseTransaction } from '../../src/types/supabase';
import { useTheme } from '../../src/contexts/ThemeContext';

interface WalletViewProps {
  accounts: Account[];
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

const WalletView: React.FC<WalletViewProps> = ({ accounts }) => {
  const [searchParams] = useSearchParams();
  const walletId = searchParams.get('id');
  const { getAccentClasses } = useTheme();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadWalletData = useCallback(async () => {
    if (!walletId) return;

    setIsLoading(true);
    setError(null);

    const { data: walletData, error: walletErr } = await getWalletById(walletId);
    if (walletErr || !walletData) {
      setError('Failed to load wallet details.');
      setIsLoading(false);
      return;
    }
    setWallet(walletData);

    const { data: txData, error: txErr } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('wallet_id', walletId)
      .order('date', { ascending: false });

    if (txErr) {
      console.error('Error fetching wallet transactions:', txErr);
      setError('Failed to load transactions.');
    } else {
      setTransactions((txData as SupabaseTransaction[]) || []);
    }

    setIsLoading(false);
  }, [walletId]);

  useEffect(() => {
    loadWalletData();
  }, [loadWalletData]);

  const openTransactionModal = () => setShowTransactionModal(true);
  const closeTransactionModal = () => setShowTransactionModal(false);

  const handleTransactionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || !wallet) return;

    const formData = new FormData(e.currentTarget);
    const description = formData.get('description') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const date = formData.get('date') as string;

    if (!description || !amount || !date) {
      alert("Please fill out all fields.");
      return;
    }

    setIsSubmitting(true);

    const { error: txError } = await supabase
      .from(getTableName('transactions'))
      .insert({
        name: description,
        amount: -Math.abs(amount),
        date: date,
        wallet_id: wallet.id,
        account_id: wallet.accountId,
        user_id: wallet.user_id
      });
    
    setIsSubmitting(false);

    if (txError) {
      alert('Failed to add transaction. Please try again.');
      console.error('Error adding transaction:', txError);
    } else {
      closeTransactionModal();
      loadWalletData(); // Re-fetch data
    }
  };


  const getAccountName = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    return acc ? `${acc.bank} (${acc.classification})` : accountId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium transition-colors">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center transition-colors">
        <p className="text-gray-500 dark:text-gray-400 transition-colors">{error || 'Wallet not found.'}</p>
        <Link to="/wallets" className="mt-4 inline-flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-bold hover:underline transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Wallets</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Back + Header */}
      <div className="flex items-center space-x-4">
        <Link
          to="/wallets"
          className="p-2 rounded-xl bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300 transition-colors" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 uppercase transition-colors">{wallet.name}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Wallet detail</p>
        </div>
      </div>

      {/* Wallet info card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Wallet Name</p>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center transition-colors">
                <WalletCards className="w-4 h-4 text-indigo-600 dark:text-indigo-400 transition-colors" />
              </div>
              <p className="text-lg font-black text-gray-900 dark:text-gray-100 transition-colors">{wallet.name}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Monthly Target</p>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 transition-colors">{formatCurrency(wallet.amount)}</p>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 transition-colors">Linked Account</p>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-300 transition-colors">{getAccountName(wallet.accountId)}</p>
          </div>
        </div>
      </div>

      {/* Transactions list */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">Transactions</h2>
        <button
          className={`flex items-center gap-2 text-white px-4 py-2 rounded-lg font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all text-sm ${getAccentClasses('bg')}`}
          onClick={openTransactionModal}
        >
          <Plus size={16} />
          Add Transaction
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
        {transactions.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4 transition-colors">
              <WalletCards className="w-8 h-8 text-gray-400 dark:text-gray-500 transition-colors" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium transition-colors">No transactions yet.</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 transition-colors">Transactions made for this wallet will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={`text-xs font-black text-black dark:text-white uppercase border-b-2 border-black ${getAccentClasses('bg')} opacity-80`}>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 transition-colors">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'})}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-900 dark:text-gray-100 transition-colors">{tx.name}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">
                       {formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

       {/* Add Transaction Modal */}
       {showTransactionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-8 border-[3px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors">
            <div className="relative mb-8">
              <h2 className={`font-titan normal-case tracking-tighter text-[2.5rem] leading-none relative z-10 [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] ${getAccentClasses('text')}`}>
                Add Transaction
              </h2>
              <div className={`absolute bottom-0 left-0 h-4 ${getAccentClasses('bg')} opacity-40 -z-0 -rotate-2 -translate-x-2 transition-colors duration-300`} style={{ width: `calc(100% + 1rem)` }} />
            </div>
            <form onSubmit={handleTransactionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Description</label>
                <input
                  required
                  type="text"
                  className="w-full bg-gray-100 dark:bg-black/20 text-black dark:text-white border-2 border-black rounded-lg p-3 font-bold placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  name="description"
                  placeholder="e.g. Coffee, Lunch, etc."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Amount</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  className="w-full bg-gray-100 dark:bg-black/20 text-black dark:text-white border-2 border-black rounded-lg p-3 font-bold placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  name="amount"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Date</label>
                <input
                  required
                  type="date"
                  className="w-full bg-gray-100 dark:bg-black/20 text-black dark:text-white border-2 border-black rounded-lg p-3 font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  name="date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                  <button
                   type="button"
                   onClick={closeTransactionModal}
                  className="flex-1 py-3 rounded-lg font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-black dark:text-white"
                 >
                   Cancel
                 </button>
                  <button
                   type="submit"
                   disabled={isSubmitting}
                  className={`flex-1 py-3 rounded-lg font-bold border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 text-white ${getAccentClasses('bg')}`}
                 >
                   {isSubmitting ? 'Adding...' : 'Add Transaction'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletView;
