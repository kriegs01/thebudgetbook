# Supabase Integration Guide

This document provides comprehensive instructions for setting up and using Supabase with the Budget Book application.

## Table of Contents
1. [Overview](#overview)
2. [Environment Setup](#environment-setup)
3. [Database Schema](#database-schema)
4. [Service Layer](#service-layer)
5. [Usage Examples](#usage-examples)
6. [Safety and Best Practices](#safety-and-best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

The Budget Book application now supports Supabase as a backend database. This integration provides:

- **Type-safe database operations** using TypeScript interfaces
- **Reusable service layer** with CRUD operations for all entities
- **Environment-based configuration** for secure credential management
- **Real-time data synchronization** capabilities (optional)

## Environment Setup

### Prerequisites

- Node.js (v16 or higher)
- A Supabase account and project
- Your Supabase project URL and anon key

### Step 1: Create a Supabase Project

1. Visit [https://supabase.com](https://supabase.com) and sign up or log in
2. Create a new project
3. Wait for the database to be provisioned (usually 2-3 minutes)

### Step 2: Get Your Credentials

1. Go to your project's **Settings** → **API**
2. Copy the following:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **Anon/Public Key** (a long JWT token)

### Step 3: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and add your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **NEVER commit `.env.local` to version control!** It's already in `.gitignore`.

### Step 4: Set Up the Database Schema

Run the following SQL in your Supabase SQL Editor to create the required tables:

```sql
-- Accounts table
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank TEXT NOT NULL,
  classification TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  credit_limit NUMERIC,
  billing_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billers table
CREATE TABLE billers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date TEXT NOT NULL,
  expected_amount NUMERIC NOT NULL,
  timing TEXT NOT NULL,
  activation_date JSONB NOT NULL,
  deactivation_c JSONB,
  status TEXT NOT NULL,
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

-- Installments table
CREATE TABLE installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  monthly_amount NUMERIC NOT NULL,
  term_duration INTEGER NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE
);

-- Savings table
CREATE TABLE savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  current_balance NUMERIC NOT NULL DEFAULT 0
);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL,
  payment_method_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

-- Budget Setups table
CREATE TABLE budget_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  timing TEXT NOT NULL,
  status TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_month_timing UNIQUE (month, timing)
);

-- Enable Row Level Security (RLS)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billers ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_setups ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your auth needs)
-- WARNING: These policies allow anyone to read/write. 
-- In production, restrict based on user authentication!

CREATE POLICY "Enable all for accounts" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for billers" ON billers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for installments" ON installments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for savings" ON savings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for budget_setups" ON budget_setups FOR ALL USING (true) WITH CHECK (true);
```

### Step 5: Enable Real-time for Transactions (IMPORTANT!)

For instant balance updates to work, you need to enable Supabase Real-time for the transactions table:

**Option A: Using Supabase Dashboard (Recommended)**
1. Go to your Supabase project
2. Navigate to **Database** → **Replication**
3. Find the `transactions` table in the list
4. Toggle the **Real-time** switch to **ON**

**Option B: Using SQL**
Run the migration file in the SQL Editor:
```sql
-- Enable real-time for transactions table
ALTER TABLE transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
```

Or run the complete migration file: `supabase/migrations/20260204_enable_realtime_transactions.sql`

**Verify Real-time Setup:**
```sql
-- Check if transactions is in the publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Check REPLICA IDENTITY (should be 'f' for FULL)
SELECT relreplident FROM pg_class WHERE relname = 'transactions';
```

### Step 6: Install Dependencies

If not already installed:
```bash
npm install @supabase/supabase-js
```

### Step 7: Start the Application

```bash
npm run dev
```

Visit the Supabase Demo page to test the integration!

## Database Schema

### Accounts
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| bank | TEXT | Bank or institution name |
| classification | TEXT | Account classification (Checking, Savings, etc.) |
| balance | NUMERIC | Current balance |
| type | TEXT | Debit or Credit |
| credit_limit | NUMERIC | Credit limit (nullable) |
| billing_date | DATE | Billing date for credit accounts (nullable) |
| due_date | DATE | Payment due date (nullable) |
| created_at | TIMESTAMPTZ | Creation timestamp (auto-generated) |

### Billers
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | TEXT | Biller name |
| category | TEXT | Category (Utilities, Subscriptions, etc.) |
| due_date | TEXT | Day of month due |
| expected_amount | NUMERIC | Expected payment amount |
| timing | TEXT | Payment timing (1/2, 2/2) |
| activation_date | JSONB | Activation date object |
| deactivation_c | JSONB | Deactivation date object (nullable, note: field name is truncated in DB) |
| status | TEXT | active or inactive |
| schedules | JSONB | Payment schedule array |
| linked_account_id | UUID | Foreign key to accounts (nullable) - Links Loans-category billers to credit accounts for dynamic billing cycle-based amount calculation |

### Installments
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | TEXT | Installment name |
| total_amount | NUMERIC | Total amount financed |
| monthly_amount | NUMERIC | Monthly payment amount |
| term_duration | INTEGER | Duration in months |
| paid_amount | NUMERIC | Amount paid so far |
| account_id | UUID | Foreign key to accounts |

### Savings
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | TEXT | Savings jar name |
| account_id | UUID | Foreign key to accounts |
| current_balance | NUMERIC | Current balance in jar |

### Transactions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | TEXT | Transaction name/description |
| date | TIMESTAMP | Transaction date |
| amount | NUMERIC | Transaction amount |
| payment_method_id | UUID | Foreign key to accounts |

### Budget Setups
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| month | TEXT | Month name (e.g., January, February) |
| timing | TEXT | Budget timing period (1/2 or 2/2) |
| status | TEXT | Status of the budget setup (e.g., Active, Saved, Completed) |
| total_amount | NUMERIC(10,2) | Total amount allocated in this budget setup |
| data | JSONB | JSON object containing categorized setup items and salary data |
| created_at | TIMESTAMPTZ | Creation timestamp (auto-generated) |

**Note:** The `data` field in budget_setups stores categorized items as well as special fields:
- `_projectedSalary`: The projected salary for this budget period
- `_actualSalary`: The actual salary received (if different from projected)

**Constraints:**
- A unique constraint on (month, timing) ensures only one setup exists per month/timing combination

## Service Layer

The application provides a service layer for interacting with Supabase. All services are located in `src/services/`.

### Available Services

- `accountsService.ts` - Account operations
- `billersService.ts` - Biller operations
- `budgetSetupsService.ts` - Budget setup operations (persistent storage)
- `installmentsService.ts` - Installment operations
- `savingsService.ts` - Savings jar operations
- `transactionsService.ts` - Transaction operations

### Common Operations

Each service provides the following operations:

- `getAll{Entity}()` - Fetch all records
- `get{Entity}ById(id)` - Fetch a single record
- `create{Entity}(data)` - Create a new record
- `update{Entity}(id, data)` - Update an existing record
- `delete{Entity}(id)` - Delete a record

Additional specialized queries are available in each service.

### Budget Setups Persistence Workflow

The Budget Setups feature now uses Supabase for persistent storage instead of localStorage. Here's how it works:

1. **On Application Load**: Budget setups are automatically fetched from Supabase when the app starts
2. **When Saving a Setup**: 
   - User clicks "Save" on the Budget Setup page
   - The setup data (including categorized items and salary information) is saved to Supabase
   - If a setup for the same month/timing already exists, it's updated; otherwise, a new record is created
3. **When Loading a Setup**: 
   - User clicks the arrow button next to a saved setup
   - The setup data is loaded from Supabase and applied to the current budget view
   - Salary fields (projected and actual) are restored from the saved data
4. **When Deleting a Setup**:
   - User clicks "Remove" on a saved setup
   - The setup is deleted from Supabase and moved to the trash

The `data` JSONB field stores:
- Categorized budget items (organized by category)
- `_projectedSalary`: The projected salary amount
- `_actualSalary`: The actual salary amount (if different)

This approach provides:
- **Data Persistence**: Setups are saved across sessions and devices
- **Data Integrity**: Centralized storage in Supabase ensures consistency
- **Scalability**: JSONB allows flexible storage of complex budget structures

## Usage Examples

### Example 1: Fetching All Accounts

```typescript
import { getAllAccounts } from '../src/services/accountsService';
// Or use the barrel export:
// import { getAllAccounts } from '../src/services';

async function loadAccounts() {
  const { data, error } = await getAllAccounts();
  
  if (error) {
    console.error('Failed to load accounts:', error);
    return;
  }
  
  console.log('Accounts:', data);
}
```

### Example 2: Creating a New Account

```typescript
import { createAccount } from '../src/services/accountsService';
// Or use the barrel export:
// import { createAccount } from '../src/services';

async function addAccount() {
  const newAccount = {
    bank: 'Chase Checking',
    classification: 'Checking',
    balance: 1000.00,
    type: 'Debit',
    credit_limit: null,
    billing_date: null,
    due_date: null,
  };

  const { data, error } = await createAccount(newAccount);
  
  if (error) {
    console.error('Failed to create account:', error);
    return;
  }
  
  console.log('Created account:', data);
}
```

### Example 3: Updating an Account Balance

```typescript
import { updateAccount } from '../src/services/accountsService';
// Or use the barrel export:
// import { updateAccount } from '../src/services';

async function updateBalance(accountId: string, newBalance: number) {
  const { data, error } = await updateAccount(accountId, {
    balance: newBalance
  });
  
  if (error) {
    console.error('Failed to update balance:', error);
    return;
  }
  
  console.log('Updated account:', data);
}
```

### Example 4: Using in React Components

```typescript
import React, { useState, useEffect } from 'react';
import { getAllAccounts } from '../src/services/accountsService';
// Or use the barrel export:
// import { getAllAccounts } from '../src/services';
import type { SupabaseAccount } from '../src/types/supabase';

function AccountsList() {
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const { data, error } = await getAllAccounts();
    if (!error && data) {
      setAccounts(data);
    }
    setLoading(false);
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {accounts.map(account => (
        <div key={account.id}>
          {account.bank} - ${account.balance}
        </div>
      ))}
    </div>
  );
}
```

## Safety and Best Practices

### 🔒 Security

1. **Never commit credentials**: Always use environment variables, never hardcode API keys
2. **Use Row Level Security (RLS)**: In production, implement proper RLS policies based on user authentication
3. **Validate user input**: Always validate and sanitize data before sending to the database
4. **Use the anon key**: Never expose your service role key in client-side code

### 🏗️ Development vs Production

#### Development
- Use `.env.local` for local development
- Can use a separate Supabase project for development/testing
- RLS policies can be more permissive for testing

#### Production
- Use environment variables from your hosting platform (Vercel, Netlify, etc.)
- Implement strict RLS policies
- Enable authentication and restrict access based on user roles
- Monitor usage and set up alerts

### ⚡ Performance Tips

1. **Use pagination** for large datasets
2. **Select only needed columns** instead of `*`
3. **Use indexes** on frequently queried columns
4. **Implement caching** for frequently accessed data
5. **Use batch operations** when possible

### 🧪 Testing

1. Test with the **Supabase Demo page** (`/pages/SupabaseDemo.tsx`)
2. Use the browser console to check for errors
3. Monitor the Supabase dashboard for query performance
4. Test with different data scenarios (empty state, large datasets, etc.)

## Troubleshooting

### Common Issues

#### "Missing Supabase environment variables"

**Solution**: Make sure `.env.local` exists and contains valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

#### "Failed to fetch accounts"

**Possible causes**:
1. Tables don't exist in the database - run the schema SQL
2. RLS is enabled but no policies exist - add RLS policies
3. Network issue - check your internet connection
4. Invalid credentials - verify your environment variables

#### "Row Level Security" errors

**Solution**: Either disable RLS (not recommended) or create appropriate policies. See the schema setup section for example policies.

#### TypeScript errors about types

**Solution**: Make sure you're importing types from `src/types/supabase.ts`:
```typescript
import type { SupabaseAccount } from '../src/types/supabase';
```

#### "Real-time balance updates not working" or "Still need to refresh"

**Problem**: Balance changes don't appear automatically after creating/deleting transactions.

**Solution**: Enable Supabase Real-time for the transactions table (see Step 5 above).

**Verify Real-time is working:**
1. Open browser console (F12)
2. Look for these logs:
   ```
   [App] Setting up real-time subscription for transactions
   [App] Real-time subscription status: SUBSCRIBED
   ```
3. Create a transaction and check for:
   ```
   [App] Transaction changed via real-time: INSERT
   ```

**If you see "CHANNEL_ERROR" or no subscription logs:**
- Go to Supabase Dashboard → Database → Replication
- Ensure `transactions` table has Real-time enabled (toggle ON)
- Run the migration: `supabase/migrations/20260204_enable_realtime_transactions.sql`

**If real-time connects but balances don't update:**
- Check browser console for errors
- Verify RLS policies allow reading from transactions table
- Ensure WebSocket connections aren't blocked by firewall/proxy

### Getting Help

1. Check the [Supabase Documentation](https://supabase.com/docs)
2. Review the browser console for detailed error messages
3. Check the Supabase Dashboard logs
4. Verify your database schema matches the expected structure

## Local Development with Supabase CLI (Optional)

For advanced users who want to run Supabase locally:

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Initialize Supabase in your project:
   ```bash
   supabase init
   ```

3. Start local Supabase:
   ```bash
   supabase start
   ```

4. Update `.env.local` to use local endpoints:
   ```env
   VITE_SUPABASE_URL=http://localhost:54321
   VITE_SUPABASE_ANON_KEY=your-local-anon-key
   ```

See [Supabase CLI documentation](https://supabase.com/docs/guides/cli) for more details.

## Migration Notes

### Existing Data Adapters

**Important**: The existing data management code has NOT been removed. This Supabase integration runs alongside existing local state management.

### Next Steps for Full Migration

1. **Test thoroughly**: Use the demo page and existing features to ensure Supabase works correctly
2. **Data migration**: Create scripts to migrate existing local data to Supabase
3. **Update components**: Gradually replace local state with Supabase queries
4. **Remove old code**: Once everything works, remove old data adapter code
5. **Add authentication**: Implement user authentication and proper RLS policies

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [TypeScript Support](https://supabase.com/docs/guides/api/generating-types)
