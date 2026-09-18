import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUserProfile } from '../services/userProfileService';

export interface MockPurchase {
  id: string;
  name: string;
  amount: number;
  type: 'one-off' | 'installment';
  startDate: string; // "YYYY-MM-DD"
  durationMonths?: number;
  paymentMethod?: 'cash' | 'credit';
  creditCardId?: string;
}

export function useSandbox() {
  const { user, userProfile } = useAuth();

  const [safetyNet, setSafetyNetState] = useState<number>(0);
  const [mockPurchases, setMockPurchasesState] = useState<MockPurchase[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Safely load from DB on mount
  useEffect(() => {
    if (userProfile && !isLoaded) {
      try {
        // Safely parse the settings column (handles both object and stringified JSON)
        const settings = typeof userProfile.settings === 'string' 
          ? JSON.parse(userProfile.settings) 
          : (userProfile.settings || {});

        if (settings.sandbox) {
          console.log("📥 Loading Sandbox from DB:", settings.sandbox);
          setSafetyNetState(settings.sandbox.safetyNet || 0);
          setMockPurchasesState(settings.sandbox.mockPurchases || []);
        } else {
          console.log("📥 No sandbox data found in profile settings.");
        }
      } catch (e) {
        console.error("❌ Error reading sandbox settings:", e);
      }
      setIsLoaded(true);
    }
  }, [userProfile, isLoaded]);

  // 2. Helper to save silently in the background
  const saveToDb = async (newSafetyNet: number, newPurchases: MockPurchase[]) => {
    if (!user || !userProfile || !isLoaded) return; // Prevent saving before data is loaded
    
    try {
      const currentSettings = typeof userProfile.settings === 'string'
        ? JSON.parse(userProfile.settings)
        : (userProfile.settings || {});

      const newSettings = {
        ...currentSettings,
        sandbox: {
          safetyNet: newSafetyNet,
          mockPurchases: newPurchases
        }
      };
      
      console.log("📤 Saving Sandbox to DB:", newSettings.sandbox);
      await updateUserProfile(user.id, { settings: newSettings });
    } catch (error) {
      console.error("❌ Failed to save sandbox to DB", error);
    }
  };

  // 3. Updated state handlers that trigger the DB save
  const setSafetyNet = (value: number) => {
    setSafetyNetState(value);
    saveToDb(value, mockPurchases);
  };

  const addMockPurchase = (purchase: MockPurchase) => {
    const updatedPurchases = [...mockPurchases, purchase];
    setMockPurchasesState(updatedPurchases);
    saveToDb(safetyNet, updatedPurchases);
  };

  const removeMockPurchase = (id: string) => {
    const updatedPurchases = mockPurchases.filter(p => p.id !== id);
    setMockPurchasesState(updatedPurchases);
    saveToDb(safetyNet, updatedPurchases);
  };

  return {
    safetyNet, 
    setSafetyNet,
    mockPurchases, 
    addMockPurchase, 
    removeMockPurchase,
    isLoaded // Exporting this just in case we need it later
  };
}
