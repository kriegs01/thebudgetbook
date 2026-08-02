export interface StandardTransaction {
  name: string;
  date: string;
  amount: number;
  transaction_type: string;
  notes: string;
}

export const squeezeMariBank = (rawText: string): StandardTransaction[] => {
  const transactions: StandardTransaction[] = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const dateRegex = /^(\d{2}\s+[A-Z]{3})/i;
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;

  let currentDate = '';
  let shouldParse = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('SAVINGS-TRANSACTION DETAILS') || line.includes('SAVINGS - TRANSACTION DETAILS') || line.includes('TRANSACTION')) {
      if (i > 5) {
        shouldParse = true;
      }
    }

    if (line.includes('SAVINGS - INTEREST & TAX DETAILS') || line.includes('Interest & Tax Details')) {
      shouldParse = false;
    }

    if (!shouldParse) continue;

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    const amounts = line.match(amountRegex);
    if (amounts && currentDate) {
      let description = 'MariBank Transaction';
      for (let j = 1; j <= 2; j++) {
        const prevLine = lines[i - j];
        if (prevLine && !prevLine.match(dateRegex) && !prevLine.match(amountRegex) && prevLine.length > 2) {
          description = prevLine;
          break;
        }
      }

      const rawAmount = Number(amounts[0].replace(/,/g, ''));
      const combinedText = (description + ' ' + line).toLowerCase();

      // 🟢 UNIVERSAL CHECK: Relies purely on keywords, banking terms, and transaction directions
      const isIncoming = 
        combinedText.includes('interest') || 
        combinedText.includes('reward') || 
        combinedText.includes('cashback') ||
        combinedText.includes('incoming') ||
        combinedText.includes('deposit') ||
        combinedText.includes('received') ||
        (combinedText.includes('transfer') && combinedText.includes('from'));

      const amount = isIncoming ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      transactions.push({
        name: description,
        date: new Date(`${currentDate} 2026`).toISOString(),
        amount: amount,
        transaction_type: isIncoming ? 'cash_in' : 'payment',
        notes: isIncoming ? 'Incoming (MariBank)' : 'Outgoing (MariBank)',
      });

      currentDate = '';
    }
  }

  return transactions;
};
