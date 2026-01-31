# Visual Examples: Linked Credit Account Dropdown States

## State 1: No Credit Accounts Exist

```
┌─────────────────────────────────────────────────────────────┐
│ Linked Credit Account (Optional)                            │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ None - Use Manual Amount                          ▼     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ⚠️ No credit accounts found. Create a credit account        │
│    first to enable linking.                                  │
└─────────────────────────────────────────────────────────────┘
```

**Visual Details:**
- Border: Purple (border-purple-200)
- Background: Light purple (bg-purple-50)
- Warning text: Orange (text-orange-600)
- Warning icon: ⚠️ emoji
- Dropdown: Only shows default option

---

## State 2: Credit Accounts Exist But No Billing Dates

```
┌─────────────────────────────────────────────────────────────┐
│ Linked Credit Account (Optional)                            │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ None - Use Manual Amount                          ▼     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ ⚠️ No credit accounts with billing dates. Edit your         │
│    credit accounts to add billing dates.                     │
└─────────────────────────────────────────────────────────────┘
```

**Visual Details:**
- Border: Purple (border-purple-200)
- Background: Light purple (bg-purple-50)
- Warning text: Orange (text-orange-600)
- Warning icon: ⚠️ emoji
- Dropdown: Only shows default option
- User has credit accounts but they lack billing dates

---

## State 3: Credit Accounts With Billing Dates (Success State)

```
┌─────────────────────────────────────────────────────────────┐
│ Linked Credit Account (Optional)                            │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ None - Use Manual Amount                          ▼     │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Chase Credit (Billing Day: 12)                          │ │
│ │ BDO Credit Card (Billing Day: 5)                        │ │
│ │ BPI Mastercard (Billing Day: 28)                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Link to a credit account to automatically calculate          │
│ expected amounts from billing cycle transactions             │
└─────────────────────────────────────────────────────────────┘
```

**Visual Details:**
- Border: Purple (border-purple-200)
- Background: Light purple (bg-purple-50)
- Help text: Purple (text-purple-600)
- Dropdown: Shows default option plus all credit accounts with billing dates
- Each account shows: `{Bank Name} (Billing Day: {day})`

---

## State 4: Account Selected (Active Link)

```
┌─────────────────────────────────────────────────────────────┐
│ Linked Credit Account (Optional)                            │
│                                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Chase Credit (Billing Day: 12)                    ▼     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                               │
│ Link to a credit account to automatically calculate          │
│ expected amounts from billing cycle transactions             │
└─────────────────────────────────────────────────────────────┘
```

**Visual Details:**
- Selected account displayed in dropdown
- Purple help text (feature working as intended)
- When this biller is saved, it will calculate amounts from the linked credit account's transactions

---

## Complete UI Context: Add Biller Form

```
┌──────────────────────────────────────────────────────────────────┐
│                        NEW BILLER                                │
│                                                                  │
│  Category                                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Loans                                                  ▼   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Biller Name                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Home Loan Payment                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Expected Amount (Optional for Loans)    Due Date (day)         │
│  ┌───────────────────┐  ┌────────────────────────────────────┐ │
│  │ 5000             │  │ 15                                  │ │
│  └───────────────────┘  └────────────────────────────────────┘ │
│                                                                  │
│  ╔════════════════════════════════════════════════════════════╗ │
│  ║ Linked Credit Account (Optional)                           ║ │
│  ║                                                              ║ │
│  ║ ┌──────────────────────────────────────────────────────────┐║ │
│  ║ │ Chase Credit (Billing Day: 12)                     ▼    │║ │
│  ║ └──────────────────────────────────────────────────────────┘║ │
│  ║                                                              ║ │
│  ║ Link to a credit account to automatically calculate         ║ │
│  ║ expected amounts from billing cycle transactions            ║ │
│  ╚════════════════════════════════════════════════════════════╝ │
│                                                                  │
│  ... (rest of form continues) ...                                │
│                                                                  │
│  ┌───────────────┐  ┌────────────────────────────────────────┐ │
│  │   Cancel      │  │         Add Biller                     │ │
│  └───────────────┘  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Note: The Linked Credit Account section only appears when "Loans" category is selected.

---

## Color Legend

| Element                  | Class/Color              | When Used |
|-------------------------|--------------------------|-----------|
| Section Border          | border-purple-200        | Always (when Loans category) |
| Section Background      | bg-purple-50             | Always (when Loans category) |
| Label Text              | text-purple-600          | Always |
| Help Text (Normal)      | text-purple-600          | When accounts available |
| Warning Text            | text-orange-600          | When no accounts available |
| Warning Icon            | ⚠️ emoji                | When no accounts available |
| Dropdown Background     | bg-white                 | Always |

---

## User Journey

1. **User clicks "Add Biller"**
2. **Selects "Loans" category**
   - Linked Credit Account section appears
3. **Sees dropdown state based on available accounts:**
   - No credit accounts → Orange warning: "Create a credit account first"
   - Credit accounts without billing dates → Orange warning: "Add billing dates"
   - Credit accounts with billing dates → Purple help text + dropdown with options
4. **Selects an account (if available)**
   - System will now calculate amounts from that account's transactions
5. **Completes and saves biller**

---

## Implementation Note

The conditional message rendering uses an IIFE (Immediately Invoked Function Expression):

```jsx
{(() => {
  const creditAccounts = accounts.filter(acc => acc.type === 'Credit');
  const creditAccountsWithBilling = creditAccounts.filter(acc => acc.billingDate);
  
  if (creditAccounts.length === 0) {
    return <WarningMessage1 />;
  } else if (creditAccountsWithBilling.length === 0) {
    return <WarningMessage2 />;
  } else {
    return <NormalHelpText />;
  }
})()}
```

This pattern allows for:
- Multiple variable declarations
- Conditional logic
- Clean JSX return statements
- No need for external state or effects
