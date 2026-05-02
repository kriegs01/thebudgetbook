import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../utils/supabaseClient';
import { getAllAccountsFrontend } from '../services/accountsService';

export function useAccounts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await getAllAccountsFrontend();
      if (error) throw error;
      return data || [];
    },
  });

  // Centralized Real-Time Listener
  useEffect(() => {
    const channel = supabase
      .channel('accounts-realtime-cache')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, (payload) => {
        console.log('[React Query] Account changed via real-time:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}