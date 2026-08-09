import { PayPeriod } from './payPeriodUtils';

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

/**
 * 1. THE MASTER SORTER
 */
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

/**
 * 2. THE ITEM EVALUATOR
 */
export const determineItemPeriod = (item: any, currentPeriods: PayPeriod[], month: string, year: number): number => {
  try {
    if (!currentPeriods || !Array.isArray(currentPeriods) || currentPeriods.length === 0) return 1;
    if (!item) return 1; 
    
    let dayNum = 1;
    let forceNextMonth = false;

    // 1. SPECIAL CASE: Credit Cards calculate actual due date (Statement Date + Grace Period)
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
