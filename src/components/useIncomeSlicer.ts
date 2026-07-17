// src/hooks/useIncomeSlicer.ts
import { useState, useEffect, useMemo } from 'react';

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
    // Preload the remaining target amount safely using properties that exist on your budget items
    useEffect(() => {
      if (budgetItems && budgetItems.length > 0) {
        const initialAllocations = budgetItems.map((item) => {
          // Fallback to item.amount (parsed as a number) since targetAmount doesn't exist here
          const target = typeof item.amount === 'number' 
            ? item.amount 
            : parseFloat(item.amount) || 0;
  
          // Fallback to 0 if actualCollected is not defined on these items
          const collected = item.actualCollected || 0;
          const remainingNeeded = target - collected;
  
          return {
            budgetItemId: item.id,
            amount: remainingNeeded > 0 ? remainingNeeded : 0,
          };
        });
  
        setAllocations(initialAllocations);
      }
    }, [budgetItems]);
  

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
      
      if (existingIdx > -1) {
        // 1. Copy the existing item
        const updatedAllocations = [...prev];
        // 2. Spread the existing values, then overwrite ONLY with the new 'fields'
        updatedAllocations[existingIdx] = { 
          ...updatedAllocations[existingIdx], 
          ...fields 
        };
        return updatedAllocations;
      } else {
        // 3. If it's a new entry, combine item info with the new fields
        return [...prev, { budgetItemId, itemName, ...fields } as SliceAllocation];
      }
    });
  };
  

  // The process handler that runs physical transfers and updates database flags
  const executeSlice = async (createTransferFn: Function, updateTxSlicedStatusFn: Function) => {
    if (trayTxIds.length === 0) return alert("Your tray is empty!");
    
    // Check if at least one row has an amount and an assigned account
    const hasValidAllocation = allocations.some(a => a.amount > 0 && a.targetAccountId);
    if (!hasValidAllocation) {
      return alert("Please enter an amount and select a destination account for at least one item.");
    }

    // Safeguard: Prevent allocating MORE than what is in the pool, 
    // but perfectly fine to leave money unallocated!
    if (remainingToAllocate < 0) {
      return alert(`You've allocated more than what's in the pool! Please reduce your allocations by ₱${Math.abs(remainingToAllocate).toFixed(2)}.`);
    }

    try {
      const sourceBalances: Record<string, number> = {};
      // ... (keep the rest of the existing try block exactly the same)
      transactions
        .filter(tx => trayTxIds.includes(tx.id))
        .forEach(tx => {
          const accId = tx.payment_method_id;
          sourceBalances[accId] = (sourceBalances[accId] || 0) + Math.abs(tx.amount);
        });

      const transferPromises = [];

      for (const alloc of allocations) {
        let amountNeeded = alloc.amount;
        
        // ✅ CRITICAL FIX: Skip if amount is 0 OR if no account was selected
        if (amountNeeded <= 0 || !alloc.targetAccountId) continue;

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

    } catch (err: any) {
      console.error("Failed to execute slice:", err);
      // ✅ Now it will tell us EXACTLY what broke!
      alert(`Something went wrong: ${err.message || JSON.stringify(err)}`);
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
