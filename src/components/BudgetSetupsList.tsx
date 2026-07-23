import React from 'react';
import { SavedBudgetSetup } from '../types';
import { ArrowRight, Archive, RotateCcw, Trash2 } from 'lucide-react';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface BudgetSetupsListProps {
  setups: SavedBudgetSetup[];
  title: string;
  isArchived: boolean;
  onLoadSetup: (setup: SavedBudgetSetup) => void;
  onArchiveSetup?: (setup: SavedBudgetSetup) => void;
  onReopenSetup?: (setup: SavedBudgetSetup) => void;
  onMoveToTrash?: (setup: SavedBudgetSetup) => void;
  formatCurrency: (amount: number) => string;
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
  archiveSubmitting
}) => {
  if (!setups || setups.length === 0) {
    return null;
  }

  const groupedSetups = setups.reduce((acc, setup) => {
    const year = setup.data?._year || new Date().getFullYear();
    const month = setup.month;
    const key = `${year}-${month}`;

    if (!acc[key]) {
      acc[key] = { key, month, year, setups: [] };
    }
    acc[key].setups.push(setup);
    return acc;
  }, {} as Record<string, { key: string; month: string; year: number; setups: SavedBudgetSetup[] }>);

  const sortedGroups = Object.values(groupedSetups).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
  });

  return (
    <div className="w-full">
      <h2 className="px-4 mb-4 text-sm font-black text-gray-400 uppercase tracking-widest">{title}</h2>
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-2 px-4 scrollbar-hide">
        {sortedGroups.map((group) => {
          const mainSetup = group.setups[0];

          return (
            <div key={group.key} className="snap-center shrink-0 w-[85vw] md:w-[400px] bg-white dark:bg-gray-900 border-4 border-black rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between transition-colors">
              <div>
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">
                     {group.month} {group.year}
                   </h3>
                   {isArchived && <span className="bg-amber-100 text-amber-800 border-2 border-black text-[10px] font-black uppercase px-2 py-1 rounded-lg">Archived</span>}
                </div>

                <div className="space-y-6">
                  {['1/2', '2/2'].map((timingVal) => {
                    const periodIndex = timingVal === '1/2' ? 1 : 2;
                    // Safely grab the unified setup
                    const setup = group.setups.find(s => s.timing === timingVal) || mainSetup;
                    
                    // 1. Pull period-specific income!
                    const actualStr = setup.data?._actualSalaryByPeriod?.[periodIndex] || setup.data?._actualSalary;
                    const projectedStr = setup.data?._projectedSalaryByPeriod?.[periodIndex] || setup.data?._projectedSalary;
                    const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
                    const projectedValue = parseFloat(projectedStr || '0');
                    const incomeToUse = actualValue !== null && !isNaN(actualValue) ? actualValue : projectedValue;

                    // 2. Pull period-specific spent totals!
                                        // 2. Pull period-specific spent totals!
                                                            // 2. Pull period-specific spent totals!
                    let spent = 0;
                    
                    // Hunt for ANY setup in the month that has our new engine math stamped on it
                    const setupWithNewMath = group.setups.find(s => s.data && s.data._periodTotals);
                    
                    if (setupWithNewMath && setupWithNewMath.data._periodTotals) {
                      // If it finds the new math, use it!
                      spent = setupWithNewMath.data._periodTotals[periodIndex] || 0;
                    } else {
                      // If no save has happened yet, fallback to the old broken math
                      const isThisTimingSaved = group.setups.some(s => s.timing === timingVal);
                      spent = isThisTimingSaved ? (setup.totalAmount || 0) : 0;
                    }

                    
                    
                    const remaining = incomeToUse - spent;
                    const percentSpent = incomeToUse > 0 ? Math.min(100, (spent / incomeToUse) * 100) : 100;
                    const isOverBudget = remaining < 0;

                    const timingLabel = timingVal === '1/2' ? 'First Paycheck' : 'Second Paycheck';

                    return (
                      <div key={timingVal} className="space-y-2">
                        <div className="flex justify-between items-end">
                          <span className="text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {timingLabel}
                          </span>
                          <span className={`text-xs font-black ${isOverBudget ? 'text-red-500' : 'text-green-600'}`}>
                            {formatCurrency(Math.abs(remaining))} {isOverBudget ? 'Over' : 'Left'}
                          </span>
                        </div>

                        <div className={`h-5 w-full border-2 border-black rounded-xl overflow-hidden flex relative ${isOverBudget ? 'bg-red-100' : 'bg-green-400'}`}>
                          <div
                            className={`h-full border-r-2 border-black transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-gray-800 dark:bg-gray-700'}`}
                            style={{ width: `${percentSpent}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-[10px] font-bold text-gray-400">
                          <span>{formatCurrency(spent)} Spent</span>
                          <span>{formatCurrency(incomeToUse)} Income</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-200 dark:border-gray-800 flex gap-3">
                <button
                  onClick={() => onLoadSetup(mainSetup)}
                  className="flex-1 bg-indigo-600 text-white border-2 border-black py-3 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex justify-center items-center gap-2"
                >
                  <span>View</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {!isArchived && onArchiveSetup && (
                  <button
                    onClick={() => onArchiveSetup(mainSetup)}
                    disabled={archiveSubmitting}
                    className="w-12 flex justify-center items-center bg-amber-50 text-amber-700 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                    title="Close Budget"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}

                {isArchived && onReopenSetup && (
                  <button
                    onClick={() => onReopenSetup(mainSetup)}
                    disabled={archiveSubmitting}
                    className="w-12 flex justify-center items-center bg-indigo-50 text-indigo-700 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                    title="Reopen Budget"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}

                {/* Removed isArchived condition here so it shows on all cards */}
                {onMoveToTrash && (
                  <button
                    onClick={(e) => {
                       e.stopPropagation(); // Stops it from opening the card
                       onMoveToTrash(mainSetup);
                    }}
                    className="w-12 flex justify-center items-center bg-white dark:bg-gray-800 text-red-500 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-50 hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                    title="Move to Trash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
