import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, WalletCards } from 'lucide-react';
import { Wallet, Account } from '../../types';
import { getWalletById } from '../../src/services/walletsService';
import { supabase, getTableName } from '../../src/utils/supabaseClient';
import type { SupabaseTransaction } from '../../src/types/supabase';

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

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [topUps, setTopUps] = useState<SupabaseTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletId) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      const { data: walletData, error: walletErr } = await getWalletById(walletId);
      if (walletErr || !walletData) {
        setError('Failed to load wallet details.');
        setIsLoading(false);
        return;
      }
      setWallet(walletData);

      // Fetch transactions linked to this wallet via wallet_id
      const { data: txData, error: txErr } = await supabase
        .from(getTableName('transactions'))
        .select('*')
        .eq('wallet_id', walletId)
        .order('date', { ascending: false });

      if (txErr) {
        console.error('Error fetching wallet top-ups:', txErr);
      } else {
        setTopUps((txData as SupabaseTransaction[]) || []);
      }

      setIsLoading(false);
    };

    load();
  }, [walletId]);

  const getAccountName = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    return acc ? `${acc.bank} (${acc.classification})` : accountId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-gray-500">{error || 'Wallet not found.'}</p>
        <Link to="/wallets" className="mt-4 inline-flex items-center space-x-2 text-indigo-600 font-bold hover:underline">
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
          className="p-2 rounded-xl bg-white shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-gray-900 uppercase">{wallet.name}</h1>
          <p className="text-gray-500 text-sm">Wallet detail</p>
        </div>
      </div>

      {/* Wallet info card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Wallet Name</p>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                <WalletCards className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-lg font-black text-gray-900">{wallet.name}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Monthly Target</p>
            <p className="text-2xl font-black text-indigo-600">{formatCurrency(wallet.amount)}</p>
          </div>
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Linked Account</p>
            <p className="text-lg font-bold text-gray-700">{getAccountName(wallet.accountId)}</p>
          </div>
        </div>
      </div>

      {/* Top-ups list */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">Top-ups</h2>
          <span className="text-sm text-gray-400">{topUps.length} transaction{topUps.length !== 1 ? 's' : ''}</span>
        </div>

        {topUps.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <WalletCards className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No top-ups yet.</p>
            <p className="text-gray-400 text-sm mt-1">Top-ups made to this stash will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50 bg-gray-50">
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topUps.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-900">{tx.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">
                        {new Date(tx.date).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-black text-indigo-600">{formatCurrency(Math.abs(tx.amount))}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">{tx.notes || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletView;
