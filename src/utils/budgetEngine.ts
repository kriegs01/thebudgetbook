import { PayPeriod } from './payPeriodUtils';

// ==========================================
// 1. INDESTRUCTIBLE DATE EXTRACTORS
// ==========================================

const extractDay = (val: any): number => {
  if (typeof val === 'number') return val;
  const str = String(val);
  // Safely extract day from YYYY-MM-DD
  const isoMatch = str.match(/^\d{4}-\d{2}-(\d{2})/);
  if (isoMatch) return parseInt(isoMatch[1], 10);
  // Fallback to basic number extraction
  const numMatch = str.match(/\d+/);
  if (numMatch) return parseInt(numMatch[0], 10);
  return 1;
};

export const getPeriodIndexForDate = (dayOrDate: number | string, currentPeriods: PayPeriod[], month: string, year: number): number => {
  try {
    if (!currentPeriods || !Array.isArray(currentPeriods) || currentPeriods.length === 0) return 1;
    
    const fallbackDay = extractDay(dayOrDate);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const safeMonth = String(month || '');
    const monthIndex = Math.max(0, monthNames.indexOf(safeMonth)) + 1; 
    
    const paddedMonth = monthIndex.toString().padStart(2, '0');
    const paddedDay = fallbackDay.toString().padStart(2, '0');
    const targetIso = `${year}-${paddedMonth}-${paddedDay}`;

    for (let i = 0; i < currentPeriods.length; i++) {
      const period = currentPeriods[i];
      if (period && period.startDate && period.endDate) {
        
        const safeStart = String(period.startDate);
        let expandedEndIso = String(period.endDate);
        
        const dateMatch = expandedEndIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch) {
          const pYear = parseInt(dateMatch[1], 10);
          const pMonth = parseInt(dateMatch[2], 10);
          const pDay = parseInt(dateMatch[3], 10);
          
          // +4 Day buffer so the paycheck catches bills immediately following it
          const endObj = new Date(pYear, pMonth - 1, pDay + 4);
          const extYear = endObj.getFullYear();
          const extMonth = (endObj.getMonth() + 1).toString().padStart(2, '0');
          const extDay = endObj.getDate().toString().padStart(2, '0');
          expandedEndIso = `${extYear}-${extMonth}-${extDay}`;
        }

        if (targetIso >= safeStart && targetIso <= expandedEndIso) {
          return i + 1;
        }
      }
    }
    
    return fallbackDay >= 20 ? currentPeriods.length : 1;
  } catch (e) {
    console.error("BudgetEngine Sorter Error:", e);
    return 1; 
  }
};

export const determineItemPeriod = (item: any, currentPeriods: PayPeriod[], month: string, year: number): number => {
  try {
    if (!currentPeriods || !Array.isArray(currentPeriods) || currentPeriods.length === 0) return 1;
    if (!item) return 1; 
    
    let dayNum = 1;
    let forceNextMonth = false;

    // 1. SPECIAL CASE: Credit Cards (Statement Date + Grace Period)
    if (item.type === 'Credit' || item.classification === 'Credit Card') {
      const stmtRaw = item.billingDate || item.billing_date || item.statementDate || item.statement_date;
      const dueRaw = item.dueDate || item.due_date;
      
      if (stmtRaw && dueRaw) {
        const stmtDay = extractDay(stmtRaw);
        const graceDays = extractDay(dueRaw);
        
        const calcDate = new Date(2024, 0, stmtDay); 
        calcDate.setDate(calcDate.getDate() + graceDays); 
        dayNum = calcDate.getDate();
        if (calcDate.getMonth() !== 0) forceNextMonth = true;
      } else {
        dayNum = extractDay(dueRaw || 1);
      }
    } 
    // 2. STANDARD CASE: Billers, Installments, etc.
    else {
      const rawDue = item.dueDate || item.dueDay || item.billingDate || item.statementDate || item.due_date || 1;
      if (String(rawDue).toLowerCase().includes('next')) forceNextMonth = true;
      dayNum = extractDay(rawDue);
    }

    if (forceNextMonth) return currentPeriods.length;
    dayNum = Math.max(1, Math.min(31, dayNum));

    return getPeriodIndexForDate(dayNum, currentPeriods, month, year);
  } catch (e) {
    console.error("BudgetEngine Evaluator Error:", e);
    return 1; 
  }
};

// ==========================================
// 2. THE MASTER AGGREGATOR
// ==========================================

export interface UnifiedBudgetPeriod {
  periodIndex: number;
  regularItems: any[];
  creditCards: any[];
  standaloneLoans: any[];
  budeeToPay: any[];
  budeeToCollect: any[]; // Isolated so it doesn't inflate your expenses!
  totalSpend: number;    // The true sum of your liabilities
}

export const buildUnifiedBudget = ({
  accounts,
  transactions,
  installments,
  setupData, // The raw object of flexi/fixed categories
  currentPeriods,
  selectedMonth,
  selectedYear,
  aggregateCreditCardPurchases, // Passed in from Accounts utility
  exclusions // { installments: Set, credits: Set, items: Set }
}: any): Record<number, UnifiedBudgetPeriod> => {
  
  const monthIndex = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(selectedMonth);
  
  // Initialize the empty dictionary based on current periods
  const masterPlan: Record<number, UnifiedBudgetPeriod> = {};
  const totalPeriods = currentPeriods.length || 2;
  for (let i = 1; i <= totalPeriods; i++) {
    masterPlan[i] = { periodIndex: i, regularItems: [], creditCards: [], standaloneLoans: [], budeeToPay: [], budeeToCollect: [], totalSpend: 0 };
  }

  // Helper to ensure we don't crash on empty periods
  const safePush = (periodNum: number, arrayName: keyof UnifiedBudgetPeriod, item: any, amount: number) => {
    const p = masterPlan[periodNum] || masterPlan[1];
    (p[arrayName] as any[]).push({ ...item, calculatedAmount: amount });
    if (arrayName !== 'budeeToCollect') { // 🟢 ANTI-DOUBLE-COUNT GUARD
      p.totalSpend += amount;
    }
  };

  try {
    // ---------------------------------------------------------
    // STEP A: Credit Cards & Swallowed Installments
    // ---------------------------------------------------------
    const creditAccounts = (accounts || []).filter((a: any) => a.type === 'Credit' || a.classification === 'Credit Card');
    
    creditAccounts.forEach((acc: any) => {
      if (exclusions?.credits?.has(acc.id)) return;
      const targetPeriod = determineItemPeriod(acc, currentPeriods, selectedMonth, selectedYear);
      
      let finalBillAmount = 0;

      // 1. Get the Fresh Swipes
      const cycleSummaries = typeof aggregateCreditCardPurchases === 'function' 
        ? aggregateCreditCardPurchases(acc, transactions || [], installments || []) : [];
      
      const targetCycle = cycleSummaries.find((c: any) => c?.cycleEnd?.getMonth() === monthIndex && c?.cycleEnd?.getFullYear() === selectedYear);
      
      if (targetCycle && Array.isArray(targetCycle.transactions)) {
        finalBillAmount += targetCycle.transactions
          .filter((tx: any) => !String(tx.name || '').toLowerCase().includes('statement balance') && !String(tx.name || '').toLowerCase().includes('previous balance'))
          .reduce((sum: number, tx: any) => sum + (Math.abs(Number(tx.amount)) || 0), 0);
      } else {
        // Raw Fallback
        finalBillAmount += (transactions || [])
          .filter((tx: any) => tx?.payment_method_id === acc.id && new Date(tx.date).getMonth() === monthIndex && new Date(tx.date).getFullYear() === selectedYear && tx.transaction_type !== 'credit_payment' && tx.amount > 0)
          .reduce((sum: number, tx: any) => sum + tx.amount, 0);
      }

      // 2. Add Swallowed Installments (including Budee items charged to this card)
      const swallowedInstallments = (installments || []).filter((inst: any) => {
        if (inst.isArchived || exclusions?.installments?.has(inst.id)) return false;
        const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
        return linkedId === acc.id; // It belongs to this card!
      });

      const swallowedTotal = swallowedInstallments.reduce((sum: number, inst: any) => sum + (Number(inst.monthlyAmount) || 0), 0);
      finalBillAmount += swallowedTotal;

      if (finalBillAmount > 0) {
        safePush(targetPeriod, 'creditCards', acc, finalBillAmount);
      }
    });

    // ---------------------------------------------------------
    // STEP B & C: Standalone Loans and Budee items
    // ---------------------------------------------------------
    (installments || []).forEach((inst: any) => {
      if (inst.isArchived || exclusions?.installments?.has(inst.id)) return;
      
      // If a credit card already swallowed this, skip it!
      const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
      const isSwallowed = creditAccounts.some((a: any) => a.id === linkedId);
      if (isSwallowed) return; 

      const targetPeriod = determineItemPeriod(inst, currentPeriods, selectedMonth, selectedYear);
      const isBudee = !!(inst.funding_friend_id || inst.debtor_friend_id || inst.friend_user_id);
      const amount = Number(inst.monthlyAmount) || 0;

      if (isBudee) {
        if (inst.debtor_friend_id) {
          safePush(targetPeriod, 'budeeToCollect', inst, amount);
        } else {
          safePush(targetPeriod, 'budeeToPay', inst, amount);
        }
      } else {
        safePush(targetPeriod, 'standaloneLoans', inst, amount);
      }
    });

    // ---------------------------------------------------------
    // STEP D: Regular Setup Items (Flexi/Fixed)
    // ---------------------------------------------------------
    if (setupData && typeof setupData === 'object') {
      Object.entries(setupData).forEach(([categoryName, items]: [string, any]) => {
        if (categoryName.startsWith('_') || categoryName === 'Credit' || categoryName === 'Loans' || categoryName === 'Budee' || !Array.isArray(items)) return;
        
        items.forEach((item: any) => {
          if (!item.included || exclusions?.items?.has(item.id)) return;
          const targetPeriod = determineItemPeriod(item, currentPeriods, selectedMonth, selectedYear);
          
          // Prioritize the period-specific amount if it exists
          const val = item.amountsByPeriod?.[targetPeriod] !== undefined ? item.amountsByPeriod[targetPeriod] : item.amount;
          const amount = parseFloat(val) || 0;
          
          if (amount > 0) {
            safePush(targetPeriod, 'regularItems', { ...item, categoryName }, amount);
          }
        });
      });
    }

  } catch (error) {
    console.error("Critical Error building Unified Budget:", error);
  }

  return masterPlan;
};
