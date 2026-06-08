import React from 'react';
import { Info, Pencil, Trash2 } from 'lucide-react';
import type { Transaction, AccountOption } from '../../types';
import { useTheme } from '../contexts/ThemeContext';
import useMediaQuery from '../hooks/useMediaQuery';
import { PinProtectedAction } from './PinProtectedAction';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

interface TransactionListProps {
  transactions: Transaction[];
  accounts: AccountOption[];
  isSelectMode: boolean;
  selectedIds: Set<string>;
  onToggleId: (id: string) => void;
  onSelectAll: () => void;
  allVisibleSelected: boolean;
  onViewDetails: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string, name: string) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  isSelectMode,
  selectedIds,
  onToggleId,
  onSelectAll,
  allVisibleSelected,
  onViewDetails,
  onEdit,
  onDelete,
}) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (isMobile) {
    return (
      <div className="space-y-3">
        {transactions.map(tx => {
          const pm = accounts.find(a => a.id === tx.paymentMethodId);
          return (
            <div
              key={tx.id}
              className={`p-4 rounded-2xl border-[3px] border-black transition-all duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                isSelectMode && selectedIds.has(tx.id) ? getAccentClasses('bg') + ' text-white' : 'bg-white dark:bg-gray-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    {isSelectMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => onToggleId(tx.id)}
                        aria-label={`Select transaction ${tx.name}`}
                        className="rounded h-5 w-5 mt-0.5"
                      />
                    )}
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{tx.name}</p>
                  </div>
                  <p className={`text-xl font-black mt-2 ${tx.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatCurrency(-tx.amount)}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onViewDetails(tx)}
                      title="View details"
                      aria-label="View transaction details"
                      className={`w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-black transition-colors text-gray-600 dark:text-gray-300 ${getAccentClasses('hoverLight')}`}>
                      <Info className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(tx)}
                      title="Edit transaction"
                      aria-label="Edit transaction"
                      className={`w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg border-2 border-black transition-colors text-gray-600 dark:text-gray-300 ${getAccentClasses('hoverLight')}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between text-xs">
                <div className="text-gray-500 dark:text-gray-400 font-medium">
                  {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-gray-700 dark:text-gray-300 font-bold">
                  {pm ? pm.bank : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full text-left">
        <thead>
          <tr>
            {isSelectMode && (
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onSelectAll}
                  title="Select all"
                  aria-label="Select all visible transactions"
                  className="rounded"
                />
              </th>
            )}
            <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Amount</th>
            <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">Payment Method</th>
            <th className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => {
            const pm = accounts.find(a => a.id === tx.paymentMethodId);
            return (
              <tr
                key={tx.id}
                className={`border-t border-gray-100 dark:border-gray-800 group transition-colors ${
                  isSelectMode && selectedIds.has(tx.id) ? `${getAccentClasses('lightBg')} dark:opacity-80` : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                {isSelectMode && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tx.id)}
                      onChange={() => onToggleId(tx.id)}
                      aria-label={`Select transaction ${tx.name}`}
                      className="rounded"
                    />
                  </td>
                )}
                <td className="px-4 py-3"><div className="text-sm font-medium text-gray-900 dark:text-gray-100">{tx.name}</div></td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{new Date(tx.date).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-400">{new Date(tx.date).toLocaleTimeString()}</div>
                </td>
                <td className="px-4 py-3"><div className={`text-sm font-semibold ${tx.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatCurrency(-tx.amount)}</div></td>
                <td className="px-4 py-3"><div className="text-sm text-gray-700 dark:text-gray-300">{pm ? pm.bank : tx.paymentMethodId}</div></td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onViewDetails(tx)}
                      title="View details"
                      aria-label="View transaction details"
                      className={`p-1.5 rounded-full transition-all text-gray-400 dark:text-gray-500 ${getAccentClasses('hoverLight')}`}>
                      <Info className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(tx)}
                      title="Edit transaction"
                      aria-label="Edit transaction"
                      className={`p-1.5 rounded-full transition-all text-gray-400 dark:text-gray-500 ${getAccentClasses('hoverLight')}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <PinProtectedAction
                      featureId="transaction_deletions"
                      onVerified={() => onDelete(tx.id, tx.name)}
                      actionLabel="Delete Transaction"
                    >
                      <button
                        onClick={(e) => e.preventDefault()}
                        title="Delete transaction"
                        aria-label="Delete transaction"
                        className="p-1.5 rounded-full transition-all text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </PinProtectedAction>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
