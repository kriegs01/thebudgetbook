# Plan: Off-Site Admin Tool & Feature Flags

## Overview
To safely control app features (like putting specific modules into "Maintenance Mode" while working on the database or code), we will build a dedicated, secure admin tool and implement a Feature Flag system.

## Strategy: Separate Vercel Project
We will create a completely separate, lightweight Vercel project (e.g., `admin.yourdomain.com`). 
* **Security:** This ensures the highest level of security. Admin logic and elevated permissions are kept completely out of the main user-facing application bundle.
* **Performance:** The main app remains fast and lightweight.
* **Tech Stack:** A minimal Vite + React app that connects to the exact same Supabase database.

---

## Phase 1: Database Setup (Supabase)
We need a new table to store the state of our app's features, and we need to enable Real-time on it so changes reflect instantly for users.

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name TEXT UNIQUE NOT NULL, -- e.g., 'billers', 'installments', 'budget_setup'
  is_active BOOLEAN DEFAULT true,
  maintenance_message TEXT DEFAULT 'This feature is currently undergoing maintenance.',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Real-time to push updates to connected clients instantly
ALTER TABLE feature_flags REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE feature_flags;
```

---

## Phase 2: Main App Real-time Integration
To make feature flags clean to implement without scattering `if` statements everywhere, we will wrap our modularized features.

1. **Create a Hook (`useFeatureFlag.ts`)**: Listens to the `feature_flags` table via Supabase Realtime.
2. **Module Wrappers**: Create entry-point components for features.

```tsx
// Example implementation in the main app
export const BillerModule = () => {
  const { isActive, message } = useFeatureFlag('billers');

  if (!isActive) {
    return <MaintenanceScreen title="Billers Offline" message={message} />;
  }

  return <BillerDashboard />;
};
```

---

## Phase 3: Building the Admin App
1. Scaffold a new, blank Vite project locally (e.g., `thebudgetbook-admin`).
2. Connect to the existing Supabase project.
3. Build a simple dashboard with toggle switches for each feature in the `feature_flags` table.
4. Deploy to Vercel (using Vercel's built-in password protection or basic Auth for access).

When ready, we can tackle any of these phases!