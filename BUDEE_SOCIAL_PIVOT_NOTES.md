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

## 2. Planned Social Features

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

## 3. Proposed Database Schema Expansion

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

---

## 4. Next Steps for Implementation
1.  **Database Migration:** Draft and apply the SQL migration for `friendships` and `messages`, ensuring RLS policies restrict access to involved parties only.
2.  **Service Layer:** Build `friendshipsService.ts` and `messagesService.ts` to wrap the Supabase queries.
3.  **UI Updates:** 
    *   Upgrade the `People.tsx` page to handle real network requests instead of local aliases.
    *   Design and build the contextual chat drawer.