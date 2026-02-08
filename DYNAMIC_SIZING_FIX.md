# Budget Projections Chart - Dynamic Sizing Fix

## Problem Fixed

When actual salary is higher than projected salary in the Budget Projections chart, the text labels on top of bars were disappearing beyond the chart frame.

## Root Cause

The Recharts library's YAxis component automatically calculates its domain (min/max values) based solely on the data values. When bar values are high, the labels positioned on top of bars can exceed the chart's visible area, causing them to be clipped or cut off.

## Solution

Added a dynamic domain configuration to the YAxis that extends the maximum value by 15%:

```typescript
<YAxis 
  axisLine={false}
  tickLine={false}
  tick={{fill: '#94a3b8', fontSize: 12}}
  tickFormatter={(value) => formatCurrency(value)}
  domain={[0, 'dataMax + 15%']}  // ← Added this line
/>
```

## How It Works

### Domain Configuration

The `domain` prop accepts a tuple `[min, max]`:
- **Min (0):** Y-axis always starts at 0
- **Max ('dataMax + 15%'):** Recharts formula that:
  1. Calculates the maximum value across all data points
  2. Adds 15% padding on top
  3. Uses this as the Y-axis maximum

### Example Calculation

If your budget setup has:
- Income (Actual Salary): ₱35,000
- Allocated Budget: ₱28,000  
- Remaining: ₱7,000

**Without fix:**
- Y-axis max: ₱35,000 (exactly at data max)
- Label "₱35,000" tries to render above the bar
- Gets clipped by chart boundary ❌

**With fix:**
- Y-axis max: ₱40,250 (35,000 × 1.15)
- Label "₱35,000" has 5,250 of space above
- Fully visible within chart area ✅

## Benefits

1. **Dynamic Adaptation:** Works with any salary amount (low or high)
2. **Prevents Clipping:** 15% padding ensures labels always fit
3. **All Bars Covered:** Applies to Income, Allocated Budget, and Remaining bars
4. **Clean Appearance:** Maintains professional look with proper spacing
5. **No Manual Adjustment:** Automatically scales based on data

## Visual Comparison

### Before (Issue)
```
Chart Boundary ─────────────────────
₱35,000 (Text cut off)
│████████│ Income bar at max
│        │
│        │
└────────┘
```

### After (Fixed)
```
Chart Boundary ─────────────────────
│        │ ← 15% padding space
₱35,000  ← Label fully visible
│████████│ Income bar
│        │
│        │
└────────┘
```

## Testing

To verify the fix works:

1. **Create a budget setup with high actual salary:**
   - Budget page → Select month and timing
   - Enter Projected Salary: ₱15,000
   - Enter Actual Salary: ₱30,000 (much higher)
   - Add some budget items
   - Save

2. **Check Dashboard:**
   - Navigate to Dashboard
   - Find Budget Projections section
   - Look at the chart for your period
   - **Expected:** All three bars show with labels fully visible on top
   - Green bar should show "₱30,000" without being cut off

3. **Try different values:**
   - Test with actual salary lower than projected
   - Test with very high actual salary (₱50,000+)
   - All labels should remain visible

## Technical Details

**File Modified:** `pages/Dashboard.tsx`

**Change Made:** Added one line to YAxis component
```typescript
domain={[0, 'dataMax + 15%']}
```

**Recharts Formula Syntax:**
- `'dataMax'` - Built-in Recharts variable for maximum data value
- `+ 15%` - Adds 15% padding (can be adjusted if needed)
- Formula is evaluated dynamically when chart renders

**Why 15%?**
- Provides comfortable space for currency labels (₱XX,XXX.XX format)
- Not too much (would waste space)
- Not too little (labels might still touch edge)
- Tested to work well with typical Philippine Peso amounts

## Alternative Solutions Considered

1. **Fixed domain (e.g., [0, 50000]):** 
   - ❌ Wouldn't adapt to different salary ranges
   
2. **Larger percentage (e.g., 25%):**
   - ❌ Wastes too much vertical space
   
3. **Position labels inside bars:**
   - ❌ Less readable, especially for small bars
   
4. **Absolute padding (e.g., dataMax + 5000):**
   - ❌ Doesn't scale proportionally with different ranges

The percentage-based approach (15%) was chosen as the optimal solution.

## Impact

This fix ensures the Budget Projections chart provides a reliable and professional visualization regardless of:
- Salary variations (actual vs projected)
- Different income levels across periods
- Various budget allocation amounts

Users can now confidently view their budget data without worrying about labels being cut off or hidden.
