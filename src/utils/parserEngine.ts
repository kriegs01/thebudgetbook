// src/utils/parserEngine.ts

// 🟢 1. Import your actual, existing MariBank parser
import { squeezeMariBank } from './parsers/maribank'; // Adjust this path to where your maribank.ts actually lives!

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
export const extractTransactions = (bankId: string, rawText: string): any[] => {
  switch (bankId) {
    case 'maribank':
      return squeezeMariBank(rawText); 
    case 'bpi_cc':
      return parseBPI(rawText);
    case 'spaylater':
      return parseSPayLater(rawText);
    default:
      throw new Error(`No parser configured for bank ID: ${bankId}`);
  }
};
