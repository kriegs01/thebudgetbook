-- =============================================================================
-- Phase 2: Social Features Foundation
-- Creates friendships, messages, and upgrades transactions/installments
-- =============================================================================

-- 1. Create friendships table
-- This table now correctly references the `user_profiles` table,
-- which will store the user's name and other profile data.
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

-- 2. Create messages table for contextual chat
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    related_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    related_installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Upgrade existing tables to support real connected users
-- These columns will now reference the `user_profiles` table.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS friend_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS friend_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- (Optional: Upgrade test environment tables as well)
ALTER TABLE transactions_test ADD COLUMN IF NOT EXISTS friend_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE installments_test ADD COLUMN IF NOT EXISTS friend_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;


-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Friendships Policies: Users can view, create, update, and delete if they are the sender or receiver
DROP POLICY IF EXISTS "Users can view their own friendships" ON friendships;
CREATE POLICY "Users can view their own friendships" ON friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can create friendships" ON friendships;
CREATE POLICY "Users can create friendships" ON friendships FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own friendships" ON friendships;
CREATE POLICY "Users can update their own friendships" ON friendships FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can delete their own friendships" ON friendships;
CREATE POLICY "Users can delete their own friendships" ON friendships FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Messages Policies: Users can view if involved. Can only send as themselves. Can only update 'read_at' if they are the receiver.
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
CREATE POLICY "Users can view their own messages" ON messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update received messages" ON messages;
CREATE POLICY "Users can update received messages" ON messages FOR UPDATE USING (auth.uid() = receiver_id);

-- Create indexes to speed up realtime queries
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_friend_user_id ON transactions(friend_user_id);
CREATE INDEX IF NOT EXISTS idx_installments_friend_user_id ON installments(friend_user_id);
