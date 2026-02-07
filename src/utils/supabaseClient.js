import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Configuration
 * 
 * This client is configured using environment variables to ensure
 * credentials are never hardcoded. Make sure to set up your .env.local file
 * with the correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.
 * 
 * For production, use environment variables in your deployment platform.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Please check your .env.local file.\n' +
    'Required variables:\n' +
    '  - VITE_SUPABASE_URL\n' +
    '  - VITE_SUPABASE_ANON_KEY\n\n' +
    'See .env.example for reference.'
  );
  throw new Error('Missing required Supabase environment variables. Check .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

/**
 * Get the table name based on test environment setting
 * @param {string} baseTableName - The base table name (e.g., 'accounts')
 * @returns {string} - The table name with _test suffix if in test mode
 */
export const getTableName = (baseTableName) => {
  const isTestMode = typeof window !== 'undefined' && localStorage.getItem('test_environment_enabled') === 'true';
  return isTestMode ? `${baseTableName}_test` : baseTableName;
};
