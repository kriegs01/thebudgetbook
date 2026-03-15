/**
 * Account Utilities
 *
 * Pure helpers for account-level derived values.
 * These helpers do NOT affect billing-cycle totals or payment-schedule logic.
 */

import type { Account } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';

export interface CreditUtilization {
  currentOutstanding: number;
  availableCredit: number | null;
}

/**
 * Compute credit utilization for a credit account.
 *
 * For non-credit accounts or accounts without a credit limit, returns
 * { currentOutstanding: account.balance, availableCredit: null }.
 *
 * For credit accounts with a limit, the outstanding balance is derived
 * from the account's opening balance plus all charge transactions, minus
 * any credit_payment transactions.  This deliberately ignores billing-cycle
 * boundaries so that the full ledger is reflected in the summary card.
 */
export const computeCreditUtilization = (
  account: Account,
  transactions: SupabaseTransaction[],
): CreditUtilization => {
  if (account.type !== 'Credit' || account.creditLimit == null) {
    return { currentOutstanding: account.balance, availableCredit: null };
  }

  const accountTxs = transactions.filter(
    tx => tx.payment_method_id === account.id,
  );

  // Charges: any transaction that is NOT a credit_payment
  const chargeTxs = accountTxs.filter(
    tx => tx.transaction_type !== 'credit_payment',
  );

  // Payments: credit_payment transactions (stored with negative amounts)
  const paymentTxs = accountTxs.filter(
    tx => tx.transaction_type === 'credit_payment',
  );

  const chargeTotal = chargeTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const paymentTotal = paymentTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const base = account.openingBalance ?? 0;
  const currentOutstanding = base + chargeTotal + paymentTotal;
  const availableCredit = Math.max(0, account.creditLimit - currentOutstanding);

  return { currentOutstanding, availableCredit };
};
