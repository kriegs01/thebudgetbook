# Column Name Fix - schedule_month and schedule_year

## Issue
The `payment_schedules` table in the database uses `schedule_month` and `schedule_year` as column names, but the initial implementation used `month` and `year`. This mismatch caused "null value in column 'schedule_month'" errors when trying to insert or update records.

## Root Cause
When the payment_schedules table was created and code was written, the column names in SQL migrations and code did not match the actual database schema. The database expected:
- `schedule_month` (not `month`)
- `schedule_year` (not `year`)

## Solution
Updated all references throughout the codebase to use the correct column names.

## Files Changed

### 1. SQL Migrations
- **`supabase/migrations/20260201_create_payment_schedules_table.sql`**
  - Changed `month TEXT` to `schedule_month TEXT`
  - Changed `year TEXT` to `schedule_year TEXT`
  - Updated unique constraint: `UNIQUE (biller_id, schedule_month, schedule_year)`
  - Updated index: `ON payment_schedules(schedule_month, schedule_year)`
  - Updated column comments

- **`supabase/migrations/20260201_migrate_legacy_schedules.sql`**
  - Updated INSERT to use `schedule_month` and `schedule_year` column names
  - Fixed WHERE clause with table alias to distinguish columns from variables

### 2. TypeScript Types
- **`src/types/supabase.ts`**
  ```typescript
  export interface SupabasePaymentSchedule {
    // Changed from:
    // month: string;
    // year: string;
    
    // To:
    schedule_month: string; // Month name (e.g., January, February)
    schedule_year: string;  // Year as string (e.g., 2024, 2025)
  }
  ```
  - Updated `CreatePaymentScheduleInput` and `UpdatePaymentScheduleInput` types

### 3. Service Layer
- **`src/services/paymentSchedulesService.ts`**
  - Updated all `.eq()` queries: `.eq('schedule_month', month)` and `.eq('schedule_year', year)`
  - Updated all `.order()` queries: `.order('schedule_year')` and `.order('schedule_month')`
  - Updated `generateSchedulesForBiller()` to create objects with `schedule_month` and `schedule_year`

### 4. UI Code
- **`pages/Billers.tsx`**
  - Updated schedule conversion: `month: sched.schedule_month`, `year: sched.schedule_year`
  - Updated schedule matching: `s.schedule_month === schedule.month`
  - Updated transaction matching calls to use `sched.schedule_month` and `sched.schedule_year`

### 5. Documentation
- **`SUPABASE_SETUP.md`**
  - Updated table schema documentation
  - Added prominent warning about column names
  
- **`PAYMENT_SCHEDULES_REFACTORING_SUMMARY.md`**
  - Added warning section at the top with code examples
  - Updated all type definitions and examples

## Verification

### Build Status
✅ Build successful - no TypeScript errors

### Security Scan
✅ CodeQL scan passed - 0 vulnerabilities

### Code Review
✅ All feedback addressed

## Best Practices Going Forward

### When Working with payment_schedules Table

**Always use:**
```typescript
{
  biller_id: string,
  schedule_month: string,  // ✅ Correct
  schedule_year: string,   // ✅ Correct
  expected_amount: number,
  // ... other fields
}
```

**Never use:**
```typescript
{
  biller_id: string,
  month: string,  // ❌ Wrong - will cause errors
  year: string,   // ❌ Wrong - will cause errors
  // ...
}
```

### Checking Your Code

Search your code for these patterns to ensure correctness:

```bash
# Look for incorrect usage (should return no results after fix)
grep -r "\.eq('month'" src/
grep -r "\.eq('year'" src/
grep -r "month:" src/services/paymentSchedulesService.ts
grep -r "year:" src/services/paymentSchedulesService.ts

# Look for correct usage
grep -r "\.eq('schedule_month'" src/
grep -r "\.eq('schedule_year'" src/
grep -r "schedule_month:" src/services/paymentSchedulesService.ts
grep -r "schedule_year:" src/services/paymentSchedulesService.ts
```

## Testing Checklist

After deploying these changes, verify:

- [ ] Creating a new biller generates schedules without errors
- [ ] Viewing biller details loads schedules correctly
- [ ] Marking a schedule as paid updates the database successfully
- [ ] Legacy data migration script runs without errors
- [ ] No "null value in column 'schedule_month'" errors appear in logs

## Migration Notes

If you've already run the old migrations on your database:

1. **Option 1: Fresh Database**
   - Drop and recreate the `payment_schedules` table using the new migration
   - Run the legacy data migration

2. **Option 2: Rename Columns**
   ```sql
   -- Rename existing columns
   ALTER TABLE payment_schedules 
     RENAME COLUMN month TO schedule_month;
   
   ALTER TABLE payment_schedules 
     RENAME COLUMN year TO schedule_year;
   
   -- Update indexes and constraints
   DROP INDEX IF EXISTS idx_payment_schedules_month_year;
   CREATE INDEX idx_payment_schedules_month_year 
     ON payment_schedules(schedule_month, schedule_year);
   
   ALTER TABLE payment_schedules 
     DROP CONSTRAINT IF EXISTS unique_biller_month_year;
   
   ALTER TABLE payment_schedules 
     ADD CONSTRAINT unique_biller_month_year 
     UNIQUE (biller_id, schedule_month, schedule_year);
   ```

3. **Deploy the updated application code**

## Conclusion

This fix ensures all code uses the correct column names (`schedule_month` and `schedule_year`) to match the database schema, preventing "null value" errors and ensuring proper functionality of the payment schedules feature.
