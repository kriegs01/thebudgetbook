# Budee Pivot Roadmap

This document unifies all parked ideas, feature enhancements, and architectural revamps into a single, prioritized execution plan focused on the "Budee Social Pivot."

---

## ⏯️ Resumption Plan
*Immediate next steps to finalize the UI transition.*

- [ ] **Retro Sticker Login Page:** Update the `Auth.tsx` layout and elements to match the heavy pop-art aesthetic.
- [ ] **Unified Modal Overhaul:** Apply thick borders, offset shadows, and retro styling to all action modals app-wide.

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
- [ ] **Legacy Data Purge & Migration UI**
  - Fully remove old `localStorage` adapter code and fully commit to Supabase.
  - Build an "In-App Migration UI" so users can apply missing DB schema changes with a single click.

---

## 🤝 Phase 2: The Social Pivot
*Transforming the app from a personal ledger into a Venmo-style social finance tool.*

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
- [ ] **Setup Wizard Revamp**
  - Redesign and improve the initial onboarding and setup wizard flow for new users.

---

## 🐛 Bug Fixes & Additional Found Issues
*Recently discovered UX issues and bugs to address across various features.*

*(No pending bugs!)*

---

## 🗄️ Archive / Completed
*Completed tasks, features, and resolved bugs.*

- [x] **Visual Cohesion Refinement:** Harmonized sidebar and top-bar transitions during scroll (Continuous Frame approach) and refined shadow offsets for the retro sticker aesthetic.
- [x] **Retro Sticker UI Foundation:** Implemented thick-border "sticker" icons with hard shadows and rotation for Page Headers and Nav Drawer.
- [x] **Brand Voice Update:** Refreshed all page subtitles (Transactions, Billers, etc.) to align with the new Budee personality.
- [x] **Sidebar & Header Cleanup:** Tightened navigation spacing, fixed top-bar alignment, and adjusted action button positioning for better utility.
- [x] **Real-time Social Sync Foundation:** Enabled `supabase_realtime` replication, added global websocket listeners with Optimistic UI updates, and implemented RLS bypass via a Security Definer for secure transaction broadcasting.
- [x] **Real-time Notification Delays:** Fixed issue where transaction notifications required a page reload by correcting RLS policies and implementing optimistic UI state updates.
- [x] **People Page as a Relationship Ledger:** Upgraded the People page to act as "Shadow Profiles", showing rolled-up "Net Balances", and split profile views.
- [x] **Network "Add Friend" UI:** Built the slide-out search drawer ("Search by email or @handle") with mock skeleton states and invitation prompts.
- [x] **Transfer Fees (Split Approach):** Added an optional "Fee" input for internal bank transfers that splits the entry into a net-zero transfer + a separate expense transaction.
- [x] **Dashboard Budget:** Refactored hard-coded monthly budget in Dashboard so it is dynamic/user-specific.
- [x] **Transactions Page:** Added an "All Transactions" filter.
- [x] **Settings Bug:** Prevented the Setup Wizard from unintentionally triggering when toggling the people feature.
- [x] **Credit Account Statement:** Fixed issue where adding transactions dated exactly on the billing period end date causes them to be missing from the statement.
- [x] **Transactions:** Fixed "Transfer to Friends" functionality which is currently not working.
- [x] **Dashboard Debit Accounts:** Fixed issue where the debit accounts overview does not display the amount actually utilized/spent for each account.