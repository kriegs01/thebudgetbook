import { useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { localDb } from '../utils/db';
import { useAuth } from '../contexts/AuthContext';

export function useProductSync() {
  const { user } = useAuth();

  const sync = useCallback(async () => {
    if (!user || !navigator.onLine) return;

    try {
      // ==========================================
      // PHASE 1: PUSH OFFLINE EDITS TO THE CLOUD
      // ==========================================
      
      // 🟢 A. Push Personal Prices
      const pendingPrices = await localDb.user_prices
        .filter(p => p.sync_status !== 'synced')
        .toArray();

      if (pendingPrices.length > 0) {
        const supabasePrices = pendingPrices.map(item => ({
          barcode: item.barcode,
          user_id: user.id,
          name: item.name,
          current_price: item.current_price,
          price_history: item.price_history
        }));

        const { error: pushError } = await supabase
          .from('user_prices')
          .upsert(supabasePrices, { onConflict: 'barcode,user_id' });

        if (pushError) throw pushError;

        await Promise.all(pendingPrices.map(item => 
          localDb.user_prices.update(item.barcode, { sync_status: 'synced' })
        ));
        console.log(`[Sync Engine] ⬆️ Pushed ${pendingPrices.length} personal prices to cloud.`);
      }

      // 🟢 B. Push Global Dictionary (For the Pioneers!)
      const pendingGlobals = await localDb.global_products
        .filter(p => p.sync_status !== 'synced')
        .toArray();

      if (pendingGlobals.length > 0) {
        const supabaseGlobals = pendingGlobals.map(item => ({
          barcode: item.barcode,
          name: item.name
        }));

        // We use ignoreDuplicates so if someone else added it first, we don't overwrite them!
        const { error: globalError } = await supabase
          .from('global_products')
          .upsert(supabaseGlobals, { onConflict: 'barcode', ignoreDuplicates: true });

        if (globalError) {
          console.warn('[Sync Engine] Global sync skipped a duplicate:', globalError);
        }

        await Promise.all(pendingGlobals.map(item => 
          localDb.global_products.update(item.barcode, { sync_status: 'synced' })
        ));
        console.log(`[Sync Engine] ⬆️ Contributed ${pendingGlobals.length} new items to global dictionary.`);
      }

      // ==========================================
      // PHASE 2: PULL MASTER LIST FROM CLOUD
      // ==========================================
      
      // We only pull the user's personal prices to keep the local database ultra-fast.
      // (Global lookups happen in real-time inside BarcodeScanner!)
      const { data: cloudItems, error: pullError } = await supabase
        .from('user_prices')
        .select('*')
        .eq('user_id', user.id);

      if (pullError) throw pullError;

      if (cloudItems && cloudItems.length > 0) {
        const localFormats = cloudItems.map(item => ({
          barcode: item.barcode.toString(),
          user_id: item.user_id,
          name: item.name,
          current_price: Number(item.current_price),
          price_history: item.price_history || [],
          sync_status: 'synced' as const,
          last_updated: new Date(item.updated_at || item.created_at).getTime()
        }));

        await localDb.user_prices.bulkPut(localFormats);
        console.log(`[Sync Engine] ⬇️ Pulled ${cloudItems.length} personal prices from cloud.`);
      }
    } catch (error) {
      console.error('[Sync Engine] Sync failed:', error);
    }
  }, [user]);

  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  return { sync };
}
