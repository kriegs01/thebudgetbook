import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, List, Eye, Pencil, FolderOpen, AlertTriangle } from 'lucide-react';
import { Wallet, Account } from '../types';
import { getWalletsForCurrentUser, createWallet, updateWallet } from '../src/services/walletsService';

interface WalletsPageProps {
  accounts: Account[];
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);

const WalletsPage: React.FC<WalletsPageProps> = ({ accounts }) => {
  const navigate = useNavigate();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', amount: '', accountId: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getWalletsForCurrentUser();
    if (err) {
      console.error('Error loading wallets:', err);
      setError('Failed to load wallets from database');
      setWallets([]);
    } else {
      setWallets(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  const openAddModal = () => {
    setEditingWallet(null);
    setFormData({ name: '', amount: '', accountId: accounts[0]?.id || '' });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (wallet: Wallet) => {
    setEditingWallet(wallet);
    setFormData({ name: wallet.name, amount: String(wallet.amount), accountId: wallet.accountId });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWallet(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const name = formData.name.trim();
    const amount = parseFloat(formData.amount);
    const accountId = formData.accountId;

    if (!name) { setFormError('Name is required.'); return; }
    if (!formData.amount || isNaN(amount) || amount <= 0) { setFormError('Amount must be a positive number.'); return; }
    if (!accountId) { setFormError('Account is required.'); return; }

    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingWallet) {
        const { error: err } = await updateWallet(editingWallet.id, { name, amount, account_id: accountId });
        if (err) {
          alert('Failed to update wallet. Please try again.');
        } else {
          await loadWallets();
          closeModal();
        }
      } else {
        const { error: err } = await createWallet({ name, amount, account_id: accountId });
        if (err) {
          alert('Failed to create wallet. Please try again.');
        } else {
          await loadWallets();
          closeModal();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAccountName = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    return acc ? `${acc.bank} (${acc.classification})` : accountId;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading wallets...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error Loading Wallets</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-black text-gray-900 uppercase">Wallet</h2>
              <p className="text-gray-500 text-sm">Configure your stashes — savings, allowance, shared expenses, and more.</p>
            </div>
            <div className="flex items-center space-x-3">
              {/* View toggle */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1 space-x-1">
                <button
                  onClick={() => setViewMode('card')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={openAddModal}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Add Wallet</span>
              </button>
            </div>
          </div>

          {/* Empty State */}
          {wallets.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
                <FolderOpen className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Wallets Yet</h3>
              <p className="text-gray-500 mb-6">Create your first wallet to start tracking your stashes.</p>
              <button
                onClick={openAddModal}
                className="inline-flex items-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg"
              >
                <Plus className="w-5 h-5" />
                <span>Add Your First Wallet</span>
              </button>
            </div>
          )}

          {/* Card View */}
          {viewMode === 'card' && wallets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 flex-shrink-0 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{wallet.name}</h3>
                        <p className="text-[10px] text-gray-500 uppercase font-black">{getAccountName(wallet.accountId)}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900">{formatCurrency(wallet.amount)}</p>
                    <p className="text-xs text-gray-400">monthly target</p>
                  </div>
                  <div className="flex items-center space-x-2 pt-2 border-t border-gray-50">
                    <button
                      onClick={() => navigate(`/wallets/view?id=${wallet.id}`)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 font-bold text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => openEditModal(wallet)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-xl bg-gray-50 hover:bg-amber-50 text-gray-600 hover:text-amber-600 font-bold text-sm transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && wallets.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Account</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {wallets.map((wallet) => (
                      <tr key={wallet.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                              <FolderOpen className="w-4 h-4 text-indigo-600" />
                            </div>
                            <span className="font-bold text-gray-900">{wallet.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-black text-gray-900">{formatCurrency(wallet.amount)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{getAccountName(wallet.accountId)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => navigate(`/wallets/view?id=${wallet.id}`)}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-600 font-bold text-xs transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => openEditModal(wallet)}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-amber-100 text-gray-600 hover:text-amber-600 font-bold text-xs transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Wallet Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 uppercase">
              {editingWallet ? 'Edit Wallet' : 'Add Wallet'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Name</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Savings, House Share, Allowance"
                  className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Amount (monthly target)</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Account</label>
                <select
                  required
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                >
                  <option value="">Select account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank} ({acc.classification})
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="text-sm text-red-600 font-medium">{formError}</p>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : editingWallet ? 'Save Changes' : 'Add Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsPage;
