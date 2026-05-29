# Budee Pivot Roadmap

This document unifies all parked ideas, feature enhancements, and architectural revamps into a single, prioritized execution plan focused on the "Budee Social Pivot."

---

## ⏯️ Resumption Plan
*Immediate next steps to finalize the UI transition.*

- [ ] **Final Logo Polish:** Implement the final logo design: Titan One font in white with a black drop shadow. On splash screens, animate the logo text to cycle through the main accent colors before the app loads.
- [ ] **Biller Modals Theming:** Apply the retro sticker theme to the "Edit Biller" and "Pay Schedule" modals to ensure a consistent user experience.
- [ ] **Budget Page Layout:** Replicate Biller page's table/container margin/width for mobile consistency.
- [ ] **Budget Setups Page UI:** Resume mobile optimization and implement card layout for all budget item categories.
- [ ] **Persist Budget view state in URL** to prevent reset on reload.
- [ ] **Mobile Top Padding:** Add spacing between the subtitle and top bar on mobile for `Billers`, `Installments`, `Accounts`, `Wallet`, `People`, and `Settings` pages to ensure visual consistency. *(Note: Partially implemented; needs to be applied to all pages.)*
- [ ] **Retro Sticker Login Page:** Update the `Auth.tsx` layout and elements to match the heavy pop-art aesthetic.
- [ ] **Unified Modal Overhaul:** Apply thick borders, offset shadows, and retro styling to all action modals app-wide.
- [ ] **Disable PWA Zoom:** Prevent zooming in the PWA on mobile devices to maintain a consistent, app-like experience.
- [ ] **Password Autofill Bug:** Dot masked password showing when using passwords/autofill instead of randomized shapes.

---

## ✨ Social & Mobile-First Pivot (Core Features)

### High Priority
- [ ] **Real-time Messaging:**
  - [ ] Implement core real-time chat functionality between "budees".
  - [ ] Add read receipts and typing indicators.
- [ ] **Social Profile v1:**
  - [ ] Design and build user profile pages (name, avatar, status).
  - [ ] Allow users to add and remove "budees" (friends).
- [ ] **Push Notifications:**
  - [ ] Set up basic push notification infrastructure.
  - [ ] Send notifications for new messages and friend requests.

### Medium Priority
- [ ] **"Settle Up" Feature:**
  - [ ] Allow users to create shared expenses and track who paid.
  - [ ] Integrate with messaging to send "settle up" requests.
- [ ] **Group Stash (Shared Wallets):**
  - [ ] Enable creation of shared "Stash" wallets for group savings goals.
  - [ ] Track contributions from each member.
- [ ] **Goals & Wishlists:**
  - [ ] Allow users to create shareable wishlists with items (link, image, price).
  - [ ] Mark items as "purchased" to automatically create a transaction.

### Low Priority
- [ ] **Feed Activity:**
  - [ ] Create a social feed showing friend activities (e.g., "User X started a new Stash for Vacation").
  - [ ] Implement privacy controls for feed visibility.
- [ ] **Reactions & Comments:**
  - [ ] Add emoji reactions to feed items.
  - [ ] Allow commenting on feed activities.

---

## 🛠️ Architectural & UX Enhancements

### High Priority
- [ ] **Component Library Refinement:** Continue refactoring key components into a more robust, reusable library.
- [ ] **End-to-End Testing:** Implement initial end-to-end tests for critical user flows (e.g., login, budget creation, transaction logging).

### Medium Priority
- [ ] **Themed In-App Numpad:** Design and implement a retro sticker-themed numeric keypad for PIN and amount inputs to ensure brand consistency.
- [ ] **Smart Budget Creation:** Refactor the 'Open New' button logic on the Budget page to automatically select the next logical month and timing (1/2 or 2/2) based on the most recent existing budget setup. This will streamline the process of creating consecutive budget plans.
- [ ] **Budget Setup Gallery:** Implement a "cover flow" style carousel for budget setups, where one item is centered and focused, and users can swipe to bring other budgets to the center stage.
- [ ] **Offline Mode (PWA):**
  - [ ] Implement service workers for basic offline viewing of cached data.
  - [ ] Queue mutations (creates, updates, deletes) and sync when back online.
- [ ] **Accessibility (A11y) Audit:** Conduct a full accessibility review and implement high-priority fixes (e.g., keyboard navigation, screen reader support).
- [ ] **Internationalization (i18n):** Abstract all user-facing strings to prepare for multi-language support.

---

## ✅ Done
- [x] **Biller View Page Overhaul:** Completely revamped the biller details page with the retro sticker theme.
    - **Consistent Styling:** Applied the grayish card color and retro sticker buttons for a cohesive look.
    - **Responsive Layout:** Ensured the biller details and payment schedule table are fully responsive and look great on all screen sizes.
    - **Dynamic Theming:** The table header and other elements now react to the randomized accent color.
    - **UI/UX Fixes:** Corrected button alignments, fixed the header title color issue, and improved overall layout and readability.
    - **Design Documentation:** Created `Font Choice Options.md` to document typeface decisions.
- [x] **Budget Setups Page (Partial):** Applied retro sticker theme to summary cards and fixed critical JSX rendering errors in `Budget.tsx`.
- [x] **Card-Style Budget List:** Applied a card-based layout to the budget setups list on the Budget page, improving readability and visual organization on mobile.
- [x] **Responsive Transaction Modals:** Ensured retro sticker-themed transaction modals (payment, loans, transfer) are proportionally sized on mobile, overlay the top bar, and do not cause horizontal scrolling.
- [x] **Budget Setup Header Refinement:** Further improved the `PageHeader` component for visual consistency across all screen sizes.
    - **Dynamic Highlight:** The decorative highlight is now dynamically sized to perfectly match the full width of the title and its accompanying icon.
    - **Fluid Typography:** Implemented fluid font sizing for the title and subtitle, allowing them to scale smoothly with the viewport and preventing text from wrapping on smaller screens.
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
- [x] **Budget Page Header Refactor:** Swapped the position of the title and subtitle in the PageHeader component for better information hierarchy and adjusted layout spacing.
- [x] **Budget Pay Button:** Fixed a bug where the "Pay" button was not appearing for manually added items in flexible budget categories (e.g., Utilities, Subscriptions).
- [x] **UI Cleanup (Top Bar & Budget Setup):** Implemented a series of minor UI refinements for better visual consistency.
    - **Top Bar:** Removed rotation effects from header buttons and corrected the user profile button's shadow and size for alignment.
    - **Budget Setup Page:** Left-aligned the back button on desktop views to improve layout and control placement.
