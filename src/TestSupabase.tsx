import React, { useEffect, useState } from 'react';
import { supabase } from './utils/supabaseClient';

const TestSupabase: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) setError(error.message);
      else setAccounts(data ?? []);
    };
    fetchAccounts();
  }, []);

  return (
    <div>
      <h2>Accounts from Supabase:</h2>
      {error && <div style={{color:'red'}}>{error}</div>}
      <ul>
        {accounts.map(acc => (
          <li key={acc.id}>{acc.bank} - {acc.balance}</li>
        ))}
      </ul>
    </div>
  );
}

export default TestSupabase;
