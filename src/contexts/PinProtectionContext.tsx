import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PinProtectionSettings {
  session_timeout: number; // minutes
  max_attempts: number;
  lockout_duration: number; // minutes
}

interface SessionState {
  authenticated: boolean;
  expires_at: string | null;
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
  setPin: (pin: string) => boolean;
  changePin: (currentPin: string, newPin: string) => boolean;
  removePin: (currentPin: string) => boolean;
  verifyPin: (pin: string) => boolean;
  isFeatureProtected: (featureId: string) => boolean;
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
}

const PinProtectionContext = createContext<PinProtectionContextType | undefined>(undefined);

const DEFAULT_SETTINGS: PinProtectionSettings = {
  session_timeout: 5,
  max_attempts: 3,
  lockout_duration: 1,
};

const DEFAULT_PROTECTED_FEATURES = ['danger_zone', 'test_environment'];

const STORAGE_KEY = 'pin_protection';

// Simple hash function using btoa
const hashPin = (pin: string): string => {
  return btoa(pin + '_budget_book_salt');
};

export const PinProtectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pinData, setPinData] = useState<PinProtectionData>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
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
  }, [pinData]);

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
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [pinData.session, pinData.lockout]);

  const isPinEnabled = (): boolean => {
    return pinData.enabled && pinData.pin_hash !== '';
  };

  const isPinSet = (): boolean => {
    return pinData.pin_hash !== '';
  };

  const setPin = (pin: string): boolean => {
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return false;
    }

    const now = new Date().toISOString();
    setPinData(prev => ({
      ...prev,
      pin_hash: hashPin(pin),
      created_at: now,
      last_changed: now,
      enabled: true,
      protected_features: DEFAULT_PROTECTED_FEATURES,
    }));

    return true;
  };

  const changePin = (currentPin: string, newPin: string): boolean => {
    if (!verifyPin(currentPin)) {
      return false;
    }

    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return false;
    }

    const now = new Date().toISOString();
    setPinData(prev => ({
      ...prev,
      pin_hash: hashPin(newPin),
      last_changed: now,
      lockout: {
        locked: false,
        unlocks_at: null,
        failed_attempts: 0,
      },
    }));

    return true;
  };

  const removePin = (currentPin: string): boolean => {
    if (!verifyPin(currentPin)) {
      return false;
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
      },
      lockout: {
        locked: false,
        unlocks_at: null,
        failed_attempts: 0,
      },
    }));

    return true;
  };

  const verifyPin = (pin: string): boolean => {
    if (isLockedOut()) {
      return false;
    }

    const isValid = hashPin(pin) === pinData.pin_hash;

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

  const setProtectedFeatures = (features: string[]): void => {
    setPinData(prev => ({
      ...prev,
      protected_features: features,
    }));
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
    setPinData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...settings,
      },
    }));
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
      }}
    >
      {children}
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
