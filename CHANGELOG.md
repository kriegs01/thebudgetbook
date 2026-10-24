# Changelog
##[4.2.2] - 2026-10-24
### What's New 
- NEW: Income Slicer optional toggle: You can now opt- in or out of the income slicer whenever you want! Just go to Settings > Budget and just toggle of the Income Slicer option. 
- Settings Page Reorganized: We cleaned up the settings page a bit to follow the retro sticker/ neobrutalist theme and regrouped the settings to make this easier for you to find! 
### Bug Fixes
- Missing New Album Button in Wishlist page: We've brought back the New Album button so you can group your items in a tap! 


##[v4.2.1] -2026-10-22
### What's New
- Partial amount override in Budget Plan: toggle the partial payment to accurately allocate amount for your credit account budget item
- NEW Wishlist Page!: save that long-eyed items to the wishlist page. Group them by albums and prioritize according to your preference. Add item variants to track total amount and tick as you go. 

### Bug Fixes
- Calibrated hit frame in the budget plan Skip and Partial toggles for both touch and mouse navigation. 
- Fixed the credit account due date paycheck tab distribution by introducing the db-backed statement due date and cycle shift logic. By creating an engine that takes existing credit account statements billing cycle and calculating approximate due date, the amount due reflects correctly in its correct paycheck tab by due date.

##[v4.2.0] - 2026-10-16
## What's New
- Smart Billing Automation: Introduced "Smart Engines" to natively handle unique statement naming conventions and cycle shifts for platforms like SPayLater.
- Clearer Budget Math: The Budget Plan now explicitly displays the "Previous Statement Balance" for carried-over debt, ensuring visible items always add up perfectly to your total bill.
- Accurate Statement Footers: Credit card timeline footers now accurately reflect the current cycle's "New Charges" total instead of the raw ending balance.

## Bug Fixes
- Fixed an issue where converting items to Buy Now, Pay Later (BNPL) caused the UI to snap, reset, and overwrite user cycle selections.
- Fixed a BNPL schedule generation bug that caused future installment months to calculate backward instead of shifting forward accurately.
- Fixed payment bleed-through where unlabelled payments made during overlapping statement windows were double-counted across multiple cycles.
- Fixed the Budget Plan dropping valid charges by ensuring it strictly loads statements based on their physical due date rather than their string name.
- Fixed a bug where a credit card would prematurely move to "Settled & Spent" once the personal share was paid, ensuring the card retains its active "Reimburse" UI state until all Budee items are fully returned.

## [v4.1.0] - 2026-10-15
### What's New
- Unified Credit Pay Carousel: Settle both your personal share and friend (Budee) reimbursable expenses in a single, uninterrupted payment flow.
- Clear Ownership Badges: Each card in the payment carousel now clearly indicates whether it is a Personal Share or a Budee expense.
- Direct Receipt Access: Added receipt shortcut buttons to Budee line items in credit card accordions to easily view past payments.

### Bug Fixes
- Fixed an issue where paying or borrowing from savings for one item prematurely locked the parent credit card or flipped it to Reimburse mode.
- The credit payment modal no longer kicks you out after paying one item—completed cards now drop off smoothly while keeping the deck open for the rest.
- Fixed card counter badges so they maintain accurate numbers (e.g., "Item 2 of 4") as you pay items.
- Fixed credit card charges ("Previous Balance + New Charges") and sub-items resetting to unpaid after payment.
- Line items now accurately show strikethroughs and settled checkmarks as soon as they are paid without waiting for the whole card to settle.

---

## [v4.0.0] - 2026-10-14
### What's New
- Added About & Updates section to Settings with live changelog history
- Restructured timeline reimbursement cards with clean "Paid using Savings" subtitles
- Circular paycheck pagination buttons for easier navigation
- Segregated Budee Out (Payables) & Budee In (Receivables) in Budget Plan
- Added Me vs. Budee breakdown within Credit Card statement timelines

### Bug Fixes
- Fixed premature strikethrough and prefix bug on credit timeline sub-items
- Fixed dark-mode swipe-to-include background bleed
- Fixed active credit card installment scope errors in budget engine
