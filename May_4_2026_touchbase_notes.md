# May 4, 2026 Touchbase Notes

## 1. UI Enhancement for "Friends" Transfer Modal

* **Goal:** Upgrade the "To Who?" input field in the Friends transfer modal to use a custom dropdown layout similar to social media platforms.
* **Design:** The dropdown should display the user's picture alongside their name (and eventually `@username`).
* **Phase 1 Implementation:** Since we are currently using "Shadow Profiles" (local aliases), we will use the existing UI pattern of the 2-letter monogram in a colored circle in lieu of an actual profile picture.
* **Scope:** This custom autocomplete dropdown needs to be applied wherever the "Send to Friend" or "Pay Person" inputs exist (e.g., `pages/accounts/view.tsx` and `pages/transactions.tsx`).

*(Note: This will replace the native HTML `<datalist>` approach with a custom React component to allow for richer UI rendering.)*