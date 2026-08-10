const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface AggregatedStatement {
  totalBankBill: number;      // The absolute total you must pay the bank (Swipes + ALL Installments)
  personalSpend: number;      // Your personal liability (Swipes + Your Installments)
  budeeReceivable: number;    // The portion of the bill that a Budee owes you
  swipeTotal: number;         // Just the raw transactions (for revolving cards)
  isLoanBundle: boolean;
}

export const processCreditAccount = (
  account: any,
  transactions: any[],
  installments: any[],
  selectedMonth: string,
  selectedYear: number
): AggregatedStatement => {
  try {
    const isLoanBundle = account.subtype === 'Loan_Bundle' || account.classification === 'Loan';
    const monthIndex = MONTHS.indexOf(selectedMonth);

    let personalSpend = 0;
    let budeeReceivable = 0;
    let swipeTotal = 0;

    // ==========================================
    // 1. THE UNIVERSAL INSTALLMENT & BUDEE SCAN
    // ==========================================
    const linkedInstallments = (installments || []).filter(inst => {
      if (inst.isArchived) return false;
      
      // Is it linked to this specific credit account?
      const linkedId = inst.accountId || inst.account_id || inst.linkedAccountId || inst.linked_account_id;
      if (linkedId !== account.id) return false;

      // Is it actively billing this month?
      if (!inst.startDate) return true;
      const [startYear, startMonth] = inst.startDate.split('-').map(Number);
      const startMonthAbs = startYear * 12 + (startMonth - 1);
      const selectedMonthAbs = selectedYear * 12 + monthIndex;

      // Hasn't started yet
      if (startMonthAbs > selectedMonthAbs) return false;

      // Already finished its terms
      const termMonths = parseInt(inst.termDuration || '0', 10);
      if (termMonths > 0) {
         const lastPaymentMonthAbs = startMonthAbs + (termMonths - 1);
         if (selectedMonthAbs > lastPaymentMonthAbs) return false;
      }

      return true;
    });

    // Sort into Personal vs. Budee (To Collect)
    linkedInstallments.forEach(inst => {
       const amount = Number(inst.monthlyAmount) || 0;
       if (inst.debtor_friend_id) {
         budeeReceivable += amount;
       } else {
         personalSpend += amount;
       }
    });

    // ==========================================
    // 2. THE REVOLVING CYCLE MATH (Bypass Individual Due Dates)
    // ==========================================
    if (!isLoanBundle && account.billingDate) {
       // Safely extract the billing day, whether the DB gave us "4" or "2000-01-04"
       let billingDay = 1;
       const rawDate = String(account.billingDate || account.billing_date);
       const isoMatch = rawDate.match(/^\d{4}-\d{2}-(\d{2})/);
       if (isoMatch) {
         billingDay = parseInt(isoMatch[1], 10);
       } else {
         const match = rawDate.match(/\d+/);
         if (match) billingDay = parseInt(match[0], 10);
       }

       // Generate the exact cycle boundaries
       // e.g. Billing Day 4, Month August (7) -> Jul 4 to Aug 3
       const cycleStart = new Date(selectedYear, monthIndex - 1, billingDay, 0, 0, 0);
       const cycleEnd = new Date(selectedYear, monthIndex, billingDay - 1, 23, 59, 59);

       // Filter raw transactions to strictly match this cycle window
       swipeTotal = (transactions || [])
         .filter(tx => tx?.payment_method_id === account.id && tx.transaction_type !== 'credit_payment')
         .filter(tx => {
           if (!tx.date) return false;
           const txDate = new Date(tx.date);
           return txDate >= cycleStart && txDate <= cycleEnd;
         })
         .reduce((sum, tx) => sum + (Math.max(0, Number(tx.amount)) || 0), 0);

       personalSpend += swipeTotal;
    }

    // ==========================================
    // 3. THE FINAL BANK BILL
    // ==========================================
    // The bank charges you for everything, regardless of who is supposed to pay you back.
    const totalBankBill = personalSpend + budeeReceivable;

    return {
      totalBankBill,
      personalSpend,
      budeeReceivable,
      swipeTotal,
      isLoanBundle
    };

  } catch (error) {
    console.error("Statement Aggregator Error:", error);
    return { totalBankBill: 0, personalSpend: 0, budeeReceivable: 0, swipeTotal: 0, isLoanBundle: false };
  }
};
