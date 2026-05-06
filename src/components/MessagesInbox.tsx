import React, { useEffect, useState, useRef } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { subscribeToIncomingMessages, getConversation, sendMessage, Message } from '../services/messagesService';

interface MessagesInboxProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  activeFriendId?: string; // If a conversation is selected
}

export const MessagesInbox: React.FC<MessagesInboxProps> = ({ isOpen, onClose, currentUserId, activeFriendId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Load history and subscribe to live updates
  useEffect(() => {
    if (!isOpen || !activeFriendId) return;

    const loadHistory = async () => {
      try {
        const { data } = await getConversation(currentUserId, activeFriendId);
        if (data) setMessages(data);
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };

    loadHistory();

    // Start Realtime Subscription
    const channel = subscribeToIncomingMessages(currentUserId, (newMsg: Message) => {
      // Only append if the message is from the person we are actively chatting with
      if (newMsg.sender_id === activeFriendId) {
        setMessages((prev) => [...prev, newMsg]);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [isOpen, currentUserId, activeFriendId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeFriendId) return;

    try {
      const { data } = await sendMessage({
        sender_id: currentUserId,
        receiver_id: activeFriendId,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-800 transition-transform transform">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-black">Inbox</h2>
        <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!activeFriendId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <MessageCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">No Chat Selected</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Select a Budee from your network to start messaging.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'}`}>
                    <p className="text-sm">{msg.content}</p>
                    <span className="text-[10px] opacity-70 mt-1 block text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <form onSubmit={handleSend} className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-50 dark:bg-gray-800 border-transparent rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
              <button type="submit" disabled={!newMessage.trim()} className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};