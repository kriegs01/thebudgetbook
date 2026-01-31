# Credit Card Biller Linking Feature

## Overview

This feature allows you to link billers to credit card accounts so that transaction totals from credit card statements can automatically populate the biller's payment schedule. This is particularly useful for credit card payment billers where the amount varies each month based on spending.

## Use Cases

1. **Credit Card Payment Biller**: Create a biller for "Credit Card Payment" and link it to your credit card account. The payment schedules will automatically sync with your actual spending each billing cycle.

2. **Variable Credit Card Bills**: For any biller that represents credit card payments, you can now have the amounts automatically calculated based on your transactions instead of manually entering them.

## How to Use

### Step 1: Ensure Your Credit Card Account is Properly Configured

Before linking a biller, make sure:
1. You have a credit card account with `classification` set to "Credit Card"
2. The account has a `billingDate` configured (this determines the billing cycles)
3. Transactions are being added with the credit card as the payment method

### Step 2: Create or Edit a Biller

When creating a new biller or editing an existing one:

1. Fill in the basic information (name, category, due date, etc.)
2. Look for the **"Link to Credit Card (Optional)"** dropdown
3. Select the credit card account you want to link to this biller
4. The dropdown only shows credit cards that have a billing date configured
5. Save the biller

### Step 3: Sync Credit Card Totals

Once a biller is linked to a credit card:

1. Find the biller in the Billers list
2. You'll see a purple indicator showing "Linked to [Credit Card Name]"
3. Click the three-dot menu (⋮) on the biller card
4. Select **"Sync Credit Card"** from the menu
5. The system will:
   - Calculate credit card transaction totals for each billing cycle
   - Map those cycles to calendar months
   - Update the biller's payment schedules with the calculated amounts
6. You'll see a success message when the sync is complete

### Step 4: View Synced Amounts

After syncing:
1. Click "View Details" on the biller
2. The payment schedule table will show the synced amounts from your credit card spending
3. These amounts reflect the actual transactions in each billing cycle, excluding installments

## Technical Details

### Billing Cycle to Month Mapping

The system maps credit card billing cycles to calendar months:
- Each billing cycle runs from one billing date to the day before the next billing date
- The payment for a cycle is typically due in the month after the cycle ends
- For example, if your billing date is the 10th:
  - Jan 10 - Feb 9 cycle → Payment due in February
  - Feb 10 - Mar 9 cycle → Payment due in March

### Transaction Aggregation

When syncing:
- All transactions with `payment_method_id` matching the linked credit card are included
- Installment transactions are automatically excluded (to avoid double-counting)
- Transactions are grouped by the billing cycle they fall within
- Each cycle's total becomes the expected payment amount for that month

### Database Schema

The feature adds a new column to the `billers` table:
```sql
ALTER TABLE billers 
ADD COLUMN linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
```

This creates a foreign key relationship between billers and accounts, allowing the link while ensuring data integrity.

## API/Functions

### `syncCreditCardToBillerSchedule()`

**Location**: `src/utils/creditCardBillerSync.ts`

**Purpose**: Updates an existing biller's payment schedules with credit card transaction totals

**Parameters**:
- `biller`: The biller to update
- `account`: The linked credit card account
- `transactions`: All transactions
- `installments`: All installments (to exclude from totals)

**Returns**: Updated biller with synced schedules

### `generateBillerSchedulesFromCreditCard()`

**Location**: `src/utils/creditCardBillerSync.ts`

**Purpose**: Creates new payment schedules for a biller based on credit card billing cycles

**Parameters**:
- `biller`: The biller to generate schedules for
- `account`: The linked credit card account
- `transactions`: All transactions
- `installments`: All installments (to exclude)
- `numberOfMonths`: How many months ahead to generate (default: 12)

**Returns**: Biller with generated schedules

## Troubleshooting

### "Linked account must be a Credit Card with a billing date set"

**Solution**: Make sure:
1. The account's `classification` is set to "Credit Card"
2. The account has a `billingDate` configured
3. Edit the account and add a billing date if missing

### Sync shows $0 for all months

**Possible causes**:
1. No transactions have been added for the credit card
2. All transactions are categorized as installments (they get excluded)
3. Transactions are outside the calculated billing cycles (check date ranges)

**Solution**: 
- Add credit card transactions via the Transactions page
- Ensure transactions have the correct `payment_method_id`
- Check that transaction dates fall within the billing cycles

### Amounts don't match credit card statement

**Possible causes**:
1. Some transactions haven't been entered yet
2. The billing date is configured incorrectly
3. Transactions have the wrong date or payment method

**Solution**:
- Verify all transactions are entered
- Check the billing date in account settings
- Review transactions to ensure they're correctly attributed

## Example Workflow

1. **Setup Credit Card**: 
   - Name: "Chase Sapphire"
   - Classification: "Credit Card"
   - Billing Date: "2026-01-10" (10th of each month)

2. **Add Transactions**:
   - Jan 15: Grocery Shopping, $150
   - Jan 20: Gas Station, $50
   - Jan 25: Restaurant, $75
   - (These fall in the Jan 10 - Feb 9 cycle)

3. **Create Biller**:
   - Name: "Chase Credit Card Payment"
   - Category: "Fixed - Credit Cards"
   - Due Date: 15 (15th of each month)
   - Link to: "Chase Sapphire"

4. **Sync**:
   - Click menu → "Sync Credit Card"
   - February schedule shows: $275 (the total from Jan 10-Feb 9)

5. **Track Payment**:
   - When you pay the credit card bill, mark it as paid in the biller schedule
   - The amount will match your actual statement

## Future Enhancements

Potential improvements for this feature:

1. **Automatic Sync**: Trigger sync automatically when transactions are added
2. **Sync Schedule**: Set up automatic weekly/monthly sync
3. **Partial Sync**: Sync only specific months instead of all schedules
4. **Visual Indicators**: Show when schedules were last synced
5. **Conflict Resolution**: Handle cases where manual amounts were already set
6. **Multiple Cards**: Link multiple credit cards to different billers
7. **Statement Comparison**: Compare synced amounts with actual credit card statements
