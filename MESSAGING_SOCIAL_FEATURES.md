# Proposed Messaging & Social Features

## Overview
Transforming the Budget Book into a more collaborative app by introducing a friend system and real-time messaging. This will make it easier to track shared expenses, remind friends of pending loan payments, and send interactive payment requests.

Since the app already uses Supabase for authentication and database management, these features will leverage **Supabase Realtime** for instant chat updates.

---

## Phase 1: Database Infrastructure
We need to expand the Supabase schema to support connections between users and the messages they send.

*   **`friendships` Table:**
    *   `id` (UUID)
    *   `user_id` (UUID) - the user sending the request
    *   `friend_id` (UUID) - the user receiving the request
    *   `status` (TEXT) - e.g., 'pending', 'accepted', 'blocked'
    *   `created_at` (TIMESTAMPTZ)

*   **`messages` Table:**
    *   `id` (UUID)
    *   `sender_id` (UUID)
    *   `receiver_id` (UUID)
    *   `content` (TEXT)
    *   `related_transaction_id` (UUID, nullable) - For context-specific chats (e.g., chatting about a specific loan)
    *   `related_installment_id` (UUID, nullable)
    *   `read_at` (TIMESTAMPTZ, nullable)
    *   `created_at` (TIMESTAMPTZ)

---

## Phase 2: The Friend System (UI & Logic)
Upgrade the existing local "aliases" in the People page into a fully-fledged friend network.

*   **Friend Search:** Allow users to search for others using their email address.
*   **Friend Requests:** UI to send, accept, or decline friend requests.
*   **Shared Tracking:** Once accepted, loans or shared transactions can automatically sync between both users' accounts.

---

## Phase 3: Real-Time Messaging & Contextual Chat
Implement the chat interface using `supabase.channel('messages-realtime')`.

*   **In-App Inbox:** A dedicated "Messages" slide-out drawer or page to view all active conversations.
*   **Contextual Chat Boxes:** Embed a chat window directly inside a Loan or Shared Bill detail view. This allows users to discuss a specific payment ("Hey, reminding you about the $50 for dinner!") right next to the remaining balance.
*   **Interactive Payment Requests:** Allow users to send rich messages containing a "Pay Now" button, which directly triggers the Cash In / Transfer modals for seamless settlement.

---

## Next Steps
1. Draft the SQL migration file to create the `friendships` and `messages` tables along with their Row Level Security (RLS) policies.
2. Build out the frontend API services (`friendshipsService.ts` and `messagesService.ts`).
3. Create the "Add Friend" UI components.