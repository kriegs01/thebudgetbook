import React, { useRef, useState, useEffect } from 'react';
import { SavedBudgetSetup } from '../types';
import { ArrowRight, Archive, RotateCcw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface BudgetSetupsListProps {
  setups: SavedBudgetSetup[];
  title: string;
  isArchived: boolean;
  onLoadSetup: (setup: SavedBudgetSetup) => void;
  onArchiveSetup?: (setup: SavedBudgetSetup | SavedBudgetSetup[]) => void;
  onReopenSetup?: (setup: SavedBudgetSetup | SavedBudgetSetup[]) => void;
  onMoveToTrash?: (setup: SavedBudgetSetup | SavedBudgetSetup[]) => void;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    
    setCanScrollLeft(scrollLeft > 0);
    // 1px buffer for pixel rounding issues
    setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);

    const cardWidth = scrollContainerRef.current.children[0]?.clientWidth || clientWidth;
    // Calculate which index is most visible
    const newIndex = Math.round(scrollLeft / cardWidth);
    setActiveIndex(newIndex);
  };

  useEffect(() => {
    handleScroll();
  }, [sortedGroups.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    
    const cardElement = container.children[0] as HTMLElement;
    if (!cardElement) return;

    const scrollStep = cardElement.clientWidth + 24; 
    const scrollAmount = direction === 'left' ? -scrollStep : scrollStep;
    
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className="w-full mb-8">
      <h2 className="px-4 mb-4 text-sm font-black text-gray-400 uppercase tracking-widest hidden lg:block">{title}</h2>
      
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-4 pt-2 px-4 scrollbar-hide"
      >
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
                  {(() => {
                    // 1. Find the "Master" setup record to detect active periods
                    const masterSetup = group.setups.find(s => s.timing === 'unified') 
                      || group.setups.find(s => s.data && s.data._periodTotals) 
                      || [...group.setups].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))[0] 
                      || mainSetup;

                    // 2. Detect active pay periods across the Master setup
                    let activeKeys = [1, 2];
                    if (masterSetup.data && masterSetup.data._periodTotals) {
                      const keys = Object.keys(masterSetup.data._periodTotals).map(Number);
                      keys.forEach(k => {
                        const spent = masterSetup.data._periodTotals[k] || 0;
                        const projInc = parseFloat(masterSetup.data._projectedSalaryByPeriod?.[k] || '0');
                        const actInc = parseFloat(masterSetup.data._actualSalaryByPeriod?.[k] || '0');
                        if ((spent > 0 || projInc > 0 || actInc > 0) && !activeKeys.includes(k)) {
                          activeKeys.push(k);
                        }
                      });
                    }
                    const periodsToRender = activeKeys.sort((a, b) => a - b);

                    // 3. Render progress bars using the EXACT record for that tab
                    return periodsToRender.map((periodIndex) => {
                      const legacyTimingVal = periodIndex === 1 ? '1/2' : '2/2';
                      
                      // 🟢 THE FIX: Prioritize the specific database record for THIS tab!
                      // If Tab 1 was saved yesterday and Tab 2 was saved today, Tab 1's snapshot of Tab 2 is stale.
                      // We must read Tab 2's data directly from Tab 2's record!
                      const specificSetup = group.setups.find(s => s.timing === legacyTimingVal) || masterSetup;
                      
                      const actualStr = specificSetup.data?._actualSalaryByPeriod?.[periodIndex] || masterSetup.data?._actualSalaryByPeriod?.[periodIndex] || (periodIndex === 1 ? specificSetup.data?._actualSalary : undefined);
                      const projectedStr = specificSetup.data?._projectedSalaryByPeriod?.[periodIndex] || masterSetup.data?._projectedSalaryByPeriod?.[periodIndex] || (periodIndex === 1 ? specificSetup.data?._projectedSalary : undefined);
                      
                      const actualValue = actualStr && actualStr.trim() !== '' ? parseFloat(actualStr) : null;
                      const projectedValue = parseFloat(projectedStr || '0');
                      const incomeToUse = actualValue !== null && !isNaN(actualValue) ? actualValue : projectedValue;

                      let spent = 0;
                      if (specificSetup.data && specificSetup.data._periodTotals && specificSetup.data._periodTotals[periodIndex] !== undefined) {
                        // Trust the exact tab's record first!
                        spent = specificSetup.data._periodTotals[periodIndex];
                      } else if (masterSetup.data && masterSetup.data._periodTotals) {
                        // Fallback to the master record
                        spent = masterSetup.data._periodTotals[periodIndex] || 0;
                      } else {
                        // Absolute legacy fallback
                        spent = specificSetup.totalAmount || 0;
                      }

                      const remaining = incomeToUse - spent;
                      const percentSpent = incomeToUse > 0 ? Math.min(100, (spent / incomeToUse) * 100) : 100;
                      const isOverBudget = remaining < 0;

                      const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
                      const timingLabel = labels[periodIndex - 1] ? `${labels[periodIndex - 1]} Paycheck` : `Paycheck ${periodIndex}`;

                      return (
                        <div key={periodIndex} className="space-y-2">
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
                    });
                  })()}
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
                    onClick={() => onArchiveSetup(group.setups)}
                    disabled={archiveSubmitting}
                    className="w-12 flex justify-center items-center bg-amber-50 text-amber-700 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                    title="Close Budget"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}

                {isArchived && onReopenSetup && (
                  <button
                    onClick={() => onReopenSetup(group.setups)}
                    disabled={archiveSubmitting}
                    className="w-12 flex justify-center items-center bg-indigo-50 text-indigo-700 border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50"
                    title="Reopen Budget"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}

                {onMoveToTrash && (
                  <button
                    onClick={(e) => {
                       e.stopPropagation();
                       onMoveToTrash(group.setups);
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

      {sortedGroups.length > 1 && (
        <div className="flex items-center justify-center gap-6 mt-4">
          <button 
            onClick={() => scroll('left')}
            className={`p-2 bg-white dark:bg-gray-800 border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all hidden md:block ${!canScrollLeft ? 'invisible' : ''}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-2">
            {sortedGroups.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-2 rounded-full transition-all duration-300 border border-black ${
                  activeIndex === idx ? 'w-6 bg-indigo-600' : 'w-2 bg-gray-300 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          <button 
            onClick={() => scroll('right')}
            className={`p-2 bg-white dark:bg-gray-800 border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all hidden md:block ${!canScrollRight ? 'invisible' : ''}`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
