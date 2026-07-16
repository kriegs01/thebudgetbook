// src/hooks/useIncomeSlicer.ts
import { useState, useMemo } from 'react';

// 1. Define the shape of our allocation state
export interface SliceAllocation {
  budgetItemId: string;
  budgetItemName: string;
  targetAccountId: string; // The selected debit account to store the funds
  amount: number;          // The portion of income allocated to this item
}

interface UseIncomeSlicerProps {
  transactions: any[];         // Your global transactions array
  currentBudgetPeriod: string; // e.g., "2026-07"
  currentBudgetTiming: string; // e.g., "1/2" or "2/2"
  budgetItems: any[];          // The budget items for this active period
  accounts: any[];             // Your physical/debit accounts list
}

export const useIncomeSlicer = ({
  transactions,
  currentBudgetPeriod,
  currentBudgetTiming,
  budgetItems,
  accounts
}: UseIncomeSlicerProps) => {
  // State to track which Income transaction IDs are in the "Tray"
  const [trayTxIds, setTrayTxIds] = useState<string[]>([]);
  
  // State to track the allocations per budget item
  const [allocations, setAllocations] = useState<SliceAllocation[]>([]);

  // Filter: Get "fresh" income transactions matching current Month + Year + Timing
  const availableIncomes = useMemo(() => {
    const [budgetYear, budgetMonthOneIndexed] = currentBudgetPeriod.split('-').map(Number);
    const targetMonthIndex = budgetMonthOneIndexed - 1; // JS Month is 0-11

    return transactions.filter(tx => {
      const isIncome = tx.transaction_type === 'cash_in' && tx.name === 'Income';
      const isNotYetSliced = !tx.is_sliced; 

      if (!isIncome || !isNotYetSliced) return false;

      // Match the calendar Year and Month
      const txDate = new Date(tx.date);
      const yearMatches = txDate.getFullYear() === budgetYear;
      const monthMatches = txDate.getMonth() === targetMonthIndex;

      // Match the timing cycle from the notes (e.g., "Income Record 1/2" -> "1/2")
      const txTimingMatch = tx.notes?.match(/\d\/\d/);
      const txTiming = txTimingMatch ? txTimingMatch[0] : null;
      const timingMatches = txTiming === currentBudgetTiming;

      return yearMatches && monthMatches && timingMatches;
    });
  }, [transactions, currentBudgetPeriod, currentBudgetTiming]);

  // Calculate total funds currently sitting in the Tray
  const totalTrayPool = useMemo(() => {
    return transactions
      .filter(tx => trayTxIds.includes(tx.id))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [trayTxIds, transactions]);

  // Calculate total amount currently allocated by the user
  const totalAllocated = useMemo(() => {
    return allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  }, [allocations]);

  const remainingToAllocate = totalTrayPool - totalAllocated;

  // Toggle an income transaction in or out of the distribution tray
  const toggleTrayTransaction = (txId: string) => {
    setTrayTxIds(prev => 
      prev.includes(txId) ? prev.filter(id => id !== txId) : [...prev, txId]
    );
  };

  // Initialize or update a specific budget item's allocation
  const updateAllocation = (budgetItemId: string, itemName: string, fields: Partial<SliceAllocation>) => {
    setAllocations(prev => {
      const existingIdx = prev.findIndex(a => a.budgetItemId === budgetItemId);
      const defaultAccountId = accounts[0]?.id || '';

      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...fields };
        return updated;
      } else {
        return [
          ...prev,
          {
            budgetItemId,
            budgetItemName: itemName,
            targetAccountId: defaultAccountId,
            amount: 0,
            ...fields
          }
        ];
      }
    });
  };

  // The process handler that runs physical transfers and updates database flags
  const executeSlice = async (createTransferFn: Function, updateTxSlicedStatusFn: Function) => {
    if (trayTxIds.length === 0) return alert("Your tray is empty!");
    if (remainingToAllocate !== 0) {
      return alert(`Please allocate the entire pool. Remaining: ₱${remainingToAllocate}`);
    }

    try {
      const sourceBalances: Record<string, number> = {};
      transactions
        .filter(tx => trayTxIds.includes(tx.id))
        .forEach(tx => {
          const accId = tx.payment_method_id;
          sourceBalances[accId] = (sourceBalances[accId] || 0) + Math.abs(tx.amount);
        });

      const transferPromises = [];

      for (const alloc of allocations) {
        let amountNeeded = alloc.amount;
        if (amountNeeded <= 0) continue;

        for (const sourceAccountId of Object.keys(sourceBalances)) {
          const availableInSource = sourceBalances[sourceAccountId];
          if (availableInSource <= 0) continue;

          const amountToTake = Math.min(amountNeeded, availableInSource);
          
          sourceBalances[sourceAccountId] -= amountToTake;
          amountNeeded -= amountToTake;

          if (sourceAccountId !== alloc.targetAccountId) {
            transferPromises.push(
              createTransferFn({
                sourceAccountId,
                destinationAccountId: alloc.targetAccountId,
                amount: amountToTake,
                description: `Slice Allocation: ${alloc.budgetItemName}`,
                date: new Date().toISOString()
              })
            );
          }

          if (amountNeeded === 0) break;
        }
      }

      await Promise.all(transferPromises);
      await updateTxSlicedStatusFn(trayTxIds, true);

      setTrayTxIds([]);
      setAllocations([]);
      alert("Success! Income sliced and physical transfers processed.");

    } catch (err) {
      console.error("Failed to execute slice:", err);
      alert("Something went wrong executing the slice.");
    }
  };

  return {
    availableIncomes,
    trayTxIds,
    totalTrayPool,
    remainingToAllocate,
    allocations,
    toggleTrayTransaction,
    updateAllocation,
    executeSlice
  };
};
