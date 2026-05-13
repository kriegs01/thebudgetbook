import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFriendships, getIncomingRequests, acceptFriendRequest, removeFriendship } from '../services/friendshipsService';
import { getUnreadMessagesCount } from '../services/messagesService';
import { getAllPeople } from '../services/peopleService';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export const socialKeys = {
  all: ['social'] as const,
  friendships: () => [...socialKeys.all, 'friendships'] as const,
  incomingRequests: () => [...socialKeys.all, 'incomingRequests'] as const,
  localPeople: () => [...socialKeys.all, 'localPeople'] as const,
  profiles: (userIds: string[]) => [...socialKeys.all, 'profiles', userIds] as const,
  unreadMessages: () => [...socialKeys.all, 'unreadMessages'] as const,
};

// 1. Fetch Friendships (My Budies)
export function useFriendships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.friendships(),
    queryFn: async () => {
      const { data, error } = await getFriendships();
      if (error) throw new Error(error.message || 'Could not fetch friendships.');
      return data || []; // Ensure we always return an array
    },
    enabled: !!user, // Only run if the user is authenticated
    staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
  });
}

// 5. Fetch Unread Messages Count
export function useUnreadMessagesCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.unreadMessages(),
    queryFn: async () => {
      if (!user) return 0;
      return await getUnreadMessagesCount(user.id);
    },
    enabled: !!user,
    refetchInterval: 1000 * 30, // Background poll every 30 seconds to catch missed sockets
  });
}

// 2. Fetch Incoming Friend Requests (For the Bell Icon)
export function useIncomingRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.incomingRequests(),
    queryFn: async () => {
        const { data, error } = await getIncomingRequests();
        if (error) throw new Error(error.message || 'Could not fetch requests.');
        return data || [];
    },
    enabled: !!user,
    refetchInterval: 1000 * 60, // Poll every minute for new requests
  });
}

// 3. Fetch Local People Table
export function useLocalPeople() {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.localPeople(),
    queryFn: async () => {
      const { data, error } = await getAllPeople();
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

// 4. Fetch User Profiles dynamically based on an array of User IDs
export function useBudeeProfiles(userIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: socialKeys.profiles(userIds),
    queryFn: async () => {
      if (!userIds.length) return [];
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .in('user_id', userIds);
      if (error) throw error;
      return data || [];
    },
    // Only run this query if we have actual IDs to fetch
    enabled: !!user && userIds.length > 0,
    staleTime: 1000 * 60 * 60, // Profiles rarely change, cache for 1 hour
  });
}