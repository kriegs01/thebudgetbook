# May 4, 2026 (Part 2) - Touchbase Notes

## Summary of Plans & Actions Taken Today
Today we officially launched **Phase 2** of the Budee social pivot, transitioning the app from a single-player ledger to a multi-player collaborative environment.

### 1. Database & Schema Expansion
- Created the `friendships` table to manage the social graph (pending, accepted, blocked).
- Created the `messages` table to prepare for contextual chat.
- Upgraded `transactions`, `installments`, and the shadow `people` tables to include a `friend_user_id` column to permanently link local data to real users.
- Added `email` and `username` (handles) to `user_profiles` and configured Row Level Security (RLS) to allow authenticated users to search public profiles globally.

### 2. API Service Layer
- Built `friendshipsService.ts` to handle user search, sending Connect Requests, fetching pending incoming requests, and accepting/declining connections.

### 3. UI & Layout Overhaul
- **App Layout:** Redesigned the main layout to include a sleek Top Navigation bar. 
- **Notification Center:** Added a dynamic Bell icon in the top nav that fetches incoming Connect Requests and presents them in a dropdown with "Accept" and "Decline" actions.
- **Settings Placement:** Moved the Settings button to a permanent, un-hideable spot at the bottom of the navigation drawer.
- **People Page Enhancements:** 
  - Replaced mock loaders with live database searches for the "Find Friends" UI.
  - Added live "Linked" (green) and "Pending Link" (yellow) badges to the People cards.
  - Refactored the `Edit Profile` modal to link local shadow aliases to real Budee accounts.
  - Stripped double-padding to fix header spacing and made the Top Nav and Sidebar proportionally slimmer.

---

## Where We Left Off & Next Steps

We successfully verified that sending Connect Requests works perfectly (the receiving user gets the notification in their dropdown). However, we ran into three specific UX/logic issues during the acceptance and account linking flows.

### Raised Issues
1. **Success Check:** Sending a connect request is working well; the receiving user gets it instantly in the notification window.
2. **Missing Profiles on Accept:** When a user clicks "Accept" on a Connect Request, no shadow profiles are being generated/added to the `people` table for either user, leaving them connected in the backend but invisible in the People UI.
3. **Constrained Linking Search:** In the "Edit Profile -> Link Account" flow, the search result automatically constrains to the first matched user (`data[0]`). There is no option to see a list, select the correct user, or explicitly trigger the request, causing the "Pending Link" badge workflow to break or feel unresponsive.

### Proposed Resolutions (To execute next session)

**For Issue 2 (Missing Profiles):**
- *The Fix:* We will refactor the acceptance logic. Right now, `App.tsx` tries to generate a profile for the receiver, but the sender is left in the dark. We will update the `loadData` function inside `People.tsx` so that whenever it detects an 'accepted' friendship that doesn't have a local `people` alias, it will dynamically fetch that user's profile and auto-insert the shadow profile for *both* users seamlessly on page load.

**For Issue 3 (Constrained Linking Search):**
- *The Fix:* We will upgrade the `Edit Profile` modal's search UI to mirror the `Find Friends` list UI. Instead of auto-selecting the first match, it will display a scrollable list of matches (showing their Monogram, Name, and @handle). 
- The user will click "Link" next to the correct profile. This action will explicitly fire the `sendFriendRequest()` function, update the local alias with the target's `user_id`, and perfectly trigger the yellow **"⏳ Pending Link"** badge while awaiting the other user's approval.

---

**Next Session Focus:**
- Apply the fixes for Issues 2 & 3.
- Test the complete end-to-end flow: Search -> Link -> Pending Badge -> Accept -> Auto-Profile Generation -> Green Linked Badge.
- Move to Phase 3: Synchronizing shared transactions and Contextual Chat.