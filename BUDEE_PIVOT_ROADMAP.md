# Budee Pivot Roadmap

This document unifies all parked ideas, feature enhancements, and architectural revamps into a single, prioritized execution plan focused on the "Budee Social Pivot."

---

## ⏯️ Resumption Plan
*Immediate next steps to finalize the UI transition.*

- [ ] **Persist Budget view state in URL** to prevent reset on reload.
- [ ] **Mobile Top Padding:** Add spacing between the subtitle and top bar on mobile for `Budgets`, `Billers`, `Installments`, `Accounts`, `Wallet`, `People`, and `Settings` pages to ensure visual consistency. *(Note: Partially implemented; needs to be applied to all pages.)*
- [ ] **Retro Sticker Login Page:** Update the `Auth.tsx` layout and elements to match the heavy pop-art aesthetic.
- [ ] **Unified Modal Overhaul:** Apply thick borders, offset shadows, and retro styling to all action modals app-wide.

---

## 🧱 Phase 1: Core Financials & Foundation
*Solidifying the base financial engine and paying off tech debt before expanding into multiplayer/social features.*

### ⭐ Key Initiatives
*High-level goals for this phase.*

- [X] **Stash & Allowance Rework:** Transition the "Fixed" budget category into a more robust "Stash" system. This involves creating dedicated "Stash Wallets" that users can fund and draw from, replacing the legacy concept of monthly allowances.
- [ ] **Multiplayer MVP:** Implement the foundational backend and frontend components for shared financial spaces. This is the first step towards social budgeting.
- [ ] **UI Refresh:** Overhaul the visual identity of the app to be more modern, friendly, and visually engaging, moving away from the current minimalist aesthetic.

### ✨ Features & Enhancements
*Specific, actionable items to be implemented.*

- [X] **Budget Setup:** Add a "Stash" category to the budget setup screen.
- [X] **Stash Wallets:** Create a new table for "Stash Wallets" with fields for `name`, `target_amount`, `current_balance`, and `user_id`.
- [X] **Friendship System:**
    - [X] Create a `friendships` table with columns for `user_id_1`, `user_id_2`, and `status` (e.g., 'pending', 'accepted').
    - [X] Develop a "People" page where users can send, accept, and reject friend requests.
- [x] **Transaction Tagging:**
    - [X] Add a `tagged_user_id` column to the `transactions` table.
    - [x] Allow users to tag a friend in a transaction.
- [ ] **Shared Spaces:** 
    - [ ] Design a new "Shared Spaces" feature where users can create a group with friends.
    - [ ] Implement a `spaces` table and a `space_members` pivot table.

---

## 🚀 Phase 2: Social Budgeting MVP
*Launching the initial "multiplayer" version of Budee.*

### ⭐ Key Initiatives
- [ ] **Shared Budgets:** Allow users within a "Shared Space" to contribute to a unified budget.
- [ ] **Activity Feed:** Create a social feed to show friends' financial activities (with privacy controls).
- [X] **Notifications:** Implement a notification system for friend requests, shared space invites, and transaction tags.

### ✨ Features & Enhancements
- [ ] **Shared Budget Setup:** Adapt the budget setup screen for shared spaces.
- [ ] **Feed Component:** Build the UI for the social activity feed.
- [ ] **Notification Panel:** Create a dropdown or page to display notifications.

---

## 🐛 Current Bugs
*A prioritized list of bugs that are actively being worked on or are pending investigation.*

- [ ] **Payment Schedule Generation:** When a biller's deactivation date is the first of the month, the schedule for the previous month is not correctly generated, causing the biller to disappear one month too early.
- [ ] **Budget Setup Categories:** The table for categories is showing duplicate header labels (e.g., "Stashes").

---

## 🗄️ Archive / Completed
*Completed tasks, features, and resolved bugs.*

- [x] **PWA Routing Issue:** When added to the home screen, clicking links (e.g., to the Dashboard) opens a separate web view instead of navigating within the app. Closing the web view does not take the user to the intended page.
- [x] **Fix Budget Setup header padding:** Adjusted padding on the Budget Setup screen for better visual alignment.
- [x] **Stash & Allowance Rework:** Initial planning and data modeling for the "Stash" wallet system.
- [x] **UI Refresh:** Initial design mockups and component library updates for the new retro-pop aesthetic.
- [x] **Onboarding Flow:** Fix issue where the "People" feature toggle in the onboarding wizard was not being correctly saved, causing the feature to be disabled by default.
- [x] **Dashboard Budget:** Refactored hard-coded monthly budget in Dashboard so it is dynamic/user-specific.
- [x] **Transactions Page:** Added an "All Transactions" filter.
- [x] **Settings Bug:** Prevented the Setup Wizard from unintentionally triggering when toggling the people feature.
- [x] **Credit Account Statement:** Fixed issue where adding transactions dated exactly on the billing period end date causes them to be missing from the statement.
- [x] **Transactions:** Fixed "Transfer to Friends" functionality which is currently not working.
- [x] **Dashboard Debit Accounts:** Fixed issue where the debit accounts overview does not display the amount actually utilized/spent for each account.
- [x] **Budget Setup Header:** Refactored the `PageHeader` component to conditionally hide the subtitle and reposition the back button for a cleaner layout on the setup screen.
- [x] **`Budget.tsx` Syntax Errors:** Resolved a series of critical syntax errors (including missing exports and component closings) that were causing the Budget page to fail with a white screen.
