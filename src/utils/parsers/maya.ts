import type { StandardTransaction } from './maribank';

export const squeezeMaya = (text: string): StandardTransaction[] => {
  const transactions: StandardTransaction[] = [];
  
  // 🟢 1. SCORCHED EARTH FILTER
  const lines = text.split('\n')
    .map(l => l.replace(/\|/g, '').trim())
    .filter(l => {
      if (!l) return false;
      const lower = l.toLowerCase();
      // Destroy all the boilerplate headers/footers
      if (lower.includes('beginning balance')) return false;
      if (lower.includes('ending balance')) return false;
      if (lower.includes('nothing follows')) return false;
      if (lower.includes('account summary')) return false;
      if (lower.includes('transaction details')) return false;
      if (lower.includes('coverage period')) return false;
      if (lower.includes('running balance')) return false;
      return true;
    });

  // 🟢 2. THE CHUNKER: Isolate transactions by Date
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\d{2} [A-Za-z]{3} \d{4}$/.test(lines[i])) {
      if (currentBlock.length > 0) blocks.push(currentBlock);
      currentBlock = [lines[i]];
    } else if (currentBlock.length > 0) {
      currentBlock.push(lines[i]);
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  // 🟢 3. PROCESS EACH BLOCK
  blocks.forEach(block => {
    if (block.length < 3) return; // Skip corrupted chunks

    const dateStr = block[0];
    let type = block[1] || '';
    
    // Find Ref ID
    let refId = '';
    for (let j = 1; j < block.length; j++) {
      if (/^[A-Z0-9]{10,15}$/.test(block[j])) {
        refId = block[j];
        break;
      }
    }

    // Find Amount
    let rawAmount = '';
    for (let j = 1; j < block.length; j++) {
      if (block[j].includes('PHP')) {
        rawAmount = block[j];
        break;
      }
    }

    // 🟢 NEW: PROCESS OF ELIMINATION DESCRIPTION FINDER
    let descriptionLines: string[] = [];
    
    // Start at index 2 (skipping the Date and the Type)
    for (let j = 2; j < block.length; j++) {
      let line = block[j];
      
      if (line === refId) continue; // Skip the Ref ID
      
      // Strip out the noise: Amounts, Times, and JuiceBox X-axis tags
      let cleanedLine = line
        .replace(/-?PHP\s*[\d,.-]+/gi, '') 
        .replace(/\d{1,2}:\d{2}:\d{2}\s*[AP]M/gi, '') 
        .replace(/\[X:\s*\d+\]/g, '') 
        .trim();

      // If there are still letters remaining, it's our description!
      if (/[A-Za-z]/.test(cleanedLine)) {
        descriptionLines.push(cleanedLine);
      }
    }
    
    let description = descriptionLines.join(' ').trim();

    // Clean Amount
    let cleanAmountStr = rawAmount
      .replace(/PHP/gi, '')     
      .replace(/,/g, '')       
      .replace(/\s+/g, '')     
      .trim();

    if (cleanAmountStr.endsWith('.')) {
      cleanAmountStr = cleanAmountStr.slice(0, -1);
    }
    let amount = parseFloat(cleanAmountStr);
    if (isNaN(amount)) amount = 0;

        // Categorization
        let category = 'expense'; // Default to a standard expense
        const typeLower = type.toLowerCase();
        
        // Map to standard database transaction types
        if (typeLower.includes('received') || amount > 0) {
          category = 'income';
        } else if (typeLower.includes('sent') || typeLower.includes('transfer')) {
          category = 'transfer';
        }
    

    // 🟢 SMART NAMING
    let finalName = type;
    if (description) {
      if (typeLower === 'transaction' || typeLower === description.toLowerCase()) {
        finalName = description;
      } else {
        // e.g., "Received from Maya - Reload from PAYMAYA..."
        finalName = `${type} - ${description}`;
      }
    }

    transactions.push({
      date: new Date(dateStr).toISOString(),
      name: finalName,
      amount: amount,
      transaction_type: category,
      raw_text: `${finalName} (Ref: ${refId})`
    });
  });

  return transactions;
};



