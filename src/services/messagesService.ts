import { supabase } from '../utils/supabaseClient';

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  related_transaction_id?: string | null;
  related_installment_id?: string | null;
  read_at?: string | null;
  created_at: string;
}

export type SendMessageInput = Omit<Message, 'id' | 'created_at' | 'read_at'>;

// Fetch conversation history between the logged-in user and a specific friend
export const getConversation = async (userId: string, friendId: string) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true });
    
  if (error) throw error;
  return { data: data as Message[], error: null };
};

// Send a new message
export const sendMessage = async (message: SendMessageInput) => {
  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) throw error;
  return { data: data as Message, error: null };
};

// Mark a specific message (or array of messages) as read
export const markMessagesAsRead = async (messageIds: string[]) => {
  const { data, error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .in('id', messageIds)
    .select();

  if (error) throw error;
  return { data, error: null };
};

// Get total count of unread messages for a user
export const getUnreadMessagesCount = async (userId: string) => {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count || 0;
};

// Set up a real-time listener for new incoming messages
export const subscribeToIncomingMessages = (userId: string, onNewMessage: (payload: any) => void) => {
  return supabase
    .channel('inbox-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, (payload) => {
      onNewMessage(payload.new);
    })
    .subscribe();
};