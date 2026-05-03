# Budee: Social Budgeting App Pivot Notes

This document serves as a historical record and future reference guide for the transition of "Budget Book" into a collaborative, social-first personal finance application.

---

## 1. Rebranding & Naming Strategy

### The Initial Challenge
The original name, **"Budget Book"**, is classic and solid for a personal finance app. However, the word "Book" inherently implies something private, solitary, and offline (like a physical ledger or diary). To pivot toward a social app (friends, syncing, messaging, and shared tracking), the branding needs to reflect connection and collaboration.

### Brainstorming Progression
*   **Budget Buddy:** Friendly, inherently social, and approachable. *Drawback:* Highly likely to be generic or saturated in app stores.
*   **FinBuddy:** Sleek, tech-forward ("FinTech" + "Buddy"), and professional. *Drawback:* Might lose some of the casual charm of the word "Budget".
*   **Buddy:** Clever wordplay (Budget + Buddy share the "Bud-" root). *Drawback:* Terrible App Store Optimization (ASO) and SEO. Hard to discover among pet and dating apps.
*   **Budgee / Buds:** Adorable, brandable, allows for a mascot (a bird or a leaf).

### The Winning Choice: "Budee"
**Budee** hits the absolute sweet spot for the new brand identity:
*   **Highly Brandable & Searchable:** The unique spelling (like Lyft, Reddit, Fiverr) solves the generic SEO/ASO problem of the word "Buddy".
*   **Modern Tech Vibe:** It looks and feels like a modern startup.
*   **Short & Punchy:** Two syllables, five letters. Fits perfectly under an iOS/Android app icon.
*   **Subtle Wordplay:** It retains the "Bud-" root from "Budget" while sounding like "Buddy".

### Tagline Ideas
Since "Budee" doesn't have the word "finance" explicitly in it, marketing should pair it with clear taglines:
*   *Budee: Your Social Money Manager*
*   *Budee: Track, Split, and Save Together*
*   *Budee: Finance with Friends*

---

## 2. Foundational Data Model Shifts (Pre-Pivot)
Before introducing real-time social features, the local data model must be refined to support multi-user logic.

### Transaction Categorization
*   **Internal vs. External:** Internal Transfers (e.g., Checking to Savings) must be strictly treated as Net Zero (wealth hasn't changed). External transactions to people must be categorized as **Payments** (Expenses) or **Loans** (Debt). The "Withdraw" type should be reserved strictly for physical ATM cash-outs.
*   **Transfer Fees (The Split Approach):** When internal transfers incur fees, the fee should not be baked into the transfer amount. The system should create *two* transactions: one internal transfer, and one standard Payment (Expense) labeled "Transfer Fee" to keep expense tracking accurate.

### The Relationship Ledger
The current "People" page relies on text aliases. It needs to evolve into a Relationship Ledger. Clicking on an alias (e.g., "John") should reveal:
1.  **Active Balances:** Loans or split expenses they owe you (or vice versa).
2.  **Transaction History:** A venmo-style feed of every time money moved between you and this person, regardless of whether it created debt.

---

## 3. Planned Social Features

### The Friend System
*   **Friend Search:** Users can search for friends using email addresses or unique handles.
*   **Friend Requests:** A dedicated UI to send, accept, decline, or block connection requests.
*   **Shared Tracking:** Once connected, specific shared bills, split expenses, or IOUs (loans) sync automatically between both users' accounts.

### Real-Time Contextual Messaging
Leveraging **Supabase Realtime** (`supabase.channel('messages-realtime')`) to introduce instant chat:
*   **In-App Inbox:** A central hub (drawer or page) for all active conversations.
*   **Contextual Chat Boxes:** Chat interfaces embedded directly inside a specific Loan or Shared Expense view. Users can discuss a specific $50 dinner split right next to the remaining balance.
*   **Interactive Payment Messages:** Rich message blocks that include a "Pay Now" or "Remind" button, instantly triggering the app's transfer/collection modals.

---

## 4. Proposed Database Schema Expansion

To support the social features, the following tables and Row Level Security (RLS) policies will need to be added to the Supabase backend.

### `friendships` Table
Manages the social graph and connection status between users.
*   `id` (UUID, Primary Key)
*   `user_id` (UUID, Foreign Key to auth.users) - The sender
*   `friend_id` (UUID, Foreign Key to auth.users) - The receiver
*   `status` (TEXT) - e.g., `'pending'`, `'accepted'`, `'blocked'`
*   `created_at` (TIMESTAMPTZ)
*   `updated_at` (TIMESTAMPTZ)

### `messages` Table
Stores the chat history, supporting contextual links to financial records.
*   `id` (UUID, Primary Key)
*   `sender_id` (UUID, Foreign Key to auth.users)
*   `receiver_id` (UUID, Foreign Key to auth.users)
*   `content` (TEXT) - The actual message
*   `related_transaction_id` (UUID, nullable) - Links the chat to a specific split expense or transaction
*   `related_installment_id` (UUID, nullable) - Links the chat to a specific loan/installment
*   `message_type` (TEXT) - e.g., `'text'`, `'payment_request'`, `'settled_notification'`
*   `read_at` (TIMESTAMPTZ, nullable)
*   `created_at` (TIMESTAMPTZ)

### Schema Updates for "Shadow Profiles" (Migration Strategy)
To migrate users gracefully from local text aliases to real connected friends without data loss, we will use a "Merge/Claim" system.
*   **`transactions` and `installments` tables:** Add a nullable `friend_user_id` (UUID, Foreign Key). 
*   **Migration Flow:** Existing transactions will retain their string `person_name`. Once a real friend is added, the UI will prompt the user to "Merge" the new connection with a local alias, backfilling the `friend_user_id` on historical records.

---

## 5. Phased Rollout Strategy

**Phase 1: The Local Foundation (Refactoring)**
*   Implement the explicit separation of internal vs. external transactions.
*   Transition away from "Withdraw" for people; implement the Split Approach for Transfer Fees.
*   Revamp the People page locally into a Relationship Ledger (History & Balances) using current text aliases.

**Phase 2: Backend Infrastructure**
*   Deploy `friendships` and `messages` tables.
*   Add `friend_user_id` to `transactions` and `loans`.
*   Set up Supabase Realtime channels and RLS policies for multi-user access.

**Phase 3: Connection & Migration (The "Merge")**
*   Build the friend search and request UI.
*   Implement the "Merge Alias" UI prompt to convert shadow profiles into real connections.
*   Write backend migration logic to link historical alias data to the new `friend_user_id`.

**Phase 4: Collaborative Features (The Pivot)**
*   Enable Shared Tracking (auto-syncing split expenses and IOUs across accounts).
*   Launch Contextual Chat Boxes (messaging linked to `related_transaction_id`).
*   Introduce interactive Payment requests in chat.