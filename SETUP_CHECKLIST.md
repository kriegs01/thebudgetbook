# Quick Start Guide: Supabase Persistence Setup

This is a quick checklist to get your Budget Book app running with full Supabase persistence.

## Prerequisites Checklist

- [ ] Node.js v16+ installed
- [ ] Supabase account created at [https://supabase.com](https://supabase.com)
- [ ] Budget Book repository cloned

## Setup Steps

### Step 1: Create Supabase Project
- [ ] Log in to Supabase Dashboard
- [ ] Create a new project
- [ ] Wait for database to be provisioned (2-3 minutes)
- [ ] Note your project URL and anon key from Settings → API

### Step 2: Configure Environment
- [ ] Copy `.env.example` to `.env.local`
- [ ] Add your Supabase URL to `VITE_SUPABASE_URL`
- [ ] Add your Supabase anon key to `VITE_SUPABASE_ANON_KEY`

### Step 3: Set Up Database Tables
- [ ] Open Supabase SQL Editor
- [ ] Copy contents of `supabase_migration.sql`
- [ ] Run the SQL script
- [ ] Verify tables created: accounts, billers, installments, savings, transactions, trash, categories

### Step 4: Install Dependencies
- [ ] Run `npm install`
- [ ] Wait for installation to complete

### Step 5: Start the Application
- [ ] Run `npm run dev`
- [ ] Open browser to `http://localhost:3000`
- [ ] Verify app loads without errors

### Step 6: Test Supabase Connection
- [ ] Navigate to `/supabase-demo` page
- [ ] Try creating a test account
- [ ] Verify data appears in Supabase Dashboard
- [ ] Delete test account if desired

### Step 7: Migrate Existing Data (if applicable)
- [ ] Navigate to Settings page
- [ ] Open "Data Migration" section
- [ ] Click "Run Migration" button
- [ ] Wait for completion message
- [ ] Verify migrated data in Transactions page

### Step 8: Verify Everything Works
- [ ] Create a new transaction
- [ ] View transactions by account
- [ ] Delete a transaction (should move to trash)
- [ ] Check Trash page for deleted item
- [ ] Restore item from trash
- [ ] Verify data in Supabase Dashboard

## Troubleshooting

### If app won't start:
- Check `.env.local` exists and has correct credentials
- Run `npm install` again
- Check browser console for errors

### If Supabase connection fails:
- Verify URL and key in `.env.local` are correct
- Check Supabase project is active (not paused)
- Check RLS policies exist (run migration SQL again)

### If migration fails:
- Open browser console for detailed errors
- Verify database tables exist
- See `MIGRATION_GUIDE.md` for detailed troubleshooting

## Getting Help

- 📖 Read `SUPABASE_SETUP.md` for detailed setup instructions
- 📖 Read `MIGRATION_GUIDE.md` for migration help
- 📖 Read `IMPLEMENTATION_SUMMARY.md` for technical details
- 🔍 Check browser console for error messages
- 🔍 Check Supabase Dashboard logs

## Success Indicators

You'll know everything is working when:
- ✅ App loads without errors
- ✅ You can create and view transactions
- ✅ Deleted items appear in trash
- ✅ Data persists after page refresh
- ✅ Data appears in Supabase Dashboard

## What's Next?

Once setup is complete:
- Explore all features: Dashboard, Accounts, Billers, Installments, Savings
- Manage budget categories in Settings
- Use Trash to recover accidentally deleted items
- All your data is now safely stored in Supabase cloud!

---

**Estimated Setup Time:** 10-15 minutes

**Need More Help?** See the full documentation:
- `README.md` - Project overview
- `SUPABASE_SETUP.md` - Detailed Supabase setup
- `MIGRATION_GUIDE.md` - Data migration guide
- `QUICKSTART.md` - 5-minute quick start

Enjoy your Budget Book with full cloud persistence! 🎉
