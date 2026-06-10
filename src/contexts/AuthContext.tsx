
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
  isPasswordRecovery: boolean;
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

const CREATOR_USER_ID = import.meta.env.VITE_CREATOR_USER_ID ?? '';

async function migrateExistingData(userId: string) {
  if (userId !== CREATOR_USER_ID) {
    console.log('[Auth] Data migration not required for this user.');
    return;
  }
  console.log('[Auth] Starting data migration for creator user:', userId);
  const tables = ['accounts','billers','installments','savings','transactions','budget_setups','monthly_payment_schedules'];
  try {
    for (const table of tables) {
      const { data, error } = await supabase.from(table).update({ user_id: userId }).is('user_id', null).select();
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (!session) {
        setIsPasswordRecovery(false);
      } else if (_event === 'SIGNED_IN') {
        setIsPasswordRecovery(false);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        // Avoid awaiting extra Supabase calls directly inside the auth callback.
        setTimeout(async () => {
          await loadUserProfile(session.user.id);
          if (_event === 'SIGNED_IN') {
            await migrateExistingData(session.user.id);
          }
        }, 0);
      } else {
        setUserProfile(null);
        localStorage.removeItem('pin_protection');
        sessionStorage.removeItem('pin_tab_session');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        const { error: profileError } = await createUserProfile({ user_id: data.user.id, first_name: firstName, last_name: lastName });
        if (profileError) {
          console.error('[Auth] Error creating profile:', profileError);
        }
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Sign in error:', error);
      return { error };
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('pin_protection');
      sessionStorage.removeItem('pin_tab_session');
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
      const { error } = await updateUserProfile(user.id, { first_name: firstName, last_name: lastName });
      if (error) throw error;
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
    isPasswordRecovery,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
