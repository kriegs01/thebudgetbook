/**
 * Credit Card Biller Sync Utility
 * 
 * Provides functionality to sync credit card transaction totals
 * to biller payment schedules for linked credit card accounts.
 */

import type { Biller, Account } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';
import { aggregateCreditCardPurchases, calculateBillingCycles } from './paymentStatus';

/**
 * Sync credit card transaction totals to biller payment schedules
 * 
 * This function:
 * 1. Gets credit card transaction totals grouped by billing cycle
 * 2. Maps each billing cycle to a month/year
 * 3. Updates the biller's payment schedules with the calculated amounts
 * 
 * @param biller - The biller to update
 * @param account - The linked credit card account
 * @param transactions - All transactions
 * @param installments - All installments (to exclude from totals)
 * @returns Updated biller with synced payment schedules
 */
export const syncCreditCardToBillerSchedule = (
  biller: Biller,
  account: Account,
  transactions: SupabaseTransaction[],
  installments: any[] = []
): Biller => {
  // Validate account is a credit card with billing date
  if (account.classification !== 'Credit Card' || !account.billingDate) {
    console.warn('[syncCreditCardToBillerSchedule] Account is not a valid credit card with billing date');
    return biller;
  }

  // Get aggregated credit card purchases by cycle
  const cycleSummaries = aggregateCreditCardPurchases(account, transactions, installments);

  // Month names for mapping
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Create a map of cycle summaries by month/year
  const cycleMap = new Map<string, number>();
  
  cycleSummaries.forEach(cycle => {
    // Determine which month this cycle belongs to based on cycle end date
    // (credit card bill is typically due in the month after the cycle ends)
    const cycleEndDate = cycle.cycleEnd;
    const dueMonth = cycleEndDate.getMonth() + 1; // Next month
    const dueYear = dueMonth > 11 ? cycleEndDate.getFullYear() + 1 : cycleEndDate.getFullYear();
    const adjustedMonth = dueMonth > 11 ? 0 : dueMonth;
    
    const key = `${monthNames[adjustedMonth]}-${dueYear}`;
    cycleMap.set(key, cycle.totalAmount);
  });

  // Update biller schedules with synced amounts
  const updatedSchedules = biller.schedules.map(schedule => {
    const key = `${schedule.month}-${schedule.year}`;
    const syncedAmount = cycleMap.get(key);
    
    if (syncedAmount !== undefined && syncedAmount > 0) {
      // Update expected amount with synced total
      return {
        ...schedule,
        expectedAmount: syncedAmount
      };
    }
    
    return schedule;
  });

  // Return updated biller
  return {
    ...biller,
    schedules: updatedSchedules
  };
};

/**
 * Generate payment schedules for a biller based on credit card billing cycles
 * 
 * This creates new payment schedules for upcoming months based on the
 * credit card's billing cycles. Useful when first linking a biller to an account.
 * 
 * @param biller - The biller to generate schedules for
 * @param account - The linked credit card account
 * @param transactions - All transactions
 * @param installments - All installments (to exclude from totals)
 * @param numberOfMonths - Number of months to generate (default: 12)
 * @returns Updated biller with generated payment schedules
 */
export const generateBillerSchedulesFromCreditCard = (
  biller: Biller,
  account: Account,
  transactions: SupabaseTransaction[],
  installments: any[] = [],
  numberOfMonths: number = 12
): Biller => {
  // Validate account
  if (account.classification !== 'Credit Card' || !account.billingDate) {
    console.warn('[generateBillerSchedulesFromCreditCard] Account is not a valid credit card with billing date');
    return biller;
  }

  // Get aggregated credit card purchases
  const cycleSummaries = aggregateCreditCardPurchases(account, transactions, installments);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Generate schedules for the next numberOfMonths
  const newSchedules = [];
  const today = new Date();
  
  for (let i = 0; i < numberOfMonths; i++) {
    const scheduleDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const month = monthNames[scheduleDate.getMonth()];
    const year = scheduleDate.getFullYear();
    
    // Check if schedule already exists
    const existingSchedule = biller.schedules.find(
      s => s.month === month && s.year === year
    );
    
    if (!existingSchedule) {
      // Find matching cycle total
      const matchingCycle = cycleSummaries.find(cycle => {
        const cycleEndDate = cycle.cycleEnd;
        const dueMonth = (cycleEndDate.getMonth() + 1) % 12;
        const dueYear = cycleEndDate.getMonth() === 11 
          ? cycleEndDate.getFullYear() + 1 
          : cycleEndDate.getFullYear();
        
        return monthNames[dueMonth] === month && dueYear === year;
      });
      
      const expectedAmount = matchingCycle ? matchingCycle.totalAmount : biller.expectedAmount;
      
      newSchedules.push({
        month,
        year,
        expectedAmount
      });
    }
  }

  // Combine existing and new schedules
  const allSchedules = [...biller.schedules, ...newSchedules];

  return {
    ...biller,
    schedules: allSchedules
  };
};
