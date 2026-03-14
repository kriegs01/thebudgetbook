/**
 * Credit Account State Utility
 *
 * Provides a pure, side-effect-free function to derive the current outstanding
 * balance and available credit for a credit account directly from its transaction
 * history, so that every payment immediately restores available credit without
 * any manual balance mutation.
 *
 * Sign convention (shared across the whole app):
 *   amount > 0  →  money leaving the account (charge / purchase / withdrawal)
 *   amount < 0  →  money entering the account (payment / cash-in / credit)
 *
 * For credit accounts this means:
 *   currentOutstanding = openingBalance + Σ(tx.amount)
 *   availableCredit    = max(0, creditLimit − currentOutstanding)
 *
 * A payment transaction (amount < 0) on the credit account reduces the sum,
 * which in turn lowers currentOutstanding and raises availableCredit — no
 * additional DB fields are required.
 */

import type { Account } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';

export interface DerivedCreditState {
  /** Amount currently owed on the credit account (≥ 0 under normal usage). */
  currentOutstanding: number;
  /**
   * Remaining credit that can still be spent.
   * null when the account is not a credit account or has no creditLimit.
   */
  availableCredit: number | null;
}

/**
 * Derive current outstanding balance and available credit for an account.
 *
 * For non-credit accounts (or credit accounts without a creditLimit) the
 * function returns the pre-calculated balance stored on the account and
 * availableCredit: null so that callers can use a single code path.
 *
 * @param account      - The account to derive state for.
 * @param transactions - All transactions (will be filtered to this account).
 */
export const deriveCreditStateFromTransactions = (
  account: Account,
  transactions: SupabaseTransaction[],
): DerivedCreditState => {
  if (account.type !== 'Credit' || account.creditLimit == null) {
    return { currentOutstanding: account.balance, availableCredit: null };
  }

  // Filter to transactions that belong to this credit account.
  const transactionsForAccount = transactions.filter(
    tx => tx.payment_method_id === account.id,
  );

  // Sum all amounts:
  //   positive  → charges/purchases (increase outstanding)
  //   negative  → payments/credits  (decrease outstanding)
  const net = transactionsForAccount.reduce(
    (sum, tx) => sum + (tx.amount || 0),
    0,
  );

  // Use openingBalance as the immutable seed (DEFAULT 0 in the DB).
  const base = account.openingBalance ?? 0;
  const currentOutstanding = base + net;

  // availableCredit is always non-negative; cannot exceed creditLimit.
  const availableCredit = Math.max(0, account.creditLimit - currentOutstanding);

  return { currentOutstanding, availableCredit };
};
