import React, { useEffect, useState, useRef } from 'react';
import { X, Send, MessageCircle, ArrowLeft } from 'lucide-react';
import { subscribeToIncomingMessages, getConversation, sendMessage, Message } from '../services/messagesService';
import { getFriendships } from '../services/friendshipsService';
import { supabase } from '../utils/supabaseClient';

interface MessagesInboxProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  activeFriendId?: string; // If a conversation is selected
  onClearActiveChat?: () => void;
}

export const MessagesInbox: React.FC<MessagesInboxProps> = ({ isOpen, onClose, currentUserId, activeFriendId, onClearActiveChat }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Internal routing states for the messaging hub
  const [internalChatId, setInternalChatId] = useState<string | undefined>();
  const [inboxList, setInboxList] = useState<any[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [chatProfile, setChatProfile] = useState<any>(null);

  // Sync external prop to internal state
  useEffect(() => {
    if (activeFriendId) {
      setInternalChatId(activeFriendId);
    }
  }, [activeFriendId]);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, internalChatId]);

  // Load Inbox Hub List View
  useEffect(() => {
    if (!isOpen || internalChatId) return;

    const fetchInbox = async () => {
      setIsLoadingInbox(true);
      try {
        const { data: friendships } = await getFriendships();
        const acceptedFriends = friendships?.filter(f => f.status === 'accepted') || [];
        const friendIds = acceptedFriends.map(f => f.user_id === currentUserId ? f.friend_id : f.user_id);
        
        if (friendIds.length === 0) {
          setInboxList([]);
          setIsLoadingInbox(false);
          return;
        }

        const { data: profiles } = await supabase.from('user_profiles').select('*').in('user_id', friendIds);
        
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .order('created_at', { ascending: false });

        const combined = profiles?.map(prof => {
          const msgs = recentMsgs?.filter(m => m.sender_id === prof.user_id || m.receiver_id === prof.user_id) || [];
          return {
            profile: prof,
            lastMessage: msgs[0] || null
          };
        }).sort((a, b) => {
          const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
          const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
          return timeB - timeA; 
        }) || [];

        setInboxList(combined);
      } catch (err) {
        console.error("Error loading inbox", err);
      }
      setIsLoadingInbox(false);
    };

    fetchInbox();
  }, [isOpen, internalChatId, currentUserId]);

  // Load active chat profile details dynamically
  useEffect(() => {
    if (!internalChatId) {
      setChatProfile(null);
      return;
    }
    const fetchProf = async () => {
      const { data } = await supabase.from('user_profiles').select('*').eq('user_id', internalChatId).single();
      setChatProfile(data);
    };
    fetchProf();
  }, [internalChatId]);

  // Load history and subscribe to live updates
  useEffect(() => {
    if (!isOpen || !internalChatId) return;

    const loadHistory = async () => {
      try {
        const { data } = await getConversation(currentUserId, internalChatId);
        if (data) setMessages(data);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };

    loadHistory();

    // Start Realtime Subscription
    const channel = subscribeToIncomingMessages(currentUserId, (newMsg: Message) => {
      if (newMsg.sender_id === internalChatId) {
        setMessages((prev) => [...prev, newMsg]);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [isOpen, currentUserId, internalChatId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !internalChatId) return;

    try {
      const { data } = await sendMessage({
        sender_id: currentUserId,
        receiver_id: internalChatId,
        content: newMessage,
      });
      
      if (data) {
        setMessages((prev) => [...prev, data]);
        setNewMessage('');
      }
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const handleBackToInbox = () => {
    setInternalChatId(undefined);
    setMessages([]);
    if (onClearActiveChat) onClearActiveChat();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-800 transition-transform transform">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {internalChatId && (
            <button onClick={handleBackToInbox} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">
              {internalChatId ? (chatProfile ? `${chatProfile.first_name} ${chatProfile.last_name}` : 'Chat') : 'Inbox'}
            </h2>
            {internalChatId && chatProfile && (
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {chatProfile.username ? `@${chatProfile.username}` : 'Budee User'}
              </p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!internalChatId ? (
        <div className="flex-1 overflow-y-auto">
          {isLoadingInbox ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm font-medium">Loading conversations...</div>
          ) : inboxList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
              <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">No Messages Yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Head to the People page to start a conversation with your connected Budies.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {inboxList.map((item) => (
                <button
                  key={item.profile.user_id}
                  onClick={() => setInternalChatId(item.profile.user_id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center uppercase shrink-0">
                    {(item.profile.first_name?.charAt(0) || '') + (item.profile.last_name?.charAt(0) || '') || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                        {item.profile.first_name} {item.profile.last_name}
                      </h4>
                      {item.lastMessage && (
                        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap ml-2">
                          {new Date(item.lastMessage.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {item.lastMessage ? (
                        item.lastMessage.sender_id === currentUserId ? `You: ${item.lastMessage.content}` : item.lastMessage.content
                      ) : (
                        <span className="italic">Start a conversation</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">
                This is the start of your conversation
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === currentUserId;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'}`}>
                      <p className="text-sm">{msg.content}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 block text-right ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <form onSubmit={handleSend} className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
              />
              <button type="submit" disabled={!newMessage.trim()} className="p-3 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};