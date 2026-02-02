# Known Good Baseline - Quick Reference Card

## 🚨 Emergency Recovery

**Last Known Good Commit**: `e6b0cfe`  
**Date**: February 2, 2026  
**Status**: ✅ VERIFIED WORKING

### Quick Checkout

```bash
# Start from baseline
git checkout e6b0cfe

# Create your branch
git checkout -b feature/your-feature
```

---

## ✅ The Universal Rule

**Transaction linkage is the ONLY source of truth for paid status.**

```typescript
isPaid = transactions.some(tx => tx.payment_schedule_id === schedule.id)
```

---

## ✅ DO This

```typescript
// Check for linked transaction
const isPaid = transactions.some(tx => 
  tx.payment_schedule_id === schedule.id
);

// Calculate progress from transactions
const paidAmount = schedules.reduce((total, schedule) => {
  const hasPaid = transactions.some(tx => 
    tx.payment_schedule_id === schedule.id
  );
  return hasPaid ? total + schedule.expected_amount : total;
}, 0);
```

---

## ❌ DON'T Do This

```typescript
// NEVER use cached fields
const isPaid = schedule.amountPaid > 0; // ❌
const isPaid = item.paidAmount >= expected; // ❌
const isPaid = schedule.status === 'paid'; // ❌

// NEVER use hybrid fallbacks to cached fields
const paid = Math.max(linkedAmount, cachedAmount); // ❌
```

---

## 🧪 Testing Checklist

Before committing:

- [ ] Add payment → schedule shows paid
- [ ] Delete transaction → schedule shows unpaid (NO GHOST STATE)
- [ ] Progress bar updates correctly
- [ ] Build succeeds (TypeScript 0 errors)

---

## 📚 Full Documentation

See [KNOWN_GOOD_BASELINE.md](KNOWN_GOOD_BASELINE.md) for complete details.

---

**Need Help?** Check the baseline documentation or ask the team!
