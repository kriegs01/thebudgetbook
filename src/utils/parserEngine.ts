// src/utils/parserEngine.ts

// 🟢 1. Import your actual, existing MariBank parser
import { squeezeMariBank } from './parsers/maribank'; // Adjust this path to where your maribank.ts actually lives!
import { squeezeMaya } from './parsers/maya'; // 🟢 Import the new parser
import { squeezeGoTyme } from './parsers/goTyme';

// A standardized transaction structure that ALL parsers must output
export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
}

// Stub for BPI
const parseBPI = (text: string): ParsedTransaction[] => {
  console.log("Running BPI Parser on text...");
  return []; 
};

// Stub for SPayLater
const parseSPayLater = (text: string): ParsedTransaction[] => {
  console.log("Running SPayLater Parser on text...");
  return [];
};

// 🟢 The Main Switchboard (Only ONE of these!)
export const extractTransactions = (bankId: string, extractedText: string) => {
  switch (bankId) {
    case 'maribank': 
      return squeezeMariBank(extractedText);
    case 'maya': // 🟢 Make sure this matches your Supabase bank ID for Maya
      return squeezeMaya(extractedText);
    case 'gotyme':
      return squeezeGoTyme(extractedText);
    default: 
      console.warn(`No parser configured for bank ID: ${bankId}`);
      return [];
  }
};
