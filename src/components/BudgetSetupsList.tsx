
import React from 'react';
import { SavedBudgetSetup } from '../../types';
import { Archive, FileText, RotateCcw, Trash2, ArrowRight } from 'lucide-react';
import { IconSquircleButton } from './IconSquircleButton';
import { PinProtectedAction } from './PinProtectedAction';
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
  archiveSubmitting?: boolean;
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
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (setups.length === 0) {
    return (
      <div className="p-24 text-center text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
        No history found
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-4 p-4">
        {setups.map((setup) => {
          const remaining = calculateBudgetRemaining(setup);
          return (
            <div key={setup.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isArchived ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'}`}>
                    {isArchived ? <Archive className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">{setup.month}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{setup.timing}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isArchived ? (
                    <PinProtectedAction
                      featureId="budget_modifications"
                      onVerified={() => onReopenSetup?.(setup)}
                      actionLabel="Reopen Budget"
                    >
                      <IconSquircleButton variant="reopen" onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} aria-label="Reopen budget">
                        <RotateCcw className="w-4 h-4" />
                      </IconSquircleButton>
                    </PinProtectedAction>
                  ) : (
                    <>
                      <PinProtectedAction
                        featureId="budget_modifications"
                        onVerified={() => onArchiveSetup?.(setup)}
                        actionLabel="Close Budget"
                      >
                        <IconSquircleButton variant="close" onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} aria-label="Close budget">
                          <Archive className="w-4 h-4" />
                        </IconSquircleButton>
                      </PinProtectedAction>
                      <PinProtectedAction
                        featureId="budget_modifications"
                        onVerified={() => onMoveToTrash?.(setup)}
                        actionLabel="Remove Budget"
                      >
                        <IconSquircleButton variant="remove" onClick={(e) => e.preventDefault()} aria-label="Remove budget">
                          <Trash2 className="w-4 h-4" />
                        </IconSquircleButton>
                      </PinProtectedAction>
                    </>
                  )}
                  <IconSquircleButton variant="open" onClick={() => onLoadSetup(setup)} aria-label="Open budget">
                    <ArrowRight className="w-4 h-4" />
                  </IconSquircleButton>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                <div>
                  <div className="text-xs font-black text-gray-400 uppercase">Budget</div>
                  <div className="font-black text-gray-900 dark:text-gray-100">{formatCurrency(setup.totalAmount)}</div>
                </div>
                <div>
                  <div className="text-xs font-black text-gray-400 uppercase">Remaining</div>
                  <div className={`font-black ${remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{formatCurrency(remaining)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-50 dark:border-gray-800/50">
            <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Month</th>
            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Timing</th>
            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Total Budget</th>
            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Remaining</th>
            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Status</th>
            <th className="p-6 pr-8 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
          {setups.map((setup) => {
            const remaining = calculateBudgetRemaining(setup);
            return (
              <tr key={setup.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group">
                <td className="p-8 pl-12">
                  <div className="flex items-center space-x-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isArchived ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shadow-indigo-50/50'}`}>
                      {isArchived ? <Archive className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                    </div>
                    <span className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">{setup.month}</span>
                  </div>
                </td>
                <td className="p-8"><span className="text-[10px] font-black text-gray-500 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-800 px-4 py-1.5 rounded-full uppercase tracking-widest">{setup.timing}</span></td>
                <td className="p-8"><span className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">{formatCurrency(setup.totalAmount)}</span></td>
                <td className="p-8">
                  <span className={`text-base font-black tracking-tight ${remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {formatCurrency(remaining)}
                  </span>
                </td>
                <td className="p-8">
                  <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full ${isArchived ? 'bg-amber-100 text-amber-700' : (setup.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}`}>
                    {isArchived ? 'Archived' : setup.status}
                  </span>
                </td>
                <td className="p-6 pr-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    {isArchived ? (
                      <PinProtectedAction
                        featureId="budget_modifications"
                        onVerified={() => onReopenSetup?.(setup)}
                        actionLabel="Reopen Budget"
                      >
                        <IconSquircleButton variant="reopen" onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} aria-label="Reopen budget">
                          <RotateCcw className="w-4 h-4" />
                        </IconSquircleButton>
                      </PinProtectedAction>
                    ) : (
                      <>
                        <PinProtectedAction
                          featureId="budget_modifications"
                          onVerified={() => onArchiveSetup?.(setup)}
                          actionLabel="Close Budget"
                        >
                          <IconSquircleButton variant="close" onClick={(e) => e.preventDefault()} disabled={archiveSubmitting} aria-label="Close budget">
                            <Archive className="w-4 h-4" />
                          </IconSquircleButton>
                        </PinProtectedAction>
                        <PinProtectedAction
                          featureId="budget_modifications"
                          onVerified={() => onMoveToTrash?.(setup)}
                          actionLabel="Remove Budget"
                        >
                          <IconSquircleButton variant="remove" onClick={(e) => e.preventDefault()} aria-label="Remove budget">
                            <Trash2 className="w-4 h-4" />
                          </IconSquircleButton>
                        </PinProtectedAction>
                      </>
                    )}
                    <IconSquircleButton variant="open" onClick={() => onLoadSetup(setup)} aria-label="Open budget">
                      <ArrowRight className="w-4 h-4" />
                    </IconSquircleButton>
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
