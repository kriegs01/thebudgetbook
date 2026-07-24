import { useState, useMemo } from 'react';

// 1. Define the blueprint for a hypothetical purchase
export interface MockItem {
  id: string;
  name: string;
  amount: number;
  date: string; // This date is crucial for the Date-Range Mapper to know which tab this falls into!
}

export const useSandbox = () => {
  // 2. The Core State
  const [isSandboxActive, setIsSandboxActive] = useState(false);
  const [safetyNet, setSafetyNet] = useState<number>(0);
  const [mockPurchases, setMockPurchases] = useState<MockItem[]>([]);

  // 3. Action Helpers (Add, Remove, Reset)
  const addMockPurchase = (item: Omit<MockItem, 'id'>) => {
    const newItem = { ...item, id: crypto.randomUUID() };
    setMockPurchases(prev => [...prev, newItem]);
  };

  const removeMockPurchase = (id: string) => {
    setMockPurchases(prev => prev.filter(item => item.id !== id));
  };

  const resetSandbox = () => {
    setMockPurchases([]);
    setSafetyNet(0);
    setIsSandboxActive(false);
  };

  // 4. Return everything so the Budget page can use it
  return {
    isSandboxActive,
    setIsSandboxActive,
    safetyNet,
    setSafetyNet,
    mockPurchases,
    addMockPurchase,
    removeMockPurchase,
    resetSandbox
  };
};
