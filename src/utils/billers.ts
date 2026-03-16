/**
 * Billers Utility
 *
 * Helpers for biller amount resolution, including scheduled future amount increases.
 */

import type { Biller, BillerAmountIncrease } from '../../types';

/**
 * Category prefixes that support scheduled amount increases.
 * Loans billers are explicitly excluded.
 */
const SUPPORTS_SCHEDULED_INCREASES_PREFIXES = ['Fixed', 'Utilities', 'Subscriptions'];

/**
 * Returns the effective expected amount for a biller on a given date.
 *
 * @param biller - The biller to resolve the amount for.
 * @param date - The target date in 'YYYY-MM-DD' format.
 *
 * For Fixed, Utilities, and Subscriptions billers:
 *   - Applies the last scheduled increase whose effectiveDate <= date.
 *   - Falls back to biller.expectedAmount when no increase applies.
 *
 * For all other categories (including Loans):
 *   - Always returns biller.expectedAmount, ignoring any scheduledIncreases.
 */
export const getBillerAmountForDate = (biller: Biller, date: string): number => {
  const { category } = biller;
  const supportsIncrease = SUPPORTS_SCHEDULED_INCREASES_PREFIXES.some(prefix =>
    category.startsWith(prefix)
  );

  if (!supportsIncrease) {
    return biller.expectedAmount;
  }

  const increases: BillerAmountIncrease[] = (biller.scheduledIncreases ?? [])
    .slice()
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  let amount = biller.expectedAmount;

  for (const inc of increases) {
    if (inc.effectiveDate <= date) {
      amount = inc.amount;
    } else {
      break;
    }
  }

  return amount;
};
