import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../utils/supabaseClient';
import { updateUserProfile, getUserProfile } from '../services/userProfileService';
import { Lock } from 'lucide-react';

interface PinProtectionSettings {
  session_timeout: number; // minutes
  max_attempts: number;
  lockout_duration: number; // minutes
  transaction_deletion_frequency: 'one-time' | 'everytime';
  feature_frequencies?: Record<string, 'one-time' | 'everytime'>;
  standby_timeout?: number; // minutes (0 = off)
  auto_logout_timeout?: number; // minutes (0 = off)
}

interface SessionState {
  authenticated: boolean;
  expires_at: string | null;
  standby_locked: boolean;
}

interface LockoutState {
  locked: boolean;
  unlocks_at: string | null;
  failed_attempts: number;
}

interface PinProtectionData {
  enabled: boolean;
  pin_hash: string;
  created_at: string;
  last_changed: string;
  protected_features: string[];
  settings: PinProtectionSettings;
  session: SessionState;
  lockout: LockoutState;
}

interface PinProtectionContextType {
  isPinEnabled: () => boolean;
  isPinSet: () => boolean;
  setPin: (pin: string) => Promise<boolean>;
  changePin: (currentPin: string, newPin: string) => Promise<boolean>;
  removePin: (currentPin: string) => Promise<boolean>;
  verifyPin: (pin: string) => Promise<boolean>;
  isFeatureProtected: (featureId: string) => boolean;
  requiresVerificationEverytime: (featureId: string) => boolean;
  isSessionActive: () => boolean;
  extendSession: () => void;
  lockOut: () => void;
  isLockedOut: () => boolean;
  getProtectedFeatures: () => string[];
  setProtectedFeatures: (features: string[]) => void;
  togglePinProtection: (enabled: boolean) => void;
  getSettings: () => PinProtectionSettings;
  updateSettings: (settings: Partial<PinProtectionSettings>) => void;
  getLastChangedDate: () => string | null;
  getRemainingAttempts: () => number;
  getLockoutTimeRemaining: () => number; // seconds
  triggerStandbyLock: () => void;
}

const PinProtectionContext = createContext<PinProtectionContextType | undefined>(undefined);

const DEFAULT_SETTINGS: PinProtectionSettings = {
  session_timeout: 5,
  max_attempts: 3,
  lockout_duration: 1,
  transaction_deletion_frequency: 'one-time',
  feature_frequencies: {},
  standby_timeout: 0,
  auto_logout_timeout: 0,
};

const DEFAULT_PROTECTED_FEATURES = ['danger_zone', 'test_environment'];

const STORAGE_KEY = 'pin_protection';

// Simple hash function using btoa with dynamic salt
// Note: For production use, consider upgrading to crypto.subtle.digest (SHA-256)
const hashPin = async (pin: string): Promise<string> => {
  // Use Web Crypto API if available for better security
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(pin + '_budget_book_salt_v1');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to btoa if crypto.subtle fails
      return btoa(pin + '_budget_book_salt_v1');
    }
  }
  // Fallback for environments without crypto.subtle
  return btoa(pin + '_budget_book_salt_v1');
};

export const PinProtectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pinData, setPinData] = useState<PinProtectionData>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        
        // If the session storage flag is missing, this is a new tab or a closed/reopened tab.
        // We lock the session here to ensure the PIN must be entered again.
        if (!sessionStorage.getItem('pin_tab_session')) {
          parsed.session = { authenticated: false, expires_at: null, standby_locked: false };
        }

        // Ensure new settings exist for backward compatibility
        if (!parsed.settings.transaction_deletion_frequency) {
          parsed.settings.transaction_deletion_frequency = 'one-time';
        }
        if (!parsed.settings.feature_frequencies) {
          parsed.settings.feature_frequencies = {};
        }
        
        return parsed;
      } catch {
        // Invalid data, return default
      }
    }
    return {
      enabled: false,
      pin_hash: '',
      created_at: '',
      last_changed: '',
      protected_features: [],
      settings: DEFAULT_SETTINGS,
      session: {
        authenticated: false,
        expires_at: null,
        standby_locked: false,
      },
      lockout: {
        locked: false,
        unlocks_at: null,
        failed_attempts: 0,
      },
    };
  });

  // Auto-save to localStorage whenever pinData changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pinData));
    
    // Sync session state to sessionStorage for tab-close detection
    if (pinData.session.authenticated) {
      sessionStorage.setItem('pin_tab_session', 'true');
    } else {
      sessionStorage.removeItem('pin_tab_session');
    }
  }, [pinData]);

  // Sync PIN from DB on mount (handles new browser/device logins)
  useEffect(() => {
    const syncPinFromDb = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await getUserProfile(user.id);
          if (data) {
            const dbPinHash = data.pin_hash || '';
                const dbFeatures = (data as any).pin_protected_features;
                  const dbSettings = (data as any).pin_settings;
            setPinData(prev => {
                  const newFeatures = Array.isArray(dbFeatures) ? dbFeatures : (prev.protected_features.length > 0 ? prev.protected_features : DEFAULT_PROTECTED_FEATURES);
                    const newSettings = dbSettings && Object.keys(dbSettings).length > 0 ? { ...DEFAULT_SETTINGS, ...dbSettings } : prev.settings;
                    
                    if (dbPinHash !== prev.pin_hash || JSON.stringify(newFeatures) !== JSON.stringify(prev.protected_features) || JSON.stringify(newSettings) !== JSON.stringify(prev.settings)) {
                return {
                  ...prev,
                  pin_hash: dbPinHash,
                  enabled: !!dbPinHash,
                    protected_features: newFeatures,
                    settings: newSettings,
                };
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.error('Failed to sync PIN from database:', err);
      }
    };

    syncPinFromDb();
  }, []);

  // Track global user activity for timeouts
  useEffect(() => {
    const updateActivity = () => {
      localStorage.setItem('budget_last_activity', Date.now().toString());
    };
    let lastCall = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastCall > 1000) { // Throttle updates to max once per second
        lastCall = now;
        updateActivity();
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, handleActivity));
    
    updateActivity(); // Initial ping

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, []);

  const [standbyPin, setStandbyPin] = useState('');
  const [standbyError, setStandbyError] = useState(false);

  // Background timer to check session expiration and lockout
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      // Check session expiration
      if (pinData.session.authenticated && pinData.session.expires_at) {
        const expiresAt = new Date(pinData.session.expires_at);
        if (now >= expiresAt) {
          setPinData(prev => ({
            ...prev,
            session: {
              authenticated: false,
              expires_at: null,
              standby_locked: prev.session.standby_locked,
            },
          }));
        }
      }

      // Check lockout expiration
      if (pinData.lockout.locked && pinData.lockout.unlocks_at) {
        const unlocksAt = new Date(pinData.lockout.unlocks_at);
        if (now >= unlocksAt) {
          setPinData(prev => ({
            ...prev,
            lockout: {
              locked: false,
              unlocks_at: null,
              failed_attempts: 0,
            },
          }));
        }
      }

      // Check Inactivity for Standby & Auto-Logout
      const lastActivityStr = localStorage.getItem('budget_last_activity');
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : Date.now();
      const idleTimeMinutes = (Date.now() - lastActivity) / 1000 / 60;

      if (pinData.enabled && pinData.pin_hash) {
        // Trigger Standby Lock
        if (pinData.settings.standby_timeout && pinData.settings.standby_timeout > 0) {
          if (idleTimeMinutes >= pinData.settings.standby_timeout && !pinData.session.standby_locked) {
            setPinData(prev => ({ ...prev, session: { ...prev.session, standby_locked: true } }));
          }
        }
        
        // Trigger Auto Logout
        if (pinData.settings.auto_logout_timeout && pinData.settings.auto_logout_timeout > 0) {
          if (idleTimeMinutes >= pinData.settings.auto_logout_timeout) {
            const logoutFired = sessionStorage.getItem('auto_logout_fired');
            if (!logoutFired) {
              sessionStorage.setItem('auto_logout_fired', 'true');
              window.dispatchEvent(new CustomEvent('app_idle_logout'));
            }
          } else {
            sessionStorage.removeItem('auto_logout_fired');
          }
        }
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [pinData.session, pinData.lockout, pinData.enabled, pinData.pin_hash, pinData.settings]);

  const isPinEnabled = (): boolean => {
    return pinData.enabled && pinData.pin_hash !== '';
  };

  const isPinSet = (): boolean => {
    return pinData.pin_hash !== '';
  };

  const setPin = async (pin: string): Promise<boolean> => {
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return false;
    }

    const now = new Date().toISOString();
    const hashedPin = await hashPin(pin);

    // Save to database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateUserProfile(user.id, { 
          pin_hash: hashedPin,
          pin_protected_features: DEFAULT_PROTECTED_FEATURES
        } as any);
      }
    } catch (err) {
      console.error('Failed to save PIN to database:', err);
    }

    setPinData(prev => ({
      ...prev,
      pin_hash: hashedPin,
      created_at: now,
      last_changed: now,
      enabled: true,
      protected_features: DEFAULT_PROTECTED_FEATURES,
    }));

    return true;
  };

  // Internal PIN verification that doesn't affect lockout counter
  const verifyPinInternal = async (pin: string): Promise<boolean> => {
    const hashedPin = await hashPin(pin);
    return hashedPin === pinData.pin_hash;
  };

  const changePin = async (currentPin: string, newPin: string): Promise<boolean> => {
    // Use internal verification to avoid affecting lockout counter
    if (!(await verifyPinInternal(currentPin))) {
      return false;
    }

    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return false;
    }

    const now = new Date().toISOString();
    const hashedPin = await hashPin(newPin);

    // Save to database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateUserProfile(user.id, { pin_hash: hashedPin });
      }
    } catch (err) {
      console.error('Failed to update PIN in database:', err);
    }

    setPinData(prev => ({
      ...prev,
      pin_hash: hashedPin,
      last_changed: now,
      lockout: {
        locked: false,
        unlocks_at: null,
        failed_attempts: 0,
      },
    }));

    return true;
  };

  const removePin = async (currentPin: string): Promise<boolean> => {
    // Use internal verification to avoid affecting lockout counter
    if (currentPin && !(await verifyPinInternal(currentPin))) {
      return false;
    }

    // Remove from database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateUserProfile(user.id, { 
          pin_hash: '',
          pin_protected_features: [] 
        } as any);
      }
    } catch (err) {
      console.error('Failed to clear PIN from database:', err);
    }

    setPinData(prev => ({
      ...prev,
      enabled: false,
      pin_hash: '',
      created_at: '',
      last_changed: '',
      protected_features: [],
      session: {
        authenticated: false,
        expires_at: null,
        standby_locked: false,
      },
      lockout: {
        locked: false,
        unlocks_at: null,
        failed_attempts: 0,
      },
    }));

    return true;
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (isLockedOut()) {
      return false;
    }

    const hashedPin = await hashPin(pin);
    const isValid = hashedPin === pinData.pin_hash;

    if (isValid) {
      // Reset failed attempts and extend session
      setPinData(prev => ({
        ...prev,
        lockout: {
          locked: false,
          unlocks_at: null,
          failed_attempts: 0,
        },
      }));
      extendSession();
      return true;
    } else {
      // Increment failed attempts
      const newFailedAttempts = pinData.lockout.failed_attempts + 1;
      
      if (newFailedAttempts >= pinData.settings.max_attempts) {
        lockOut();
      } else {
        setPinData(prev => ({
          ...prev,
          lockout: {
            ...prev.lockout,
            failed_attempts: newFailedAttempts,
          },
        }));
      }
      
      return false;
    }
  };

  const isFeatureProtected = (featureId: string): boolean => {
    return isPinEnabled() && pinData.protected_features.includes(featureId);
  };

  const requiresVerificationEverytime = (featureId: string): boolean => {
    // Force everytime for high-risk features
    if (featureId === 'danger_zone' || featureId === 'test_environment') {
      return true;
    }
    
    // Look up generalized feature frequency
    if (pinData.settings.feature_frequencies && pinData.settings.feature_frequencies[featureId]) {
      return pinData.settings.feature_frequencies[featureId] === 'everytime';
    }

    // Fallback for transaction_deletions backward compatibility
    if (featureId === 'transaction_deletions') {
      return pinData.settings.transaction_deletion_frequency === 'everytime';
    }
    return false;
  };

  const isSessionActive = (): boolean => {
    if (!pinData.session.authenticated || !pinData.session.expires_at) {
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(pinData.session.expires_at);
    return now < expiresAt;
  };

  const extendSession = (): void => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + pinData.settings.session_timeout * 60 * 1000);

    setPinData(prev => ({
      ...prev,
      session: {
        authenticated: true,
        expires_at: expiresAt.toISOString(),
      },
    }));
  };

  const lockOut = (): void => {
    const now = new Date();
    const unlocksAt = new Date(now.getTime() + pinData.settings.lockout_duration * 60 * 1000);

    setPinData(prev => ({
      ...prev,
      lockout: {
        locked: true,
        unlocks_at: unlocksAt.toISOString(),
        failed_attempts: prev.lockout.failed_attempts,
      },
    }));
  };

  const isLockedOut = (): boolean => {
    if (!pinData.lockout.locked || !pinData.lockout.unlocks_at) {
      return false;
    }

    const now = new Date();
    const unlocksAt = new Date(pinData.lockout.unlocks_at);
    return now < unlocksAt;
  };

  const getProtectedFeatures = (): string[] => {
    return pinData.protected_features;
  };

  const setProtectedFeatures = async (features: string[]): Promise<void> => {
    setPinData(prev => ({
      ...prev,
      protected_features: features,
    }));

    // Save to database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateUserProfile(user.id, { pin_protected_features: features } as any);
      }
    } catch (err) {
      console.error('Failed to sync protected features to database:', err);
    }
  };

  const togglePinProtection = (enabled: boolean): void => {
    setPinData(prev => ({
      ...prev,
      enabled,
    }));
  };

  const getSettings = (): PinProtectionSettings => {
    return pinData.settings;
  };

  const updateSettings = (settings: Partial<PinProtectionSettings>): void => {
    setPinData(prev => {
      const newSettings = {
        ...prev.settings,
        ...settings,
      };

      // Save to database in the background
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          updateUserProfile(user.id, { pin_settings: newSettings } as any).catch(err => 
            console.error('Failed to sync settings to database:', err)
          );
        }
      });

      return {
        ...prev,
        settings: newSettings,
      };
    });
  };

  const getLastChangedDate = (): string | null => {
    return pinData.last_changed || null;
  };

  const getRemainingAttempts = (): number => {
    return Math.max(0, pinData.settings.max_attempts - pinData.lockout.failed_attempts);
  };

  const getLockoutTimeRemaining = (): number => {
    if (!isLockedOut() || !pinData.lockout.unlocks_at) {
      return 0;
    }

    const now = new Date();
    const unlocksAt = new Date(pinData.lockout.unlocks_at);
    const remaining = Math.floor((unlocksAt.getTime() - now.getTime()) / 1000);
    return Math.max(0, remaining);
  };

  const triggerStandbyLock = (): void => {
    if (isPinEnabled()) {
      setPinData(prev => ({
        ...prev,
        session: { ...prev.session, standby_locked: true }
      }));
    }
  };

  const handleStandbySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut()) return;
    
    const hashedPin = await hashPin(standbyPin);
    if (hashedPin === pinData.pin_hash) {
      setPinData(prev => ({
        ...prev,
        lockout: { locked: false, unlocks_at: null, failed_attempts: 0 },
        session: { ...prev.session, standby_locked: false }
      }));
      setStandbyPin('');
      setStandbyError(false);
      extendSession();
      localStorage.setItem('budget_last_activity', Date.now().toString());
    } else {
      setStandbyError(true);
      setStandbyPin('');
      const newFailedAttempts = pinData.lockout.failed_attempts + 1;
      if (newFailedAttempts >= pinData.settings.max_attempts) {
        lockOut();
      } else {
        setPinData(prev => ({ ...prev, lockout: { ...prev.lockout, failed_attempts: newFailedAttempts } }));
      }
    }
  };

  return (
    <PinProtectionContext.Provider
      value={{
        isPinEnabled,
        isPinSet,
        setPin,
        changePin,
        removePin,
        verifyPin,
        isFeatureProtected,
        requiresVerificationEverytime,
        isSessionActive,
        extendSession,
        lockOut,
        isLockedOut,
        getProtectedFeatures,
        setProtectedFeatures,
        togglePinProtection,
        getSettings,
        updateSettings,
        getLastChangedDate,
        getRemainingAttempts,
        getLockoutTimeRemaining,
        triggerStandbyLock,
      }}
    >
      {children}

      {/* App Standby Lock Screen Overlay */}
      {pinData.session.standby_locked && (
        <div className="fixed inset-0 z-[9999] bg-gray-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)]">
            <Lock className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-[0.2em]">App Locked</h2>
          <p className="text-gray-400 mb-10 font-medium tracking-wide">Please enter your PIN to resume</p>
          
          <form onSubmit={handleStandbySubmit} className="w-full max-w-xs space-y-6">
            <div>
              <input
                type="password"
                value={standbyPin}
                onChange={(e) => { setStandbyPin(e.target.value); setStandbyError(false); }}
                className={`w-full bg-gray-900 border-2 ${standbyError ? 'border-red-500 text-red-500' : 'border-gray-800 text-white focus:border-indigo-500'} rounded-2xl p-4 text-center text-3xl font-black tracking-[0.5em] outline-none transition-colors`}
                placeholder="••••"
                maxLength={6}
                autoFocus
              />
              {standbyError && <p className="text-red-500 text-sm font-bold mt-3 text-center uppercase tracking-widest">Incorrect PIN</p>}
              {isLockedOut() && <p className="text-red-500 text-sm font-bold mt-3 text-center uppercase tracking-widest">Too many attempts. Try again later.</p>}
            </div>
            <button type="submit" disabled={isLockedOut() || standbyPin.length < 4} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-900/50">
              Unlock
            </button>
          </form>
        </div>
      )}
    </PinProtectionContext.Provider>
  );
};

export const usePinProtection = () => {
  const context = useContext(PinProtectionContext);
  if (context === undefined) {
    throw new Error('usePinProtection must be used within a PinProtectionProvider');
  }
  return context;
};
