import { useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { localDb } from '../utils/db';
import { useAuth } from '../contexts/AuthContext'; // Using your existing AuthContext

export function useProductSync() {
  const { user } = useAuth();

  const sync = useCallback(async () => {
    // 1. Bail out if no user is logged in, or if the device is currently offline
    if (!user || !navigator.onLine) return;

    try {
      // --- PHASE 1: PUSH OFFLINE EDITS TO THE CLOUD ---
      // Find all items in Dexie that were added/edited while offline
      const pendingItems = await localDb.products
        .filter(p => p.sync_status !== 'synced')
        .toArray();

      if (pendingItems.length > 0) {
        // Format them for Supabase
        const supabaseItems = pendingItems.map(item => ({
          barcode: item.barcode,
          user_id: user.id,
          name: item.name,
          current_price: item.current_price,
          price_history: item.price_history
        }));

        // Upsert to Supabase (insert new, update existing)
        const { error: pushError } = await supabase
          .from('products')
          .upsert(supabaseItems, { onConflict: 'barcode,user_id' });

        if (pushError) throw pushError;

        // If successful, mark all those local items as 'synced'
        await Promise.all(pendingItems.map(item => 
          localDb.products.update(item.barcode, { sync_status: 'synced' })
        ));
        console.log(`[Sync Engine] ⬆️ Pushed ${pendingItems.length} items to cloud.`);
      }

      // --- PHASE 2: PULL MASTER LIST FROM CLOUD ---
      const { data: cloudItems, error: pullError } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id);

      if (pullError) throw pullError;

      if (cloudItems && cloudItems.length > 0) {
        // Format cloud items for Dexie
        const localFormats = cloudItems.map(item => ({
          barcode: item.barcode,
          user_id: item.user_id,
          name: item.name,
          current_price: Number(item.current_price),
          price_history: item.price_history || [],
          sync_status: 'synced' as const,
          last_updated: new Date(item.updated_at).getTime()
        }));

        // Bulk overwrite the local database so it perfectly matches the cloud
        await localDb.products.bulkPut(localFormats);
        console.log(`[Sync Engine] ⬇️ Pulled ${cloudItems.length} items from cloud.`);
      }
    } catch (error) {
      console.error('[Sync Engine] Sync failed:', error);
    }
  }, [user]);

  // Automatically trigger sync when the app mounts OR when the device regains Wi-Fi
  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  return { sync };
}
