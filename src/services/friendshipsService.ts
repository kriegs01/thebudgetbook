import { supabase } from '../utils/supabaseClient';
import type { SupabaseFriendship, SupabaseResponse, SupabaseUserProfile } from '../types/supabase';

// Helper to get current user ID
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
};

/**
 * Search for users to add as friends by name or handle
 */
export const searchUsers = async (searchTerm: string): Promise<SupabaseResponse<SupabaseUserProfile[]>> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    // Clean the search term (remove '@' if they typed a handle)
    const cleanTerm = searchTerm.replace('@', '');

    // Split the search term by spaces to handle full name searches (e.g. "John Doe")
    const words = cleanTerm.split(/\s+/).filter(Boolean);

    let query = supabase
      .from('user_profiles')
      .select('*')
      .neq('user_id', userId);
      
    // Each typed word must match at least one of the searchable columns
    for (const word of words) {
      query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,username.ilike.%${word}%`);
    }

    const { data, error } = await query.limit(10);
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('Error searching users:', error);
    return { data: null, error };
  }
};

/**
 * Send a new friend request
 */
export const sendFriendRequest = async (friendId: string): Promise<SupabaseResponse<SupabaseFriendship>> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: friendId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('Error sending friend request:', error);
    return { data: null, error };
  }
};

/**
 * Fetch all friendships (pending, accepted, blocked) involving the current user
 */
export const getFriendships = async (): Promise<SupabaseResponse<SupabaseFriendship[]>> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('friendships')
      .select(`*`)
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching friendships:', error);
    return { data: null, error };
  }
};

/**
 * Accept an incoming friend request
 */
export const acceptFriendRequest = async (friendshipId: string): Promise<SupabaseResponse<SupabaseFriendship>> => {
  try {
    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('Error accepting friend request:', error);
    return { data: null, error };
  }
};

/**
 * Reject, cancel, or remove a friend
 */
export const removeFriendship = async (friendshipId: string): Promise<SupabaseResponse<boolean>> => {
  try {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) throw error;
    return { data: true, error: null };
  } catch (error: any) {
    console.error('Error removing friendship:', error);
    return { data: null, error };
  }
};