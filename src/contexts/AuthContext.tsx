import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Migrate existing data (with null user_id) to the current user's account
 * This runs once after a user's first successful login
 */
async function migrateExistingData(userId: string) {
  console.log('[Auth] Starting data migration for user:', userId);

  const tables = [
    'accounts',
    'billers',
    'installments',
    'savings',
    'transactions',
    'budget_setups',
    'monthly_payment_schedules'
  ];

  try {
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .update({ user_id: userId })
        .is('user_id', null)
        .select();

      if (error) {
        console.error(`[Auth] Error migrating ${table}:`, error);
      } else if (data && data.length > 0) {
        console.log(`[Auth] Migrated ${data.length} records in ${table}`);
      }
    }

    console.log('[Auth] Data migration completed successfully');
  } catch (error) {
    console.error('[Auth] Data migration failed:', error);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('[Auth] State changed:', _event);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Migrate data on first sign in
        if (_event === 'SIGNED_IN' && session?.user) {
          await migrateExistingData(session.user.id);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // If signup successful and user is immediately logged in, migrate data
      if (data.user && data.session) {
        await migrateExistingData(data.user.id);
      }

      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Sign up error:', error);
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Migration happens automatically through onAuthStateChange
      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Sign in error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
      throw error;
    }
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
