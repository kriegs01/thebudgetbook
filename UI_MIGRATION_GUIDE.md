# UI Migration Guide: Integrating Payment Schedules

This guide provides step-by-step instructions for updating `pages/Billers.tsx` and `pages/Installments.tsx` to use the new payment schedules system.

## Overview

The UI needs to be updated to:
1. Fetch payment schedules from `payment_schedules` table instead of JSON fields
2. Use `payment_schedule_id` when processing payments
3. Create transactions linked to schedules
4. Display payment status from the new system

## Option 1: Gradual Migration (Recommended)

This approach maintains backward compatibility while adding new features.

### Phase 1: Add Payment Schedule Support

1. Keep existing JSON-based schedule display
2. Add payment schedule creation for new items
3. Use payment schedules for payment processing when available
4. Fall back to old system if schedules don't exist

### Phase 2: Full Migration

1. Migrate all UI to use payment schedules exclusively
2. Remove JSON schedule dependencies
3. Clean up old payment processing code

---

## Billers.tsx Migration Steps

### Step 1: Add Imports

Add these imports at the top of `Billers.tsx`:

```typescript
import {
  getPaymentSchedulesByBiller,
  markPaymentScheduleAsPaid
} from '../src/services/paymentSchedulesService';
import { createTransaction } from '../src/services/transactionsService';
import type { SupabasePaymentSchedule } from '../src/types/supabase';
```

### Step 2: Update State

Add payment schedules state:

```typescript
// Add this with other useState declarations
const [paymentSchedules, setPaymentSchedules] = useState<Record<string, SupabasePaymentSchedule[]>>({});
const [useNewScheduleSystem, setUseNewScheduleSystem] = useState(true);
```

### Step 3: Load Payment Schedules

Add this effect to load schedules when billers change:

```typescript
// Add this useEffect after billers are loaded
useEffect(() => {
  async function loadPaymentSchedules() {
    if (!useNewScheduleSystem) return;
    
    const schedulesMap: Record<string, SupabasePaymentSchedule[]> = {};
    
    for (const biller of billers) {
      const { data, error } = await getPaymentSchedulesByBiller(biller.id);
      if (data && !error) {
        schedulesMap[biller.id] = data;
      } else {
        console.warn(`No payment schedules found for biller ${biller.name}. Using legacy schedule system.`);
      }
    }
    
    setPaymentSchedules(schedulesMap);
  }
  
  if (billers.length > 0) {
    loadPaymentSchedules();
  }
}, [billers, useNewScheduleSystem]);
```

### Step 4: Update handlePaySubmit

Replace the existing `handlePaySubmit` function:

```typescript
const handlePaySubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!showPayModal || isSubmitting) return;
  
  setIsSubmitting(true);
  try {
    const { biller, schedule } = showPayModal;
    
    // Check if we have a schedule ID (new system) or need to use legacy system
    const scheduleId = schedule.id;
    const hasNewScheduleId = scheduleId && scheduleId.length === 36; // UUID length check
    
    if (hasNewScheduleId && useNewScheduleSystem) {
      // NEW SYSTEM: Use payment schedules
      console.log('Processing payment with new schedule system');
      
      // Mark schedule as paid
      const { data: updatedSchedule, error: scheduleError } = await markPaymentScheduleAsPaid(
        scheduleId,
        parseFloat(payFormData.amount),
        payFormData.datePaid,
        payFormData.accountId,
        payFormData.receipt || undefined
      );
      
      if (scheduleError) {
        throw new Error('Failed to mark schedule as paid: ' + scheduleError.message);
      }
      
      // Create transaction with payment_schedule_id (prevents duplicates)
      const { error: txError } = await createTransaction({
        name: `${biller.name} - ${schedule.month} ${schedule.year}`,
        date: payFormData.datePaid,
        amount: parseFloat(payFormData.amount),
        payment_method_id: payFormData.accountId,
        payment_schedule_id: scheduleId,
      });
      
      if (txError) {
        // Check if it's a duplicate payment error
        if (txError.code === '23505') { // PostgreSQL unique violation
          throw new Error('This payment has already been recorded. Duplicate payments are not allowed.');
        }
        throw new Error('Failed to create transaction: ' + txError.message);
      }
      
      // Update local state
      setPaymentSchedules(prev => ({
        ...prev,
        [biller.id]: (prev[biller.id] || []).map(s =>
          s.id === scheduleId ? { ...s, ...updatedSchedule } : s
        )
      }));
      
    } else {
      // LEGACY SYSTEM: Update JSON schedules (backward compatibility)
      console.log('Processing payment with legacy schedule system');
      
      const updatedSchedules = biller.schedules.map(s => {
        const isMatch = (schedule.id != null) ? 
          (s.id === schedule.id) : 
          (s.month === schedule.month && s.year === schedule.year);
          
        if (isMatch) {
          return { 
            ...s, 
            amountPaid: parseFloat(payFormData.amount), 
            receipt: payFormData.receipt || `${biller.name}_${schedule.month}`, 
            datePaid: payFormData.datePaid, 
            accountId: payFormData.accountId 
          };
        }
        return s;
      });
      
      await onUpdate({ ...biller, schedules: updatedSchedules });
    }
    
    setShowPayModal(null);
    
  } catch (error) {
    console.error('Failed to update payment:', error);
    alert(error instanceof Error ? error.message : 'Failed to process payment. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

### Step 5: Update Schedule Display

Modify the schedule rendering to use new schedules when available:

```typescript
// In the detailed view where schedules are displayed
const displaySchedules = (biller: Biller) => {
  // Try to use new payment schedules first
  const newSchedules = paymentSchedules[biller.id];
  
  if (newSchedules && newSchedules.length > 0) {
    // NEW SYSTEM: Display from payment_schedules table
    return newSchedules.map(sched => {
      const isPaid = sched.amount_paid !== null;
      const displayAmount = sched.expected_amount;
      
      return (
        <tr key={sched.id}>
          <td className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-bold">{sched.schedule_month}</span>
              <span className="text-gray-500 text-sm">{sched.schedule_year}</span>
              {sched.timing && (
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                  {sched.timing}
                </span>
              )}
            </div>
          </td>
          <td className="p-4 font-medium text-gray-600">{formatCurrency(displayAmount)}</td>
          <td className="p-4 text-center">
            {!isPaid ? (
              <button
                onClick={() => {
                  setShowPayModal({ 
                    biller: biller, 
                    schedule: {
                      id: sched.id,
                      month: sched.schedule_month,
                      year: sched.schedule_year,
                      expectedAmount: sched.expected_amount,
                      amountPaid: sched.amount_paid || undefined,
                    }
                  });
                  setPayFormData({ 
                    ...payFormData, 
                    amount: displayAmount.toString(), 
                    receipt: '' 
                  });
                }}
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 text-xs transition-all"
              >
                Pay
              </button>
            ) : (
              <span role="status" className="flex items-center justify-center text-green-600">
                <CheckCircle2 className="w-5 h-5" aria-label="Payment completed" title="Paid" />
              </span>
            )}
          </td>
        </tr>
      );
    });
  } else {
    // LEGACY SYSTEM: Display from biller.schedules JSON
    return biller.schedules.map(sched => {
      // ... existing code ...
    });
  }
};
```

---

## Installments.tsx Migration Steps

### Step 1: Add Imports

```typescript
import {
  getPaymentSchedulesByInstallment,
  markPaymentScheduleAsPaid
} from '../src/services/paymentSchedulesService';
import { createTransaction } from '../src/services/transactionsService';
import type { SupabasePaymentSchedule } from '../src/types/supabase';
```

### Step 2: Update State

```typescript
const [paymentSchedules, setPaymentSchedules] = useState<Record<string, SupabasePaymentSchedule[]>>({});
const [useNewScheduleSystem, setUseNewScheduleSystem] = useState(true);
```

### Step 3: Load Payment Schedules

```typescript
useEffect(() => {
  async function loadPaymentSchedules() {
    if (!useNewScheduleSystem) return;
    
    const schedulesMap: Record<string, SupabasePaymentSchedule[]> = {};
    
    for (const installment of installments) {
      const { data, error } = await getPaymentSchedulesByInstallment(installment.id);
      if (data && !error) {
        schedulesMap[installment.id] = data;
      } else {
        console.warn(`No payment schedules found for installment ${installment.name}.`);
      }
    }
    
    setPaymentSchedules(schedulesMap);
  }
  
  if (installments.length > 0) {
    loadPaymentSchedules();
  }
}, [installments, useNewScheduleSystem]);
```

### Step 4: Update handlePaySubmit

```typescript
const handlePaySubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!showPayModal || isSubmitting) return;

  setIsSubmitting(true);
  try {
    const paymentAmount = parseFloat(payFormData.amount) || 0;
    
    // Check if we have payment schedules for this installment
    const schedules = paymentSchedules[showPayModal.id];
    
    if (schedules && schedules.length > 0 && useNewScheduleSystem) {
      // NEW SYSTEM: Find the next unpaid schedule
      const unpaidSchedule = schedules.find(s => s.amount_paid === null);
      
      if (!unpaidSchedule) {
        throw new Error('No unpaid schedules found for this installment.');
      }
      
      // Mark schedule as paid
      const { data: updatedSchedule, error: scheduleError } = await markPaymentScheduleAsPaid(
        unpaidSchedule.id,
        paymentAmount,
        payFormData.datePaid,
        payFormData.accountId,
        payFormData.receipt || undefined
      );
      
      if (scheduleError) {
        throw new Error('Failed to mark schedule as paid');
      }
      
      // Create transaction
      const { error: txError } = await createTransaction({
        name: `${showPayModal.name} - ${unpaidSchedule.schedule_month} ${unpaidSchedule.schedule_year}`,
        date: payFormData.datePaid,
        amount: paymentAmount,
        payment_method_id: payFormData.accountId,
        payment_schedule_id: unpaidSchedule.id,
      });
      
      if (txError) {
        if (txError.code === '23505') {
          throw new Error('This payment has already been recorded.');
        }
        throw new Error('Failed to create transaction');
      }
      
      // Update local state
      setPaymentSchedules(prev => ({
        ...prev,
        [showPayModal.id]: prev[showPayModal.id].map(s =>
          s.id === unpaidSchedule.id ? { ...s, ...updatedSchedule } : s
        )
      }));
      
      // Update installment paid_amount for display
      const totalPaid = schedules
        .filter(s => s.id === unpaidSchedule.id || s.amount_paid !== null)
        .reduce((sum, s) => sum + (s.amount_paid || 0), 0);
      
      const updatedInstallment: Installment = {
        ...showPayModal,
        paidAmount: totalPaid
      };
      
      await onUpdate?.(updatedInstallment);
      
    } else {
      // LEGACY SYSTEM: Update cumulative paid_amount
      const updatedInstallment: Installment = {
        ...showPayModal,
        paidAmount: showPayModal.paidAmount + paymentAmount
      };
      
      await onUpdate?.(updatedInstallment);
    }
    
    setShowPayModal(null);
    
  } catch (error) {
    console.error('[Installments] Failed to process payment:', error);
    alert(error instanceof Error ? error.message : 'Failed to process payment. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};
```

### Step 5: Update Progress Display

Show detailed schedule-based progress:

```typescript
const renderInstallmentProgress = (installment: Installment) => {
  const schedules = paymentSchedules[installment.id];
  
  if (schedules && schedules.length > 0) {
    // NEW SYSTEM: Calculate from schedules
    const totalSchedules = schedules.length;
    const paidSchedules = schedules.filter(s => s.amount_paid !== null).length;
    const totalPaid = schedules.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    const progressPercent = (paidSchedules / totalSchedules) * 100;
    
    return (
      <div>
        <div className="flex justify-between mb-2">
          <span>{paidSchedules} of {totalSchedules} payments made</span>
          <span>₱{totalPaid.toFixed(2)} / ₱{installment.totalAmount.toFixed(2)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-green-600 h-2 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  } else {
    // LEGACY SYSTEM: Use cumulative paid_amount
    const progressPercent = (installment.paidAmount / installment.totalAmount) * 100;
    
    return (
      <div>
        <div className="flex justify-between mb-2">
          <span>Progress</span>
          <span>₱{installment.paidAmount.toFixed(2)} / ₱{installment.totalAmount.toFixed(2)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-green-600 h-2 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }
};
```

---

## Testing Checklist

After making these changes, test thoroughly:

### Test Cases

1. **Create New Biller**
   - ✅ Should auto-generate payment schedules
   - ✅ Schedules should appear in UI
   - ✅ Should be able to make payment

2. **Create New Installment**
   - ✅ Should auto-generate payment schedules
   - ✅ Schedules should appear in UI
   - ✅ Should be able to make first payment

3. **Make Payment**
   - ✅ Payment should succeed
   - ✅ Transaction should be created with payment_schedule_id
   - ✅ Schedule should be marked as paid
   - ✅ UI should update to show paid status

4. **Prevent Duplicate Payment**
   - ✅ Try to pay same schedule twice
   - ✅ Should show error message
   - ✅ Database constraint should prevent duplicate

5. **Legacy Data**
   - ✅ Old billers/installments should still work
   - ✅ Should fall back to legacy system if no schedules
   - ✅ Can still make payments on legacy items

---

## Rollback Plan

If issues arise, you can temporarily disable the new system:

```typescript
// At the top of component
const [useNewScheduleSystem, setUseNewScheduleSystem] = useState(false);
```

This will keep using the old JSON-based schedule system while you troubleshoot.

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Verify payment schedules exist in database
3. Check that migrations ran successfully
4. Review the PAYMENT_SCHEDULES_IMPLEMENTATION.md documentation
5. Look at PAYMENT_SCHEDULES_SAMPLE_IMPLEMENTATION.tsx for examples

---

**Last Updated:** February 1, 2026  
**Status:** Ready for implementation
