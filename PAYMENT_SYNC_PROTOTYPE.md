# Payment Synchronization Prototype - Documentation

## Overview

This prototype implements a centralized payment synchronization system that ensures transactions serve as the single source of truth for payment status and amounts across all entities in the Budget Book application.

## Problem Statement

Currently, payment information is fragmented across multiple entities:
- **Installments**: Store `paidAmount` directly in the database
- **Billers**: Store payment schedules with `amountPaid` in a JSONB array
- **Budget Items**: Check payment status through client-side fuzzy matching
- **Accounts**: Store static balances that may not reflect transaction history

This fragmentation leads to:
- **Data inconsistencies** between stored values and actual transaction records
- **Duplication of matching logic** across different components
- **Difficulty auditing** payment history
- **Synchronization challenges** when transactions are added/modified

## Solution Architecture

### Core Components

#### 1. Payment Sync Utility (`src/utils/paymentSync.ts`)

A comprehensive utility library that provides:

**Core Functions:**
- `findMatchingTransactions()` - Base function for transaction matching with configurable tolerance
- `computeInstallmentPaymentStatus()` - Calculate installment payment from transactions
- `computeBillerSchedulePaymentStatus()` - Calculate biller payment status per schedule
- `computeBudgetItemPaymentStatus()` - Check budget item payment status
- `groupTransactionsByBillingPeriod()` - Group account transactions by month/year
- `buildLoansBudgetSection()` - Combine installments and loan billers for budget view
- `calculateAccountBalanceFromTransactions()` - Transaction-based balance calculation
- `checkPaymentSyncStatus()` - Compare stored vs computed payment data

**Configuration:**
```typescript
export const PAYMENT_SYNC_CONFIG = {
  AMOUNT_TOLERANCE: 1,           // ±1 peso for amount matching
  MIN_NAME_LENGTH: 3,            // Minimum name length for fuzzy matching
  LOOKBACK_MONTHS: 24,           // How far back to search transactions
};
```

**Matching Algorithm:**
The utility uses a three-part fuzzy matching algorithm:
1. **Name Matching**: Partial string match (case-insensitive), minimum 3 characters
2. **Amount Matching**: Within ±1 peso tolerance to handle rounding
3. **Date Matching**: Same month/year, or previous year for carryover payments

#### 2. React Hook (`src/utils/usePaymentSync.ts`)

React hooks that wrap the utility functions with memoization and state management:

**Available Hooks:**
- `useInstallmentPaymentStatus()` - Returns Map<installmentId, PaymentStatus>
- `useBillerPaymentStatus()` - Returns nested Map<billerId, Map<scheduleKey, PaymentStatus>>
- `useAccountBillingPeriods()` - Returns Map<accountId, BillingPeriodSummary[]>
- `useLoansBudgetSection()` - Returns LoanPaymentInfo[] for a specific month
- `usePaymentSyncStatus()` - Returns sync discrepancy detection
- `usePaymentSync()` - Composite hook providing all sync data
- `useBudgetItemPaymentStatus()` - Convenience hook for single budget item

**Usage Example:**
```typescript
const paymentSync = usePaymentSync({
  installments,
  billers,
  accounts,
  transactions,
  targetMonth: "January",
  targetYear: "2025",
});

// Access computed payment status
const status = paymentSync.installmentStatus.get(installmentId);
console.log(`Paid: ${status.paidAmount} of ${status.expectedAmount}`);
console.log(`Is Paid: ${status.isPaid}`);
```

#### 3. Demo Component (`pages/PaymentSyncDemo.tsx`)

A comprehensive demonstration component that:
- Shows real-time payment sync calculations
- Displays sync discrepancies between stored and computed values
- Provides visual indicators for payment status
- Demonstrates proper usage patterns
- Serves as debugging/testing tool

**Access:** Navigate to `/payment-sync-demo` in the application

## Data Types

### PaymentStatus
```typescript
interface PaymentStatus {
  entityId: string;              // Unique identifier for the entity
  entityName: string;            // Display name
  expectedAmount: number;        // Total expected payment
  paidAmount: number;            // Total paid (from transactions)
  isPaid: boolean;               // Whether fully paid
  paymentDate?: string;          // Latest payment date
  matchingTransactionIds: string[]; // IDs of matching transactions
  billingPeriod?: {
    month: string;
    year: string;
  };
}
```

### BillingPeriodSummary
```typescript
interface BillingPeriodSummary {
  accountId: string;
  accountName: string;
  period: { month: string; year: string; };
  transactions: SupabaseTransaction[];
  totalAmount: number;
  transactionCount: number;
}
```

### LoanPaymentInfo
```typescript
interface LoanPaymentInfo {
  installmentId?: string;
  installmentName?: string;
  period: { month: string; year: string; };
  expectedAmount: number;
  paidAmount: number;
  isPaid: boolean;
  transactions: SupabaseTransaction[];
  accountId?: string;
}
```

## Integration Points

### Current Implementation (Prototype Mode)

The prototype has been integrated with **clear markers** to avoid breaking production code:

#### 1. Installments.tsx
- Added commented-out integration code showing how to use `useInstallmentPaymentStatus()`
- Shows where to display transaction-based vs stored payment amounts
- Demonstrates sync discrepancy detection

#### 2. Billers.tsx
- Added comment showing replacement of existing transaction matching
- Existing matching logic preserved and functional
- Shows where `useBillerPaymentStatus()` would replace current implementation

#### 3. Budget.tsx
- Added comment in `checkIfPaidByTransaction()` showing how to use `computeBudgetItemPaymentStatus()`
- Current implementation preserved
- Demonstrates `useLoansBudgetSection()` for Loans category

#### 4. Accounts (Future)
- Use `useAccountBillingPeriods()` for statement generation
- Use `calculateAccountBalanceFromTransactions()` for balance reconciliation
- Group transactions by billing cycle for credit card statements

## Requirements Checklist

✅ **Requirement 1**: Utility function for computing payment status and sums from transactions
- Implemented in `src/utils/paymentSync.ts`
- Comprehensive functions for all entity types

✅ **Requirement 2**: Update Installments logic to fetch paid amount from transactions
- Integration points marked in `Installments.tsx`
- `computeInstallmentPaymentStatus()` function ready to use

✅ **Requirement 3**: Update Accounts logic for billing period totals from transactions
- `groupTransactionsByBillingPeriod()` implemented
- Ready for integration in account statements

✅ **Requirement 4**: Budget Setup loans logic with combined installment/regular payments
- `buildLoansBudgetSection()` implemented
- Combines installments and loan billers by period

✅ **Requirement 5**: Billers payment status determined from transactions
- `computeBillerSchedulePaymentStatus()` implemented
- Integration points marked in `Billers.tsx`

✅ **Requirement 6**: Integration example in UI
- Demo component at `/payment-sync-demo` fully functional
- Shows all sync calculations in real-time

✅ **Requirement 7**: Prototype implementation - doesn't break production
- All new code clearly marked with PROTOTYPE comments
- Existing functionality preserved
- Integration points documented with TODOs

## Usage Guide

### For Developers

#### To Enable Prototype Features:

1. **In Installments.tsx:**
   ```typescript
   // Uncomment these lines at the top of the file:
   import type { SupabaseTransaction } from '../src/types/supabase';
   import { useInstallmentPaymentStatus } from '../src/utils/usePaymentSync';
   import { getAllTransactions } from '../src/services/transactionsService';
   
   // Then uncomment the state and effect hooks in the component
   ```

2. **In Billers.tsx:**
   Replace the existing transaction loading logic with:
   ```typescript
   const paymentSync = usePaymentSync({
     installments, billers, accounts, transactions, 
     targetMonth: selectedMonth, targetYear: selectedYear
   });
   ```

3. **In Budget.tsx:**
   Replace `checkIfPaidByTransaction` with:
   ```typescript
   const status = paymentSync.computeBudgetItemStatus(itemName, amount, month, year);
   return status.isPaid;
   ```

#### To View the Demo:

1. Start the development server: `npm run dev`
2. Navigate to: `http://localhost:5173/payment-sync-demo`
3. The demo shows:
   - Installment payment status from transactions
   - Sync discrepancies between stored and computed values
   - Loans budget section for selected period
   - Account transaction summaries by billing period

## Known Limitations & TODOs

### Critical TODOs Before Production:

1. **Transaction Matching Accuracy**
   - Current fuzzy matching may produce false positives/negatives
   - Need to test with real-world transaction data
   - Consider adding transaction metadata (billerId, installmentId) for exact matching

2. **Performance Optimization**
   - No caching strategy implemented
   - All transactions loaded into memory
   - Consider database-level computed views or materialized views
   - Add pagination for large transaction sets

3. **Error Handling**
   - Limited error handling in utility functions
   - Need comprehensive error boundaries in React hooks
   - Add fallback behavior for sync failures

4. **Data Validation**
   - No validation of transaction data completeness
   - Need to handle edge cases (refunds, partial payments, date discrepancies)
   - Validate amount precision and rounding

5. **Audit Trail**
   - No logging of sync operations
   - Need to track when sync calculations run
   - Monitor sync discrepancies over time

6. **Testing**
   - No unit tests for utility functions
   - Need integration tests for React hooks
   - Add visual regression tests for demo component

7. **Account Balance Calculation**
   - `calculateAccountBalanceFromTransactions()` needs clarification:
     - How to handle starting balance?
     - How to distinguish income vs expense?
     - How to handle transfers between accounts?
     - Different logic for debit vs credit accounts?

8. **Context/State Management**
   - Consider React Context for app-wide payment sync state
   - Integrate with React Query or SWR for caching
   - Add refresh/invalidation logic

9. **Loan Payments**
   - Clarify requirements for loan categorization
   - Handle installments without billerId
   - Support variable payment amounts
   - Handle early payoff scenarios

10. **Date/Time Handling**
    - No timezone consideration
    - Need to handle custom billing cycles (not just calendar months)
    - Support date range queries

### Future Enhancements:

- **Real-time Sync**: WebSocket or polling for live transaction updates
- **Conflict Resolution**: UI for resolving sync discrepancies
- **Bulk Operations**: Sync multiple entities at once
- **Export Functionality**: Generate sync reports
- **Analytics**: Dashboard showing sync health metrics
- **AI/ML**: Improved transaction matching using machine learning

## Testing the Prototype

### Manual Testing Steps:

1. **Create Test Data:**
   - Add some installments with known amounts
   - Add matching transactions with similar names/amounts
   - Add some intentional mismatches to test discrepancy detection

2. **View Demo Page:**
   - Navigate to `/payment-sync-demo`
   - Select different months/years
   - Verify calculated amounts match expectations
   - Check for sync warnings on mismatched data

3. **Check Existing Pages:**
   - Verify Installments page still works normally
   - Verify Billers page payment status still works
   - Verify Budget page transaction matching still works
   - Ensure no console errors

4. **Edge Cases:**
   - Test with no transactions
   - Test with very old transactions
   - Test with amount variations (±2 pesos)
   - Test with similar names
   - Test with special characters in names

## Migration Strategy

When ready to move to production:

1. **Phase 1: Parallel Run**
   - Enable prototype alongside existing logic
   - Compare results for discrepancies
   - Collect metrics on matching accuracy

2. **Phase 2: Gradual Rollout**
   - Replace Budget.tsx matching first (lowest risk)
   - Then Billers.tsx payment status
   - Then Installments.tsx paid amounts
   - Finally Account balance calculations

3. **Phase 3: Database Schema Updates**
   - Consider adding transaction linking fields (billerId, installmentId)
   - Add computed columns for cached sync values
   - Create database triggers for automatic sync

4. **Phase 4: UI Enhancements**
   - Add sync status indicators throughout the app
   - Add reconciliation tools for discrepancies
   - Add audit log viewer

## Support & Questions

For questions or issues with this prototype:
1. Review TODOs in source code comments
2. Check the demo component for usage examples
3. Review this documentation for clarification
4. Document additional requirements as TODOs in code

## File Locations

- **Utility**: `/src/utils/paymentSync.ts`
- **Hook**: `/src/utils/usePaymentSync.ts`
- **Demo**: `/pages/PaymentSyncDemo.tsx`
- **Types**: Uses existing types from `types.ts` and `src/types/supabase.ts`
- **This Doc**: `/PAYMENT_SYNC_PROTOTYPE.md`
