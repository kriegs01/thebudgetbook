import React, { useEffect, useState } from 'react';
import { supabase } from './utils/supabaseClient';

interface Account {
  id: string | number;
  bank: string;
  balance: number;
}

const TestSupabase: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const { data, error } = await supabase.from('accounts').select('*');
        if (error) {
          setError(error.message);
        } else {
          setAccounts(data ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    };
    fetchAccounts();
  }, []);

  return (
    <div>
      <h2>Accounts from Supabase:</h2>
      {error && <div className="text-red-600">{error}</div>}
      <ul>
        {accounts.map(acc => (
          <li key={acc.id}>{acc.bank} - {acc.balance}</li>
        ))}
      </ul>
    </div>
  );
}

export default TestSupabase;
