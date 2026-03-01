import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
import type { SupabaseUserProfile } from '../types/supabase';
import { getUserProfile, createUserProfile, updateUserProfile } from '../services/userProfileService';
import { clearAuthCache } from '../utils/authCache';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: SupabaseUserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updateProfile: (firstName: string, lastName: string) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
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
 * CREATOR_USER_ID - The Supabase UUID of the original data creator.
 * Set the VITE_CREATOR_USER_ID environment variable to the repo owner's Supabase UUID.
 * Only this user will receive the legacy data migration on first login.
 * All other users will be skipped to prevent unintended data assignment.
 *
 * TODO: Add VITE_CREATOR_USER_ID=<your-supabase-uuid> to your .env file.
 */
const CREATOR_USER_ID = import.meta.env.VITE_CREATOR_USER_ID ?? '';

/**
 * Migrate existing data (with null user_id) to the current user's account.
 * This runs once after a user's first successful login.
 *
 * Security: Migration is restricted to the original data creator (CREATOR_USER_ID).
 * Non-creator users are explicitly skipped to prevent accidental data assignment.
 * The creator should replace CREATOR_USER_ID with their actual Supabase UUID.
 */
async function migrateExistingData(userId: string) {
  // Only migrate legacy data for the original creator of this dataset.
  // Other users must not receive legacy null-user_id records.
  if (userId !== CREATOR_USER_ID) {
    console.log('[Auth] Data migration not required for this user.');
    return;
  }

  console.log('[Auth] Starting data migration for creator user:', userId);

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
  const [userProfile, setUserProfile] = useState<SupabaseUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user profile
  const loadUserProfile = async (userId: string) => {
    const { data, error } = await getUserProfile(userId);
    if (data) {
      setUserProfile(data);
    } else if (error) {
      console.error('[Auth] Error loading user profile:', error);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id);
    }
  };

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('[Auth] State changed:', _event);
        
        // Clear auth cache on any auth state change
        clearAuthCache();
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);

        // Migrate data on first sign in
        if (_event === 'SIGNED_IN' && session?.user) {
          await migrateExistingData(session.user.id);
        }
      }
    );

    // Re-validate session when user returns to the tab after dormancy.
    // After long inactivity the auth token lock may be orphaned, causing data
    // loads to fail. Checking the session on visibility change ensures the user
    // is redirected to login if their session has expired.
    let mounted = true;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && !session) {
          clearAuthCache();
          setSession(null);
          setUser(null);
          setUserProfile(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Create user profile
      if (data.user) {
        const { error: profileError } = await createUserProfile({
          user_id: data.user.id,
          first_name: firstName,
          last_name: lastName,
        });

        if (profileError) {
          console.error('[Auth] Error creating profile:', profileError);
        }

        // If signup successful and user is immediately logged in, migrate data
        if (data.session) {
          await migrateExistingData(data.user.id);
        }
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
      setUserProfile(null);
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Reset password error:', error);
      return { error };
    }
  };

  const updateProfile = async (firstName: string, lastName: string) => {
    try {
      if (!user) throw new Error('Not authenticated');

      const { error } = await updateUserProfile(user.id, {
        first_name: firstName,
        last_name: lastName,
      });

      if (error) throw error;

      // Refresh profile data
      await loadUserProfile(user.id);

      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Update profile error:', error);
      return { error };
    }
  };

  const value = {
    user,
    session,
    userProfile,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
