const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface BucketItem {
  id: string;
  name: string;
  amount: number;
  date?: string;
  conversion_group_id?: string | null;
  conversionGroupId?: string | null;
  conversion_status?: string | null;
  conversionStatus?: string | null;
  isBudee?: boolean;
  budeeId?: string;
  isReceivable?: boolean;
}

export interface CreditBucket {
  cycleStart: Date;
  cycleEnd: Date;
  cycleLabel: string;
  
  targetMonth: string;
  targetYear: number;
  calculatedDueDate: string;
  
  startingBalance: number;
  paymentsTotal: number;
  newChargesTotal: number;
  endingBalance: number;
  personalEndingBalance: number;
  budeeEndingBalance: number;

  personalBreakdown: {
    unpaidRollover: number;
    newSwipesTotal: number;
    activeInstallments: BucketItem[]; 
    swipes: BucketItem[];
  };

  budeeBreakdown: BucketItem[];
  payments: BucketItem[];
}

const getPaymentMethodId = (tx: any) => tx.payment_method_id || tx.paymentMethodId;
const getTransactionType = (tx: any) => tx.transaction_type || tx.transactionType;
const getConversionGroupId = (item: any) => item.conversion_group_id || item.conversionGroupId;
const isApprovedConversion = (item: any) => Boolean(
  getConversionGroupId(item) &&
  (item.conversion_status || item.conversionStatus) === 'approved'
);

// 🟢 NEW: Bulletproof Date Parser for iPad/Safari (WebKit)
// Replaces the space with a 'T' to satisfy strict ISO 8601 requirements
const parseSafeDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const safeStr = String(dateStr).trim().replace(' ', 'T');
  const d = new Date(safeStr);
  return isNaN(d.getTime()) ? null : d;
};

export const generateCreditBuckets = (
  account: any,
  transactions: any[],
  installments: any[],
  upToYear: number,
  upToMonthName: string
): CreditBucket[] => {
  try {
    if (!account) return [];
    
    let billingDay = 1;
    const rawDate = String(account.billingDate || account.billing_date || '1');
    const isoMatch = rawDate.match(/^\d{4}-\d{2}-(\d{2})/);
    if (isoMatch) {
      billingDay = parseInt(isoMatch[1], 10);
    } else {
      const match = rawDate.match(/\d+/);
      if (match) billingDay = parseInt(match[0], 10);
    }

    let graceDays = 21; 
    const rawDueDate = String(account.dueDate || account.due_date || '');
    // Safely extract the exact days to pay, completely ignoring the "2000-01-" prefix trap!
    const isoDueMatch = rawDueDate.match(/^\d{4}-\d{2}-(\d{2})/);
    
    if (isoDueMatch) {
      graceDays = parseInt(isoDueMatch[1], 10);
    } else {
      const match = rawDueDate.match(/\d+/);
      if (match) {
         const parsed = parseInt(match[0], 10);
         graceDays = parsed > 1000 ? 21 : parsed; // Final failsafe
      }
    }


        // -- THE GHOST HARVESTER (Strict Mode) --
        const bankName = String(account.bank || '').toLowerCase().trim();
        const accountInst = (installments || []).filter(inst => {
          const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
          return linkedId === account.id;
        });
    
        const harvestedPayments = (transactions || []).filter(tx => {
          // 1. Ignore if it's already natively attached to the credit card
          if (getPaymentMethodId(tx) === account.id) return false; 
          
          // 2. Ignore if the credit card side of this payment already exists
          const isDebitHalfOfModernPair = transactions.some(otherTx => 
            otherTx.related_transaction_id === tx.id || 
            otherTx.relatedTransactionId === tx.id
          );
          if (isDebitHalfOfModernPair) return false;
    
          const txName = String(tx.name || '').toLowerCase();
          const txType = String(getTransactionType(tx)).toLowerCase();
          
          // 🟢 THE FIX: Never harvest incoming collections or income!
          if (txType === 'cash_in' || txType === 'income') return false;
          
          // Strict Check 1: Paid the bank explicitly
          if (bankName && txName.includes(bankName) && (txName.includes('payment') || txType === 'credit_payment')) {
              return true;
          }
    
          
          // Strict Check 2: Paid an installment
          return accountInst.some(inst => {
            const instName = String(inst.name || '').toLowerCase().trim();
            if (!instName || instName.length < 3) return false; 
            
            if (!txName.includes(instName)) return false;
    
            const isExplicitPayment = txType === 'credit_payment' || txName.includes('payment') || Number(tx.amount) < 0;
            
            const hasMonthYearSuffix = MONTHS.some(m => {
               const mLower = m.toLowerCase();
               return txName.includes(`- ${mLower}`) || txName.includes(`- ${mLower.substring(0, 3)}`);
            });
    
            return isExplicitPayment || hasMonthYearSuffix;
          });
        }).map(tx => ({
          ...tx,
          amount: -Math.abs(Number(tx.amount)), 
          transaction_type: 'credit_payment',
          payment_method_id: account.id,
          paymentMethodId: account.id 
        }));
    

    

    const directTxs = (transactions || []).filter(tx => getPaymentMethodId(tx) === account.id);
    const accountTxs = [...directTxs, ...harvestedPayments];

    // Safely calculate the beginning of time
    let startDate = new Date(upToYear, MONTHS.indexOf(upToMonthName), 1); 
    if (accountTxs.length > 0) {
      const earliestTx = accountTxs.reduce((earliest, current) => {
        const earliestDate = parseSafeDate(earliest.date) || new Date();
        const currentDate = parseSafeDate(current.date) || new Date();
        return currentDate < earliestDate ? current : earliest;
      });
      startDate = parseSafeDate(earliestTx.date) || new Date(upToYear, MONTHS.indexOf(upToMonthName), 1);
    } else if (account.openingBalanceDate) {
      startDate = parseSafeDate(account.openingBalanceDate) || new Date(upToYear, MONTHS.indexOf(upToMonthName), 1);
    }

    const buckets: CreditBucket[] = [];
    let currentYear = startDate.getFullYear();
    let currentMonthIdx = startDate.getMonth();
    let currentStartingBalance = Math.abs(Number(account.openingBalance) || 0);
    let currentPersonalStartingBalance = currentStartingBalance;

    const targetMonthIdx = MONTHS.indexOf(upToMonthName);
    const targetAbsMonth = upToYear * 12 + targetMonthIdx;

    //NEW: Memory tracker to prevent overlapping buckets from double counting payments
    const claimedPaymentIds = new Set<string>();
    
    while ((currentYear * 12 + currentMonthIdx) <= targetAbsMonth + 2) { 
      
      const cycleStart = new Date(currentYear, currentMonthIdx - 1, billingDay, 0, 0, 0);
      const cycleEnd = new Date(currentYear, currentMonthIdx, billingDay - 1, 23, 59, 59);
      const cycleLabel = `${cycleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${cycleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      
      const dueDateObj = new Date(cycleEnd);
      dueDateObj.setDate(dueDateObj.getDate() + graceDays);
      const calculatedDueDate = dueDateObj.toISOString().split('T')[0];
      const targetMonth = MONTHS[dueDateObj.getMonth()];
      const targetYear = dueDateObj.getFullYear();

                  // -- SORT TRANSACTIONS --
      const txsInCycle = accountTxs.filter(tx => {
        if (!tx.date) return false;
        const txDate = parseSafeDate(tx.date);
        return txDate && txDate >= cycleStart && txDate <= cycleEnd;
      });

      // 🟢 Helper to definitively identify true bill payments (Ignores merchant "payments")
      const isTrueBillPayment = (tx: any) => {
        const type = String(getTransactionType(tx)).toLowerCase();
        const name = String(tx.name).toLowerCase();
        // We strictly ignore type === 'payment' here because your DB uses that for standard shopping!
        return type === 'credit_payment' || Number(tx.amount) < 0 || name.includes('payment');
      };

      // 🟢 Swipes are strictly normal purchases
      const swipes = txsInCycle.filter(tx => !isTrueBillPayment(tx) && Number(tx.amount) > 0);

            // 🟢 Smart Envelope Matching for TRUE Payments Only
            const payments = accountTxs.filter(tx => {
              if (!isTrueBillPayment(tx)) return false;
              
              // 1. If an older statement already claimed this payment, ignore it!
              if (claimedPaymentIds.has(tx.id)) return false;
      
              const name = String(tx.name).toLowerCase();
              const targetMonthLower = targetMonth.toLowerCase();
              
              const explicitMonthMatch = MONTHS.find(m => {
                const mLower = m.toLowerCase();
                const shortM = mLower.substring(0, 3);
                const regex = new RegExp(`\\b(${mLower}|${shortM})\\b`, 'i');
                return regex.test(name);
              });
      
              // 2. Explicit name match (e.g., "August Payment")
              if (explicitMonthMatch) {
                  return explicitMonthMatch.toLowerCase() === targetMonthLower;
              } 
              
              const txDate = parseSafeDate(tx.date);
              if (!txDate) return false;
      
              // 3. 🟢 THE FIX: Extend the payment window up to the Due Date (+ 3 days buffer).
              // This ensures payments made *after* the cycle closes still attach to the bill they are paying!
              const paymentWindowEnd = new Date(dueDateObj);
              paymentWindowEnd.setDate(paymentWindowEnd.getDate() + 3);
      
              return txDate >= cycleStart && txDate <= paymentWindowEnd;
            });
            
            // 🟢 Lock these payments to this bucket so the next running bucket ignores them
            payments.forEach(tx => claimedPaymentIds.add(tx.id));
      
            const paymentsTotal = payments.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0);
      

      
      
      const activeInst = (installments || []).filter(inst => {
        if (inst.status === 'pending') return false;
        const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
        if (linkedId !== account.id) return false;

        // An installment cannot exist in a statement that closed before it started.
        const rawStartDate = inst.startDateExact || inst.start_date || inst.startDate || (inst as any).activationDate || (inst as any).activation_date;
        if (!rawStartDate) return true; 

        const installmentStartDate = parseSafeDate(String(rawStartDate));
        if (!installmentStartDate) return false;
        installmentStartDate.setHours(12, 0, 0, 0);

        const cycleEndBoundary = new Date(cycleEnd);
        cycleEndBoundary.setHours(23, 59, 59, 999);
        if (installmentStartDate > cycleEndBoundary) return false;

        const startYr = installmentStartDate.getFullYear();
        const startMo = installmentStartDate.getMonth() + 1;

        const startAbs = startYr * 12 + (startMo - 1);
        const cycleAbs = cycleEnd.getFullYear() * 12 + cycleEnd.getMonth();
        
        // Has the installment started yet?
        if (startAbs > cycleAbs) return false;
        
        // Has the installment ended? (The engine naturally drops it after the term is over!)
        const termDurationStr = String(inst.termDuration || inst.term_duration || '0');
        const term = parseInt(termDurationStr.replace(/\D/g, ''), 10);
        if (term > 0) {
          const endAbs = startAbs + (term - 1);
          if (cycleAbs > endAbs) return false;
        }
        return true;
      });


      const budeeBreakdown: BucketItem[] = [];
      const personalActiveInstallments: BucketItem[] = [];
      const personalSwipes: BucketItem[] = [];

      let personalNewChargesTotal = 0;
      let budeeNewChargesTotal = 0;

      activeInst.forEach(inst => {
        const amt = Number(inst.monthlyAmount) || 0;
        const budeeId = inst.debtor_friend_id || inst.funding_friend_id || (inst as any).friend_user_id;
        
        if (budeeId) {
          budeeNewChargesTotal += amt;
          budeeBreakdown.push({ 
            id: inst.id, 
            name: inst.name, 
            amount: amt, 
            isBudee: true, 
            budeeId,
            isReceivable: !!inst.debtor_friend_id 
          });
        } else {
          personalNewChargesTotal += amt;
          personalActiveInstallments.push({
            ...inst,
            id: inst.id,
            name: inst.name,
            amount: amt,
          });
        }
      });

      swipes.forEach(tx => {
        const nameStr = String(tx.name || '').toLowerCase();
        if (nameStr.includes('statement balance') || nameStr.includes('previous balance')) return;

        const amt = Math.max(0, Number(tx.amount)) || 0;
        const budeeId = tx.debtor_friend_id || tx.funding_friend_id || (tx as any).friend_user_id;
        
        const isConverted = isApprovedConversion(tx);

        if (budeeId) {
          if (!isConverted) budeeNewChargesTotal += amt;
          budeeBreakdown.push({ 
            ...tx,
            id: tx.id, 
            name: tx.name || 'Swipe', 
            amount: amt, 
            date: tx.date, 
            isBudee: true, 
            budeeId 
          });
        } else {
          if (!isConverted) personalNewChargesTotal += amt;
          personalSwipes.push({
            ...tx,
            id: tx.id,
            name: tx.name || 'Swipe',
            amount: amt,
            date: tx.date,
          });
        }
      });

            // -- WATERFALL MATH --
            const totalNewCharges = personalNewChargesTotal + budeeNewChargesTotal;
      
            // 🟢 THE FUTURE BUDGET WALL
            // Completely insulates future budgets from current-month debt.
            // If this bucket belongs to a month that hasn't arrived in the real world yet,
            // we zero out the rollover so your future projections stay perfectly clean.
            const today = new Date();
            const currentRealMonth = today.getMonth();
            const currentRealYear = today.getFullYear();
            
            const targetMonthIdx = MONTHS.indexOf(targetMonth);
            const isFutureBucket = (targetYear > currentRealYear) || 
                                   (targetYear === currentRealYear && targetMonthIdx > currentRealMonth);
      
            if (isFutureBucket) {
               currentStartingBalance = 0;
              currentPersonalStartingBalance = 0;
            }
            
            // 🟢 THE FIX 3: Pure Ledger Math (Previous + New - Payments)
            const personalEndingBalance = Math.max(0, currentPersonalStartingBalance + personalNewChargesTotal - paymentsTotal);
            const budeeEndingBalance = Math.max(0, budeeNewChargesTotal);
            const endingBalance = currentStartingBalance + totalNewCharges - paymentsTotal;
            
            // Display purposes for the UI
            const unpaidRollover = currentPersonalStartingBalance;
      


      buckets.push({
        cycleStart,
        cycleEnd,
        cycleLabel,
        targetMonth,
        targetYear,
        calculatedDueDate,
        startingBalance: currentStartingBalance,
        paymentsTotal,
        newChargesTotal: totalNewCharges,
        endingBalance,
        personalEndingBalance,
        budeeEndingBalance,
        personalBreakdown: {
          unpaidRollover,
          newSwipesTotal: personalSwipes.reduce(
            (sum, tx) => sum + (isApprovedConversion(tx) ? 0 : tx.amount),
            0
          ),
          activeInstallments: personalActiveInstallments,
          swipes: personalSwipes
        },
        budeeBreakdown,
        payments: payments.map(p => ({ id: p.id, name: p.name, amount: Math.abs(Number(p.amount)), date: p.date }))
      });

      currentStartingBalance = endingBalance;
      currentPersonalStartingBalance = personalEndingBalance;

      currentMonthIdx++;
      if (currentMonthIdx > 11) {
        currentMonthIdx = 0;
        currentYear++;
      }
      
      if (targetMonth === upToMonthName && targetYear === upToYear) {
          break;
      }
    }

    return buckets;

  } catch (error) {
    console.error("Critical Error in Bucket Engine:", error);
    return [];
  }
};

export const getBucketForMonth = (
  buckets: CreditBucket[], 
  targetMonth: string, 
  targetYear: number
): CreditBucket | null => {
  return buckets.find(b => b.targetMonth === targetMonth && b.targetYear === targetYear) || null;
};
