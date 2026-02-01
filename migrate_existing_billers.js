/**
 * Migration Script: Generate Payment Schedules for Existing Billers
 * 
 * This script generates payment schedules for billers that were created
 * before the payment schedules system was implemented.
 * 
 * Run this in browser console when logged into the app.
 */

(async function migrateExistingBillers() {
  console.log('=== Payment Schedules Migration Script ===');
  console.log('This will generate schedules for existing billers');
  console.log('');
  
  try {
    // Dynamic import - adjust paths if needed
    const { getAllBillersFrontend } = await import('./src/services/billersService');
    const { generateBillerSchedules, getPaymentSchedulesByBiller } = await import('./src/services/paymentSchedulesService');
    
    console.log('[Migration] Loading all billers...');
    const { data: billers, error: billersError } = await getAllBillersFrontend();
    
    if (billersError) {
      console.error('[Migration] Failed to load billers:', billersError);
      return;
    }
    
    if (!billers || billers.length === 0) {
      console.log('[Migration] No billers found');
      return;
    }
    
    console.log(`[Migration] Found ${billers.length} billers`);
    console.log('');
    
    const monthNames = ["January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"];
    
    let processed = 0;
    let skipped = 0;
    let created = 0;
    let failed = 0;
    
    for (const biller of billers) {
      console.log(`[Migration] Processing: ${biller.name} (${biller.id})`);
      
      // Check if schedules already exist
      const { data: existingSchedules } = await getPaymentSchedulesByBiller(biller.id);
      
      if (existingSchedules && existingSchedules.length > 0) {
        console.log(`  ✓ Already has ${existingSchedules.length} schedules - skipping`);
        skipped++;
        processed++;
        continue;
      }
      
      // Determine start month from activation date
      let startMonth = '2026-01'; // Default to January 2026
      
      if (biller.activationDate && biller.activationDate.month && biller.activationDate.year) {
        const monthIndex = monthNames.indexOf(biller.activationDate.month);
        const monthNum = monthIndex >= 0 ? monthIndex + 1 : 1;
        startMonth = `${biller.activationDate.year}-${String(monthNum).padStart(2, '0')}`;
        console.log(`  Using activation date: ${startMonth}`);
      } else {
        console.log(`  Using default start month: ${startMonth}`);
      }
      
      // Generate schedules
      console.log(`  Generating 24 months of schedules...`);
      const result = await generateBillerSchedules(
        biller.id,
        biller.expectedAmount,
        startMonth,
        24
      );
      
      if (result.error) {
        console.error(`  ✗ Failed:`, result.error);
        failed++;
      } else {
        console.log(`  ✓ Created ${result.data?.length || 0} schedules`);
        created += result.data?.length || 0;
      }
      
      processed++;
      console.log('');
    }
    
    console.log('=== Migration Complete ===');
    console.log(`Processed: ${processed} billers`);
    console.log(`Skipped: ${skipped} (already had schedules)`);
    console.log(`Created: ${created} schedules`);
    console.log(`Failed: ${failed} billers`);
    
  } catch (error) {
    console.error('[Migration] Script error:', error);
    console.log('');
    console.log('Make sure you are running this in the browser console while the app is loaded.');
  }
})();
