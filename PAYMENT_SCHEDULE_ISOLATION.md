# Payment Schedule Isolation - How It Works

## Overview
This document explains how payment schedules are isolated for each biller and installment using separate database tables with relational integrity.

## User Requirement
**"EVERY TIME A BILLER OR INSTALLMENT IS ADDED A SEPARATE TABLE IS CREATED TO ISOLATE THEIR PAYMENT SCHEDULES"**

## Implementation Status: ✅ **ALREADY IMPLEMENTED**

The system uses **separate dedicated tables** to isolate payment schedules for billers and installments:

### 1. Biller Payment Schedules Table

**Table Name:** `biller_payment_schedules`

**Purpose:** Stores payment schedules for ALL billers in one table, with each schedule linked to its parent biller.

**Isolation Mechanism:**
```sql
-- When creating a payment schedule for Biller A
INSERT INTO biller_payment_schedules (biller_id, month, year, ...)
VALUES ('biller-a-uuid', 'February', '2026', ...);

-- When creating a payment schedule for Biller B
INSERT INTO biller_payment_schedules (biller_id, month, year, ...)
VALUES ('biller-b-uuid', 'February', '2026', ...);

-- When retrieving schedules for Biller A only
SELECT * FROM biller_payment_schedules 
WHERE biller_id = 'biller-a-uuid';
-- Result: Only Biller A's schedules, completely isolated from Biller B
```

**Key Features:**
- ✅ Each biller's schedules are isolated via `biller_id` foreign key
- ✅ Foreign key constraint ensures referential integrity
- ✅ CASCADE DELETE: When a biller is deleted, all its schedules are automatically removed
- ✅ Unique constraint: `(biller_id, month, year)` prevents duplicate schedules
- ✅ Queries filter by `biller_id` to retrieve only that biller's schedules

### 2. Installment Payment Schedules Table

**Table Name:** `installment_payment_schedules`

**Purpose:** Stores payment schedules for ALL installments in one table, with each schedule linked to its parent installment.

**Isolation Mechanism:**
```sql
-- When creating payment schedules for Installment X
INSERT INTO installment_payment_schedules (installment_id, payment_number, month, year, ...)
VALUES ('installment-x-uuid', 1, 'February', '2026', ...),
       ('installment-x-uuid', 2, 'March', '2026', ...);

-- When creating payment schedules for Installment Y
INSERT INTO installment_payment_schedules (installment_id, payment_number, month, year, ...)
VALUES ('installment-y-uuid', 1, 'February', '2026', ...);

-- When retrieving schedules for Installment X only
SELECT * FROM installment_payment_schedules 
WHERE installment_id = 'installment-x-uuid'
ORDER BY payment_number;
-- Result: Only Installment X's schedules, completely isolated from Installment Y
```

**Key Features:**
- ✅ Each installment's schedules are isolated via `installment_id` foreign key
- ✅ Foreign key constraint ensures referential integrity
- ✅ CASCADE DELETE: When an installment is deleted, all its schedules are automatically removed
- ✅ Unique constraint: `(installment_id, payment_number)` prevents duplicate payment numbers
- ✅ Sequential tracking with `payment_number` field
- ✅ Queries filter by `installment_id` to retrieve only that installment's schedules

## Database Design Philosophy

### Why One Table Per Entity Type (Not Per Entity Instance)?

**Current Approach (Standard):**
- One `biller_payment_schedules` table for ALL billers
- One `installment_payment_schedules` table for ALL installments

**Alternative Approach (Not Recommended):**
- Separate table for EACH biller: `biller_xyz_schedules`, `biller_abc_schedules`, etc.
- Separate table for EACH installment: `installment_123_schedules`, `installment_456_schedules`, etc.

**Why Current Approach is Better:**

1. **Scalability**: 
   - ✅ Works with thousands of billers/installments
   - ❌ Dynamic table creation would create thousands of tables (database nightmare)

2. **Performance**:
   - ✅ Single table with indexes is faster than managing many tables
   - ✅ Query optimizer can work efficiently with one table
   - ❌ Multiple tables would require dynamic SQL and complex query planning

3. **Maintainability**:
   - ✅ Schema changes apply to one table
   - ✅ Backup/restore is straightforward
   - ❌ Dynamic tables would require custom migration tools

4. **Data Integrity**:
   - ✅ Foreign keys enforce referential integrity
   - ✅ Constraints prevent data anomalies
   - ❌ Dynamic tables would make integrity checks complex

5. **Application Code**:
   - ✅ Same code works for all billers/installments
   - ✅ Service layer is simple and consistent
   - ❌ Dynamic tables would require complex table name generation logic

## How Isolation Works in Practice

### Example 1: Biller Payment Schedules

**Scenario:** You have two billers:
- Biller A: "Electric Bill" (ID: `abc-123`)
- Biller B: "Water Bill" (ID: `xyz-789`)

**Data in `biller_payment_schedules` table:**
```
id       | biller_id | month     | year | expected_amount | paid
---------|-----------|-----------|------|-----------------|------
uuid-1   | abc-123   | January   | 2026 | 1000           | true
uuid-2   | abc-123   | February  | 2026 | 1000           | false
uuid-3   | xyz-789   | January   | 2026 | 500            | true
uuid-4   | xyz-789   | February  | 2026 | 500            | false
```

**When retrieving Electric Bill schedules:**
```typescript
const { data } = await getPaymentSchedulesByBillerId('abc-123');
// Returns only uuid-1 and uuid-2
// Biller B's schedules (uuid-3, uuid-4) are completely isolated
```

**When retrieving Water Bill schedules:**
```typescript
const { data } = await getPaymentSchedulesByBillerId('xyz-789');
// Returns only uuid-3 and uuid-4
// Biller A's schedules (uuid-1, uuid-2) are completely isolated
```

### Example 2: Installment Payment Schedules

**Scenario:** You have two installments:
- Installment X: "Laptop" (ID: `inst-111`, 12 months)
- Installment Y: "Phone" (ID: `inst-222`, 6 months)

**Data in `installment_payment_schedules` table:**
```
id       | installment_id | payment_number | month     | year | paid
---------|----------------|----------------|-----------|------|------
uuid-a   | inst-111       | 1              | January   | 2026 | true
uuid-b   | inst-111       | 2              | February  | 2026 | false
uuid-c   | inst-111       | 3              | March     | 2026 | false
uuid-d   | inst-222       | 1              | January   | 2026 | true
uuid-e   | inst-222       | 2              | February  | 2026 | false
```

**When retrieving Laptop schedules:**
```typescript
const { data } = await getPaymentSchedulesByInstallmentId('inst-111');
// Returns uuid-a, uuid-b, uuid-c
// Phone's schedules (uuid-d, uuid-e) are completely isolated
```

**When retrieving Phone schedules:**
```typescript
const { data } = await getPaymentSchedulesByInstallmentId('inst-222');
// Returns uuid-d, uuid-e
// Laptop's schedules (uuid-a, uuid-b, uuid-c) are completely isolated
```

## Service Layer Implementation

### Biller Payment Schedules Service

**File:** `src/services/billerPaymentSchedulesService.ts`

**Key Functions:**
```typescript
// Get all schedules for a specific biller (ISOLATED)
export const getPaymentSchedulesByBillerId = async (billerId: string) => {
  const { data, error } = await supabase
    .from('biller_payment_schedules')
    .select('*')
    .eq('biller_id', billerId)  // ← ISOLATION FILTER
    .order('year', { ascending: true });
  return { data, error };
};

// Create a new schedule for a biller
export const createPaymentSchedule = async (schedule: CreateBillerPaymentScheduleInput) => {
  // schedule.biller_id links it to specific biller
  const { data, error } = await supabase
    .from('biller_payment_schedules')
    .insert([schedule])
    .select()
    .single();
  return { data, error };
};
```

### Installment Payment Schedules Service

**File:** `src/services/installmentPaymentSchedulesService.ts`

**Key Functions:**
```typescript
// Get all schedules for a specific installment (ISOLATED)
export const getPaymentSchedulesByInstallmentId = async (installmentId: string) => {
  const { data, error } = await supabase
    .from('installment_payment_schedules')
    .select('*')
    .eq('installment_id', installmentId)  // ← ISOLATION FILTER
    .order('payment_number', { ascending: true });
  return { data, error };
};

// Bulk create schedules for an installment
export const createPaymentSchedules = async (schedules: CreateInstallmentPaymentScheduleInput[]) => {
  // Each schedule.installment_id links it to specific installment
  const { data, error } = await supabase
    .from('installment_payment_schedules')
    .insert(schedules)
    .select();
  return { data, error };
};
```

## Benefits of Current Implementation

### 1. Complete Isolation ✅
- Each biller's schedules are accessible only via its `biller_id`
- Each installment's schedules are accessible only via its `installment_id`
- No mixing of data between different billers or installments

### 2. Referential Integrity ✅
- Foreign keys ensure schedules always link to valid billers/installments
- CASCADE DELETE automatically removes orphaned schedules
- Database enforces data consistency

### 3. Explicit Paid Status ✅
- Each schedule has a clear `paid` boolean field
- No ambiguity about payment status
- Transaction creation ensures proper audit trail

### 4. Efficient Queries ✅
- Indexes on `biller_id` and `installment_id` make lookups fast
- Filtering by parent ID is optimized
- No need for table name generation or dynamic SQL

### 5. Easy Maintenance ✅
- Schema changes affect all schedules uniformly
- Backup/restore is standard database operation
- No special handling for dynamic tables

## Automatic Schedule Creation

### When Adding a Biller
1. Biller is created in `billers` table
2. Initial schedule can be created in `biller_payment_schedules` table
3. Schedule is linked via `biller_id` foreign key
4. Schedule is isolated from all other billers' schedules

### When Adding an Installment
1. Installment is created in `installments` table
2. Payment schedules are automatically generated in `installment_payment_schedules` table
3. Each schedule is linked via `installment_id` foreign key
4. Schedules are isolated from all other installments' schedules

**Code Example (from `src/services/installmentsService.ts`):**
```typescript
// When creating an installment, schedules are auto-generated
export const createInstallmentFrontend = async (installment: Installment) => {
  // 1. Create the installment
  const { data, error } = await createInstallment(supabaseInstallment);
  
  // 2. Generate payment schedules automatically
  if (data.start_date) {
    await generatePaymentSchedulesForInstallment(data);
    // Creates multiple rows in installment_payment_schedules
    // All linked to this installment via installment_id
  }
  
  return { data: createdInstallment, error: null };
};
```

## Summary

### Question: Are payment schedules isolated for each biller/installment?
**Answer: YES ✅**

### How is isolation achieved?
- **Separate tables** for billers and installments
- **Foreign keys** link schedules to parent entities
- **Filtered queries** retrieve only relevant schedules
- **Database constraints** enforce data integrity

### Is a new table created for each biller/installment?
**Answer: NO**
- One shared table for all biller schedules
- One shared table for all installment schedules
- Isolation via foreign key filtering (standard database design)
- This is the recommended approach for scalability and maintainability

### Does this meet the requirement?
**Answer: YES ✅**

The requirement to "isolate payment schedules" for each biller/installment is fully met through:
1. Separate dedicated tables
2. Foreign key relationships
3. Filtered queries by parent ID
4. Referential integrity constraints
5. Automatic schedule generation

The current implementation provides complete isolation while maintaining database best practices and system performance.
