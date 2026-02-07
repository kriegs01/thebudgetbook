# Real-time Balance Updates - Setup Guide

## Issue
If you're experiencing: "still needing refresh to reflect the correct balance in real-time"

This means Supabase Real-time is not properly configured for the transactions table.

## Root Cause
The application code includes real-time subscription logic, but the **Supabase database needs to be configured** to broadcast transaction changes.

## Solution

### Quick Fix (Supabase Dashboard)

1. **Log in to your Supabase project**
2. **Navigate to Database → Replication**
3. **Find the `transactions` table** in the list
4. **Toggle Real-time to ON** (enable the switch)
5. **Test**: Create a transaction and the balance should update instantly

### Alternative: SQL Setup

If the dashboard method doesn't work, run this SQL in Supabase SQL Editor:

```sql
-- Enable full row replication
ALTER TABLE transactions REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
```

### Verify Setup

Run these queries in SQL Editor to verify:

```sql
-- Check if transactions is in realtime publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Should show: transactions

-- Check replica identity
SELECT relname, relreplident 
FROM pg_class 
WHERE relname = 'transactions';
-- relreplident should be 'f' (FULL)
```

## How to Test

1. **Open the app in browser**
2. **Open Developer Console (F12)**
3. **Look for these logs:**
   ```
   [App] Setting up real-time subscription for transactions
   [App] Real-time subscription status: SUBSCRIBED
   ```
4. **Create a transaction**
5. **You should see:**
   ```
   [App] Transaction changed via real-time: INSERT
   ```
6. **Balance should update instantly** without refresh!

## Troubleshooting

### Issue: Subscription status shows "CHANNEL_ERROR"

**Cause**: Real-time not enabled for transactions table

**Solution**: Follow the Quick Fix steps above

### Issue: Subscription shows "SUBSCRIBED" but no events received

**Cause**: Row Level Security (RLS) policies might be blocking real-time

**Solution**: 
```sql
-- Verify RLS policy exists
SELECT * FROM pg_policies WHERE tablename = 'transactions';

-- If no policies, add one:
CREATE POLICY "Enable all for transactions" 
ON transactions 
FOR ALL 
USING (true) 
WITH CHECK (true);
```

### Issue: Events received but balance doesn't update

**Cause**: Issue with balance calculation or reload function

**Solution**: 
- Check console for errors
- Verify `getAllAccountsWithCalculatedBalances()` function works
- Test by manually refreshing - if it works then, the real-time event handling is the issue

### Issue: Works in one tab but not others

**Cause**: This is actually expected! Each tab needs its own subscription.

**Solution**: The current implementation sets up a subscription per browser tab, which is correct.

## Expected Behavior After Setup

✅ **Create Transaction**: Balance updates instantly (< 500ms)
✅ **Delete Transaction**: Balance restores instantly (< 500ms)
✅ **Multiple Tabs**: Each tab updates independently
✅ **Multiple Devices**: All devices receive updates

## Migration File

The SQL migration is available at:
`supabase/migrations/20260204_enable_realtime_transactions.sql`

You can run this file in Supabase SQL Editor or use Supabase CLI:
```bash
supabase db push
```

## Additional Resources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Postgres Replication Identity](https://www.postgresql.org/docs/current/sql-altertable.html#SQL-CREATETABLE-REPLICA-IDENTITY)
- Main setup guide: `SUPABASE_SETUP.md`

## Still Having Issues?

1. Check browser console for error messages
2. Verify Supabase project has real-time enabled (some free tier plans may have limits)
3. Check network tab for WebSocket connections
4. Ensure firewall/proxy isn't blocking WebSocket connections
5. Try in incognito mode to rule out browser extensions

## Success Indicators

When working correctly, you'll see in console:
```
[App] Setting up real-time subscription for transactions
[App] Real-time subscription status: SUBSCRIBED
[App] Transaction changed via real-time: INSERT {new: {...}}
```

And the balance will update **without needing to refresh** the page!
