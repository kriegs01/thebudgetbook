import React, { useEffect, useState, useRef } from 'react';
import { X, Send, MessageCircle, ArrowLeft, Banknote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeToIncomingMessages, getConversation, sendMessage, Message } from '../services/messagesService';
import { supabase } from '../utils/supabaseClient';
import { useFriendships, useBudeeProfiles } from '../hooks/useBudies';

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
  const navigate = useNavigate();

  // Internal routing states for the messaging hub
  const [internalChatId, setInternalChatId] = useState<string | undefined>();
  const [inboxList, setInboxList] = useState<any[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const hasLoadedInboxRef = useRef(false);

  // Quick Request state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqAmount, setReqAmount] = useState('');
  const [reqNote, setReqNote] = useState('');

  // Consume Globally Cached Social Data
  const { data: friendships } = useFriendships();
  const acceptedFriends = friendships?.filter(f => f.status === 'accepted') || [];
  const friendIds = acceptedFriends.map(f => f.user_id === currentUserId ? f.friend_id : f.user_id);
  const { data: profiles, isLoading: isLoadingProfiles } = useBudeeProfiles(friendIds);
  const chatProfile = profiles?.find(p => p.user_id === internalChatId);

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
      // Only show the loading spinner on the very first load
      if (!hasLoadedInboxRef.current) {
        setIsLoadingInbox(true);
      }
      try {
        if (!profiles || profiles.length === 0) {
          setInboxList([]);
          return;
        }
        
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .order('created_at', { ascending: false });

        const combined = profiles.map(prof => {
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
      } finally {
        setIsLoadingInbox(false);
        hasLoadedInboxRef.current = true;
      }
    };

    if (!isLoadingProfiles) fetchInbox();
  }, [isOpen, internalChatId, currentUserId, profiles, isLoadingProfiles]);

  // Load history and subscribe to live updates
  useEffect(() => {
    if (!isOpen || !internalChatId) return;

    // Instantly clear old messages when switching to a new chat
    setMessages([]);

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

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqAmount.trim() || !internalChatId) return;

    try {
      const { data } = await sendMessage({
        sender_id: currentUserId,
        receiver_id: internalChatId,
        content: `[PAY_REQUEST]|${reqAmount}|${reqNote || 'Payment Request'}`,
      });
      
      if (data) {
        setMessages((prev) => [...prev, data]);
        setShowRequestForm(false);
        setReqAmount('');
        setReqNote('');
      }
    } catch (err) {
      console.error('Failed to send request', err);
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
                const isPayReq = msg.content.startsWith('[PAY_REQUEST]|');

                if (isPayReq) {
                  const parts = msg.content.split('|');
                  const amt = parts[1] || '0.00';
                  const note = parts[2] || '';
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`w-48 md:w-56 rounded-2xl p-4 shadow-sm border ${isMe ? 'bg-indigo-50 border-indigo-100 text-indigo-900 rounded-br-sm dark:bg-indigo-900/30 dark:border-indigo-800' : 'bg-white border-gray-200 text-gray-900 rounded-bl-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Banknote className="w-4 h-4 text-indigo-500" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Request</span>
                        </div>
                        <p className="text-2xl font-black mb-1">₱{amt}</p>
                        <p className="text-xs opacity-80 mb-4 truncate">{note}</p>
                        {!isMe && (
                          <button
                            onClick={() => {
                              onClose();
                              alert(`Ready to pay ₱${amt} for ${note}? We'll hook this up to the transfer modal next!`);
                            }}
                            className="w-full bg-indigo-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                          >
                            Pay Now
                          </button>
                        )}
                        <span className={`text-[9px] font-bold uppercase tracking-widest block text-right mt-2 ${isMe ? 'text-indigo-400' : 'text-gray-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                }

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

          {showRequestForm ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5"><Banknote className="w-4 h-4"/> Payment Request</span>
                <button onClick={() => setShowRequestForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><X className="w-4 h-4"/></button>
              </div>
              <form onSubmit={handleSendRequest} className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative w-1/3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                    <input type="number" step="0.01" min="0.01" value={reqAmount} onChange={e => setReqAmount(e.target.value)} placeholder="0.00" className="w-full bg-gray-50 dark:bg-gray-800 dark:text-white rounded-xl py-3 pl-8 pr-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500 transition-all" required />
                  </div>
                  <input type="text" value={reqNote} onChange={e => setReqNote(e.target.value)} placeholder="For what?" className="flex-1 bg-gray-50 dark:bg-gray-800 dark:text-white rounded-xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <button type="submit" disabled={!reqAmount} className="w-full bg-indigo-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                  Send Request
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
              <form onSubmit={handleSend} className="flex items-center space-x-2">
                <button type="button" onClick={() => setShowRequestForm(true)} className="p-3 text-indigo-500 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 rounded-2xl transition-colors">
                  <Banknote className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 transition-all"
                />
                <button type="submit" disabled={!newMessage.trim()} className="p-3 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
};