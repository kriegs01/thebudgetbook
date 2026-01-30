import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Trash2, Loader } from 'lucide-react';
import { 
  getAllTrash, 
  permanentlyDeleteFromTrash, 
  getTrashItemForRestore 
} from '../src/services/trashService';
import { createTransaction } from '../src/services/transactionsService';
import { createAccount } from '../src/services/accountsService';
import { createBiller } from '../src/services/billersService';
import { createInstallment } from '../src/services/installmentsService';
import { createSavings } from '../src/services/savingsService';
import type { SupabaseTrash } from '../src/types/supabase';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-PH', { 
    style: 'currency', 
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(val);
};

const TrashPageNew: React.FC = () => {
  const [trashItems, setTrashItems] = useState<SupabaseTrash[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await getAllTrash();
      if (fetchError) {
        console.error('Failed to load trash:', fetchError);
        setError('Failed to load trash items');
      } else if (data) {
        setTrashItems(data);
      }
    } catch (err) {
      console.error('Error loading trash:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: SupabaseTrash) => {
    try {
      // Restore based on type
      let restoreResult;
      
      switch (item.type) {
        case 'transaction':
          restoreResult = await createTransaction(item.data);
          break;
        case 'account':
          restoreResult = await createAccount(item.data);
          break;
        case 'biller':
          restoreResult = await createBiller(item.data);
          break;
        case 'installment':
          restoreResult = await createInstallment(item.data);
          break;
        case 'savings':
          restoreResult = await createSavings(item.data);
          break;
        default:
          console.error('Unknown item type:', item.type);
          setError(`Cannot restore item of type: ${item.type}`);
          return;
      }

      if (restoreResult.error) {
        console.error('Failed to restore item:', restoreResult.error);
        setError(`Failed to restore ${item.type}`);
        return;
      }

      // Delete from trash after successful restore
      const { error: deleteError } = await permanentlyDeleteFromTrash(item.id);
      if (deleteError) {
        console.error('Failed to delete from trash:', deleteError);
        setError('Item restored but failed to remove from trash');
      }

      // Reload trash
      await loadTrash();
    } catch (err) {
      console.error('Error restoring item:', err);
      setError('Failed to restore item');
    }
  };

  const handleDeletePermanently = async (id: string) => {
    if (!window.confirm('Permanently delete this item? This cannot be undone.')) return;

    try {
      const { error: deleteError } = await permanentlyDeleteFromTrash(id);
      if (deleteError) {
        console.error('Failed to delete permanently:', deleteError);
        setError('Failed to permanently delete item');
        return;
      }

      // Update local state
      setTrashItems(trashItems.filter(item => item.id !== id));
    } catch (err) {
      console.error('Error deleting permanently:', err);
      setError('Failed to permanently delete item');
    }
  };

  const getItemDisplayName = (item: SupabaseTrash): string => {
    if (item.data?.name) return item.data.name;
    if (item.data?.bank) return item.data.bank;
    if (item.data?.month) return item.data.month;
    return `${item.type} (${item.original_id.substring(0, 8)}...)`;
  };

  const getItemDisplayValue = (item: SupabaseTrash): string => {
    if (item.data?.amount !== undefined) return formatCurrency(item.data.amount);
    if (item.data?.balance !== undefined) return formatCurrency(item.data.balance);
    if (item.data?.totalAmount !== undefined) return formatCurrency(item.data.totalAmount);
    if (item.data?.total_amount !== undefined) return formatCurrency(item.data.total_amount);
    return '-';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 w-full p-8">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">TRASH</h2>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">
          Review and manage deleted items
        </p>
      </div>

      <div className="bg-white/40 backdrop-blur-xl rounded-[3rem] shadow-sm border border-gray-100 p-2 w-full">
        <div className="bg-white rounded-[2.5rem] overflow-hidden w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Item</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Type</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Value</th>
                  <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Deleted</th>
                  <th className="p-8 pr-12 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {trashItems.length > 0 ? (
                  trashItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="p-8 pl-12">
                        <div className="flex items-center space-x-5">
                          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 shadow-sm">
                            <FileText className="w-6 h-6" />
                          </div>
                          <span className="text-base font-black text-gray-900 tracking-tight">
                            {getItemDisplayName(item)}
                          </span>
                        </div>
                      </td>
                      <td className="p-8">
                        <span className="text-[10px] font-black text-gray-500 bg-gray-100/80 px-4 py-1.5 rounded-full uppercase tracking-widest">
                          {item.type}
                        </span>
                      </td>
                      <td className="p-8">
                        <span className="text-base font-black text-gray-900 tracking-tight">
                          {getItemDisplayValue(item)}
                        </span>
                      </td>
                      <td className="p-8">
                        <span className="text-sm text-gray-500">
                          {new Date(item.deleted_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-8 pr-12 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <button 
                            onClick={() => handleRestore(item)}
                            className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                            title="Restore"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>
                          <button 
                            onClick={() => handleDeletePermanently(item.id)}
                            className="p-3 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                            title="Delete Permanently"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-24 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center text-gray-300 mb-6">
                          <Trash2 className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                          Trash is empty
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrashPageNew;
