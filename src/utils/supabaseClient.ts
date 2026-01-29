import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co';  // <-- Replace with your real URL
const supabaseKey = 'sb_publishable_xxxx...';               // <-- Replace with your publishable key

export const supabase = createClient(supabaseUrl, supabaseKey);
