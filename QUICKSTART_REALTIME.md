# Quick Start: Enable Real-time Balance Updates

## The Problem
Your balance still requires a page refresh even though real-time is implemented in the code.

## The Solution (2 Minutes)

### Step 1: Open Supabase Dashboard
Go to your Supabase project at https://supabase.com

### Step 2: Navigate to Replication
Click: **Database** → **Replication**

### Step 3: Find Transactions Table
Scroll through the list to find the `transactions` table

### Step 4: Enable Real-time
Toggle the switch to **ON** for the transactions table

### Step 5: Test It!
1. Go back to your app
2. Open browser console (F12)
3. Create a transaction
4. You should see:
   ```
   [App] Transaction changed via real-time: INSERT
   ```
5. **Balance updates instantly!** No refresh needed! ⚡

## Visual Checklist

```
┌─────────────────────────────────────┐
│  Supabase Dashboard                 │
│  ↓                                  │
│  Database                           │
│  ↓                                  │
│  Replication                        │
│  ↓                                  │
│  Find: transactions                 │
│  ↓                                  │
│  Toggle: Real-time [OFF] → [ON]    │
│  ↓                                  │
│  Done! ✅                           │
└─────────────────────────────────────┘
```

## Verify It's Working

Open your app and check console (F12):

```
✅ GOOD:
[App] Real-time subscription status: SUBSCRIBED
[App] Transaction changed via real-time: INSERT

❌ BAD:
[App] Real-time subscription status: CHANNEL_ERROR
(means real-time not enabled)
```

## Alternative Method: SQL

If the dashboard doesn't work, use SQL Editor:

```sql
ALTER TABLE transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
```

## Need More Help?

See complete guides:
- `REALTIME_SETUP_GUIDE.md` - Full troubleshooting guide
- `SUPABASE_SETUP.md` - Complete Supabase setup
- `/tmp/REALTIME_FIX_SUMMARY.md` - Technical details

## Expected Result

**BEFORE:**
- Create transaction → Must refresh page
- Delete transaction → Must refresh page
- ❌ Annoying!

**AFTER:**
- Create transaction → Balance updates instantly ⚡
- Delete transaction → Balance restores instantly ⚡  
- ✅ Perfect!

---

**Remember:** This is a ONE-TIME setup. Once enabled, real-time works forever!
