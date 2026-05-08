# Budee Pivot Roadmap

This document unifies all parked ideas, feature enhancements, and architectural revamps into a single, prioritized execution plan focused on the "Budee Social Pivot."

---

## 🧱 Phase 1: Core Financials & Foundation
*Solidifying the base financial engine and paying off tech debt before expanding into multiplayer/social features.*

- [ ] **Income Frequency Revamp**
  - Shift from static "1/2 & 2/2" to dynamic anchor dates (Weekly, Fortnightly, Semi-Monthly).
  - Implement "Smart Bucket" distribution (auto-mapping biller due dates to the closest previous paycheck).
- [ ] **Advanced Installment Management**
  - Support Bulk Payments (pay multiple schedules at once).
  - Support Partial Payments (split a single payment across schedules).
  - Build a dedicated Payment History view per installment.
- [x] **Transfer Fees (Split Approach)**
  - Add an optional "Fee" input for internal bank transfers that splits the entry into a net-zero transfer + a separate expense transaction.
- [ ] **Legacy Data Purge & Migration UI**
  - Fully remove old `localStorage` adapter code and fully commit to Supabase.
  - Build an "In-App Migration UI" so users can apply missing DB schema changes with a single click.

---

## 🤝 Phase 2: The Social Pivot
*Transforming the app from a personal ledger into a Venmo-style social finance tool.*

- [x] **People Page as a Relationship Ledger**
  - Upgrade the People page to act as "Shadow Profiles" using a `person_name` transaction tag.
  - Show a rolled-up "Net Balance" per person.
  - Split profile views into "Active Balances" vs "Transaction History".
- [x] **Network "Add Friend" UI**
  - Build the slide-out search drawer ("Search by email or @handle").
  - Add mock skeleton states and invitation prompts to prime users for real connections.
- [ ] **Contextual Pay (Chat Integration)**
  - Wire up the "Pay Now" button on inline chat request cards.
  - Instantly trigger the Transfer modal with pre-filled amounts based on chat context.
- [ ] **Contextual Verification (OCR)**
  - Integrate `Tesseract.js` for Receipt OCR.
  - Auto-scan uploaded payment receipts to verify the amount and last 4 digits before allowing the recipient to log the transaction.

---

## 🏗️ Phase 3: Architecture & Admin Control
*Structural changes required to support a growing codebase and safely manage active users.*

- [ ] **Feature-Based Modularization**
  - Refactor giant page components (e.g., `pages/Budget.tsx`) into isolated feature folders (`src/features/billers/`, `src/features/installments/`).
- [ ] **Feature Flag System**
  - Create a `feature_flags` table in Supabase with Real-time listeners.
  - Wrap main app modules so features can be instantly toggled into "Maintenance Mode".
- [ ] **Off-Site Admin Dashboard**
  - Build a standalone, lightweight Vercel app (e.g., `admin.budee.com`).
  - Securely toggle feature flags without exposing admin logic in the main app bundle.
- [ ] **Automated Testing Suite**
  - Add Unit, Integration, and E2E tests specifically covering the complex Installment and Biller payment calculation flows.

---

## ✨ Phase 4: Polish, Security & PWA
*Enhancing the user experience, locking down security, and making it feel like a native app.*

- [ ] **Advanced Authentication & Security**
  - Build Password Reset & Email Verification flows.
  - Add Social Auth (Google, GitHub) and Two-Factor Authentication (2FA).
  - Set up logging for failed login attempts and new sign-ups.
- [ ] **User Profile Management**
  - Create a dedicated profile page for managing avatars, handles, and account preferences.
- [ ] **PWA & Offline Support**
  - Add a Service Worker to allow the app to work offline or on spotty connections.
  - Enable full Progressive Web App (PWA) manifest so users can install it to their phone home screens.
- [ ] **Performance Optimizations**
  - Implement React Code Splitting by route.
  - Enable Vercel Image Optimization for uploaded receipts and avatars.

---

## 🐛 Bug Fixes & Additional Found Issues
*Recently discovered UX issues and bugs to address across various features.*

- [ ] **Connect Feature:** Fix noticeable delay when sending connect requests.
- [ ] **Friends/Connect Message Sync:** Fix delay in received messages appearing (notification alert shows, but message is missing in the messages window).
- [x] **Dashboard Budget:** Refactor hard-coded monthly budget in Dashboard so it is dynamic/user-specific.
- [ ] **Transactions Page:** Add an "All Transactions" filter.
- [ ] **Settings Bug:** Prevent the Setup Wizard from unintentionally triggering when toggling the people feature.
- [x] **Credit Account Statement:** Fix issue where adding transactions dated exactly on the billing period end date causes them to be missing from the statement.
- [x] **Transactions:** Fix "Transfer to Friends" functionality which is currently not working.
- [x] **Dashboard Debit Accounts:** Fix issue where the debit accounts overview does not display the amount actually utilized/spent for each account.

---
*Note: As items are completed, move them to an "Archive/Completed" section at the bottom of this document.*