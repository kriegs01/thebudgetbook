/**
 * Payment Schedules Generator Utility
 * 
 * Utilities for generating monthly payment schedules for billers and installments.
 */

import type { Biller, Installment } from '../../types';
import type { CreateMonthlyPaymentScheduleInput } from '../types/supabase';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generate payment schedules for a biller
 * Creates one schedule per month based on activation/deactivation dates
 */
export const generateBillerPaymentSchedules = (
  biller: Biller,
  year: number = 2026
): CreateMonthlyPaymentScheduleInput[] => {
  const schedules: CreateMonthlyPaymentScheduleInput[] = [];
  
  const activationMonth = MONTHS.indexOf(biller.activationDate.month);
  const deactivationMonth = biller.deactivationDate 
    ? MONTHS.indexOf(biller.deactivationDate.month)
    : 11; // Default to December if no deactivation

  // Generate schedules for each active month
  for (let i = 0; i < MONTHS.length; i++) {
    // Check if month is within active period
    const isActive = i >= activationMonth && i <= deactivationMonth;
    
    // Only create schedules for active months AND when biller is active
    if (isActive && biller.status === 'active') {
      schedules.push({
        source_type: 'biller',
        source_id: biller.id,
        month: MONTHS[i],
        year: year,
        payment_number: null, // Billers don't use payment numbers
        expected_amount: biller.expectedAmount,
        amount_paid: 0,
        receipt: null,
        date_paid: null,
        account_id: null,
        status: 'pending',
      });
    }
  }

  return schedules;
};

/**
 * Generate payment schedules for an installment
 * Creates schedules based on start date and term duration
 */
export const generateInstallmentPaymentSchedules = (
  installment: Installment
): CreateMonthlyPaymentScheduleInput[] => {
  const schedules: CreateMonthlyPaymentScheduleInput[] = [];

  if (!installment.startDate) {
    console.warn('Installment has no start date, cannot generate schedules');
    return schedules;
  }

  // Parse start date (format: YYYY-MM)
  const [startYear, startMonth] = installment.startDate.split('-').map(Number);
  
  // Parse term duration (e.g., "12 months" -> 12)
  const termMatch = installment.termDuration.match(/(\d+)/);
  if (!termMatch) {
    console.warn('Invalid term duration format:', installment.termDuration);
    return schedules;
  }
  const termMonths = parseInt(termMatch[1], 10);

  // Generate schedule for each month in the term
  for (let i = 0; i < termMonths; i++) {
    const scheduleDate = new Date(startYear, startMonth - 1 + i, 1);
    const month = MONTHS[scheduleDate.getMonth()];
    const year = scheduleDate.getFullYear();

    schedules.push({
      source_type: 'installment',
      source_id: installment.id,
      month: month,
      year: year,
      payment_number: i + 1, // Payment sequence number (1, 2, 3, ...)
      expected_amount: installment.monthlyAmount,
      amount_paid: 0,
      receipt: null,
      date_paid: null,
      account_id: installment.accountId,
      status: 'pending',
    });
  }

  return schedules;
};

/**
 * Update payment schedules when a biller is modified
 * Returns schedules that need to be created/updated
 */
export const updateBillerPaymentSchedules = (
  oldBiller: Biller,
  newBiller: Biller,
  year: number = 2026
): {
  toCreate: CreateMonthlyPaymentScheduleInput[];
  schedulesToDelete: boolean; // Whether to delete all old schedules first
} => {
  // If key properties changed, regenerate all schedules
  const needsRegeneration = 
    oldBiller.expectedAmount !== newBiller.expectedAmount ||
    oldBiller.activationDate.month !== newBiller.activationDate.month ||
    oldBiller.activationDate.year !== newBiller.activationDate.year ||
    JSON.stringify(oldBiller.deactivationDate) !== JSON.stringify(newBiller.deactivationDate);

  if (needsRegeneration) {
    return {
      toCreate: generateBillerPaymentSchedules(newBiller, year),
      schedulesToDelete: true,
    };
  }

  return {
    toCreate: [],
    schedulesToDelete: false,
  };
};

/**
 * Update payment schedules when an installment is modified
 * Returns schedules that need to be created/updated
 */
export const updateInstallmentPaymentSchedules = (
  oldInstallment: Installment,
  newInstallment: Installment
): {
  toCreate: CreateMonthlyPaymentScheduleInput[];
  schedulesToDelete: boolean;
} => {
  // If key properties changed, regenerate all schedules
  const needsRegeneration = 
    oldInstallment.monthlyAmount !== newInstallment.monthlyAmount ||
    oldInstallment.termDuration !== newInstallment.termDuration ||
    oldInstallment.startDate !== newInstallment.startDate;

  if (needsRegeneration) {
    return {
      toCreate: generateInstallmentPaymentSchedules(newInstallment),
      schedulesToDelete: true,
    };
  }

  return {
    toCreate: [],
    schedulesToDelete: false,
  };
};

/**
 * Calculate payment status based on amount paid and expected amount
 * Note: 'overdue' status should be determined by the application logic
 * by comparing the current date with the payment due date
 */
export const calculatePaymentStatus = (
  amountPaid: number,
  expectedAmount: number
): 'pending' | 'paid' | 'partial' => {
  if (amountPaid === 0) {
    return 'pending';
  } else if (amountPaid >= expectedAmount) {
    return 'paid';
  } else {
    return 'partial';
  }
};

/**
 * Check if a payment schedule is overdue
 * A schedule is overdue if:
 * 1. It's not fully paid (amount_paid < expected_amount)
 * 2. The due date has passed
 */
export const isScheduleOverdue = (
  schedule: {
    month: string;
    year: number;
    amount_paid: number;
    expected_amount: number;
  },
  dueDay: number = 15 // Default due day of month
): boolean => {
  // If fully paid, it's not overdue
  if (schedule.amount_paid >= schedule.expected_amount) {
    return false;
  }

  const monthIndex = MONTHS.indexOf(schedule.month);
  if (monthIndex === -1) {
    return false;
  }

  // Create due date for this schedule
  const dueDate = new Date(schedule.year, monthIndex, dueDay);
  const today = new Date();

  // Remove time component for fair comparison
  dueDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return today > dueDate;
};
