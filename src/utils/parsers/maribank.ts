// 🟢 1. We added 'raw_text' to the interface so the app can remember the original names
export interface StandardTransaction {
  name: string;
  date: string;
  amount: number;
  transaction_type: string;
  notes: string;
  raw_text: string; 
}

export interface StandardTransaction {
  name: string;
  date: string;
  amount: number;
  transaction_type: string;
  notes: string;
  raw_text: string; 
}

export const squeezeMariBank = (rawText: string): StandardTransaction[] => {
  const transactions: StandardTransaction[] = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const dateRegex = /^(\d{2}\s+[A-Z]{3})/i;
  // 🟢 NEW: Regex now looks for our injected X-coordinate tag
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*\[X:(\d+)\])?/;

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

    const amountMatch = line.match(amountRegex);
    if (amountMatch && currentDate) {
      const textLines: string[] = [];
      
      for (let j = 1; j <= 3; j++) {
        const prevLine = lines[i - j];
        if (!prevLine) break;
        
        if (prevLine.match(dateRegex) || prevLine.match(amountRegex)) {
          break;
        }
        
        if (prevLine.length > 1) {
          textLines.unshift(prevLine); 
        }
      }

      const originalName = textLines.length > 0 ? textLines[0] : 'MariBank Transaction';
      let displayName = originalName;

      const rawAmount = Number(amountMatch[1].replace(/,/g, ''));
      const combinedText = (textLines.join(' ') + ' ' + line).toLowerCase();

      if (combinedText.includes('transfer')) {
        displayName = 'Funds Transfer';
      }

      // 🟢 NEW: Determine column based on X-coordinate
      let isIncoming = false;
      if (amountMatch[2]) {
        const xCoord = parseInt(amountMatch[2], 10);
        // Standard A4 width is ~595pt. Outgoing is roughly < 400, Incoming is > 400.
        isIncoming = xCoord > 400; 
      } else {
        // Fallback heuristic if coordinate is missing
        isIncoming = combinedText.includes('interest') || combinedText.includes('reward') || combinedText.includes('incoming');
      }

      const amount = isIncoming ? Math.abs(rawAmount) : -Math.abs(rawAmount);

      transactions.push({
        name: displayName,
        date: new Date(`${currentDate} 2026`).toISOString(),
        amount: amount,
        transaction_type: isIncoming ? 'cash_in' : 'payment',
        notes: isIncoming ? 'Incoming (MariBank)' : 'Outgoing (MariBank)',
        raw_text: originalName,
      });

      currentDate = '';
    }
  }

  return transactions;
};
