// src/services/wishlistService.ts
import { supabase } from '../utils/supabaseClient';

export interface WishlistItem {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  url?: string;
  image_url?: string;
  priority: 'High' | 'Medium' | 'Low';
  classification: 'Need' | 'Want' | 'Upgrade';
  group_tag?: string;
  status: 'Saved' | 'Bought' | 'Discarded';
  created_at?: string;
  variants?: WishlistVariant[];
}
export interface WishlistVariant {
  name: string;
  image_url?: string;
  checked?: boolean;
}

export const getWishlistItems = async () => {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('*')
    .eq('status', 'Saved')
    .order('created_at', { ascending: false });
    
  return { data, error };
};

export const addWishlistItem = async (item: Omit<WishlistItem, 'id' | 'user_id' | 'created_at'>) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from('wishlist_items')
    .insert([{ ...item, user_id: userData.user.id }])
    .select()
    .single();
    
  return { data, error };
};

export const updateWishlistItemStatus = async (id: string, status: 'Bought' | 'Discarded') => {
  const { error } = await supabase
    .from('wishlist_items')
    .update({ status })
    .eq('id', id);
  return { error };
};

export const updateWishlistGroup = async (oldName: string, newName: string, coverUrl: string | undefined) => {
  // Bulk update all items matching the old group name (or classification fallback)
  const { error } = await supabase
    .from('wishlist_items')
    .update({ 
      group_tag: newName, 
      group_cover_url: coverUrl || null 
    })
    .or(`group_tag.eq.${oldName},classification.eq.${oldName}`);
    
  return { error };
};

export const uploadWishlistCover = async (file: File) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { url: null, error: 'Not authenticated' };

  // Generate a unique filename: user_id-timestamp.extension
  const fileExt = file.name.split('.').pop();
  const fileName = `${userData.user.id}-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('wishlist_covers')
    .upload(fileName, file);

  if (uploadError) return { url: null, error: uploadError };

  const { data } = supabase.storage
    .from('wishlist_covers')
    .getPublicUrl(fileName);

  return { url: data.publicUrl, error: null };
};

export const updateWishlistItem = async (id: string, updates: Partial<WishlistItem>) => {
  const { data, error } = await supabase
    .from('wishlist_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
};

export const deleteWishlistItem = async (id: string | number) => {
  const { data, error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('id', id)
    .select(); // 🟢 Forces Supabase to return the deleted row(s)
    
  return { data, error };
};

export interface WishlistAlbum {
  id: string;
  name: string;
  cover_url?: string;
}

export const getWishlistAlbums = async () => {
  const { data, error } = await supabase
    .from('wishlist_albums')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
};

export const addWishlistAlbum = async (album: { name: string, cover_url?: string }) => {
  const { data, error } = await supabase
    .from('wishlist_albums')
    .insert([album])
    .select()
    .single();
  return { data, error };
};

export const updateWishlistAlbum = async (id: string, updates: Partial<WishlistAlbum>) => {
  const { data, error } = await supabase
    .from('wishlist_albums')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
};

export const deleteWishlistAlbum = async (id: string) => {
  const { error } = await supabase
    .from('wishlist_albums')
    .delete()
    .eq('id', id);
  return { error };
};


