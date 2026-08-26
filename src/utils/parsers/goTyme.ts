import type { StandardTransaction } from './maribank';

export const squeezeGoTyme = (text: string): StandardTransaction[] => {
  const transactions: StandardTransaction[] = [];

  // 🟢 1. SCORCHED EARTH FILTER
  const lines = text.split('\n')
    // Strip pipes and the [X: 123] JuiceBox spatial tags early
    .map(l => l.replace(/\|/g, '').replace(/\[X:\s*\d+\]/g, '').trim())
    .filter(l => {
      if (!l) return false;
      const lower = l.toLowerCase();
      
      // Header and Column Destroyers
      if (lower === 'date' || lower === 'details' || lower === 'credits' || lower === 'debits' || lower === 'running balance') return false;
      if (/^(date|details|credits|debits|running balance)(\s+(date|details|credits|debits|running balance))*$/.test(lower)) return false;

      // Boilerplate Destroyers
      if (lower.includes('statement of account')) return false;
      if (lower.includes('gotyme bank') && !lower.includes('transfer')) return false; 
      if (lower.includes('go tyme bank') && !lower.includes('transfer')) return false;
      if (lower.includes('summary') || lower.includes('opening balance')) return false;
      if (lower.includes('total credit') || lower.includes('total debit')) return false;
      if (lower.includes('closing balance') || lower.includes('running balance')) return false;
      
      // Footer Destroyers
      if (lower.includes('all figures are in php')) return false;
      if (lower.includes('got questions')) return false;
      if (lower.includes('happy to answer')) return false;
      if (lower.includes('helpful human')) return false;
      if (lower.includes('landline and mobile')) return false;
      if (lower.includes('@gotyme.com.ph')) return false;
      if (lower.includes('pdic')) return false;
      if (lower.includes('bangko sentral')) return false;
      if (lower.includes('bsp.gov.ph')) return false;
      if (lower.includes('digital banking group')) return false;
      if (lower.includes('visit our website')) return false;
      if (lower.includes('22nd floor, gbf center')) return false;
      if (lower.includes('brgy. ugong norte')) return false;
      if (lower.includes('quezon city, philippines')) return false;
      if (lower.includes('document id:') || lower.includes('request date:')) return false;
      if (lower.includes('page ') || lower.includes('doc id:')) return false;
      if (lower.match(/^[a-z0-9]{13}$/i)) return false; // Catches random Doc IDs
      
      // Catches standalone parsed dates like "Aug 02, 2026"
      if (/^[a-z]{3}\s\d{2},?\s\d{4}$/i.test(lower)) return false; 

      return true;
    });

  // 🟢 2. THE CHUNKER (Unchanged)
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\d{2}-\d{2}-\d{4}$/.test(lines[i])) {
      if (currentBlock.length > 0) blocks.push(currentBlock);
      currentBlock = [lines[i]];
    } else if (currentBlock.length > 0) {
      currentBlock.push(lines[i]);
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  // 🟢 3. SMART STRING EXTRACTION
  blocks.forEach(block => {
    if (block.length < 2) return; 

    const dateStr = block[0];
    const safeDateStr = dateStr.replace(/-/g, '/'); // Safari Fix

    // Mash everything else into one continuous string
    let fullText = block.slice(1).join(' ').trim();

    // Find ALL monetary amounts in the string (e.g. 0.00, 265.00, 1,000.00)
    const moneyMatches = fullText.match(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g);
    
    // If it doesn't have at least Credit, Debit, and Balance, it's a corrupted chunk
    if (!moneyMatches || moneyMatches.length < 3) return; 

    // We know the LAST three amounts belong to the ledger math
    const balanceStr = moneyMatches[moneyMatches.length - 1];
    const debitStr = moneyMatches[moneyMatches.length - 2];
    const creditStr = moneyMatches[moneyMatches.length - 3];

    const credit = parseFloat(creditStr.replace(/,/g, ''));
    const debit = parseFloat(debitStr.replace(/,/g, ''));

    let amount = 0;
    if (credit > 0) amount = credit;
    else if (debit > 0) amount = -debit;

    // Isolate the description by mathematically chopping off the numbers and any trailing garbage
    // This looks for where the Credit, Debit, and Balance sit next to each other at the end of the text
    const numberBlockRegex = new RegExp(`${creditStr.replace('.', '\\.')}\\s*${debitStr.replace('.', '\\.')}\\s*${balanceStr.replace('.', '\\.')}[\\s\\S]*$`);
    
    let description = fullText.replace(numberBlockRegex, '').trim();

    // One final safety scrub just in case any column headers snuck through the Scorched Earth filter
    description = description.replace(/\b(date|details|credits|debits|running balance)\b/gi, '').trim();

    // Categorization
    let category = 'expense';
    const descLower = description.toLowerCase();

    if (descLower.includes('transfer') || descLower.includes('interbank')) {
      category = 'transfer';
    } else if (amount > 0) {
      category = 'income';
    }

    transactions.push({
      date: new Date(safeDateStr).toISOString(),
      name: description || 'GoTyme Transaction',
      amount: amount,
      transaction_type: category,
      raw_text: `${description} | In: ${credit} | Out: ${debit}`
    });
  });

  return transactions;
};
