export interface StandardTransaction {
    name: string;
    date: string;
    amount: number;
    transaction_type: string;
    notes: string;
  }
  
  export const squeezeMariBank = (rawText: string): StandardTransaction[] => {
    const transactions: StandardTransaction[] = [];
    const lines = rawText.split('\n');
  
    // Matches MariBank date headers like "01 JUL" or "12 JUL"
    const dateRegex = /^(\d{2}\s+[A-Z]{3})/i;
    // Matches monetary amounts (e.g., 6,088.54)
    const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
  
    let currentDate = '';
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
  
      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        currentDate = dateMatch[1];
      }
  
      const amounts = line.match(amountRegex);
      if (amounts && currentDate) {
        const description = lines[i - 1]?.trim() || 'MariBank Transaction';
        const rawAmount = Number(amounts[0].replace(/,/g, ''));
        
        // Determine if outgoing (debit) or incoming (credit) based on keywords
        const isOutgoing = line.toLowerCase().includes('payment') || 
                           (line.toLowerCase().includes('transfer') && !line.toLowerCase().includes('incoming'));
  
        // Format amount to match your app convention (Positive for expenses/outgoing, negative for cash-in/incoming)
        const amount = isOutgoing ? Math.abs(rawAmount) : -Math.abs(rawAmount);
  
        transactions.push({
          name: description,
          date: new Date(`${currentDate} 2026`).toISOString(), // Standardizes date string
          amount: amount,
          transaction_type: 'payment',
          notes: 'Imported via JuiceBox (MariBank)',
        });
      }
    }
  
    return transactions;
  };
  