# Phase 1: Local Foundation & Transfer Fees Implementation Plan

## Overview
This document outlines the technical implementation plan for **Phase 1** of the Budee social pivot. The goal is to refactor the local data model to support multi-user logic (shadow profiles), implement explicit transfer fees, and prepare the UI for friend connections.

---

## Feature 1: Transfer Fees (The Split Approach)

### The Concept
When a user transfers money between their own accounts (Internal Transfer) and incurs a bank fee, the fee should not be baked into the transfer amount. It must be split into a separate "Payment" (Expense) transaction. This keeps net-zero wealth transfers accurate while correctly tracking bank fees as expenses.

### UI Flow Changes
1. **Transfer Modal (`pages/accounts/view.tsx`)**:
   - Add an optional "Transfer Fee" number input field below the Transfer Amount.
   - Add a subtle helper text: *"Fees will be logged as a separate expense from the source account."*

### Service Layer Logic (`src/services/transactionsService.ts`)
Update `createTransfer` to handle three transactions instead of two when a fee is present:
1. **Transfer Out (Source):** Negative amount equal to the base transfer amount.
2. **Transfer In (Destination):** Positive amount equal to the base transfer amount.
3. **Transfer Fee (Source):** Negative amount equal to the `feeAmount`, with `transaction_type = 'payment'` and `name = 'Transfer Fee'`.

*Note: All three transactions will share the same `related_transaction_id` grouping so they can be identified as part of the same transfer event.*

---

## Feature 2: People Page as a Relationship Ledger

### The Concept
The "People" page currently focuses heavily on active loans. It needs to evolve into a Venmo-style **Relationship Ledger** for local text aliases (Shadow Profiles). When you click on an alias (e.g., "John"), you should see both your active IOUs and your complete transaction history with them.

### Database Preparation
*   Currently, standard transactions use the `name` column for the payee/description. 
*   To explicitly link transactions to an alias before the `friendships` table is ready, we need to ensure there is a reliable way to query transactions by person. 
*   *Action:* We will add a `person_name` (TEXT) column to the `transactions` table. If it's a payment to "John", `person_name = 'John'`.

### UI Flow Changes
1. **The People Dashboard (`pages/People.tsx`)**:
   - List all unique `person_name` entries extracted from `transactions` and `installments/loans`.
   - Show a rolled-up "Net Balance" next to each person (how much they owe you vs how much you owe them).

2. **The Relationship View (Person Detail Modal/Page)**:
   - **Header:** Person's Name (Alias) & Net Balance.
   - **Tab 1: Active Balances:** Shows active loans and shared split expenses (unsettled).
   - **Tab 2: History:** A chronological feed of every transaction where `person_name` matches. Includes regular payments, settled loans, and split expenses.

---

## Feature 3: "Add Friend" UI Sneak Peek

### The Concept
To prime users for the social pivot, we will introduce the "Network" search UI. It won't have full backend friend-request functionality yet, but it will visually establish the app's capability to connect with real people.

### UI Flow Changes
1. **Network Header**:
   - Add a primary "Find Friends" button at the top of the People page.
2. **Search Drawer/Modal**:
   - A slide-out drawer with a search input: *"Search by email or @handle"*.
   - **Mock State:** When typing, show a skeleton loader, followed by a "No registered users found. Invite them to Budee!" state or a mock user card with an "Add" button.
   - This establishes the mental model for Phase 3 without requiring the `friendships` table right now.

---

## Implementation Steps

### Step 1: Database Schema Updates
Execute a migration to add `person_name` to `transactions`.
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS person_name TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_person_name ON transactions(person_name);
```

### Step 2: The Transfer Fee Implementation
1. Update `SupabaseTransaction` types to include `person_name`.
2. Refactor `createTransfer` in `transactionsService.ts` to accept `feeAmount` and generate the 3rd fee transaction.
3. Update the Transfer Modal UI in the frontend to include the Fee input.

### Step 3: Standardize External Payments
1. Update the "Add Transaction" and "Payment" modals to include an optional "Person / Payee" autocomplete input.
2. This input saves to the `person_name` column, building the foundation for the Shadow Profiles.

### Step 4: Revamp the People Page
1. Create a new service function: `getRelationshipLedger(personName: string)`.
2. Redesign `People.tsx` to list these profiles.
3. Build the detailed view with the "Balances" and "History" tabs.

### Step 5: Add the "Find Friends" UI
1. Build the Search UI component.
2. Add empty states and invitation prompts to complete the social illusion.

---

## Summary of Impact
By completing this phase, the application's internal data model will perfectly mirror a multi-user environment. A payment to "Mom" is now explicitly tracked as a relationship event rather than an anonymous withdrawal. Transfer fees are accurately categorized as expenses. The app is now fully primed for Phase 2: deploying the `friendships` table.