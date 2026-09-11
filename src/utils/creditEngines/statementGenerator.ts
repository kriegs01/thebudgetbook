// utils/creditEngines/statementGenerator.ts
export interface BillingConfig {
  cutoffDay: number;
  dueDay: number;
}

export const generateStatementBuckets = (config: BillingConfig, lookaheadMonths: number = 3) => {
  const buckets = [];
  const now = new Date();
  let currentMonth = now.getMonth();
  let currentYear = now.getFullYear();

  for (let i = 0; i < lookaheadMonths; i++) {
    const cutoffDate = new Date(currentYear, currentMonth, config.cutoffDay);
    const dueDate = new Date(currentYear, currentMonth, config.dueDay);
    
    // Adjust due date to the next month if the cutoff falls late in the month (e.g., Cutoff 25th, Due 5th)
    if (config.dueDay < config.cutoffDay) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    buckets.push({
      id: `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`,
      label: `${cutoffDate.toLocaleString('default', { month: 'long' })} Statement (Due ${dueDate.toLocaleString('default', { month: 'short', day: 'numeric' })})`,
      cutoffDate: cutoffDate.toISOString(),
      dueDate: dueDate.toISOString(),
    });

    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  return buckets;
};
