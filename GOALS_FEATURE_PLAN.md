# Feature Plan: Goals & Wishlists

This document outlines the plan for implementing a new "Goals" feature, as suggested. This feature aligns perfectly with the social-first direction of the Budee application.

## 1. Core Concept

A "Goals" feature will allow users to create shareable wishlists or moodboards. Users can add items they want to save for, including:
- Item Name/Title
- An image URL
- A link to the item (e.g., a store page)
- The price of the item

When a user decides to purchase an item from their goal list, they can mark it as "purchased," which will then automatically create a corresponding transaction in their budget.

## 2. Alignment with Social Pivot

This feature is a natural extension of the social features being introduced, as detailed in `BUDEE_SOCIAL_PIVOT_NOTES.md`.
- **Shareability:** Users can share their "Goals" with friends ("Budies") within the app, making things like birthday or holiday wishlists easy to manage and view.
- **Collaboration:** We can leverage the real-time messaging features to allow users to comment on each other's goal items.

## 3. Technical Implementation Plan

Following the "Feature-Based Architecture" from `PROPOSED_ARCH_AND_INCOME_REVAMP.md`, we will encapsulate this feature into its own module.

### New Components:
- **`pages/Goals.tsx`**: A new top-level page to display the user's goals and wishlists.
- **`src/components/GoalItem.tsx`**: A component to display a single item in a goal list.
- **`src/components/modals/AddGoalItemModal.tsx`**: A modal for adding a new item to a goal list.

### New Services & Database:
- **`src/services/goalsService.ts`**: A new service to handle CRUD operations for goals and goal items.
- **Supabase Table `goals`**:
    - `id` (uuid, primary key)
    - `user_id` (foreign key to `profiles.id`)
    - `name` (text)
    - `description` (text, nullable)
    - `is_public` (boolean, default false)
- **Supabase Table `goal_items`**:
    - `id` (uuid, primary key)
    - `goal_id` (foreign key to `goals.id`)
    - `name` (text)
    - `price` (numeric)
    - `image_url` (text, nullable)
    - `item_url` (text, nullable)
    - `purchased_at` (timestamp, nullable)
    - `purchased_transaction_id` (foreign key to `transactions.id`, nullable)

### Enhancement: Image Extraction from URL

To provide a seamless user experience, we will automatically extract images from the `item_url`.

- **Trigger:** When a user provides an `item_url` in the `AddGoalItemModal.tsx`, the client will invoke a dedicated Supabase Edge Function.
- **Server-Side Logic (Supabase Edge Function):**
    1. The function receives the target URL.
    2. It uses a server-side HTTP client to fetch the raw HTML content of the page, bypassing browser CORS restrictions.
    3. It parses the HTML using a library (e.g., `cheerio`).
    4. It queries the parsed document to extract image sources, prioritizing high-quality social sharing images (e.g., from `<meta property="og:image" ...>` tags) before scanning for standard `<img>` tags.
    5. It compiles a list of absolute image URLs and returns it to the client as a JSON array.
- **Client-Side Logic (`AddGoalItemModal.tsx`):**
    1. On receiving the list of image URLs, the modal displays them in a simple, selectable gallery.
    2. The user clicks an image to select it as the goal's cover photo.
    3. The URL of the selected image is stored in the `image_url` field for the `goal_item` upon saving.

### Integration with Existing Features:
- **People/Friends:** We will use the existing `friendships` data and `PersonAutocomplete.tsx` component to manage sharing permissions for goals.
- **Transactions:** When an item is marked as purchased, `goalsService.ts` will call `transactionsService.ts` to create a new expense transaction.
- **Real-time:** We can use Supabase Realtime to update shared goal lists instantly and to power comments.

This plan provides a solid foundation for developing the "Goals" feature in a way that is consistent with the app's existing architecture and future direction.