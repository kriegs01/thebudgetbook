# Transaction Types Feature - UI Visual Guide

## 1. Account View Page - Debit Account

### Header Section (Action Buttons)
```
┌─────────────────────────────────────────────────────────────────────┐
│ ← [Back]  Bank of America Checking                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TRANSACTIONS                                      15 items           │
│                                                                       │
│  [Withdraw]  [Transfer]  [Loan]  [Cash In]                          │
│    (Red)      (Blue)    (Orange)  (Green)                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Transaction List with Badges
```
┌─────────────────────────────────────────────────────────────────────┐
│ Name                    Type            Date        Amount    Action │
├─────────────────────────────────────────────────────────────────────┤
│ ATM Withdrawal         [Withdraw]    12/15/2025   -₱2,000.00        │
│                          (Red)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Transfer Out          [Transfer]    12/14/2025   -₱5,000.00        │
│                         (Blue)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Loan: John Doe          [Loan]      12/10/2025  -₱10,000.00  [Receive Payment]│
│                        (Orange)                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Cash In               [Cash In]     12/08/2025    ₱3,000.00        │
│                        (Green)                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Groceries                          12/05/2025      -₱500.00         │
│ (no badge - regular payment)                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Account View Page - Credit Account

### NO Action Buttons Shown
```
┌─────────────────────────────────────────────────────────────────────┐
│ ← [Back]  Chase Credit Card                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TRANSACTIONS                                      8 items            │
│                                                                       │
│ (NO ACTION BUTTONS - Credit accounts don't show these buttons)      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Name                             Date        Amount                  │
├─────────────────────────────────────────────────────────────────────┤
│ Amazon Purchase                 12/15/2025    ₱1,500.00             │
│ Restaurant                      12/14/2025      ₱800.00             │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. Withdraw Modal

```
┌──────────────────────────────────┐
│                                  │
│    Withdraw                      │
│    Record a withdrawal from      │
│    this account                  │
│                                  │
│  FOR WHAT?                       │
│  ┌────────────────────────────┐  │
│  │ e.g. ATM Withdrawal        │  │
│  └────────────────────────────┘  │
│                                  │
│  AMOUNT                          │
│  ┌────────────────────────────┐  │
│  │ ₱ 0.00                     │  │
│  └────────────────────────────┘  │
│                                  │
│  DATE                            │
│  ┌────────────────────────────┐  │
│  │ 2026-02-07                 │  │
│  └────────────────────────────┘  │
│                                  │
│  [Cancel]  [Record Withdrawal]  │
│   (Gray)         (Red)          │
└──────────────────────────────────┘
```

## 4. Transfer Modal

```
┌──────────────────────────────────┐
│                                  │
│    Transfer                      │
│    Transfer money to another     │
│    account                       │
│                                  │
│  AMOUNT                          │
│  ┌────────────────────────────┐  │
│  │ ₱ 0.00                     │  │
│  └────────────────────────────┘  │
│                                  │
│  RECEIVING ACCOUNT               │
│  ┌────────────────────────────┐  │
│  │ Select account...       ▼  │  │
│  │  - Chase Checking          │  │
│  │  - Wells Fargo Savings     │  │
│  │  (Only Debit accounts,     │  │
│  │   excluding current one)   │  │
│  └────────────────────────────┘  │
│                                  │
│  DATE                            │
│  ┌────────────────────────────┐  │
│  │ 2026-02-07                 │  │
│  └────────────────────────────┘  │
│                                  │
│  [Cancel]  [Complete Transfer]  │
│   (Gray)         (Blue)         │
└──────────────────────────────────┘
```

## 5. Loan Modal

```
┌──────────────────────────────────┐
│                                  │
│    Loan                          │
│    Record money lent out         │
│                                  │
│  WHAT?                           │
│  ┌────────────────────────────┐  │
│  │ e.g. John Doe, Emergency   │  │
│  │      Loan                  │  │
│  └────────────────────────────┘  │
│                                  │
│  AMOUNT                          │
│  ┌────────────────────────────┐  │
│  │ ₱ 0.00                     │  │
│  └────────────────────────────┘  │
│                                  │
│  DATE                            │
│  ┌────────────────────────────┐  │
│  │ 2026-02-07                 │  │
│  └────────────────────────────┘  │
│                                  │
│  [Cancel]    [Record Loan]      │
│   (Gray)       (Orange)         │
└──────────────────────────────────┘
```

## 6. Cash In Modal

```
┌──────────────────────────────────┐
│                                  │
│    Cash In                       │
│    Add money to this account     │
│                                  │
│  AMOUNT                          │
│  ┌────────────────────────────┐  │
│  │ ₱ 0.00                     │  │
│  └────────────────────────────┘  │
│                                  │
│  DATE                            │
│  ┌────────────────────────────┐  │
│  │ 2026-02-07                 │  │
│  └────────────────────────────┘  │
│                                  │
│  NOTES (OPTIONAL)                │
│  ┌────────────────────────────┐  │
│  │ e.g. Salary, Bonus, etc.   │  │
│  │                            │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  [Cancel]   [Record Cash In]    │
│   (Gray)        (Green)         │
└──────────────────────────────────┘
```

## 7. Loan Repayment Modal

```
┌──────────────────────────────────┐
│                                  │
│    Receive Loan Payment          │
│    Record payment received for:  │
│    Loan: John Doe                │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Original Loan:  ₱10,000.00 │  │
│  │ Total Paid:      ₱3,000.00 │  │
│  │ ────────────────────────── │  │
│  │ Remaining:       ₱7,000.00 │  │
│  └────────────────────────────┘  │
│                                  │
│  AMOUNT RECEIVED                 │
│  ┌────────────────────────────┐  │
│  │ ₱ 0.00                     │  │
│  │ (max: ₱7,000.00)           │  │
│  └────────────────────────────┘  │
│                                  │
│  DATE                            │
│  ┌────────────────────────────┐  │
│  │ 2026-02-07                 │  │
│  └────────────────────────────┘  │
│                                  │
│  [Cancel]   [Record Payment]    │
│   (Gray)       (Purple)         │
└──────────────────────────────────┘
```

## 8. Success Message

```
┌─────────────────────────────────────────────────────────────────────┐
│ ✓ Withdrawal recorded successfully                                  │
│   (Green background, appears at top for 3 seconds)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 9. Error Message

```
┌─────────────────────────────────────────────────────────────────────┐
│ ✗ Failed to create withdrawal                                       │
│   (Red background, appears at top for 3 seconds)                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Key UI Features

### Color Scheme
- **Withdraw Button & Modal**: Red (#EF4444)
- **Transfer Button & Modal**: Blue (#3B82F6)
- **Loan Button & Modal**: Orange (#F97316)
- **Cash In Button & Modal**: Green (#10B981)
- **Loan Payment Modal**: Purple (#8B5CF6)
- **Cancel Buttons**: Gray (#F3F4F6)

### Typography
- **Modal Titles**: 2xl, Black weight
- **Modal Subtitles**: Small, Gray-500
- **Field Labels**: 10px, Black, Uppercase, Wide tracking
- **Input Fields**: Bold
- **Amount Fields**: XL, Black weight

### Styling Details
- **Modal Backdrop**: Black 60% opacity with blur
- **Modal Container**: White, rounded-3xl (24px), padding 10 (40px)
- **Input Fields**: Gray-50 background, rounded-2xl (16px), padding 4 (16px)
- **Buttons**: Bold, rounded-2xl, padding-y 4
- **Focus States**: 2px ring in button color

### Responsive Design
- **Max Width**: 448px (28rem) for all modals
- **Padding**: Consistent 4-unit padding on mobile
- **Full Width**: Inputs and buttons stretch full width

### Accessibility
- All inputs have labels
- Required fields marked
- Clear error states
- Loading states during submission
- Keyboard navigable
- Proper form submission (Enter key)

## Transaction Badge Colors

| Type         | Background    | Text          |
|-------------|---------------|---------------|
| Withdraw    | Red-100       | Red-700       |
| Transfer    | Blue-100      | Blue-700      |
| Loan        | Orange-100    | Orange-700    |
| Cash In     | Green-100     | Green-700     |
| Loan Payment| Purple-100    | Purple-700    |
| Payment     | (No badge)    | (No badge)    |

## Design Consistency

All components follow the existing design system from the codebase:
- Same backdrop style as transaction modals
- Same form field styling
- Same button styling
- Same typography hierarchy
- Same color palette
- Same spacing/padding conventions

---

**Note**: This is a text-based visual guide. The actual implementation includes all hover states, transitions, and animations that match the existing application's feel.
