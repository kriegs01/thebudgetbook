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

    let orQuery = '';

    if (words.length === 1) {
      const word = words[0];
      orQuery = `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,username.ilike.%${word}%`;
    } else if (words.length >= 2) {
      const w1 = words[0];
      const w2 = words.slice(1).join(' '); // Group the rest as the last name
      // Using embedded 'and()' so it precisely matches "First Last" OR "Last First"
      orQuery = `and(first_name.ilike.%${w1}%,last_name.ilike.%${w2}%),and(first_name.ilike.%${w2}%,last_name.ilike.%${w1}%),email.ilike.%${cleanTerm}%,username.ilike.%${cleanTerm}%`;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .neq('user_id', userId)
      .or(orQuery)
      .limit(10);

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

/**
 * Fetch incoming friend requests with the sender's profile attached
 */
export const getIncomingFriendRequests = async (): Promise<SupabaseResponse<any[]>> => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data: friendships, error: fError } = await supabase
      .from('friendships')
      .select('*')
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (fError) throw fError;
    if (!friendships || friendships.length === 0) return { data: [], error: null };

    const senderIds = friendships.map(f => f.user_id);
    const { data: profiles, error: pError } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', senderIds);

    if (pError) throw pError;

    const enrichedRequests = friendships.map(f => ({
      ...f,
      sender_profile: profiles?.find(p => p.user_id === f.user_id)
    }));

    return { data: enrichedRequests, error: null };
  } catch (error: any) {
    console.error('Error fetching incoming requests:', error);
    return { data: null, error };
  }
};