
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
import type { SupabaseUserProfile } from '../types/supabase';
import { getUserProfile, createUserProfile, updateUserProfile } from '../services/userProfileService';
import { clearAuthCache } from '../utils/authCache';

// ... (interface and context creation remain the same)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ... (state and other functions remain the same)

  const resetPassword = async (email: string) => {
    try {
      // CORRECTED: Point to the public confirmation route
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      });

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
      console.error('[Auth] Reset password error:', error);
      return { error };
    }
  };

  // ... (the rest of the provider remains the same)

  const value = {
    user,
    session,
    userProfile,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword, // This now uses the corrected function
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
