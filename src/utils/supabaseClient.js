import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ozildpjxuseziclkdfov.supabase.co'; // Replace with your project’s URL
const supabaseKey = 'sb_publishable_x-WeSNi_xB1Aao8sdk6nUw_U3SEwEWp'; // Replace with your Project’s Public Anon Key

export const supabase = createClient(supabaseUrl, supabaseKey);
