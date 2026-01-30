# Budget Setup Persistence Debug Guide

## Overview

This document describes the robust validation and logging system implemented for budget setup persistence to Supabase.

## Changes Made

### 1. Type Validation in budgetSetupsService.ts

Added comprehensive validation functions to ensure data integrity:

#### `validateSetupData(data: any)`
Validates that setupData is properly structured before saving to Supabase:
- Ensures `data` is a plain object (not an array, not a string)
- Verifies each category key contains an array of items
- Validates each item in arrays is a proper object
- Skips validation for special fields (prefixed with `_` like `_projectedSalary`)

**Example Valid Structure:**
```json
{
  "Utilities": [
    { "id": "123", "name": "Electric Bill", "amount": "150", "included": true },
    { "id": "456", "name": "Water Bill", "amount": "50", "included": true }
  ],
  "Groceries": [
    { "id": "789", "name": "Weekly Shopping", "amount": "200", "included": true }
  ],
  "_projectedSalary": "11000",
  "_actualSalary": "11500"
}
```

#### `frontendBudgetSetupToSupabase()`
Enhanced to:
- Log data type and structure before conversion
- Call `validateSetupData()` to ensure structure is correct
- Throw meaningful errors if validation fails
- Ensure data is never stringified where an object is expected

### 2. Enhanced Logging in Save Operations

Both `createBudgetSetup()` and `updateBudgetSetup()` now log:
- Request payload details (month, timing, status, total_amount)
- Data type and keys being sent
- Response data structure after successful save
- Detailed error information on failure

**Console Output Example:**
```
[budgetSetupsService] Creating budget setup
[budgetSetupsService] Setup payload: {
  "month": "January",
  "timing": "1/2",
  "status": "Saved",
  "total_amount": 1500,
  "data_type": "object",
  "data_keys": ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
}
[budgetSetupsService] Budget setup created successfully
[budgetSetupsService] Created record: {
  "id": "uuid-here",
  "month": "January",
  "timing": "1/2",
  "status": "Saved",
  "total_amount": 1500,
  "data_type": "object",
  "data_keys": ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
}
```

### 3. Budget.tsx handleSaveSetup Improvements

Enhanced `handleSaveSetup()` function with:
- Comprehensive logging of save operation lifecycle
- Validation of amount parsing (warns about invalid amounts)
- Better error messages that include specific error details
- Deep clone of setupData to avoid reference issues
- Verification that data structure is correct before sending to service layer

**Console Output Example:**
```
[Budget] ===== Starting budget setup save =====
[Budget] Selected month: January
[Budget] Selected timing: 1/2
[Budget] Current setupData type: object
[Budget] Current setupData keys: ["Utilities", "Groceries"]
[Budget] Calculated total amount: 1500
[Budget] Existing setup found: false
[Budget] Data to save type: object
[Budget] Data to save keys: ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
[Budget] Projected salary: 11000
[Budget] Actual salary: 11500
[Budget] Creating new setup
[Budget] Budget setup created successfully
[Budget] Created record ID: uuid-here
[Budget] Created record data type: object
[Budget] Created record data keys: ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
[Budget] ===== Budget setup save completed successfully =====
```

### 4. Budget.tsx handleLoadSetup Improvements

Enhanced `handleLoadSetup()` function with:
- Validation that loaded data is a proper object before setting state
- Detailed logging of loaded data structure
- User-friendly error messages if data is malformed
- Deep clone to avoid reference issues

**Console Output Example:**
```
[Budget] ===== Loading budget setup =====
[Budget] Setup ID: uuid-here
[Budget] Setup month: January
[Budget] Setup timing: 1/2
[Budget] Setup data type: object
[Budget] Setup data keys: ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
[Budget] Loaded data type: object
[Budget] Loaded data keys: ["Utilities", "Groceries", "_projectedSalary", "_actualSalary"]
[Budget] ===== Budget setup loaded successfully =====
```

### 5. Transaction Storage Migration

Migrated transaction storage from localStorage to Supabase:
- Updated `handleTransactionSubmit()` to use `createTransaction()` service
- Added logging for transaction saves
- Improved error handling with user-friendly messages

## Debugging Common Issues

### Issue: "Invalid setupData structure: Category X must be an array"

**Cause:** A category in setupData contains non-array data

**Solution:** Ensure all categories contain arrays:
```javascript
// WRONG
setupData = {
  "Utilities": "some string"  // ❌ String instead of array
}

// CORRECT
setupData = {
  "Utilities": [{ id: "1", name: "Bill", amount: "100", included: true }]  // ✅ Array
}
```

### Issue: "setupData must be a plain object"

**Cause:** setupData is an array or string instead of an object

**Solution:** setupData should be a dictionary/object:
```javascript
// WRONG
setupData = []  // ❌ Array
setupData = "[{...}]"  // ❌ String

// CORRECT
setupData = {  // ✅ Object
  "CategoryName": [...]
}
```

### Issue: "Item must be an object"

**Cause:** An item in a category array is not a proper object

**Solution:** Each item must be an object with required fields:
```javascript
// WRONG
setupData = {
  "Utilities": ["string item"]  // ❌ String in array
}

// CORRECT
setupData = {
  "Utilities": [
    { id: "1", name: "Bill", amount: "100", included: true }  // ✅ Proper object
  ]
}
```

## Console Monitoring

When saving or loading budget setups, monitor the browser console for:

1. **Validation Success:** Look for `[budgetSetupsService] Data validation passed`
2. **Data Structure:** Check logged data types and keys match expectations
3. **Save Success:** Verify `Budget setup created/updated successfully` messages
4. **Error Details:** Any errors will be logged with `[Budget]` or `[budgetSetupsService]` prefix

## Best Practices

1. **Always check browser console** when troubleshooting save/load issues
2. **Look for the structured logs** - they show exactly what data is being sent/received
3. **Verify data types** - ensure objects are objects, arrays are arrays
4. **Check special fields** - `_projectedSalary` and `_actualSalary` should be strings
5. **Monitor error messages** - they now include specific details about what went wrong

## Data Flow

```
User clicks "Save"
    ↓
Budget.tsx: handleSaveSetup()
    ↓ (validates basic structure)
Budget.tsx: createBudgetSetupFrontend() or updateBudgetSetupFrontend()
    ↓
budgetSetupsService.ts: frontendBudgetSetupToSupabase()
    ↓ (validates data structure with validateSetupData())
budgetSetupsService.ts: createBudgetSetup() or updateBudgetSetup()
    ↓ (logs payload before sending)
Supabase: insert/update operation
    ↓ (logs response after receiving)
Budget.tsx: onReloadSetups() to refresh UI
```

## Summary

All budget setup persistence operations now include:
- ✅ Robust type validation before saving
- ✅ Detailed console logging at each step
- ✅ User-friendly error messages with specific details
- ✅ Verification that arrays are passed to insert/replace operations
- ✅ Guarantee that data field in Supabase is always a JSON-compliant object
- ✅ No localStorage usage (migrated to Supabase-only persistence)
