
# UI Overhaul Checklist

This checklist is designed to ensure that all UI components are updated consistently during the application overhaul. Mark each item as complete before moving to the next major section.

## Guiding Principles

- **Consistency:** All forms, buttons, and visual elements should have a consistent look and feel.
- **Clarity:** Use clear and simple language (e.g., "Pay" instead of "Add Purchase Transaction").
- **Single Source of Truth:** UI should always reflect the database state, with automatic updates.
- **Type Safety:** All new components should be built with TypeScript.

---

## ✅ Global Components

- [ ] **Forms:**
    - [ ] All forms use standardized labels, fields, and styling.
    - [ ] Unnecessary fields (like Receipt Upload) have been removed from old forms.
    - [ ] All "Pay" or "Add" forms are consistent.
- [ ] **Buttons:**
    - [ ] All buttons use the `IconSquircleButton` style.
    - [ ] Button labels are clear and concise.
- [ ] **Modals:**
    - [ ] All modals (`ChangePinModal`, `SetPinModal`, `VerifyPinModal`) have the new UI style.
- [ ] **Navigation:**
    - [ ] The main navigation/menu is updated.
    - [ ] `DashboardHeader.tsx` reflects the new design.

---

## ✅ Page-Specific Components

### 📄 `pages/Dashboard.tsx`
- [ ] `DashboardHeader.tsx` is implemented correctly.
- [ ] `FloatingHUD.tsx` is styled and positioned correctly.
- [ ] `TestModeBanner.tsx` is styled correctly.

### 📄 `pages/Accounts.tsx`
- [ ] **Main Page:**
    - [ ] The list of accounts has the new UI.
    - [ ] The "Add Account" button is updated.
- [ ] **`pages/accounts/[id].tsx` (Account Detail):**
    - [ ] Account details are displayed with the new styling.
- [ ] **`pages/accounts/statement.tsx` (Statement View):**
    - [ ] Statement generation and display have been updated.
- [ ] **`pages/accounts/view.tsx` (Account View):**
    - [ ] All elements on this page are updated.

### 📄 `pages/Billers.tsx`
- [ ] The list of billers has the new UI.
- [ ] The "Add Biller" form is standardized.
- [ ] The "Pay Biller" action uses the new standardized "Pay" form.

### 📄 `pages/Budget.tsx`
- [ ] `BudgetSetupsList.tsx` has the new UI.
- [ ] The "Add Budget Setup" form is standardized.

### 📄 `pages/Installments.tsx`
- [ ] The list of installments has the new UI.
- [ ] The **Progress Bar** for each installment:
    - [ ] Reflects the actual database state.
    - [ ] Updates automatically when a transaction is added or deleted.
- [ ] The "Add Installment" form is standardized.
- [ ] The "Pay" action for an installment uses the new standardized "Pay" form.

### 📄 `pages/People.tsx`
- [ ] `PersonAutocomplete.tsx` is styled correctly.
- [ ] The list of people has the new UI.
- [ ] The "Add Person" form is standardized.

### 📄 `pages/Settings.tsx`
- [ ] All settings sections are updated.
- [ ] `SecuritySettings.tsx` is styled correctly.
- [ ] The PIN modals (`ChangePinModal`, `SetPinModal`, `VerifyPinModal`) are triggered correctly from this page.

### 📄 `pages/transactions.tsx`
- [ ] `TransactionList.tsx` has the new UI.
- [ ] Transaction amounts and signs display correctly (e.g., negative for expenses).
- [ ] The "Add Transaction" form is standardized.

### 📄 `pages/Auth.tsx` & `pages/update-password.tsx`
- [ ] The login, signup, and update password forms are all styled consistently.
