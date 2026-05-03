# Proposed Architecture & Income Frequency Revamp

This document outlines two major structural improvements for the Budget Book app to enhance scalability, maintainability, and user experience.

## 1. Feature-Based Architecture (Modularization)

Currently, a lot of business logic, state management, and UI rendering is concentrated in page-level components (e.g., `pages/Budget.tsx`, `pages/Installments.tsx`). 

By adopting a **Feature-Based Architecture**, we will encapsulate everything related to a specific domain into its own isolated module.

### Proposed Directory Structure
```text
src/
  features/
    billers/
      components/
        BillerCard.tsx
        BillerFormModal.tsx
      hooks/
        useBillers.ts          // Data fetching and state management
      utils/
        billerCalculations.ts  // Logic for cycles and amounts
    installments/
      components/
        InstallmentList.tsx
        PayInstallmentModal.tsx
      hooks/
        useInstallments.ts
    budgets/
      ...
```

### Benefits
* **Easier Maintenance:** If there's a bug in how Billers calculate cycles, it's isolated to the `features/billers` directory without affecting Budgets or Installments.
* **Reusability:** Modular components (like `<BillerCard />`) can be easily dropped into a Dashboard or other pages without duplicating logic.
* **Cleaner Pages:** Page files act purely as layout wrappers that import and compose these modular components.

---

## 2. Income Frequency Revamp

The current system relies on a static "1/2" and "2/2" timing model. This revamp shifts to a **dynamic, date-anchored model** to better support various pay schedules natively.

### A. Weekly & Fortnightly (Anchor-Day Logic)
* **Mechanism:** Users select a frequency ("Weekly" or "Fortnightly") and an **Anchor Day** (e.g., "Friday").
* **System Action:** The app dynamically generates pay periods by finding all anchor days in the current month.
  * *Weekly:* Creates 4-5 pay periods per month.
  * *Fortnightly:* Calculates every 14 days from a user-defined starting date.

### B. Monthly & Semi-Monthly (Fixed-Date Logic)
* **Mechanism:** 
  * *Semi-monthly:* Defaults to the 15th and End of Month (handles February's 28th/29th and 31-day months gracefully).
  * *Monthly:* Defaults to the 1st or the End of the Month based on user preference.

### C. Distributing Payables (The "Smart Bucket" System)
* To distribute billers and installments automatically, the system maps the **Due Date** of the payable to the **Closest Previous Paycheck**.
* *Example:* For a Semi-Monthly setup (15th and 30th) and a Biller due on the 22nd, the system automatically assigns this biller to the **15th's Pay Period** (as those are the funds used to pay it).

### Database Implications
Currently, tables like `billers` and `budget_setups` use a `timing` column expecting `"1/2"` or `"2/2"`. To support this revamp, we will need to:
1. Introduce a schema to store user income frequency preferences (e.g., `income_type`, `anchor_date`, `anchor_day`).
2. Migrate from hardcoded timing strings to dynamically generated `pay_period` references.
3. Create utility functions that evaluate due dates against generated pay periods to establish mapping dynamically.