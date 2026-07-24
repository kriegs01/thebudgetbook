import { useState } from 'react';

export interface MockPurchase {
  id: string;
  name: string;
  amount: number;
  type: 'one-off' | 'installment';
  startDate: string; // "YYYY-MM-DD"
  durationMonths?: number;
}

export function useSandbox() {
  const [safetyNet, setSafetyNet] = useState<number>(0);
  const [mockPurchases, setMockPurchases] = useState<MockPurchase[]>([]);

  const addMockPurchase = (purchase: MockPurchase) => {
    setMockPurchases(prev => [...prev, purchase]);
  };

  const removeMockPurchase = (id: string) => {
    setMockPurchases(prev => prev.filter(p => p.id !== id));
  };

  return {
    safetyNet, setSafetyNet,
    mockPurchases, addMockPurchase, removeMockPurchase
  };
}
