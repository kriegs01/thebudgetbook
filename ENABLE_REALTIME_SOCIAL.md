# Enable Realtime for Social Features

By default, Supabase does **not** broadcast changes for new tables. If your global real-time listeners in `App.tsx` (the red badges and notifications) are not firing instantly, it means Realtime Replication is not enabled for your `messages` and `friendships` tables.

### How to Fix:
Run this SQL snippet in your Supabase SQL Editor to enable Realtime for these tables:

```sql
-- Enable realtime for the new social tables and transactions
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table friendships;
alter publication supabase_realtime add table transactions;
```

Once you run this, your `App.tsx` global listeners will start receiving the `INSERT` and `UPDATE` payloads instantly, and your notification badges will light up!