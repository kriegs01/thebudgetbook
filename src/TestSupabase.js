import React, { useEffect } from 'react';
import { supabase } from './utils/supabaseClient'; // Update path if needed!

const TestSupabase = () => {
  useEffect(() => {
    // Try to get all accounts from Supabase
    async function fetchAccounts() {
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) {
        console.error('Error:', error);
      } else {
        console.log('Accounts:', data);
      }
    }
    fetchAccounts();
  }, []);

  return (
    <div>
      <h2>Supabase Test</h2>
      <p>Open the browser console to see if it worked.</p>
    </div>
  );
};

export default TestSupabase;
