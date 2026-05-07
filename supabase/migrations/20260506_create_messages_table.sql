-- Create messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    related_transaction_id UUID, -- For contextual chats about a specific split/expense
    related_installment_id UUID, -- For contextual chats about a specific loan
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read messages they sent or received
CREATE POLICY "Users can read their own messages"
ON messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Policy: Users can only send messages from themselves
CREATE POLICY "Users can insert messages they send"
ON messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Policy: Users can mark messages as read if they are the receiver
CREATE POLICY "Users can update messages they received (mark as read)"
ON messages FOR UPDATE
USING (auth.uid() = receiver_id);

-- Enable Supabase Realtime for the messages table
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;