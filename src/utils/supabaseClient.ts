import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase configuration
// Add these to your .env file:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_KEY=your-publishable-key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_xxxx...';

export const supabase = createClient(supabaseUrl, supabaseKey);

