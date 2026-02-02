# Fix Guide: Eliminating ".match is not a function" Errors

## Problem Overview

The error `TypeError: [variable].match is not a function` occurs when code attempts to call the `.match()` method on a value that is not a string. This can happen when:

- A parameter expected to be a string is actually an object, array, null, or undefined
- Data from an external source (database, API) has unexpected types
- Type conversion or validation is missing

## Root Causes in This Codebase

### 1. Payment Schedule Generation
**File**: `src/services/paymentSchedulesService.ts`
**Function**: `generateSchedulesForInstallment()`

**Issue**: The `termDuration` parameter (expected format: "12 months") could be passed as a non-string value.

```typescript
// BEFORE (Unsafe)
const termMatch = termDuration.match(/(\d+)/);
```

**Problem**: If `termDuration` is an object like `{ value: "12 months" }` instead of the string `"12 months"`, calling `.match()` throws an error.

### 2. Billing Cycle Calculation
**Files**: 
- `src/utils/billingCycles.ts`
- `src/utils/paymentStatus.ts`

**Function**: `calculateBillingCycles()`

**Issue**: The `billingDate` parameter (expected format: "2026-01-15" or "15") could be passed as a non-string value.

```typescript
// BEFORE (Unsafe)
const match = billingDate.match(/\d+/);
```

**Problem**: If `billingDate` is a Date object instead of a string, calling `.match()` throws an error.

## Solution: Defensive Type Checking

### Pattern to Follow

Always check that a value is a string before calling string methods like `.match()`:

```typescript
// SAFE PATTERN
let match: RegExpMatchArray | null = null;
if (typeof variable === 'string') {
  match = variable.match(/pattern/);
} else {
  console.error('[FunctionName] variable must be a string, received:', typeof variable, variable);
  // Handle error appropriately (return, throw, use default)
  return defaultValue;
}

if (!match) {
  console.error('[FunctionName] Invalid format:', variable);
  return defaultValue;
}
```

### Key Components

1. **Type Guard**: `typeof variable === 'string'`
2. **Explicit Type Declaration**: `let match: RegExpMatchArray | null = null;`
3. **Error Logging**: Detailed console.error with function name, type, and value
4. **Graceful Handling**: Return empty/default value instead of crashing
5. **Secondary Validation**: Check if match is null after regex

## Implemented Fixes

### 1. paymentSchedulesService.ts

```typescript
export const generateSchedulesForInstallment = (
  installmentId: string,
  startDate: string,
  termDuration: string,
  monthlyAmount: number
): CreatePaymentScheduleInput[] => {
  const schedules: CreatePaymentScheduleInput[] = [];
  
  // DEFENSIVE: Validate that inputs are strings before using string methods
  if (typeof startDate !== 'string') {
    console.error('[generateSchedulesForInstallment] startDate must be a string, received:', typeof startDate, startDate);
    return schedules;
  }
  
  if (typeof termDuration !== 'string') {
    console.error('[generateSchedulesForInstallment] termDuration must be a string, received:', typeof termDuration, termDuration);
    return schedules;
  }
  
  // DEFENSIVE: Extract term duration number (e.g., "12 months" -> 12)
  let termMatch: RegExpMatchArray | null = null;
  if (typeof termDuration === 'string') {
    termMatch = termDuration.match(/(\d+)/);
  } else {
    console.error('[generateSchedulesForInstallment] termDuration is not a string, cannot parse:', typeof termDuration, termDuration);
    return schedules;
  }
  
  if (!termMatch) {
    console.error(`[generateSchedulesForInstallment] Invalid term duration format: ${termDuration}. Expected format like "12 months"`);
    return schedules;
  }
  
  const term = parseInt(termMatch[1]);
  // ... rest of function
};
```

### 2. billingCycles.ts

```typescript
export const calculateBillingCycles = (
  billingDate: string, 
  numberOfCycles: number = 6,
  onlyCurrentYear: boolean = false
): BillingCycle[] => {
  const cycles: BillingCycle[] = [];
  
  // DEFENSIVE: Validate that billingDate is a string before using string methods
  if (typeof billingDate !== 'string') {
    console.error('[calculateBillingCycles] billingDate must be a string, received:', typeof billingDate, billingDate);
    return cycles;
  }
  
  let billingDay: number;
  
  if (billingDate.includes('-')) {
    const date = new Date(billingDate);
    billingDay = date.getDate();
  } else {
    // DEFENSIVE: Check type before calling .match()
    let match: RegExpMatchArray | null = null;
    if (typeof billingDate === 'string') {
      match = billingDate.match(/\d+/);
    } else {
      console.error('[calculateBillingCycles] billingDate is not a string for regex match:', typeof billingDate, billingDate);
      return cycles;
    }
    
    if (!match) {
      console.error('[calculateBillingCycles] Invalid billing date format:', billingDate);
      return cycles;
    }
    billingDay = parseInt(match[0], 10);
  }
  // ... rest of function
};
```

### 3. paymentStatus.ts

Same defensive pattern applied to `calculateBillingCycles()` in this file.

## Testing Strategy

### 1. Unit Tests (Recommended)

Create tests that pass invalid types:

```typescript
describe('generateSchedulesForInstallment', () => {
  it('should handle non-string termDuration gracefully', () => {
    const result = generateSchedulesForInstallment(
      'inst-123',
      '2026-03',
      { value: '12 months' } as any, // Wrong type!
      500
    );
    expect(result).toEqual([]);
    // Check console.error was called
  });
  
  it('should handle non-string startDate gracefully', () => {
    const result = generateSchedulesForInstallment(
      'inst-123',
      new Date() as any, // Wrong type!
      '12 months',
      500
    );
    expect(result).toEqual([]);
  });
});
```

### 2. Console Monitoring

After deployment, monitor browser console for these error messages:

- `[generateSchedulesForInstallment] termDuration must be a string`
- `[generateSchedulesForInstallment] startDate must be a string`
- `[calculateBillingCycles] billingDate must be a string`

If you see these errors, it indicates:
1. Where the error originated (function name in brackets)
2. What type was actually received
3. The actual value that was passed

### 3. Manual Testing

Test scenarios that previously failed:

1. **Create Installment**:
   - Fill in installment form
   - Verify schedules are created without errors
   - Check browser console for any warnings

2. **View Credit Card Statement**:
   - Open account with billing date
   - Verify cycles display correctly
   - Check browser console for any warnings

## Prevention Guidelines

### For Developers

When writing new code that uses string methods:

1. **Always validate parameter types** before using string methods
2. **Use TypeScript types** but don't rely on them alone (runtime data can differ)
3. **Add JSDoc comments** specifying expected types
4. **Use defensive coding** for external data sources
5. **Log detailed errors** to help future debugging

### Example Template

```typescript
/**
 * Function description
 * 
 * @param param1 - Description - MUST be a string in format "XXX"
 * @param param2 - Description - MUST be a number
 * @returns Description
 */
export const functionName = (param1: string, param2: number) => {
  // DEFENSIVE: Validate types
  if (typeof param1 !== 'string') {
    console.error('[functionName] param1 must be a string, received:', typeof param1, param1);
    return defaultValue;
  }
  
  if (typeof param2 !== 'number') {
    console.error('[functionName] param2 must be a number, received:', typeof param2, param2);
    return defaultValue;
  }
  
  // Now safe to use string/number methods
  const result = param1.match(/pattern/);
  // ...
};
```

## Common Mistakes to Avoid

### ❌ DON'T: Call .match() directly

```typescript
// BAD - Will crash if value is not a string
const match = someValue.match(/pattern/);
```

### ✅ DO: Check type first

```typescript
// GOOD - Handles non-string values gracefully
let match: RegExpMatchArray | null = null;
if (typeof someValue === 'string') {
  match = someValue.match(/pattern/);
} else {
  console.error('Expected string, got:', typeof someValue, someValue);
  return;
}
```

### ❌ DON'T: Assume TypeScript types guarantee runtime types

```typescript
// BAD - TypeScript says it's a string, but runtime data might not be
function process(date: string) {
  return date.match(/\d+/); // Could fail!
}
```

### ✅ DO: Validate even with TypeScript types

```typescript
// GOOD - Defensive even with TypeScript
function process(date: string) {
  if (typeof date !== 'string') {
    console.error('Expected string, got:', typeof date);
    return null;
  }
  return date.match(/\d+/);
}
```

### ❌ DON'T: Silent failures

```typescript
// BAD - Silently returns undefined on error
const match = typeof value === 'string' ? value.match(/pattern/) : undefined;
```

### ✅ DO: Log errors for debugging

```typescript
// GOOD - Makes debugging easier
let match: RegExpMatchArray | null = null;
if (typeof value === 'string') {
  match = value.match(/pattern/);
} else {
  console.error('[FunctionName] Expected string, got:', typeof value, value);
  match = null;
}
```

## Benefits of This Approach

1. **No Runtime Crashes**: Functions return gracefully instead of throwing errors
2. **Better Debugging**: Console logs show exactly what went wrong
3. **Type Safety**: Explicit runtime checks complement TypeScript
4. **User Experience**: App continues working even with unexpected data
5. **Developer Experience**: Clear error messages help fix issues quickly

## Additional Resources

- [MDN: String.prototype.match()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match)
- [TypeScript: Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#typeof-type-guards)
- [Defensive Programming Best Practices](https://en.wikipedia.org/wiki/Defensive_programming)

## Summary Checklist

When working with `.match()` or other string methods:

- [ ] Check `typeof variable === 'string'` before calling string methods
- [ ] Declare match variables with explicit type: `RegExpMatchArray | null`
- [ ] Log detailed error messages with function name, type, and value
- [ ] Return appropriate default/empty values on error
- [ ] Add JSDoc comments emphasizing "MUST be a string"
- [ ] Test with invalid input types
- [ ] Monitor console for error messages after deployment

---

**Last Updated**: 2026-02-02
**Version**: 1.0
**Status**: Implemented and Tested ✅
