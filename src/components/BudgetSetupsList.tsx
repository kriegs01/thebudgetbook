// src/components/BudgetSetupsList.tsx
import React from 'react';
import { SavedBudgetSetup } from '../../types';
import { Archive, ArrowRight, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { PinProtectedAction } from './PinProtectedAction';
import { useTheme } from '../contexts/ThemeContext';
import useMediaQuery from '../hooks/useMediaQuery';

interface BudgetSetupsListProps {
  setups: SavedBudgetSetup[];
  title: string;
  isArchived: boolean;
  onLoadSetup: (setup: SavedBudgetSetup) => void;
  onArchiveSetup?: (setup: SavedBudgetSetup) => void;
  onReopenSetup?: (setup: SavedBudgetSetup) => void;
  onMoveToTrash?: (setup: SavedBudgetSetup) => void;
  formatCurrency: (value: number) => string;
  calculateBudgetRemaining: (setup: SavedBudgetSetup) => number;
  archiveSubmitting: boolean;
}

export const BudgetSetupsList: React.FC<BudgetSetupsListProps> = ({
  setups,
  title,
  isArchived,
  onLoadSetup,
  onArchiveSetup,
  onReopenSetup,
  onMoveToTrash,
  formatCurrency,
  calculateBudgetRemaining,
  archiveSubmitting,
}) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const renderMobileList = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {setups.map((setup) => {
        const remaining = calculateBudgetRemaining(setup);
        const remainingColor = remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

        return (
          <div 
            key={setup.id} 
            className="bg-white dark:bg-gray-900 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col"
          >
            <div className="p-4 flex-grow flex flex-col">
              <div className="flex justify-between items-start">
                <div>
                  <p className={`text-lg font-black uppercase tracking-tight ${getAccentClasses('text')}`}>{setup.month}</p>
                  <p className="font-semibold text-gray-400 dark:text-gray-500 text-xs">{setup.timing} • <span className="font-bold">{setup.status}</span></p>
                </div>
                {onMoveToTrash && (
                  <PinProtectedAction featureId="budget_deletions" onVerified={() => onMoveToTrash(setup)}>
                    <button onClick={(e) => e.preventDefault()} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </PinProtectedAction>
                )}
              </div>
        
              <div className="mt-4 flex-grow flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400 text-xs">Total:</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">{formatCurrency(setup.totalAmount)}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400 text-xs">Remaining:</span>
                    <span className={`font-bold text-sm ${remainingColor}`}>{formatCurrency(remaining)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isArchived ? (
                    onReopenSetup && (
                      <PinProtectedAction featureId="budget_modifications" onVerified={() => onReopenSetup(setup)} actionLabel="Reopen Budget">
                        <button
                          onClick={(e) => e.preventDefault()}
                          disabled={archiveSubmitting}
                          className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-sm p-2 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center"
                        >
                          {archiveSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </PinProtectedAction>
                    )
                  ) : (
                    onArchiveSetup && (
                      <PinProtectedAction featureId="budget_modifications" onVerified={() => onArchiveSetup(setup)} actionLabel="Archive Budget">
                        <button
                          onClick={(e) => e.preventDefault()}
                          disabled={archiveSubmitting}
                          className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold text-sm p-2 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center"
                        >
                          {archiveSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                         </button>
                      </PinProtectedAction>
                    )
                  )}
                  <button
                    onClick={() => onLoadSetup(setup)}
                    className={`w-10 h-10 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center ${getAccentClasses('bg')}`}
                  >
                    <ArrowRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDesktopTable = () => (
    <div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800">
            <th className="p-4 pl-8">Month</th>
            <th className="p-4">Status</th>
            <th className="p-4 text-center">Total</th>
            <th className="p-4 text-center">Remaining</th>
            <th className="p-4 pr-8 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {setups.map((setup) => {
            const remaining = calculateBudgetRemaining(setup);
            const remainingColor = remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

            return (
              <tr key={setup.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-4 pl-8">
                  <p className={`font-black uppercase tracking-tight ${getAccentClasses('text')}`}>{setup.month}</p>
                  <p className="font-semibold text-gray-400 dark:text-gray-500 text-xs">{setup.timing}</p>
                </td>
                <td className="p-4"><span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">{setup.status}</span></td>
                <td className="p-4 text-center font-bold text-gray-800 dark:text-gray-200">{formatCurrency(setup.totalAmount)}</td>
                <td className={`p-4 text-center font-bold ${remainingColor}`}>{formatCurrency(remaining)}</td>
                <td className="p-4 pr-8">
                  <div className="flex items-center justify-center gap-2">
                    {onMoveToTrash && (
                      <PinProtectedAction featureId="budget_deletions" onVerified={() => onMoveToTrash(setup)}>
                        <button onClick={(e) => e.preventDefault()} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PinProtectedAction>
                    )}
                    {isArchived ? (
                      onReopenSetup && (
                        <PinProtectedAction featureId="budget_modifications" onVerified={() => onReopenSetup(setup)} actionLabel="Reopen Budget">
                          <button
                            onClick={(e) => e.preventDefault()}
                            disabled={archiveSubmitting}
                            className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-sm p-2 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center"
                          >
                            {archiveSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                          </button>
                        </PinProtectedAction>
                      )
                    ) : (
                      onArchiveSetup && (
                        <PinProtectedAction featureId="budget_modifications" onVerified={() => onArchiveSetup(setup)} actionLabel="Archive Budget">
                          <button
                            onClick={(e) => e.preventDefault()}
                            disabled={archiveSubmitting}
                            className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold text-sm p-2 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center"
                          >
                            {archiveSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                           </button>
                        </PinProtectedAction>
                      )
                    )}
                    <button
                      onClick={() => onLoadSetup(setup)}
                      className={`w-10 h-10 rounded-xl border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center ${getAccentClasses('bg')}`}
                    >
                      <ArrowRight className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className={isMobile ? "p-4" : "p-8"}>
        <h2 className={`text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.25em] mb-6 ${!isMobile && 'px-8'}`}>{title}</h2>
        {setups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-bold">No {isArchived ? 'archived' : 'active'} budgets found.</p>
            <p className="text-sm text-gray-400 mt-2">Click "Open New" to create a new budget setup.</p>
          </div>
        ) : (
          isMobile ? renderMobileList() : renderDesktopTable()
        )}
      </div>
    </div>
  );
};
