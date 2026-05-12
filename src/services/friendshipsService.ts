import { supabase } from './supabaseClient';

// Helper to get current user ID safely
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // This might happen on initial load or if session is lost.
    // The query will be re-run by React Query upon auth state change.
    console.warn('User not available yet for friendship fetch.');
    return null;
  }
  return user.id;
};

export const getFriendships = async () => {
  const userId = await getCurrentUserId();
  if (!userId) return { data: [], error: null }; // Return empty if no user

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      user_id,
      friend_id,
      status,
      created_at,
      user_profile:user_id ( first_name, last_name ),
      friend_profile:friend_id ( first_name, last_name )
    `)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) {
    console.error('Error fetching friendships:', error);
    return { data: null, error };
  }

  // Normalize data to show the other person's profile
  const friends = data.map(f => {
    const isUserInitiator = f.user_id === userId;
    return {
      id: f.id,
      friend_id: isUserInitiator ? f.friend_id : f.user_id,
      status: f.status,
      created_at: f.created_at,
      profile: isUserInitiator ? f.friend_profile : f.user_profile,
    };
  });

  return { data: friends, error: null };
};

export const getIncomingRequests = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      status,
      created_at,
      sender_profile:user_id ( first_name, last_name )
    `)
    .eq('friend_id', userId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error fetching incoming requests:', error);
  }

  return { data, error };
};

export const acceptFriendRequest = async (requestId: string) => {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', requestId)
    .select();

  if (error) console.error('Error accepting friend request:', error);
  return { data, error };
};

export const removeFriendship = async (friendshipId: string) => {
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) console.error('Error removing friendship:', error);
  return { data, error };
};

export const sendFriendRequest = async (friendId: string) => {
    const userId = await getCurrentUserId();
    if (!userId) return { data: null, error: new Error('User not authenticated') };

  // Check if a friendship already exists
  const { data: existing, error: existingError } = await supabase
    .from('friendships')
    .select('id, status')
    .or(`(user_id.eq.${userId},friend_id.eq.${friendId}),(user_id.eq.${friendId},friend_id.eq.${userId})`)
    .maybeSingle();

  if (existingError) {
    console.error('Error checking for existing friendship:', existingError);
    return { data: null, error: existingError };
  }

  if (existing) {
    if (existing.status === 'accepted') return { data: null, error: new Error('You are already friends.') };
    if (existing.status === 'pending') return { data: null, error: new Error('A friend request is already pending.') };
    if (existing.status === 'declined' || existing.status === 'blocked') {
      // Allow re-sending request if it was declined/blocked previously by updating the status
      const { data, error } = await supabase
        .from('friendships')
        .update({ status: 'pending', user_id: userId, friend_id: friendId })
        .eq('id', existing.id)
        .select();
      return { data, error };
    }
  }

  // If no previous record, create a new one
  const { data, error } = await supabase
    .from('friendships')
    .insert({ user_id: userId, friend_id: friendId, status: 'pending' })
    .select();

  if (error) console.error('Error sending friend request:', error);
  return { data, error };
};