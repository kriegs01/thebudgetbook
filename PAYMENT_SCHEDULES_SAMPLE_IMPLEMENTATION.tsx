/**
 * Sample Implementation: Payment Processing with Payment Schedules
 * 
 * This file demonstrates how to update the Billers.tsx and Installments.tsx
 * components to use the new payment_schedules system.
 * 
 * Key Changes:
 * 1. Fetch payment schedules from payment_schedules table instead of JSON field
 * 2. Use payment_schedule_id when processing payments
 * 3. Create transactions linked to payment schedules
 * 4. Prevent duplicate payments through unique constraints
 * 
 * HOW TO INTEGRATE:
 * - Copy the relevant sections to your Billers.tsx or Installments.tsx
 * - Update state management to include payment schedules
 * - Update payment processing to use markPaymentScheduleAsPaid
 * - Update UI to display schedules from the new system
 */

import { useState, useEffect } from 'react';
import type { SupabasePaymentSchedule } from '../src/types/supabase';
import { 
  getPaymentSchedulesByBiller,
  getPaymentSchedulesByInstallment,
  markPaymentScheduleAsPaid 
} from '../src/services/paymentSchedulesService';
import { createTransaction } from '../src/services/transactionsService';

// ============================================================================
// EXAMPLE 1: Billers.tsx Payment Processing
// ============================================================================

/**
 * State Management for Billers
 * Add this to your Billers component state
 */
function BillersExample() {
  const [billers, setBillers] = useState<any[]>([]);
  const [paymentSchedules, setPaymentSchedules] = useState<Record<string, SupabasePaymentSchedule[]>>({});
  const [showPayModal, setShowPayModal] = useState<{ 
    billerId: string, 
    billerName: string,
    schedule: SupabasePaymentSchedule 
  } | null>(null);
  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Load payment schedules for all billers
   * Call this after loading billers
   */
  useEffect(() => {
    async function loadPaymentSchedules() {
      const schedulesMap: Record<string, SupabasePaymentSchedule[]> = {};
      
      for (const biller of billers) {
        const { data, error } = await getPaymentSchedulesByBiller(biller.id);
        if (data && !error) {
          schedulesMap[biller.id] = data;
        }
      }
      
      setPaymentSchedules(schedulesMap);
    }
    
    if (billers.length > 0) {
      loadPaymentSchedules();
    }
  }, [billers]);

  /**
   * Handle payment submission - NEW APPROACH
   */
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { schedule } = showPayModal;
      
      // Step 1: Mark the schedule as paid
      const { data: updatedSchedule, error: scheduleError } = await markPaymentScheduleAsPaid(
        schedule.id,
        parseFloat(payFormData.amount),
        payFormData.datePaid,
        payFormData.accountId,
        payFormData.receipt || undefined
      );
      
      if (scheduleError) {
        throw new Error('Failed to mark schedule as paid: ' + scheduleError.message);
      }
      
      // Step 2: Create a transaction linked to this schedule
      // The unique constraint on payment_schedule_id prevents duplicate payments
      const { error: txError } = await createTransaction({
        name: `${showPayModal.billerName} - ${schedule.schedule_month} ${schedule.schedule_year}`,
        date: payFormData.datePaid,
        amount: parseFloat(payFormData.amount),
        payment_method_id: payFormData.accountId,
        payment_schedule_id: schedule.id, // CRITICAL: Links to schedule, prevents duplicates
      });
      
      if (txError) {
        throw new Error('Failed to create transaction: ' + txError.message);
      }
      
      // Step 3: Update local state to reflect the payment
      setPaymentSchedules(prev => ({
        ...prev,
        [showPayModal.billerId]: prev[showPayModal.billerId].map(s => 
          s.id === schedule.id ? { ...s, ...updatedSchedule } : s
        )
      }));
      
      // Step 4: Close modal and reset form
      setShowPayModal(null);
      setPayFormData({
        amount: '',
        receipt: '',
        datePaid: new Date().toISOString().split('T')[0],
        accountId: ''
      });
      
      // Show success message
      alert('Payment processed successfully!');
      
    } catch (error) {
      console.error('Payment processing failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to process payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Display schedules in the UI - NEW APPROACH
   */
  const renderSchedulesTable = (billerId: string, billerName: string) => {
    const schedules = paymentSchedules[billerId] || [];
    
    return (
      <table className="w-full">
        <thead>
          <tr>
            <th>Month</th>
            <th>Expected Amount</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map(schedule => {
            const isPaid = schedule.amount_paid !== null;
            const displayAmount = schedule.expected_amount;
            
            return (
              <tr key={schedule.id}>
                <td>{schedule.schedule_month} {schedule.schedule_year}</td>
                <td>₱{displayAmount.toFixed(2)}</td>
                <td>
                  {isPaid ? (
                    <span className="text-green-600">Paid</span>
                  ) : (
                    <span className="text-orange-600">Pending</span>
                  )}
                </td>
                <td>
                  {!isPaid ? (
                    <button
                      onClick={() => {
                        setShowPayModal({ 
                          billerId, 
                          billerName,
                          schedule 
                        });
                        setPayFormData({
                          ...payFormData,
                          amount: displayAmount.toString(),
                          receipt: ''
                        });
                      }}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-xl"
                    >
                      Pay
                    </button>
                  ) : (
                    <span>✓ Paid on {schedule.date_paid}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return null; // This is a sample, not a real component
}

// ============================================================================
// EXAMPLE 2: Installments.tsx Payment Processing
// ============================================================================

/**
 * State Management for Installments
 * Add this to your Installments component state
 */
function InstallmentsExample() {
  const [installments, setInstallments] = useState<any[]>([]);
  const [paymentSchedules, setPaymentSchedules] = useState<Record<string, SupabasePaymentSchedule[]>>({});
  const [showPayModal, setShowPayModal] = useState<{
    installmentId: string,
    installmentName: string,
    schedule: SupabasePaymentSchedule
  } | null>(null);
  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Load payment schedules for all installments
   */
  useEffect(() => {
    async function loadPaymentSchedules() {
      const schedulesMap: Record<string, SupabasePaymentSchedule[]> = {};
      
      for (const installment of installments) {
        const { data, error } = await getPaymentSchedulesByInstallment(installment.id);
        if (data && !error) {
          schedulesMap[installment.id] = data;
        }
      }
      
      setPaymentSchedules(schedulesMap);
    }
    
    if (installments.length > 0) {
      loadPaymentSchedules();
    }
  }, [installments]);

  /**
   * Handle payment submission for installments
   */
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { schedule } = showPayModal;
      const paymentAmount = parseFloat(payFormData.amount);
      
      // Step 1: Mark the schedule as paid
      const { data: updatedSchedule, error: scheduleError } = await markPaymentScheduleAsPaid(
        schedule.id,
        paymentAmount,
        payFormData.datePaid,
        payFormData.accountId,
        payFormData.receipt || undefined
      );
      
      if (scheduleError) {
        throw new Error('Failed to mark schedule as paid');
      }
      
      // Step 2: Create transaction
      const { error: txError } = await createTransaction({
        name: `${showPayModal.installmentName} - ${schedule.schedule_month} ${schedule.schedule_year}`,
        date: payFormData.datePaid,
        amount: paymentAmount,
        payment_method_id: payFormData.accountId,
        payment_schedule_id: schedule.id,
      });
      
      if (txError) {
        throw new Error('Failed to create transaction');
      }
      
      // Step 3: Update local state
      setPaymentSchedules(prev => ({
        ...prev,
        [showPayModal.installmentId]: prev[showPayModal.installmentId].map(s =>
          s.id === schedule.id ? { ...s, ...updatedSchedule } : s
        )
      }));
      
      // Step 4: Also update the installment's paid_amount (for backward compatibility)
      // This keeps the cumulative tracking in sync
      const totalPaid = paymentSchedules[showPayModal.installmentId]
        .filter(s => s.id === schedule.id || s.amount_paid !== null)
        .reduce((sum, s) => sum + (s.amount_paid || 0), 0);
      
      // You would call updateInstallment here to update paid_amount
      // await updateInstallment(installmentId, { paid_amount: totalPaid });
      
      // Close modal
      setShowPayModal(null);
      alert('Payment processed successfully!');
      
    } catch (error) {
      console.error('Payment processing failed:', error);
      alert('Failed to process payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Calculate payment progress
   */
  const calculateProgress = (installmentId: string) => {
    const schedules = paymentSchedules[installmentId] || [];
    const totalSchedules = schedules.length;
    const paidSchedules = schedules.filter(s => s.amount_paid !== null).length;
    const totalPaid = schedules.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    
    return {
      progress: totalSchedules > 0 ? (paidSchedules / totalSchedules) * 100 : 0,
      paidSchedules,
      totalSchedules,
      totalPaid
    };
  };

  return null; // This is a sample, not a real component
}

// ============================================================================
// EXAMPLE 3: Error Handling and Validation
// ============================================================================

/**
 * Check if a payment can be made (prevent duplicates)
 */
async function canMakePayment(scheduleId: string): Promise<{ canPay: boolean; reason?: string }> {
  try {
    // Check if schedule is already paid
    const { data: schedule, error } = await supabase
      .from('payment_schedules')
      .select('*, transactions!payment_schedule_id(*)')
      .eq('id', scheduleId)
      .single();
    
    if (error) {
      return { canPay: false, reason: 'Failed to load schedule' };
    }
    
    if (schedule.amount_paid !== null) {
      return { canPay: false, reason: 'This schedule is already marked as paid' };
    }
    
    // Check if transaction exists
    if (schedule.transactions && schedule.transactions.length > 0) {
      return { canPay: false, reason: 'A transaction already exists for this schedule' };
    }
    
    return { canPay: true };
  } catch (error) {
    console.error('Error checking payment status:', error);
    return { canPay: false, reason: 'Failed to verify payment status' };
  }
}

// ============================================================================
// MIGRATION NOTES
// ============================================================================

/**
 * MIGRATION CHECKLIST FOR EXISTING COMPONENTS:
 * 
 * 1. Import required services:
 *    - getPaymentSchedulesByBiller / getPaymentSchedulesByInstallment
 *    - markPaymentScheduleAsPaid
 *    - createTransaction
 * 
 * 2. Add state for payment schedules:
 *    - useState for paymentSchedules map
 *    - Update showPayModal to include schedule object
 * 
 * 3. Load schedules on component mount:
 *    - Fetch schedules for each biller/installment
 *    - Store in state by parent ID
 * 
 * 4. Update payment processing:
 *    - Replace direct biller.schedules updates
 *    - Call markPaymentScheduleAsPaid first
 *    - Create transaction with payment_schedule_id
 *    - Update local state to reflect changes
 * 
 * 5. Update UI rendering:
 *    - Display schedules from paymentSchedules state
 *    - Show payment status from schedule.amount_paid
 *    - Pass schedule object to pay modal
 * 
 * 6. Add error handling:
 *    - Handle schedule already paid
 *    - Handle transaction already exists (duplicate)
 *    - Display user-friendly error messages
 * 
 * 7. Test thoroughly:
 *    - Create new biller/installment (schedules auto-generated)
 *    - Make payment (should succeed)
 *    - Try duplicate payment (should fail with clear error)
 *    - Verify transaction is created with payment_schedule_id
 *    - Check that payment status updates correctly
 */

export default {};
