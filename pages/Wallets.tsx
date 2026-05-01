import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LayoutGrid, List, Eye, Pencil, WalletCards, AlertTriangle, Trash2 } from 'lucide-react';
import { Wallet, Account } from '../types';
import { getWalletsForCurrentUser, createWallet, updateWallet, deleteWallet } from '../src/services/walletsService';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    const firstDebitAccount = accounts.find((acc) => acc.type !== 'Credit');
    setFormData({ name: '', amount: '', accountId: firstDebitAccount?.id || '' });
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
    setShowDeleteConfirm(false);
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

  const handleDelete = async () => {
    if (!editingWallet || isDeleting) return;
    setIsDeleting(true);
    try {
      const { error: err } = await deleteWallet(editingWallet.id);
      if (err) {
        alert('Failed to delete wallet. Please try again.');
      } else {
        await loadWallets();
        closeModal();
      }
    } finally {
      setIsDeleting(false);
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
            <p className="text-gray-600 dark:text-gray-400 font-medium transition-colors">Loading wallets...</p>
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
              <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 uppercase transition-colors">Wallet</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">Configure your stashes — savings, allowance, shared expenses, and more.</p>
            </div>
            <div className="flex items-center space-x-3">
              {/* View toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 space-x-1 transition-colors">
                <button
                  onClick={() => setViewMode('card')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'card' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
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
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4 transition-colors">
                <WalletCards className="w-10 h-10 text-gray-400 dark:text-gray-500 transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 transition-colors">No Wallets Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 transition-colors">Create your first wallet to start tracking your stashes.</p>
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
                  className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all flex flex-col space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 flex-shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center transition-colors">
                        <WalletCards className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 transition-colors">{wallet.name}</h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-black transition-colors">{getAccountName(wallet.accountId)}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(wallet.amount)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 transition-colors">monthly target</p>
                  </div>
                  <div className="flex items-center space-x-2 pt-2 border-t border-gray-50 dark:border-gray-800/50 transition-colors">
                    <button
                      onClick={() => navigate(`/wallets/view?id=${wallet.id}`)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => openEditModal(wallet)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 font-bold text-sm transition-colors"
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 transition-colors">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Account</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 transition-colors">
                    {wallets.map((wallet) => (
                      <tr key={wallet.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center transition-colors">
                              <WalletCards className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="font-bold text-gray-900 dark:text-gray-100 transition-colors">{wallet.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-black text-gray-900 dark:text-gray-100 transition-colors">{formatCurrency(wallet.amount)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400 transition-colors">{getAccountName(wallet.accountId)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => navigate(`/wallets/view?id=${wallet.id}`)}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold text-xs transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => openEditModal(wallet)}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-amber-100 dark:hover:bg-amber-900/20 text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 font-bold text-xs transition-colors"
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
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-8 shadow-2xl transition-colors">
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-6 uppercase transition-colors">
              {editingWallet ? 'Edit Wallet' : 'Add Wallet'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Name</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Savings, House Share, Allowance"
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Amount (monthly target)</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 transition-colors">Account</label>
                <select
                  required
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent dark:border-gray-700 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-colors"
                >
                  <option value="">Select account</option>
                  {accounts.filter((acc) => acc.type !== 'Credit').map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank} ({acc.classification})
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="text-sm text-red-600 font-medium">{formError}</p>
              )}

              {/* Delete confirmation inline */}
              {showDeleteConfirm && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-4 space-y-3 transition-colors">
                  <p className="text-sm font-bold text-red-800 dark:text-red-300 transition-colors">Delete this wallet?</p>
                  <p className="text-xs text-red-600 dark:text-red-400 transition-colors">This will permanently remove the wallet. This action cannot be undone.</p>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 py-2 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold hover:bg-red-700 disabled:opacity-60 text-sm"
                    >
                      {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 py-3 rounded-xl font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                {editingWallet && !showDeleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center justify-center space-x-1 px-4 py-3 rounded-xl font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                )}
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
