import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabaseClient';
import { getAllTransactions } from '../services/transactionsService';
import type { Transaction } from '../../types';
import type { SupabaseTransaction } from '../types/supabase';

const formatTransaction = (supabaseTransaction: SupabaseTransaction): Transaction => ({
  id: supabaseTransaction.id,
  name: supabaseTransaction.name,
  date: supabaseTransaction.date,
  amount: supabaseTransaction.amount,
  paymentMethodId: supabaseTransaction.payment_method_id,
  transaction_type: supabaseTransaction.transaction_type ?? null,
  borrower_name: supabaseTransaction.borrower_name ?? null,
  receiptUrl: supabaseTransaction.receipt_url ?? null,
});

export function useTransactions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await getAllTransactions();
      if (error) throw error;
      return {
        raw: data || [],
        formatted: (data || []).map(formatTransaction),
      };
    },
  });

  // Centralized Real-Time Listener
  useEffect(() => {
    const channel = supabase
      .channel('transactions-realtime-cache')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        console.log('[React Query] Transaction changed via real-time:', payload.eventType);
        // Instantly tell the cache to refresh itself in the background
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}