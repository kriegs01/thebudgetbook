// src/components/SandboxView.tsx
import React, { useState, useRef } from 'react';
import { useSandbox } from '../components/useSandbox';
import { Plus, Trash2, Calendar, WalletCards, CalendarDays, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { useTheme } from '../contexts/ThemeContext';
import { calculateBillingCycles } from '../utils/billingCycles';
import { determineItemPeriod } from '../utils/budgetEngine';

interface SandboxViewProps {
  onClose: () => void;
  liveIncomeTxs: any[];
  liveSpendTxs: any[];
  activeSetup: any;
  allSetups?: any[];
  currentYear?: number;
  accounts: any[]; 
  billers?: any[]; 
  currentPeriods?: any[]; // 🟢 ADD THIS
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


export const SandboxView: React.FC<SandboxViewProps> = ({ 
  onClose, liveIncomeTxs, liveSpendTxs, activeSetup, allSetups, currentYear, accounts, billers, currentPeriods 
}) => {
  const {
    safetyNet, setSafetyNet,
    mockPurchases, addMockPurchase, removeMockPurchase
  } = useSandbox();

  const { getAccentClasses } = useTheme();

  const [isTrayOpen, setIsTrayOpen] = useState(true);
  
  // Dynamic Date Range Controls
  const [forecastMonths, setForecastMonths] = useState<number>(3);
  const [forecastInterval, setForecastInterval] = useState<'monthly' | 'paycheck'>('monthly');

  // Carousel Controls
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Mock Purchase Form State
  const [newPurchaseName, setNewPurchaseName] = useState('');
  const [newPurchaseAmount, setNewPurchaseAmount] = useState('');
  const [purchaseType, setPurchaseType] = useState<'one-off' | 'installment'>('one-off');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationMonths, setDurationMonths] = useState('3');
  
  // 🟢 NEW: Credit Card Sweep State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string>('');

  // 🟢 NEW: Filter down to just the user's credit cards
  const creditCardAccounts = React.useMemo(() => {
    return (accounts || []).filter(acc => acc.type === 'Credit' || acc.classification === 'Credit Card');
  }, [accounts]);



  // --- ISOLATED FORECAST MATH ---
  const startMonthIdx = activeSetup?.month ? MONTHS.indexOf(activeSetup.month) : new Date().getMonth();
  const startYear = currentYear || activeSetup?.data?._year || new Date().getFullYear();
  const startLabel = `${MONTHS[startMonthIdx]} ${startYear}`;

  const hasMockPurchases = mockPurchases.length > 0;

  const totalMockSpend = mockPurchases.reduce((sum, p) => {
    if (p.type === 'installment') return sum + (p.amount * (p.durationMonths || 1));
    return sum + p.amount;
  }, 0);

  const endOptions = Array.from({ length: 12 }).map((_, i) => {
    const targetIdx = (startMonthIdx + i) % 12;
    const targetYear = startYear + Math.floor((startMonthIdx + i) / 12);
    return {
      months: i + 1,
      label: `${MONTHS[targetIdx]} ${targetYear}`
    };
  });

  const isPaycheck = forecastInterval === 'paycheck';
  const periodsPerMonth = isPaycheck ? 2 : 1;
  const totalPeriods = forecastMonths * periodsPerMonth;

  const timeline = Array.from({ length: totalPeriods }).map((_, i) => {
    const isFirstPeriod = i === 0;
    const monthOffset = isPaycheck ? Math.floor(i / 2) : i;
    
    const targetMonthIdx = (startMonthIdx + monthOffset) % 12;
    const targetYear = startYear + Math.floor((startMonthIdx + monthOffset) / 12);
    const targetAbsMonth = targetYear * 12 + targetMonthIdx; 
    const monthName = MONTHS[targetMonthIdx];

    const periodIndex = isPaycheck ? (i % 2) + 1 : 1;
    const label = isPaycheck ? `${monthName} (Pay ${periodIndex})` : monthName;

    let monthSetups = allSetups?.filter(s => s.month === monthName && Number(s.data?._year || targetYear) === targetYear) || [];
    if (monthOffset === 0 && monthSetups.length === 0 && activeSetup) {
      monthSetups = [activeSetup];
    }

    let periodIncome = 0;
    let periodSpend = 0;
    const setupToUse = monthSetups.find(s => s.timing === 'unified') || monthSetups[0];

    if (setupToUse) {
      if (isPaycheck) {
        const actualInc = Number(setupToUse.data?._actualSalaryByPeriod?.[periodIndex]);
        const projInc = Number(setupToUse.data?._projectedSalaryByPeriod?.[periodIndex]);
        periodIncome = (actualInc > 0 ? actualInc : projInc) || (Number(setupToUse.data?._projectedSalary || 0) / 2);
        periodSpend = Number(setupToUse.data?._periodTotals?.[periodIndex]) || (Number(setupToUse.totalAmount || 0) / 2);
      } else {
        const actual1 = Number(setupToUse.data?._actualSalaryByPeriod?.[1]);
        const proj1 = Number(setupToUse.data?._projectedSalaryByPeriod?.[1]);
        const actual2 = Number(setupToUse.data?._actualSalaryByPeriod?.[2]);
        const proj2 = Number(setupToUse.data?._projectedSalaryByPeriod?.[2]);
        
        periodIncome = ((actual1 > 0 ? actual1 : proj1) || 0) + ((actual2 > 0 ? actual2 : proj2) || 0) || Number(setupToUse.data?._projectedSalary || 0);
        periodSpend = (Number(setupToUse.data?._periodTotals?.[1]) || 0) + (Number(setupToUse.data?._periodTotals?.[2]) || 0) || Number(setupToUse.totalAmount || 0);
      }
    } else {
      const defaultProj = Number(activeSetup?.data?._projectedSalary || 11000);
      periodIncome = isPaycheck ? defaultProj / 2 : defaultProj;
      periodSpend = 0; 
    }

    let periodMockSpend = 0;
    
    mockPurchases.forEach(purchase => {
      const pDate = new Date(purchase.startDate);
      
      // 🟢 1. BASELINE: Assume it's a cash purchase hitting immediately
      let effectiveAbsMonth = pDate.getFullYear() * 12 + pDate.getMonth();
      let effectiveDay = pDate.getDate();

                  // 🟢 Scope the biller so the engine can use it in Step 3!
      let matchedBiller: any = null;

      // 🟢 2. TIME TRAVEL: If it's a credit card swipe, calculate the future hit!
      if (purchase.paymentMethod === 'credit' && purchase.creditCardId) {
        const card = accounts?.find(a => a.id === purchase.creditCardId);
        
        matchedBiller = billers?.find(b => 
          b.linkedAccountId === card?.id || 
          b.linked_account_id === card?.id || 
          (b.name && card?.bank && b.name.toLowerCase() === card.bank.toLowerCase())
        );

        const actualBillingDate = card?.billingDate || card?.billing_date || card?.statementDate;
        
        if (card && actualBillingDate && typeof calculateBillingCycles === 'function') {
          try {
            const gracePeriod = Number(card.gracePeriod || card.grace_period) || 24;
            const cycles = calculateBillingCycles(actualBillingDate, gracePeriod, false);
            
            const targetCycle = cycles.find((c: any) => pDate >= c.startDate && pDate <= c.endDate);
            
            if (targetCycle) {
              let dynamicDueDate = targetCycle.dueDate ? new Date(targetCycle.dueDate) : new Date(targetCycle.endDate);
              if (!targetCycle.dueDate) dynamicDueDate.setDate(dynamicDueDate.getDate() + gracePeriod);
              
              const hardcodedDueDay = matchedBiller?.dueDate || matchedBiller?.due_date || card?.dueDate || card?.due_date;
              
              effectiveDay = hardcodedDueDay 
                ? parseInt(String(hardcodedDueDay).replace(/[^0-9]/g, ''), 10) 
                : dynamicDueDate.getDate();

              effectiveAbsMonth = dynamicDueDate.getFullYear() * 12 + dynamicDueDate.getMonth();

              // 🟢 THE 32+ CHOKEHOLD FIX
              const statementMonth = targetCycle.endDate.getMonth();
              const dueMonth = dynamicDueDate.getMonth();
              
              if (statementMonth !== dueMonth && effectiveDay < 15) {
                // 1. Shift the month back to the Statement Month
                effectiveAbsMonth = targetCycle.endDate.getFullYear() * 12 + targetCycle.endDate.getMonth();
                
                // 2. 🟢 THE FIX: The engine ignores text tags and only reads numbers! 
                // We forcefully spoof the day to the 28th so the engine physically plots it in Pay 2!
                effectiveDay = 28;
              }
            }
          } catch (e) {
            console.warn("Cycle math failed, falling back to standard date");
          }
        }
      }

      // 🟢 3. ASSIGN EXPENSE: Apply the shifted dates to the timeline
      const targetPeriod = currentPeriods && currentPeriods.length > 0 
        ? determineItemPeriod({ ...matchedBiller, dueDate: effectiveDay }, currentPeriods, monthName, targetYear) 
        : (effectiveDay <= 15 ? 1 : 2);

      


      if (purchase.type === 'one-off') {
        if (effectiveAbsMonth === targetAbsMonth) {
          if (isPaycheck) {
            if (periodIndex === targetPeriod) {
              periodMockSpend += purchase.amount;
            }
          } else {
            periodMockSpend += purchase.amount;
          }
        }
      } else if (purchase.type === 'installment') {
        const duration = purchase.durationMonths || 1;
        const monthlyAmount = purchase.amount; 
        
        // For installments, the timeline starts at the shifted month and runs for `duration` months
        const endAbsMonth = effectiveAbsMonth + duration - 1;

        if (targetAbsMonth >= effectiveAbsMonth && targetAbsMonth <= endAbsMonth) {
          if (isPaycheck) {
            if (periodIndex === targetPeriod) {
              periodMockSpend += monthlyAmount;
            }
          } else {
            periodMockSpend += monthlyAmount;
          }
        }
      }
    });

    const periodRemaining = periodIncome - periodSpend - periodMockSpend;
    const isSafe = periodRemaining >= (safetyNet || 0);

    return {
      id: i, label, income: periodIncome, spend: periodSpend, mockSpend: periodMockSpend, remaining: periodRemaining, isSafe, isFirstPeriod
    };
  });


  const isAbsolutelySafe = timeline.every(p => p.isSafe);

  // --- CAROUSEL LOGIC ---
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const cardWidth = 304; // 280px min-width + 24px gap
    const newIndex = Math.round(container.scrollLeft / cardWidth);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  const scrollToCard = (index: number) => {
    if (!scrollContainerRef.current) return;
    const cardWidth = 304;
    scrollContainerRef.current.scrollTo({ left: index * cardWidth, behavior: 'smooth' });
    setActiveIndex(index);
  };

  const handlePrev = () => scrollToCard(Math.max(0, activeIndex - 1));
  const handleNext = () => scrollToCard(Math.min(timeline.length - 1, activeIndex + 1));

  React.useEffect(() => {
    // Grab the entire global navigation bar
    const navBar = document.getElementById('global-nav-bar');
    
    // Hide it completely the moment Crystal Ball opens
    if (navBar) navBar.style.display = 'none';
    
    // Bring it back exactly as it was when you hit Exit!
    return () => {
      if (navBar) navBar.style.display = 'flex';
    };
  }, []);




  return (
    <div className={`slide-in-from-bottom-4 duration-500 bg-[#F4F3EF] dark:bg-gray-950 min-h-screen pb-48 pt-16 overflow-y-auto w-full px-1 lg:px-8 ${isTrayOpen ? 'relative z-20' : 'animate-in'}`}>

      {/* 🔮 PAGE HEADER COMPONENT */}
      <div className="shrink-0 mb-6 w-full">
        <PageHeader 
          title="Crystal Ball"
          subtitle="Check your future"
          icon={
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
              🔮
            </div>
          }
          actions={
            <button 
              onClick={onClose}
              className="px-5 py-3 bg-red-100 text-red-700 border-[3px] border-black rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              Exit
            </button>
          }
        />
      </div>

      {/* 🟢 MAIN LAYOUT */}
      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        
        {/* 🎶 APPLE MUSIC TRAY / LEFT COLUMN (Locked to 380px on Desktop) */}
        {/* TO (Notice 'top-14 lg:top-auto' added to the second line): */}
<div className={`
  order-2 lg:order-1 w-full lg:w-[380px] shrink-0 flex flex-col gap-6 lg:sticky lg:top-4 lg:translate-y-0 lg:h-[calc(100vh-8rem)]
  fixed inset-x-0 bottom-0 top-14 lg:top-auto z-[120] lg:z-auto lg:relative bg-[#F4F3EF] dark:bg-gray-900 lg:bg-transparent lg:dark:bg-transparent
  rounded-t-[2.5rem] lg:rounded-none border-t-4 border-l-4 border-r-4 lg:border-none border-black
  shadow-[0px_-8px_20px_rgba(0,0,0,0.15)] lg:shadow-none transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
  ${isTrayOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.5rem)] lg:translate-y-0'}
`}>

          {/* TO: */}
<div className="lg:hidden w-full h-[4.5rem] flex flex-col items-center justify-center cursor-pointer active:bg-gray-200 dark:active:bg-gray-800 rounded-t-[2.5rem] transition-colors bg-white dark:bg-gray-900 border-b-4 border-black" onClick={() => setIsTrayOpen(!isTrayOpen)}>
  <div className="w-12 h-1.5 bg-black dark:bg-gray-500 rounded-full mb-2"></div>
  <p className="font-black text-black dark:text-white uppercase tracking-widest text-sm">

              {isTrayOpen ? 'Tap to Close' : 'Tap to Add Purchases'}
            </p>
          </div>

          {/* TO: */}
<div className="px-6 pb-40 pt-6 lg:p-0 max-h-[70vh] lg:max-h-none overflow-y-auto lg:overflow-visible block space-y-6 bg-[#F4F3EF] dark:bg-gray-900 lg:bg-transparent lg:dark:bg-transparent">




            
            <div className="p-6 bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0">
              <h2 className="text-xl font-black mb-2 uppercase">Money-Chill Zone</h2>
              <div className="flex items-center border-2 border-black rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800 focus-within:ring-2 focus-within:ring-amber-400 transition-all mt-4">
                <span className="text-gray-400 font-bold mr-2 text-sm">₱</span>
                <input type="number" value={safetyNet || ''} onChange={(e) => setSafetyNet(Number(e.target.value))} placeholder="e.g. 5000" className="flex-1 bg-transparent outline-none text-base font-black text-amber-600 dark:text-amber-400" />
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex-1 lg:flex-none lg:h-fit flex flex-col">
              <div className="shrink-0 mb-6">
                <h2 className="text-xl font-black mb-4 uppercase">What if I buy...</h2>
                
                {/* TO: */}
<div className="flex gap-2 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border-2 border-black">
  <button onClick={() => setPurchaseType('one-off')} className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${purchaseType === 'one-off' ? 'bg-white dark:bg-gray-700 dark:text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500 dark:text-gray-400 border-2 border-transparent'}`}>One-Off</button>
  <button onClick={() => setPurchaseType('installment')} className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${purchaseType === 'installment' ? 'bg-white dark:bg-gray-700 dark:text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'text-gray-500 dark:text-gray-400 border-2 border-transparent'}`}>Installment</button>
</div>


                <div className="space-y-3 mb-4">
                  
                  {/* 🟢 NEW: Payment Method Toggle */}
                  {/* TO: */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border-2 border-black">
                      <button 
                        onClick={() => { setPaymentMethod('cash'); setSelectedCreditCardId(''); }} 
                        className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 ${paymentMethod === 'cash' ? 'bg-white dark:bg-gray-700 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400 border-2 border-transparent'}`}
                      >
                        Cash/Debit
                      </button>
                      <button 
                        onClick={() => setPaymentMethod('credit')} 
                        className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 ${paymentMethod === 'credit' ? 'bg-white dark:bg-gray-700 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 border-2 border-transparent'}`}
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Swipe It
                      </button>
                    </div>


                  {/* 🟢 NEW: Credit Card Selector Dropdown */}
                  {paymentMethod === 'credit' && creditCardAccounts.length > 0 && (
                     <div className="animate-in slide-in-from-top-2 duration-300">
                        <select 
                          value={selectedCreditCardId}
                          onChange={(e) => setSelectedCreditCardId(e.target.value)}
                          className="w-full bg-purple-50 border-2 border-black text-purple-700 rounded-xl px-3 py-2 outline-none font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-1"
                        >
                          <option value="" disabled>Select Credit Card...</option>
                          {creditCardAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.bank}</option>
                          ))}
                        </select>
                     </div>
                  )}

<input 
  type="text" 
  value={newPurchaseName} 
  onChange={(e) => setNewPurchaseName(e.target.value)} 
  placeholder="Item name" 
  className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 outline-none font-bold text-[16px]" 
/>


                  
<div className="flex gap-2">
  <div className="relative flex-1">
    {/* Scaled the peso sign to 16px on mobile to match the input, shrinks back to text-xs on desktop */}
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[16px] md:text-xs">₱</span>
    <input 
      type="number" 
      value={newPurchaseAmount} 
      onChange={(e) => setNewPurchaseAmount(e.target.value)} 
      placeholder={purchaseType === 'installment' ? 'Monthly Amount' : 'Amount'} 
      className="w-full pl-7 md:pl-6 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 outline-none font-black text-[16px] md:text-xs" 
    />
  </div>
  
  {purchaseType === 'installment' && (
    <div className="relative flex-[0.5]">
      <input 
        type="number" 
        value={durationMonths} 
        onChange={(e) => setDurationMonths(e.target.value)} 
        placeholder="Months" 
        className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 outline-none font-black text-[16px] md:text-xs" 
      />
      {/* Kept "Mos" small since it acts as a tiny decorative label */}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[10px] uppercase">Mos</span>
    </div>
  )}
</div>

                  
                  <div className="relative">
                    <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full pl-0 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-3 py-2 outline-none font-bold text-xs" />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    if (newPurchaseName && newPurchaseAmount) {
                      // Prevent submission if they chose Credit but didn't pick a card
                      if (paymentMethod === 'credit' && !selectedCreditCardId) {
                         alert("Please select a credit card to swipe.");
                         return;
                      }

                      addMockPurchase({ 
                        id: Date.now().toString(), 
                        name: newPurchaseName, 
                        amount: Number(newPurchaseAmount),
                        type: purchaseType, 
                        startDate: purchaseDate, 
                        durationMonths: purchaseType === 'installment' ? Number(durationMonths) : undefined,
                        // 🟢 Send the swipe data to the engine
                        paymentMethod: paymentMethod,
                        creditCardId: paymentMethod === 'credit' ? selectedCreditCardId : undefined
                      });

                      setNewPurchaseName(''); setNewPurchaseAmount('');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-amber-400 text-black p-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all font-black text-xs uppercase"
                >

                  <Plus className="w-4 h-4" /> Add to cart!
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1 pr-1 custom-scrollbar min-h-[150px] border-t-2 border-dashed border-gray-200 pt-4">
                {!hasMockPurchases ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">No mock purchases yet.</p>
                ) : (
                  mockPurchases.map(purchase => {
                    let paymentLabel = 'Cash/Debit';
                    if (purchase.paymentMethod === 'credit' && purchase.creditCardId) {
                      const card = accounts?.find(a => a.id === purchase.creditCardId);
                      paymentLabel = card ? card.bank : 'Credit';
                    }

                    return (
                      <div key={purchase.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 border-2 border-black p-3 rounded-xl shrink-0">
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-sm font-bold truncate">{purchase.name}</span>
                          <span className="text-[9px] font-black uppercase text-gray-500">
                            {purchase.type === 'installment' 
                              ? `${purchase.durationMonths} Mos • Starts ${new Date(purchase.startDate).toLocaleDateString()} • ${paymentLabel}` 
                              : `One-off • ${new Date(purchase.startDate).toLocaleDateString()} • ${paymentLabel}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-black text-red-500">
                            ₱{purchase.amount.toLocaleString()}
                            {purchase.type === 'installment' && <span className="text-[10px] text-gray-500 font-bold ml-1">/ mo</span>}
                          </span>
                          <button onClick={() => removeMockPurchase(purchase.id)} className="text-gray-400 hover:text-red-500 transition-colors bg-white border border-gray-200 rounded p-1 shadow-sm">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* 🟡 FORECAST BOARD */}

        <div className="flex-1 min-w-0 w-full flex flex-col gap-6 order-1 lg:order-2 overflow-hidden">
          
          <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-900 border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0">
          <div className="flex items-center gap-2 w-full min-w-0">
  <Calendar className="w-5 h-5 text-indigo-500 shrink-0" />
  
  <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-lg px-1.5 py-1 flex-1 min-w-0 overflow-hidden">
    
    <span className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-1 text-gray-500 select-none whitespace-nowrap shrink-0 text-sm">
      {startLabel}
    </span>
    
    <span className="text-gray-400 text-sm shrink-0">To</span>
    
    <select
      value={forecastMonths}
      onChange={(e) => setForecastMonths(Number(e.target.value))}
      className="bg-white dark:bg-gray-900 border-2 border-black rounded px-1 py-1 outline-none text-indigo-600 dark:text-indigo-400 flex-1 min-w-0 text-ellipsis whitespace-nowrap text-sm"
    >
      {endOptions.map(opt => (
        <option key={opt.months} value={opt.months}>
          {opt.label} ({opt.months} {opt.months === 1 ? 'mo' : 'mos'})
        </option>
      ))}
    </select>
    
  </div>
</div>


            <div className="flex flex-wrap items-center gap-2">
              <WalletCards className="w-5 h-5 text-indigo-500" />
              <select 
                value={forecastInterval}
                onChange={(e) => setForecastInterval(e.target.value as 'monthly' | 'paycheck')}
                className="bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-lg px-3 py-1.5 outline-none font-black text-xs uppercase"
              >
                <option value="monthly">Monthly View</option>
                <option value="paycheck">Per Paycheck View</option>
              </select>
            </div>
          </div>

          {/* 🔮 THE CRYSTAL BALL VERDICT CARD */}
          <div className={`shrink-0 flex justify-between items-center p-6 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-colors duration-500 ${!hasMockPurchases ? 'bg-indigo-50 dark:bg-indigo-900/20' : (isAbsolutelySafe ? 'bg-green-400' : 'bg-red-400')}`}>
            <div className="flex items-center gap-4">
              <div className="text-4xl drop-shadow-md">🔮</div>
              <div>
                <span className={`font-black uppercase tracking-widest text-sm block mb-1 ${!hasMockPurchases ? 'text-indigo-600 dark:text-indigo-400' : 'text-black'}`}>
                  The Crystal Ball says:
                </span>
                <span className={`font-bold text-sm ${!hasMockPurchases ? 'text-indigo-500 dark:text-indigo-300' : 'text-black/80'}`}>
                  {!hasMockPurchases 
                    ? 'Tell me what you want to buy...' 
                    : (isAbsolutelySafe ? 'I see a great future! ✨' : 'The stars say be cautious! ⚠️')}
                </span>
              </div>
            </div>
          </div>

          {/* TIMELINE UI (with Carousel Support) */}
          <div className="p-4 bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex-1 flex flex-col overflow-hidden min-h-[400px]">
            <div className="mb-6 flex justify-between items-end shrink-0">
              <h2 className="text-xl font-black uppercase">Take a peek!</h2>
              {totalMockSpend > 0 && (
                <div className="text-right border-2 border-black px-3 py-1 bg-red-100 rounded-lg">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-700">Total Planned Spend</p>
                  <p className="text-base font-black text-red-600">-₱{totalMockSpend.toLocaleString()}</p>
                </div>
              )}
            </div>

            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto lg:overflow-x-auto lg:overflow-y-hidden custom-scrollbar pb-4"
            >
              <div className={`relative flex w-full flex-col space-y-6 lg:space-y-0 lg:flex-row lg:space-x-6 lg:min-w-max`}>
                <div className="absolute left-[15px] top-4 bottom-4 w-1 bg-black lg:hidden z-0"></div>
                <div className="hidden lg:block absolute top-[15px] left-4 right-4 h-1 bg-black z-0"></div>

                {timeline.map((period) => {
                  const dipsBelowSafe = !period.isSafe;
                  
                  return (
                    <div key={period.id} className="relative pl-10 lg:pl-0 lg:pt-10 flex-1 min-w-[280px]">
                      <div className={`absolute z-10 rounded-full border-4 border-black w-5 h-5 left-1 top-4 lg:left-1/2 lg:-translate-x-1/2 lg:top-1 ${dipsBelowSafe ? 'bg-red-500' : 'bg-green-400'}`} />

                      <div className={`p-4 border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 relative overflow-hidden ${dipsBelowSafe ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                        <div className="flex justify-between items-center border-b-2 border-black/10 pb-2">
                          <span className="font-black text-sm uppercase tracking-wider">{period.label}</span>
                          {period.isFirstPeriod && <span className="bg-amber-300 text-black border-2 border-black text-[9px] font-black px-2 py-0.5 rounded-md uppercase">Current</span>}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-bold text-gray-500">
                            <span>Income</span>
                            <span className="text-gray-900 dark:text-gray-100">₱{period.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold text-gray-500">
                            <span>Budgeted Spend</span>
                            <span className="text-gray-900 dark:text-gray-100">-₱{period.spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          
                          {period.mockSpend > 0 && (
                            <div className="flex justify-between text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded border border-red-200 mt-1">
                              <span>Mock Spend</span>
                              <span>-₱{period.mockSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>

                        <div className={`border-t-2 border-black pt-2 mt-1 flex justify-between items-end`}>
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Remaining</span>
                          <span className={`font-black text-xl ${dipsBelowSafe ? 'text-red-600' : 'text-green-600'}`}>
                            ₱{period.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 🟢 DESKTOP CAROUSEL CONTROLS */}
            <div className="hidden lg:flex items-center justify-center gap-6 pt-4 shrink-0 border-t-2 border-dashed border-gray-200 dark:border-gray-700 mt-auto">
              <button 
                onClick={handlePrev} 
                disabled={activeIndex === 0} 
                className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                <ChevronLeft className="w-5 h-5 text-black dark:text-white" />
              </button>
              
              <div className="flex gap-2">
                {timeline.map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => scrollToCard(i)}
                    className={`w-3 h-3 rounded-full border-2 border-black transition-colors ${activeIndex === i ? 'bg-indigo-500' : 'bg-transparent dark:bg-gray-800'}`}
                    aria-label={`Go to period ${i + 1}`}
                  />
                ))}
              </div>

              <button 
                onClick={handleNext} 
                disabled={activeIndex === timeline.length - 1} 
                className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                <ChevronRight className="w-5 h-5 text-black dark:text-white" />
              </button>
            </div>

          </div>
        </div>

      </div>

      {isTrayOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-500 animate-in fade-in" onClick={() => setIsTrayOpen(false)} />
      )}
    </div>
  );
};
