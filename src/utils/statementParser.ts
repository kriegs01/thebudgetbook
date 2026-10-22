// utils/statementParser.ts
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../types'; // Adjust import path as needed

// Define the keywords that trigger a Vault transfer
const VAULT_KEYWORDS = ["go save", "goalsave", "stash"];

export const processImportedRow = (
  rawName: string,
  rawAmount: number, // Assume the bank export provides a negative number for debits (e.g., -1000)
  rawDate: string,
  mainAccountId: string,
  vaultAccountId: string
): Transaction[] => {
  const normalizedName = rawName.toLowerCase();
  const isVaultTransfer = VAULT_KEYWORDS.some(keyword => normalizedName.includes(keyword));

  if (isVaultTransfer) {
    const mainTxId = uuidv4();
    const vaultTxId = uuidv4();

    // Leg A: The Debit from Main Checking
    const mainTx: Transaction = {
      id: mainTxId,
      name: rawName,
      date: rawDate,
      amount: rawAmount, // Stays negative
      paymentMethodId: mainAccountId,
      transaction_type: 'internal_transfer',
      related_transaction_id: vaultTxId, // Link to the Vault credit
    };

    // Leg B: The Credit to the Vault
    const vaultTx: Transaction = {
      id: vaultTxId,
      name: `Vault: ${rawName}`,
      date: rawDate,
      amount: Math.abs(rawAmount), // Force positive
      paymentMethodId: vaultAccountId,
      transaction_type: 'internal_transfer',
      related_transaction_id: mainTxId, // Link back to the Main debit
    };

    return [mainTx, vaultTx];
  }

  // Standard external transaction
  return [{
    id: uuidv4(),
    name: rawName,
    date: rawDate,
    amount: rawAmount,
    paymentMethodId: mainAccountId,
    // transaction_type can remain null or map to 'payment'/'withdraw' depending on your existing logic
  }];
};
