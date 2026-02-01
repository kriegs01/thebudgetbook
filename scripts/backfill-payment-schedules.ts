/**
 * Backfill Payment Schedules Script
 * 
 * This script generates payment_schedules entries for all existing Billers and Installments.
 * 
 * IMPORTANT: Run this AFTER running the database migrations:
 * - 20260201_create_payment_schedules_table.sql
 * - 20260201_add_payment_schedule_to_transactions.sql
 * 
 * How to run:
 * 1. Ensure your .env.local file has valid Supabase credentials
 * 2. Run: npx tsx scripts/backfill-payment-schedules.ts
 * 
 * This script is idempotent - safe to run multiple times.
 * 
 * When to remove:
 * After confirming all production data has been backfilled successfully,
 * this script can be removed from the repository (estimated: 1-2 months after deployment)
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase credentials in environment variables');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PaymentSchedule {
  id?: string;
  biller_id?: string | null;
  installment_id?: string | null;
  schedule_month: string;
  schedule_year: string;
  expected_amount: number;
  amount_paid?: number | null;
  date_paid?: string | null;
  receipt?: string | null;
  account_id?: string | null;
  timing?: string | null;
}

/**
 * Backfill payment schedules for all Billers
 */
async function backfillBillerSchedules(): Promise<number> {
  console.log('Starting backfill of payment schedules for Billers...');
  
  // Fetch all billers
  const { data: billers, error: billersError } = await supabase
    .from('billers')
    .select('*');
  
  if (billersError) {
    throw new Error(`Failed to fetch billers: ${billersError.message}`);
  }
  
  if (!billers || billers.length === 0) {
    console.log('No billers found to process.');
    return 0;
  }
  
  let insertCount = 0;
  
  for (const biller of billers) {
    console.log(`Processing Biller: ${biller.name} (ID: ${biller.id})`);
    
    if (!biller.schedules || !Array.isArray(biller.schedules)) {
      console.log(`  No schedules found for ${biller.name}, skipping...`);
      continue;
    }
    
    for (const schedule of biller.schedules) {
      const paymentSchedule: PaymentSchedule = {
        biller_id: biller.id,
        installment_id: null,
        schedule_month: schedule.month,
        schedule_year: schedule.year,
        expected_amount: schedule.expectedAmount || biller.expected_amount,
        amount_paid: schedule.amountPaid || null,
        date_paid: schedule.datePaid || null,
        receipt: schedule.receipt || null,
        account_id: schedule.accountId || null,
        timing: biller.timing || null,
      };
      
      // Check if schedule already exists
      const { data: existing } = await supabase
        .from('payment_schedules')
        .select('id')
        .eq('biller_id', biller.id)
        .eq('schedule_month', schedule.month)
        .eq('schedule_year', schedule.year)
        .single();
      
      if (existing) {
        console.log(`  Schedule for ${schedule.month} ${schedule.year} already exists, skipping...`);
        continue;
      }
      
      // Insert new schedule
      const { error: insertError } = await supabase
        .from('payment_schedules')
        .insert([paymentSchedule]);
      
      if (insertError) {
        console.error(`  Failed to insert schedule: ${insertError.message}`);
        continue;
      }
      
      insertCount++;
      console.log(`  Created schedule for ${schedule.month} ${schedule.year}`);
    }
  }
  
  console.log(`Backfill complete! Created ${insertCount} new payment schedule records for Billers.`);
  return insertCount;
}

/**
 * Backfill payment schedules for all Installments
 */
async function backfillInstallmentSchedules(): Promise<number> {
  console.log('Starting backfill of payment schedules for Installments...');
  
  // Fetch all installments with start dates
  const { data: installments, error: installmentsError } = await supabase
    .from('installments')
    .select('*')
    .not('start_date', 'is', null);
  
  if (installmentsError) {
    throw new Error(`Failed to fetch installments: ${installmentsError.message}`);
  }
  
  if (!installments || installments.length === 0) {
    console.log('No installments with start dates found to process.');
    return 0;
  }
  
  let insertCount = 0;
  
  for (const installment of installments) {
    console.log(`Processing Installment: ${installment.name} (ID: ${installment.id})`);
    
    if (!installment.start_date) {
      console.log(`  No start date for ${installment.name}, skipping...`);
      continue;
    }
    
    const startDate = new Date(installment.start_date + '-01'); // Assuming YYYY-MM format
    
    // Generate schedules for each month of the term
    for (let monthOffset = 0; monthOffset < installment.term_duration; monthOffset++) {
      const scheduleDate = new Date(startDate);
      scheduleDate.setMonth(startDate.getMonth() + monthOffset);
      
      const scheduleMonth = scheduleDate.toLocaleDateString('en-US', { month: 'long' });
      const scheduleYear = scheduleDate.getFullYear().toString();
      
      const paymentSchedule: PaymentSchedule = {
        biller_id: null,
        installment_id: installment.id,
        schedule_month: scheduleMonth,
        schedule_year: scheduleYear,
        expected_amount: installment.monthly_amount,
        amount_paid: null, // Needs manual reconciliation
        date_paid: null,
        receipt: null,
        account_id: null,
        timing: installment.timing || null,
      };
      
      // Check if schedule already exists
      const { data: existing } = await supabase
        .from('payment_schedules')
        .select('id')
        .eq('installment_id', installment.id)
        .eq('schedule_month', scheduleMonth)
        .eq('schedule_year', scheduleYear)
        .single();
      
      if (existing) {
        continue;
      }
      
      // Insert new schedule
      const { error: insertError } = await supabase
        .from('payment_schedules')
        .insert([paymentSchedule]);
      
      if (insertError) {
        console.error(`  Failed to insert schedule: ${insertError.message}`);
        continue;
      }
      
      insertCount++;
    }
    
    console.log(`  Generated ${installment.term_duration} schedules for ${installment.name}`);
  }
  
  console.log(`Backfill complete! Created ${insertCount} new payment schedule records for Installments.`);
  console.log('');
  console.log('NOTE: Installment payment history (amount_paid, date_paid) needs manual reconciliation.');
  console.log('The paid_amount on installments table represents cumulative payments but does not');
  console.log('specify which monthly schedules were paid. Please review and update schedules accordingly.');
  
  return insertCount;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Payment Schedules Backfill Script');
    console.log('='.repeat(60));
    console.log('');
    
    const billerCount = await backfillBillerSchedules();
    console.log('');
    
    const installmentCount = await backfillInstallmentSchedules();
    console.log('');
    
    console.log('='.repeat(60));
    console.log(`Summary: Created ${billerCount + installmentCount} total payment schedules`);
    console.log(`  - Billers: ${billerCount} schedules`);
    console.log(`  - Installments: ${installmentCount} schedules`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  }
}

main();
