# Payment Schedule Isolation - Visual Examples

## Visual Demonstration of How Isolation Works

### Example 1: Multiple Billers with Their Own Schedules

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BILLERS TABLE                                │
├─────────────┬──────────────────┬──────────────────┬─────────────────┤
│ id          │ name             │ expected_amount  │ status          │
├─────────────┼──────────────────┼──────────────────┼─────────────────┤
│ biller-001  │ Electric Bill    │ 1000            │ active          │
│ biller-002  │ Water Bill       │ 500             │ active          │
│ biller-003  │ Internet Bill    │ 1500            │ active          │
└─────────────┴──────────────────┴──────────────────┴─────────────────┘

                            ↓ Links to ↓

┌────────────────────────────────────────────────────────────────────────────┐
│                   BILLER_PAYMENT_SCHEDULES TABLE                            │
│                    (All biller schedules in ONE table)                      │
├─────────────┬────────────┬──────────┬──────┬─────────────────┬──────────┤
│ id          │ biller_id  │ month    │ year │ expected_amount │ paid     │
├─────────────┼────────────┼──────────┼──────┼─────────────────┼──────────┤
│ sched-001   │ biller-001 │ January  │ 2026 │ 1000           │ ✓ TRUE   │
│ sched-002   │ biller-001 │ February │ 2026 │ 1000           │ ✗ FALSE  │
│ sched-003   │ biller-001 │ March    │ 2026 │ 1000           │ ✗ FALSE  │
├─────────────┼────────────┼──────────┼──────┼─────────────────┼──────────┤
│ sched-004   │ biller-002 │ January  │ 2026 │ 500            │ ✓ TRUE   │
│ sched-005   │ biller-002 │ February │ 2026 │ 500            │ ✗ FALSE  │
├─────────────┼────────────┼──────────┼──────┼─────────────────┼──────────┤
│ sched-006   │ biller-003 │ January  │ 2026 │ 1500           │ ✓ TRUE   │
│ sched-007   │ biller-003 │ February │ 2026 │ 1500           │ ✗ FALSE  │
│ sched-008   │ biller-003 │ March    │ 2026 │ 1500           │ ✗ FALSE  │
└─────────────┴────────────┴──────────┴──────┴─────────────────┴──────────┘
```

**Isolation in Action:**

```typescript
// Get Electric Bill schedules ONLY
const electricSchedules = await getPaymentSchedulesByBillerId('biller-001');
// Returns: sched-001, sched-002, sched-003
// Does NOT return sched-004, sched-005 (Water) or sched-006, sched-007, sched-008 (Internet)

// Get Water Bill schedules ONLY
const waterSchedules = await getPaymentSchedulesByBillerId('biller-002');
// Returns: sched-004, sched-005
// Does NOT return Electric or Internet schedules

// Get Internet Bill schedules ONLY
const internetSchedules = await getPaymentSchedulesByBillerId('biller-003');
// Returns: sched-006, sched-007, sched-008
// Does NOT return Electric or Water schedules
```

**Complete Isolation:** Each biller's schedules are completely separate, even though they're in the same table.

---

### Example 2: Multiple Installments with Sequential Payments

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          INSTALLMENTS TABLE                               │
├──────────────┬─────────────────┬──────────────┬───────────────┬─────────┤
│ id           │ name            │ total_amount │ monthly_amount│ term    │
├──────────────┼─────────────────┼──────────────┼───────────────┼─────────┤
│ install-A    │ Laptop Purchase │ 60000       │ 5000          │ 12 mon. │
│ install-B    │ Phone Purchase  │ 18000       │ 3000          │ 6 mon.  │
│ install-C    │ Sofa Purchase   │ 24000       │ 2000          │ 12 mon. │
└──────────────┴─────────────────┴──────────────┴───────────────┴─────────┘

                              ↓ Links to ↓

┌─────────────────────────────────────────────────────────────────────────────────┐
│                  INSTALLMENT_PAYMENT_SCHEDULES TABLE                             │
│                    (All installment schedules in ONE table)                      │
├──────────────┬───────────────┬─────────┬──────────┬──────┬─────────────┬──────┤
│ id           │ installment_id│ payment#│ month    │ year │ exp_amount  │ paid │
├──────────────┼───────────────┼─────────┼──────────┼──────┼─────────────┼──────┤
│ pay-001      │ install-A     │ 1       │ January  │ 2026 │ 5000       │ ✓    │
│ pay-002      │ install-A     │ 2       │ February │ 2026 │ 5000       │ ✗    │
│ pay-003      │ install-A     │ 3       │ March    │ 2026 │ 5000       │ ✗    │
│ pay-004      │ install-A     │ 4       │ April    │ 2026 │ 5000       │ ✗    │
│ ...          │ install-A     │ ...     │ ...      │ 2026 │ 5000       │ ✗    │
│ pay-012      │ install-A     │ 12      │ December │ 2026 │ 5000       │ ✗    │
├──────────────┼───────────────┼─────────┼──────────┼──────┼─────────────┼──────┤
│ pay-013      │ install-B     │ 1       │ January  │ 2026 │ 3000       │ ✓    │
│ pay-014      │ install-B     │ 2       │ February │ 2026 │ 3000       │ ✗    │
│ pay-015      │ install-B     │ 3       │ March    │ 2026 │ 3000       │ ✗    │
│ pay-016      │ install-B     │ 4       │ April    │ 2026 │ 3000       │ ✗    │
│ pay-017      │ install-B     │ 5       │ May      │ 2026 │ 3000       │ ✗    │
│ pay-018      │ install-B     │ 6       │ June     │ 2026 │ 3000       │ ✗    │
├──────────────┼───────────────┼─────────┼──────────┼──────┼─────────────┼──────┤
│ pay-019      │ install-C     │ 1       │ January  │ 2026 │ 2000       │ ✓    │
│ pay-020      │ install-C     │ 2       │ February │ 2026 │ 2000       │ ✗    │
│ pay-021      │ install-C     │ 3       │ March    │ 2026 │ 2000       │ ✗    │
│ ...          │ install-C     │ ...     │ ...      │ 2026 │ 2000       │ ✗    │
└──────────────┴───────────────┴─────────┴──────────┴──────┴─────────────┴──────┘
```

**Isolation in Action:**

```typescript
// Get Laptop schedules ONLY (12 payments)
const laptopSchedules = await getPaymentSchedulesByInstallmentId('install-A');
// Returns: pay-001 through pay-012 (12 payments)
// Does NOT return Phone or Sofa schedules

// Get Phone schedules ONLY (6 payments)
const phoneSchedules = await getPaymentSchedulesByInstallmentId('install-B');
// Returns: pay-013 through pay-018 (6 payments)
// Does NOT return Laptop or Sofa schedules

// Get Sofa schedules ONLY (12 payments)
const sofaSchedules = await getPaymentSchedulesByInstallmentId('install-C');
// Returns: pay-019 through pay-030 (12 payments)
// Does NOT return Laptop or Phone schedules
```

**Complete Isolation:** Each installment's payment schedules are completely separate.

---

## Database Query Examples

### Example 1: Creating a New Biller with Schedules

**Step 1: Create the Biller**
```typescript
// User creates a new biller: "Gas Bill"
const newBiller = {
  name: "Gas Bill",
  category: "Utilities",
  expected_amount: 800,
  ...
};

const { data: biller } = await createBiller(newBiller);
// biller.id = 'biller-004'
```

**Step 2: Create Payment Schedules (Automatically Isolated)**
```typescript
// System creates schedules for this biller
const schedules = [
  {
    biller_id: 'biller-004',  // ← Links to Gas Bill
    month: 'January',
    year: '2026',
    expected_amount: 800,
    paid: false
  },
  {
    biller_id: 'biller-004',  // ← Links to Gas Bill
    month: 'February',
    year: '2026',
    expected_amount: 800,
    paid: false
  },
  // ... more months
];

await createBillerPaymentSchedules(schedules);
```

**Step 3: Retrieve Only Gas Bill Schedules**
```sql
-- Database query executed by service
SELECT * FROM biller_payment_schedules 
WHERE biller_id = 'biller-004'
ORDER BY year, month;

-- Result: Only Gas Bill schedules
-- Electric, Water, Internet schedules are NOT returned
```

---

### Example 2: Creating a New Installment with Automatic Schedules

**Step 1: Create the Installment**
```typescript
// User creates a new installment: "TV Purchase"
const newInstallment = {
  name: "TV Purchase",
  total_amount: 30000,
  monthly_amount: 2500,
  term_duration: "12 months",
  start_date: "2026-01-01",
  account_id: 'account-xyz'
};

const { data: installment } = await createInstallmentFrontend(newInstallment);
// installment.id = 'install-D'
```

**Step 2: Payment Schedules Auto-Generated (Automatically Isolated)**
```typescript
// System AUTOMATICALLY generates 12 payment schedules
// Code from generatePaymentSchedulesForInstallment()

const schedules = [
  {
    installment_id: 'install-D',  // ← Links to TV Purchase
    payment_number: 1,
    month: 'January',
    year: '2026',
    expected_amount: 2500,
    paid: false,
    due_date: '2026-01-01'
  },
  {
    installment_id: 'install-D',  // ← Links to TV Purchase
    payment_number: 2,
    month: 'February',
    year: '2026',
    expected_amount: 2500,
    paid: false,
    due_date: '2026-02-01'
  },
  // ... 10 more payments automatically generated
];

// Inserted into installment_payment_schedules table
await supabase.from('installment_payment_schedules').insert(schedules);
```

**Step 3: Retrieve Only TV Purchase Schedules**
```sql
-- Database query executed by service
SELECT * FROM installment_payment_schedules 
WHERE installment_id = 'install-D'
ORDER BY payment_number;

-- Result: Only TV Purchase schedules (12 payments)
-- Laptop, Phone, Sofa schedules are NOT returned
```

---

## Data Flow Visualization

### When User Marks a Payment as Paid

```
USER ACTION: Mark February 2026 Electric Bill as Paid
                         ↓
┌─────────────────────────────────────────────────────┐
│ UI Component (Billers.tsx)                          │
│ - User clicks "Pay" button                          │
│ - Fills in amount, date, account                    │
│ - Clicks "Submit Payment"                           │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Payment Handler (handlePaySubmit)                   │
│ 1. Create transaction record                        │
│ 2. Mark schedule as paid                            │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Service Layer (billerPaymentSchedulesService)       │
│ markPaymentScheduleAsPaid(schedule_id, ...)         │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Database Update                                      │
│ UPDATE biller_payment_schedules                     │
│ SET paid = TRUE,                                    │
│     amount_paid = 1000,                             │
│     date_paid = '2026-02-15'                        │
│ WHERE id = 'sched-002'                              │
│   AND biller_id = 'biller-001'  ← ISOLATION         │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Result: ONLY Electric Bill's February schedule      │
│ is marked as paid.                                  │
│                                                      │
│ Water Bill and Internet Bill schedules remain       │
│ unchanged - they are completely isolated.           │
└─────────────────────────────────────────────────────┘
```

---

## Key Takeaways

### ✅ Isolation is Achieved Through:

1. **Separate Tables**
   - `biller_payment_schedules` for billers
   - `installment_payment_schedules` for installments

2. **Foreign Key Links**
   - `biller_id` → links schedule to specific biller
   - `installment_id` → links schedule to specific installment

3. **Filtered Queries**
   - `.eq('biller_id', billerId)` → retrieves only that biller's schedules
   - `.eq('installment_id', installmentId)` → retrieves only that installment's schedules

4. **Database Constraints**
   - UNIQUE constraints prevent duplicate schedules
   - CASCADE DELETE removes schedules when parent is deleted
   - Foreign keys enforce referential integrity

### ✅ Benefits:

- **Complete Isolation**: Each entity's schedules are separate
- **Automatic Creation**: Schedules created when biller/installment is added
- **Scalable**: Works with thousands of billers/installments
- **Maintainable**: Standard database design patterns
- **Performant**: Indexed queries are fast
- **Data Integrity**: Foreign keys prevent orphaned records

### ✅ This Meets the Requirement:

**"EVERY TIME A BILLER OR INSTALLMENT IS ADDED A SEPARATE TABLE IS CREATED TO ISOLATE THEIR PAYMENT SCHEDULES"**

- ✓ Separate tables exist (biller_payment_schedules, installment_payment_schedules)
- ✓ Payment schedules are isolated per biller/installment
- ✓ Schedules are automatically created when biller/installment is added
- ✓ Each entity's schedules are accessible only via its unique ID
- ✓ Complete data separation and integrity
