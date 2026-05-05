# May 5, 2026 Touchbase Notes

## Actions Made Today (Part 1 - Architecture & Rebranding)

1. **App Rebranding to "Budee"**
   - Replaced "Budget Book" with "Budee" across the application (Sidebar, Auth/Login, Splash Screen, Reset Password).
   - Successfully integrated the **Titan One** Google Font.
   - Applied a marine blue to purple text gradient (`from-blue-600 to-purple-600`) to the logo text and scaled up the sizes for better proportion across devices.

2. **People & Connections Architecture Refactor**
   - Moved away from forced, bidirectional shadow-profile creation due to Row Level Security (RLS) database restrictions.
   - Split the `People.tsx` interface into two distinct tabs:
     - **Local Profiles:** Traditional local address book.
     - **My Budies:** Dedicated list of connected friends fetched dynamically via the relationships table.
   - Decoupled the "Match Found" modal to stop infinite looping when users connect. 
   - Added manual "Create Profile" and "Link Existing" action buttons directly on the "My Budies" list.

3. **Transaction Flow Interception**
   - Built a custom `ContactDropdown` for transaction forms to replace the standard text autocomplete.
   - Implemented logic to intercept transactions when an unlinked "Budee" is selected, prompting the user to instantly create a local profile for them before the transaction saves.

4. **Build Fixes & Schema Cache**
   - Resolved `esbuild` syntax errors caused by escaped backticks inside template literals across `People.tsx` and `transactions.tsx`.
   - Added missing `friend_user_id` to the local `people` table and forcefully reloaded the PostgREST schema cache to resolve linking failures.

## Actions Made Today (Part 2 - Phase 3 Shared Transactions)

1. **Inbox & Pending Sync Architecture**
   - Created the `pending_transactions` table to serve as an Inbox for incoming shared money (Loans, Transfers, Payments).
   - Added a "Default Deposit Account" preference in the `Settings.tsx` page to handle automated routing of accepted funds.
   - Hooked the Top Navigation Bell Icon to display both pending Friend Requests and pending Inbox Transactions. Users can pick a deposit account on the fly and click "Accept" or "Decline".

2. **Historical Sync & Review Modal**
   - Added background scanning logic in `People.tsx` to detect past shared transactions that haven't been pushed to newly linked Budies.
   - Built a robust **Review & Sync** modal, allowing users to specifically select which historical ledger items to push to their friends' inboxes.

3. **Ledger Logic & "Pay Back" Flow**
   - Refined the transaction interception so when a user accepts a loan, it logs correctly as `isBorrowed = true`.
   - Transformed the standard "Collect" button into a red **"Pay Back"** button for borrowers.
   - Refactored the Loan Settlement modal to allow the borrower to choose their source account, dynamically calculating remaining balances without mutating the original loan amount.
   - Connected accepted Loan Payments to instantly tuck themselves underneath the original loan's history dropdown using the `related_transaction_id`.

4. **Performance & Concurrency Protection**
   - Implemented a `resolvingIds` state lock in `App.tsx` to disable the "Accept" button and safeguard against rapid double-clicks inserting duplicate transactions.
   - Dispatched a global `transactions_updated` CustomEvent upon accepting inbox items to trigger a lightning-fast data refetch, seamlessly updating balances without a full page reload.

## Next Session / Currently Parked

- **Phase 3 (Contextual Verification):** We will integrate **Tesseract.js** for Receipt OCR reading. When settling loans or shared payments, the sender can upload a receipt, and the recipient will verify the amount and the **Last 4 digits** to securely accept and log the transaction into their ledger.