
import React from 'react';
import { SavedBudgetSetup } from '../../types';
import { SupabaseTransaction } from '../../src/types/supabase';
import { MoreHorizontal, FileText, Archive, RotateCcw, Trash2, ArrowRight } from 'lucide-react';
import { PinProtectedAction } from './PinProtectedAction';
import { IconSquircleButton } from './IconSquircleButton';

interface BudgetSetupsListProps {
  setups: SavedBudgetSetup[];
  transactions: SupabaseTransaction[];
  selectedYear: number;
  archiveSubmitting: boolean;
  onLoadSetup: (setup: SavedBudgetSetup) => void;
  onReopenSetup: (setup: SavedBudgetSetup) => void;
  onArchiveSetup: (setup: SavedBudgetSetup) => void;
  onMoveToTrash: (setup: SavedBudgetSetup) => void;
  setConfirmModal: (modal: { show: boolean; title: string; message: string; onConfirm: () => void; }) => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

const calculateBudgetRemaining = (
  setup: SavedBudgetSetup,
  transactions: SupabaseTransaction[],
  selectedYear: number
): number => {
    if (!setup.data) return -setup.totalAmount;
  const actualStr = setup.data._actualSalary;
  const projectedStr = setup.data._projectedSalary;
  const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
  const projectedValue = parseFloat(projectedStr || '0') || 0;
  
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonthIndex = MONTHS.indexOf(setup.month);
  const allIncomeTxs = transactions.filter(tx => {
    if (tx.transaction_type !== 'cash_in') return false;
    
    const isTaggedIncome = tx.notes?.startsWith('Income Record');
    const nameLower = tx.name.trim().toLowerCase();
    const isLegacyIncome = nameLower === 'salary' || nameLower === 'income';
    
    if (!isTaggedIncome && !isLegacyIncome) return false;

    const txDate = new Date(tx.date);
    if (txDate.getMonth() !== currentMonthIndex || txDate.getFullYear() !== selectedYear) return false;

    let matchesTiming = false;
    if (tx.notes?.includes(' - 1/2') || tx.notes?.includes(' - 2/2')) {
      matchesTiming = tx.notes.includes(` - ${setup.timing}`);
    } else {
      const estimatedTiming = txDate.getDate() <= 15 ? '1/2' : '2/2';
      matchesTiming = estimatedTiming === setup.timing;
    }

    return matchesTiming;
  });

  const otherIncomeTxs = allIncomeTxs.filter(tx => {
    const nameLower = tx.name.trim().toLowerCase();
    return nameLower !== 'salary' && nameLower !== 'income';
  });

  const totalOtherIncome = otherIncomeTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const hasIncomeRecords = allIncomeTxs.length > 0;

  let salaryToUse = 0;
  if (actualValue !== null && !isNaN(actualValue)) {
    salaryToUse = actualValue;
  } else if (hasIncomeRecords) {
    salaryToUse = 0;
  } else {
    salaryToUse = projectedValue;
  }

  const netIncome = salaryToUse + totalOtherIncome;
  return netIncome - setup.totalAmount;
};

const BudgetSetupsList: React.FC<BudgetSetupsListProps> = ({
  setups,
  transactions,
  selectedYear,
  archiveSubmitting,
  onLoadSetup,
  onReopenSetup,
  onArchiveSetup,
  onMoveToTrash,
  setConfirmModal,
}) => {
  return (
    <div className="space-y-3">
      {setups.map(setup => {
        const remaining = calculateBudgetRemaining(setup, transactions, selectedYear);
        const isArchived = setup.isArchived;
        
        return (
          <div key={setup.id} className="bg-white dark:bg-gray-800 border-2 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isArchived ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  {isArchived ? <Archive className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-black text-gray-900 dark:text-white">{setup.month}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">{setup.timing} timing</p>
                </div>
              </div>
              <div className="relative group">
                  <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                      <MoreHorizontal className="w-5 h-5" />
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border-2 border-black rounded-lg shadow-lg z-10 hidden group-hover:block">
                      {isArchived ? (
                          <PinProtectedAction
                              featureId="budget_modifications"
                              onVerified={() => onReopenSetup(setup)}
                              actionLabel="Reopen Budget"
                          >
                              <button
                                  onClick={(e) => e.preventDefault()}
                                  disabled={archiveSubmitting}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                  <RotateCcw className="w-4 h-4" />
                                  <span>Reopen</span>
                              </button>
                          </PinProtectedAction>
                      ) : (
                          <>
                              <button
                                  onClick={() => onLoadSetup(setup)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                  <ArrowRight className="w-4 h-4" />
                                  <span>Open</span>
                              </button>
                              <PinProtectedAction
                                  featureId="budget_modifications"
                                  onVerified={() => onArchiveSetup(setup)}
                                  actionLabel="Close Budget"
                              >
                                  <button
                                      onClick={(e) => e.preventDefault()}
                                      disabled={archiveSubmitting}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                      <Archive className="w-4 h-4" />
                                      <span>Close</span>
                                  </button>
                              </PinProtectedAction>
                              <PinProtectedAction
                                featureId="budget_modifications"
                                onVerified={() => {
                                    setConfirmModal({
                                    show: true,
                                    title: 'Move to Trash',
                                    message: `Are you sure you want to move the ${setup.month} (${setup.timing}) budget history entry to Trash?`,
                                    onConfirm: () => {
                                        onMoveToTrash?.(setup);
                                        setConfirmModal(p => ({ ...p, show: false }));
                                    }
                                    });
                                }}
                                actionLabel="Remove Budget"
                                >
                                <button
                                    onClick={(e) => e.preventDefault()}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Trash</span>
                                </button>
                                </PinProtectedAction>
                          </>
                      )}
                  </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 text-center">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Budget</p>
                <p className="font-black text-lg text-gray-900 dark:text-white">{formatCurrency(setup.totalAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Remaining</p>
                <p className={`font-black text-lg ${remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(remaining)}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
                {isArchived ? (
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full bg-amber-100 text-amber-700">Archived</span>
                ) : (
                    <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full ${setup.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {setup.status}
                    </span>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BudgetSetupsList;
