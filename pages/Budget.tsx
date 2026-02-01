
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory, Installment } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, FileText, ArrowRight, Upload, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend } from '../src/services/budgetSetupsService';
import { createTransaction, getAllTransactions, updateTransaction } from '../src/services/transactionsService';
import type { SupabaseTransaction } from '../src/types/supabase';
import { getInstallmentPaymentSchedule, aggregateCreditCardPurchases } from '../src/utils/paymentStatus'; // PROTOTYPE: Import payment status utilities
import { getScheduleExpectedAmount } from '../src/utils/linkedAccountUtils'; // ENHANCEMENT: Import for linked account amount calculation

interface BudgetProps {
  items: BudgetItem[];
  accounts: Account[];
  billers: Biller[];
  categories: BudgetCategory[];
  savedSetups: SavedBudgetSetup[];
  setSavedSetups: React.Dispatch<React.SetStateAction<SavedBudgetSetup[]>>;
  onAdd: (item: BudgetItem) => void;
  onUpdateBiller: (biller: Biller) => Promise<void>;
  onMoveToTrash?: (setup: SavedBudgetSetup) => void;
  onReloadSetups?: () => Promise<void>;
  onReloadBillers?: () => Promise<void>;
  onUpdateInstallment?: (installment: Installment) => Promise<void>; // For updating installment payments
  installments?: Installment[]; // PROTOTYPE: Installments for Loans section
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Budget setup status constants
const BUDGET_SETUP_STATUS = {
  SAVED: 'Saved',
  ACTIVE: 'Active',
  COMPLETED: 'Completed'
} as const;

// Autosave configuration constants
const AUTO_SAVE_DEBOUNCE_MS = 3000; // 3 seconds debounce for autosave
const AUTO_SAVE_STATUS_TIMEOUT_MS = 3000; // How long to show status messages

// Transaction matching configuration
const TRANSACTION_AMOUNT_TOLERANCE = 1; // ±1 peso tolerance for amount matching (accounts for rounding differences)
const TRANSACTION_MIN_NAME_LENGTH = 3; // Minimum length for partial name matching to avoid false positives
const TRANSACTION_DATE_GRACE_DAYS = 7; // Allow transactions up to N days after budget month ends (for late payments)

const Budget: React.FC<BudgetProps> = ({ accounts, billers, categories, savedSetups, setSavedSetups, onUpdateBiller, onMoveToTrash, onReloadSetups, onReloadBillers, onUpdateInstallment, installments = [] }) => {
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');

  // Categorized Setup State
  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  
  // PROTOTYPE: Track excluded installments (by default all are included)
  const [excludedInstallmentIds, setExcludedInstallmentIds] = useState<Set<string>>(new Set());

  // Month Summary State - stored in Supabase with setup data
  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');

  // Transactions state - used for matching payments
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);

  // Load from saved setup when month/timing changes
  useEffect(() => {
    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    if (existingSetup && existingSetup.data) {
      // Load salary data from setup if available
      if (existingSetup.data._projectedSalary !== undefined) {
        setProjectedSalary(existingSetup.data._projectedSalary);
      } else {
        setProjectedSalary('11000');
      }
      if (existingSetup.data._actualSalary !== undefined) {
        setActualSalary(existingSetup.data._actualSalary);
      } else {
        setActualSalary('');
      }
    } else {
      // Reset to defaults if no saved setup
      setProjectedSalary('11000');
      setActualSalary('');
    }
  }, [selectedMonth, selectedTiming, savedSetups]);

  // Load transactions for matching payment status
  // Only loads once on mount to avoid excessive DB queries
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const { data, error } = await getAllTransactions();
        if (error) {
          console.error('[Budget] Failed to load transactions:', error);
        } else if (data) {
          // Filter transactions to last 24 months to improve performance
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          
          const recentTransactions = data.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= twoYearsAgo;
          });
          
          setTransactions(recentTransactions);
          console.log('[Budget] Loaded transactions:', recentTransactions.length, 'of', data.length);
        }
      } catch (error) {
        console.error('[Budget] Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, []); // Load once on mount, reload happens after creating transactions

  // Autosave State
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');

  // Modal States
  const [showPayModal, setShowPayModal] = useState<{ biller: Biller, schedule: PaymentSchedule } | null>(null);
  // QA: Add transactionId to support editing from Pay modal
  const [payFormData, setPayFormData] = useState({
    transactionId: '', // Empty for new, set for editing
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });

  // QA: Transaction form modal for Purchases (supports create and edit)
  // Fix for Issue #6: Enable transaction editing
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  // Default transaction form state - used for resetting
  const getDefaultTransactionFormData = () => ({
    id: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    accountId: accounts[0]?.id || ''
  });
  
  const [transactionFormData, setTransactionFormData] = useState(getDefaultTransactionFormData());

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Sync effect with Billers and Categories
  useEffect(() => {
    if (view === 'setup') {
      setSetupData(prev => {
        const newData = { ...prev };
        
        categories.forEach(cat => {
          if (!newData[cat.name]) newData[cat.name] = [];

          const matchingBillers = billers.filter(b => 
            (b.category === cat.name || b.category.startsWith(`${cat.name} -`)) && 
            b.timing === selectedTiming &&
            b.status === 'active' &&
            !removedIds.has(b.id)
          );

          // Remove billers that don't match the current timing
          // ENHANCEMENT: Also update amounts for existing billers (in case of linked account changes)
          const filteredExisting = newData[cat.name].filter(item => {
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              return biller && biller.timing === selectedTiming;
            }
            return true; // Keep non-biller items
          }).map(item => {
            // ENHANCEMENT: Update amount for existing biller items
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              if (biller) {
                const schedule = biller.schedules.find(s => s.month === selectedMonth);
                if (schedule) {
                  const { amount: calculatedAmount } = getScheduleExpectedAmount(
                    biller,
                    schedule,
                    accounts,
                    transactions
                  );
                  return {
                    ...item,
                    amount: calculatedAmount.toString()
                  };
                }
              }
            }
            return item;
          });

          const existingIds = new Set(filteredExisting.map(i => i.id));
          const newItems = matchingBillers
            .filter(b => !existingIds.has(b.id))
            .map(b => {
              const schedule = b.schedules.find(s => s.month === selectedMonth);
              
              // ENHANCEMENT: For linked billers, calculate amount from transactions
              let amount: number;
              if (schedule) {
                const { amount: calculatedAmount } = getScheduleExpectedAmount(
                  b,
                  schedule,
                  accounts,
                  transactions
                );
                amount = calculatedAmount;
              } else {
                amount = b.expectedAmount;
              }
              
              return {
                id: b.id,
                name: b.name,
                amount: amount.toString(),
                included: true,
                timing: b.timing,
                isBiller: true
              };
            });

          newData[cat.name] = [...filteredExisting, ...newItems];
        });

        return newData;
      });
    }
  }, [selectedMonth, selectedTiming, billers, view, removedIds, categories]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  /**
   * QA: Check if installment should be displayed for selected month
   * Only shows installments that have started on or before the selected month
   * Fix for Issue #2: Incorrect installment scheduling
   */
  const shouldShowInstallment = useCallback((installment: Installment, month: string, year?: number): boolean => {
    // If no start date is set, always show (backward compatibility)
    if (!installment.startDate) return true;
    
    // Parse installment start date (format: YYYY-MM)
    const [startYear, startMonth] = installment.startDate.split('-').map(Number);
    
    // Parse selected month
    const selectedMonthIndex = MONTHS.indexOf(month);
    if (selectedMonthIndex === -1) return false;
    
    // Determine target year (use provided year or current year)
    const targetYear = year || new Date().getFullYear();
    
    // Compare: installment should only show if start date is on or before selected month
    if (startYear < targetYear) return true;
    if (startYear > targetYear) return false;
    // Same year: compare months (startMonth is 1-12, selectedMonthIndex is 0-11)
    return startMonth <= (selectedMonthIndex + 1);
  }, []); // MONTHS is a constant, no need to include in deps

  /**
   * Check if an item is paid by matching transactions
   * Matches by name (with minimum length), amount (within tolerance), and date (within month/year)
   */
  const checkIfPaidByTransaction = useCallback((
    itemName: string, 
    itemAmount: string | number, 
    month: string,
    year?: number // Optional year parameter for viewing past budgets
  ): boolean => {
    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return false;

    // Get month index (0-11) for date comparison
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return false;

    // Determine target year (use provided year or current year)
    const targetYear = year || new Date().getFullYear();

    // Find matching transaction
    const matchingTransaction = transactions.find(tx => {
      // Check name match with minimum length requirement to avoid false positives
      const itemNameLower = itemName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      // Require at least TRANSACTION_MIN_NAME_LENGTH characters to match
      const nameMatch = (
        (txNameLower.includes(itemNameLower) && itemNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (itemNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      // Check amount match (within tolerance)
      const amountMatch = Math.abs(tx.amount - amount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      // Check date match with grace period for late payments
      // Allow:
      // 1. Transactions in the same month and year
      // 2. Transactions in December of previous year (for January budgets)
      // 3. Transactions within TRANSACTION_DATE_GRACE_DAYS after month ends
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      let dateMatch = false;
      
      // Same month and year
      if (txMonth === monthIndex && txYear === targetYear) {
        dateMatch = true;
      }
      // December of previous year for January budgets
      else if (monthIndex === 0 && txMonth === 11 && txYear === targetYear - 1) {
        dateMatch = true;
      }
      // Within grace period after month ends (next month only, within first N days)
      else if (txMonth === (monthIndex + 1) % 12) {
        const budgetMonthEnd = new Date(targetYear, monthIndex + 1, 0); // Last day of budget month
        const daysDifference = Math.floor((txDate.getTime() - budgetMonthEnd.getTime()) / (1000 * 60 * 60 * 24));
        
        // Ensure transaction is after month end and within grace period
        if (daysDifference > 0 && daysDifference <= TRANSACTION_DATE_GRACE_DAYS) {
          // Handle year transition for December -> January
          const expectedYear = monthIndex === 11 ? targetYear + 1 : targetYear;
          if (txYear === expectedYear) {
            dateMatch = true;
          }
        }
      }

      return nameMatch && amountMatch && dateMatch;
    });

    if (matchingTransaction) {
      console.log(`[Budget] ✓ Found matching transaction for "${itemName}":`, {
        txName: matchingTransaction.name,
        txAmount: matchingTransaction.amount,
        txDate: matchingTransaction.date,
        itemAmount: amount
      });
    } else {
      console.log(`[Budget] ✗ No matching transaction for "${itemName}" (${amount}) in ${month}`, {
        totalTransactions: transactions.length,
        itemAmount: amount,
        month,
        targetYear: year || new Date().getFullYear()
      });
    }

    return !!matchingTransaction;
  }, [transactions]);

  /**
   * QA: Find existing transaction for an item
   * Fix for Issue: Transaction editing from Pay modal
   */
  const findExistingTransaction = useCallback((
    itemName: string, 
    itemAmount: string | number, 
    month: string,
    year?: number
  ): SupabaseTransaction | undefined => {
    const amount = typeof itemAmount === 'string' ? parseFloat(itemAmount) : itemAmount;
    if (isNaN(amount) || amount <= 0) return undefined;

    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex === -1) return undefined;

    const targetYear = year || new Date().getFullYear();

    return transactions.find(tx => {
      const itemNameLower = itemName.toLowerCase();
      const txNameLower = tx.name.toLowerCase();
      
      const nameMatch = (
        (txNameLower.includes(itemNameLower) && itemNameLower.length >= TRANSACTION_MIN_NAME_LENGTH) ||
        (itemNameLower.includes(txNameLower) && txNameLower.length >= TRANSACTION_MIN_NAME_LENGTH)
      );
      
      const amountMatch = Math.abs(tx.amount - amount) <= TRANSACTION_AMOUNT_TOLERANCE;
      
      const txDate = new Date(tx.date);
      const txMonth = txDate.getMonth();
      const txYear = txDate.getFullYear();
      
      const dateMatch = (txMonth === monthIndex) && 
                       (txYear === targetYear || txYear === targetYear - 1);

      return nameMatch && amountMatch && dateMatch;
    });
  }, [transactions]);

  /**
   * Reload transactions from Supabase
   */
  const reloadTransactions = useCallback(async () => {
    try {
      const { data, error } = await getAllTransactions();
      if (error) {
        console.error('[Budget] Failed to reload transactions:', error);
      } else if (data) {
        setTransactions(data);
        console.log('[Budget] Reloaded transactions:', data.length);
      }
    } catch (error) {
      console.error('[Budget] Error reloading transactions:', error);
    }
  }, []);

  /**
   * Auto-save budget setup with debouncing
   * Automatically saves changes after 3 seconds of inactivity
   */
  const autoSave = useCallback(async () => {
    // Only auto-save in setup view
    if (view !== 'setup') return;
    
    // Prepare data including salary information (use structuredClone for better performance)
    const dataToSave = {
      ...structuredClone(setupData),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary
    };
    
    // Check if data has actually changed
    const currentDataString = JSON.stringify(dataToSave);
    if (currentDataString === lastSavedDataRef.current) {
      console.log('[Budget] No changes detected, skipping auto-save');
      return;
    }
    
    // Calculate total amount
    let total = 0;
    Object.values(setupData)
      .filter((value): value is CategorizedSetupItem[] => Array.isArray(value))
      .forEach(catItems => {
        catItems.forEach(item => {
          if (item.included) {
            const amount = parseFloat(item.amount);
            if (!isNaN(amount)) {
              total += amount;
            }
          }
        });
      });

    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    
    try {
      setAutoSaveStatus('saving');
      console.log('[Budget] Auto-saving budget setup...');
      
      if (existingSetup) {
        // Update existing setup
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: 'Saved'
        };
        
        const { error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          console.error('[Budget] Auto-save failed:', error);
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      } else {
        // Create new setup
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          console.error('[Budget] Auto-save failed:', error);
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
          return;
        }
      }
      
      // Update last saved data reference
      lastSavedDataRef.current = currentDataString;
      
      // Reload setups to get fresh data
      if (onReloadSetups) {
        await onReloadSetups();
      }
      
      console.log('[Budget] Auto-save completed successfully');
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[Budget] Error in auto-save:', error);
      setAutoSaveStatus('error');
      setTimeout(() => setAutoSaveStatus('idle'), AUTO_SAVE_STATUS_TIMEOUT_MS);
    }
  }, [view, setupData, projectedSalary, actualSalary, selectedMonth, selectedTiming, savedSetups, onReloadSetups]);

  /**
   * Debounced auto-save trigger
   * Waits for specified delay after last change before auto-saving
   */
  const triggerAutoSave = useCallback(() => {
    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [autoSave]);

  // Trigger auto-save when setupData, projectedSalary, or actualSalary changes
  useEffect(() => {
    if (view === 'setup') {
      triggerAutoSave();
    }
  }, [setupData, projectedSalary, actualSalary, view, triggerAutoSave]);

  // Cleanup timeout on component unmount only
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array ensures this only runs on unmount

  const handleSetupToggle = (category: string, id: string) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === id ? { ...item, included: !item.included } : item
      )
    }));
  };

  const handleSetupUpdate = (category: string, id: string, field: keyof CategorizedSetupItem, value: any) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
  };

  const addItemToCategory = (category: string) => {
    // For all categories, add a blank item
    const newItem: CategorizedSetupItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Item',
      amount: '0',
      included: true,
    };
    setSetupData(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), newItem]
    }));
  };

  // QA: Exclude item from current Budget Setup view only (doesn't delete master record)
  // Fix for Issue #4: Exclude button behavior
  const removeItemFromCategory = (category: string, id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Exclude Item',
      message: `Are you sure you want to exclude "${name}" from this month's budget? This will NOT delete the biller or payment schedule.`,
      onConfirm: () => {
        setRemovedIds(prev => new Set([...prev, id]));
        setSetupData(prev => ({
          ...prev,
          [category]: prev[category].filter(item => item.id !== id)
        }));
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  /**
   * Save budget setup to Supabase
   * This replaces the previous localStorage-based persistence
   */
  const handleSaveSetup = async () => {
    console.log('[Budget] ===== Starting budget setup save =====');
    console.log('[Budget] Selected month:', selectedMonth);
    console.log('[Budget] Selected timing:', selectedTiming);
    console.log('[Budget] Current setupData type:', typeof setupData);
    console.log('[Budget] Current setupData keys:', Object.keys(setupData));
    
    let total = 0;
    // Filter out non-array values (like _projectedSalary, _actualSalary) before iterating
    Object.values(setupData)
      .filter((value): value is CategorizedSetupItem[] => Array.isArray(value))
      .forEach(catItems => {
        catItems.forEach(item => {
          if (item.included) {
            const amount = parseFloat(item.amount);
            if (isNaN(amount)) {
              console.warn(`[Budget] Invalid amount for item "${item.name}": "${item.amount}"`);
            } else {
              total += amount;
            }
          }
        });
      });

    console.log('[Budget] Calculated total amount:', total);

    const existingSetup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    console.log('[Budget] Existing setup found:', !!existingSetup);
    
    // Prepare data including salary information
    // Deep clone to avoid reference issues - cannot use spread for nested objects
    const dataToSave = {
      ...JSON.parse(JSON.stringify(setupData)),
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary
    };
    
    console.log('[Budget] Data to save type:', typeof dataToSave);
    console.log('[Budget] Data to save keys:', Object.keys(dataToSave));
    console.log('[Budget] Projected salary:', projectedSalary);
    console.log('[Budget] Actual salary:', actualSalary);
    
    try {
      if (existingSetup) {
        console.log('[Budget] Updating existing setup, ID:', existingSetup.id);
        
        // Update existing setup in Supabase
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          totalAmount: total,
          data: dataToSave,
          status: BUDGET_SETUP_STATUS.SAVED
        };
        
        const { data, error } = await updateBudgetSetupFrontend(updatedSetup);
        
        if (error) {
          console.error('[Budget] Error updating budget setup:', error);
          const errorMessage = error?.message || 'Unknown error occurred';
          alert(`Failed to save budget setup: ${errorMessage}`);
          return;
        }
        
        console.log('[Budget] Budget setup updated successfully');
        console.log('[Budget] Updated record ID:', data?.id);
        console.log('[Budget] Updated record data type:', data?.data ? typeof data.data : 'undefined');
        console.log('[Budget] Updated record data keys:', data?.data ? Object.keys(data.data) : []);
        
        // Reload setups from Supabase to get fresh data
        if (onReloadSetups) {
          await onReloadSetups();
        }
      } else {
        console.log('[Budget] Creating new setup');
        
        // Create new setup in Supabase
        const newSetup: Omit<SavedBudgetSetup, 'id'> = {
          month: selectedMonth,
          timing: selectedTiming,
          status: BUDGET_SETUP_STATUS.SAVED,
          totalAmount: total,
          data: dataToSave
        };
        
        const { data, error } = await createBudgetSetupFrontend(newSetup);
        
        if (error) {
          console.error('[Budget] Error creating budget setup:', error);
          const errorMessage = error?.message || 'Unknown error occurred';
          alert(`Failed to save budget setup: ${errorMessage}`);
          return;
        }
        
        console.log('[Budget] Budget setup created successfully');
        console.log('[Budget] Created record ID:', data?.id);
        console.log('[Budget] Created record data type:', data?.data ? typeof data.data : 'undefined');
        console.log('[Budget] Created record data keys:', data?.data ? Object.keys(data.data) : []);
        
        // Reload setups from Supabase to get the new one with generated ID
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      console.log('[Budget] ===== Budget setup save completed successfully =====');
      setView('summary');
    } catch (error) {
      console.error('[Budget] Error in handleSaveSetup:', error);
      const errorMessage = (error as any)?.message || 'Unknown error occurred';
      alert(`Failed to save budget setup: ${errorMessage}`);
    }
  };

  // QA: Handle transaction create/update
  // Fix for Issue #6: Enable transaction editing
  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isEditing = !!transactionFormData.id;
    console.log(`[Budget] ${isEditing ? 'Updating' : 'Creating'} transaction in Supabase`);
    console.log('[Budget] Transaction data:', transactionFormData);
    
    const transaction = {
      name: transactionFormData.name,
      date: new Date(transactionFormData.date).toISOString(),
      amount: parseFloat(transactionFormData.amount),
      payment_method_id: transactionFormData.accountId
    };
    
    try {
      let result;
      if (isEditing) {
        // Update existing transaction
        result = await updateTransaction(transactionFormData.id, transaction);
      } else {
        // Create new transaction
        result = await createTransaction(transaction);
      }
      
      const { data, error } = result;
      
      if (error) {
        console.error(`[Budget] Failed to ${isEditing ? 'update' : 'save'} transaction:`, error);
        alert(`Failed to ${isEditing ? 'update' : 'save'} transaction. Please try again.`);
        return;
      }
      
      console.log(`[Budget] Transaction ${isEditing ? 'updated' : 'saved'} successfully:`, data);
      
      // Reload transactions to update paid status
      await reloadTransactions();
      
      // Close the modal and reset form to defaults
      setShowTransactionModal(false);
      setTransactionFormData(getDefaultTransactionFormData());
    } catch (e) {
      console.error('[Budget] Error saving transaction:', e);
      alert('Failed to save transaction. Please try again.');
    }
  };

  // QA: Handle Pay modal submission - supports create and update
  // Fix for Issue: Transaction editing from Pay modal
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    
    try {
      const { biller, schedule } = showPayModal;
      const isEditing = !!payFormData.transactionId;
      
      console.log(`[Budget] ${isEditing ? 'Updating' : 'Creating'} transaction for payment`);
      const transaction = {
        name: `${biller.name} - ${schedule.month} ${schedule.year}`,
        date: new Date(payFormData.datePaid).toISOString(),
        amount: parseFloat(payFormData.amount),
        payment_method_id: payFormData.accountId
      };
      
      let transactionData, transactionError;
      if (isEditing) {
        // Update existing transaction
        const result = await updateTransaction(payFormData.transactionId, transaction);
        transactionData = result.data;
        transactionError = result.error;
      } else {
        // Create new transaction
        const result = await createTransaction(transaction);
        transactionData = result.data;
        transactionError = result.error;
      }
      
      if (transactionError) {
        console.error(`[Budget] Failed to ${isEditing ? 'update' : 'create'} transaction:`, transactionError);
        alert(`Failed to ${isEditing ? 'update' : 'save'} transaction. Please try again.`);
        return;
      }
      
      console.log(`[Budget] Transaction ${isEditing ? 'updated' : 'created'} successfully:`, transactionData);
      
      // Update the biller's payment schedule
      const updatedSchedules = biller.schedules.map(s => {
        if (s.month === schedule.month && s.year === schedule.year) {
          return { 
            ...s, 
            amountPaid: parseFloat(payFormData.amount), 
            receipt: payFormData.receipt || `${biller.name}_${schedule.month}`, 
            datePaid: payFormData.datePaid, 
            accountId: payFormData.accountId 
          };
        }
        return s;
      });
      
      console.log('[Budget] Updating biller with new schedule');
      await onUpdateBiller({ ...biller, schedules: updatedSchedules });
      
      // FIX: Update linked installment's paidAmount if this biller is linked to an installment
      if (biller.category.startsWith('Loans') && installments && installments.length > 0) {
        const linkedInstallment = installments.find(inst => inst.billerId === biller.id);
        if (linkedInstallment && onUpdateInstallment) {
          console.log('[Budget] Found linked installment, updating paidAmount');
          const updatedInstallment: Installment = {
            ...linkedInstallment,
            paidAmount: linkedInstallment.paidAmount + parseFloat(payFormData.amount)
          };
          await onUpdateInstallment(updatedInstallment);
          console.log('[Budget] Installment paidAmount updated successfully');
        }
      }
      
      // FIX: Update budget setup status to reflect payment activity
      const existingSetup = savedSetups.find(s => 
        s.month === schedule.month && s.timing === selectedTiming
      );
      if (existingSetup) {
        console.log('[Budget] Updating budget setup status after payment');
        const updatedSetup: SavedBudgetSetup = {
          ...existingSetup,
          status: BUDGET_SETUP_STATUS.ACTIVE // Mark as Active when payments are being made
        };
        await updateBudgetSetupFrontend(updatedSetup);
        console.log('[Budget] Budget setup status updated to Active');
        
        // Reload setups to refresh UI
        if (onReloadSetups) {
          await onReloadSetups();
        }
      }
      
      // Reload transactions to update paid status
      await reloadTransactions();
      
      // Explicitly reload billers to ensure UI updates
      if (onReloadBillers) {
        console.log('[Budget] Reloading billers after payment');
        await onReloadBillers();
      }
      
      console.log('[Budget] Payment completed successfully');
      
      // Only close modal on success and reset form
      setShowPayModal(null);
      setPayFormData({
        transactionId: '',
        amount: '',
        receipt: '',
        datePaid: new Date().toISOString().split('T')[0],
        accountId: accounts[0]?.id || ''
      });
    } catch (error) {
      console.error('Failed to update payment:', error);
      alert('Failed to process payment. Please try again.');
      // Keep modal open so user can retry
    }
  };

  const handleOpenNew = () => {
    const emptySetup: { [key: string]: CategorizedSetupItem[] } = {};
    categories.forEach(c => emptySetup[c.name] = []);
    setSetupData(emptySetup);
    setRemovedIds(new Set());
    setSelectedMonth(MONTHS[new Date().getMonth()]);
    setSelectedTiming('1/2');
    setView('setup');
  };

  const handleLoadSetup = (setup: SavedBudgetSetup) => {
    console.log('[Budget] ===== Loading budget setup =====');
    console.log('[Budget] Setup ID:', setup.id);
    console.log('[Budget] Setup month:', setup.month);
    console.log('[Budget] Setup timing:', setup.timing);
    console.log('[Budget] Setup data type:', typeof setup.data);
    console.log('[Budget] Setup data keys:', setup.data ? Object.keys(setup.data) : []);
    
    // Validate that setup.data is an object before loading
    if (typeof setup.data !== 'object' || setup.data === null || Array.isArray(setup.data)) {
      console.error('[Budget] Invalid setup data structure:', typeof setup.data, Array.isArray(setup.data));
      alert('Cannot load this setup: data structure is invalid');
      return;
    }
    
    // Deep clone the data to avoid reference issues
    const loadedData = JSON.parse(JSON.stringify(setup.data));
    console.log('[Budget] Loaded data type:', typeof loadedData);
    console.log('[Budget] Loaded data keys:', Object.keys(loadedData));
    
    setSetupData(loadedData);
    setRemovedIds(new Set());
    setSelectedMonth(setup.month);
    setSelectedTiming(setup.timing as '1/2' | '2/2');
    setView('setup');
    
    console.log('[Budget] ===== Budget setup loaded successfully =====');
  };

  if (view === 'summary') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">BUDGET</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Review your monthly budget history</p>
          </div>
          <button type="button" onClick={handleOpenNew} className="flex items-center space-x-3 bg-indigo-600 text-white px-8 py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl transition-all">
            <Plus className="w-5 h-5" />
            <span>Open New</span>
          </button>
        </div>

        <div className="bg-white/40 backdrop-blur-xl rounded-[3rem] shadow-sm border border-gray-100 p-2 w-full">
          <div className="bg-white rounded-[2.5rem] overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="p-8 pl-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Month</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Timing</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Total Budget</th>
                    <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Status</th>
                    <th className="p-8 pr-12 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {savedSetups.length > 0 ? (
                    savedSetups.map((setup) => (
                      <tr key={setup.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="p-8 pl-12">
                          <div className="flex items-center space-x-5">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm shadow-indigo-50/50">
                              <FileText className="w-6 h-6" />
                            </div>
                            <span className="text-base font-black text-gray-900 tracking-tight">{setup.month}</span>
                          </div>
                        </td>
                        <td className="p-8"><span className="text-[10px] font-black text-gray-500 bg-gray-100/80 px-4 py-1.5 rounded-full uppercase tracking-widest">{setup.timing}</span></td>
                        <td className="p-8"><span className="text-base font-black text-gray-900 tracking-tight">{formatCurrency(setup.totalAmount)}</span></td>
                        <td className="p-8">
                          <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full ${setup.status === BUDGET_SETUP_STATUS.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {setup.status}
                          </span>
                        </td>
                        <td className="p-8 pr-12 text-right">
                          <div className="flex items-center justify-end space-x-4">
                            <button 
                              onClick={() => {
                                setConfirmModal({
                                  show: true,
                                  title: 'Move to Trash',
                                  message: `Are you sure you want to move the ${setup.month} (${setup.timing}) budget history entry to Trash?`,
                                  onConfirm: () => {
                                    onMoveToTrash?.(setup);
                                    setConfirmModal(prev => ({ ...prev, show: false }));
                                  }
                                });
                              }} 
                              className="px-4 py-2 text-[10px] font-black text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest border border-red-100"
                            >
                              Remove
                            </button>
                            <button onClick={() => handleLoadSetup(setup)} className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all">
                              <ArrowRight className="w-6 h-6" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className="p-24 text-center text-gray-400 font-bold uppercase tracking-widest">No history found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
      </div>
    );
  }

  const categorySummary = categories.map((cat) => {
    const items = setupData[cat.name] || [];
    const itemsTotal = items.filter(i => i.included).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    
    // FIX: Include installments for Loans category (same logic as Setup view)
    let installmentsTotal = 0;
    if (cat.name === 'Loans') {
      installmentsTotal = installments
        .filter(inst => {
          const timingMatch = !inst.timing || inst.timing === selectedTiming;
          const dateMatch = shouldShowInstallment(inst, selectedMonth);
          const notExcluded = !excludedInstallmentIds.has(inst.id);
          return timingMatch && dateMatch && notExcluded;
        })
        .reduce((s, inst) => s + inst.monthlyAmount, 0);
    }
    
    return { category: cat.name, total: itemsTotal + installmentsTotal };
  });
  const grandTotal = categorySummary.reduce((sum, cat) => sum + cat.total, 0);

  // Calculate Month Summary values
  const totalSpend = grandTotal;
  const actualSalaryValue = actualSalary.trim() !== '' ? parseFloat(actualSalary) : null;
  const projectedSalaryValue = parseFloat(projectedSalary) || 0;
  const salaryToUse = actualSalaryValue !== null && !isNaN(actualSalaryValue) ? actualSalaryValue : projectedSalaryValue;
  const remaining = salaryToUse - totalSpend;

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20 w-full">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => setView('summary')} className="flex flex-col text-left group">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-400 group-hover:text-indigo-400">Back to</span>
            <span className="text-sm font-black tracking-tight text-gray-600 group-hover:text-indigo-600">Summary</span>
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase">BUDGET SETUP</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Configure Recurring Expenses</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Autosave Status Indicator */}
            {autoSaveStatus !== 'idle' && (
              <div className="flex items-center space-x-2 text-xs font-bold">
                {autoSaveStatus === 'saving' && (
                  <>
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-600">Saving...</span>
                  </>
                )}
                {autoSaveStatus === 'saved' && (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">Saved</span>
                  </>
                )}
                {autoSaveStatus === 'error' && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-red-600">Error</span>
                  </>
                )}
              </div>
            )}
            <button onClick={handleSaveSetup} className="flex items-center space-x-3 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl">
              <Save className="w-5 h-5" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="flex justify-center items-center space-x-6">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white border border-gray-100 rounded-[1.5rem] px-8 py-4 font-black text-indigo-600 shadow-sm outline-none">
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedTiming} onChange={(e) => setSelectedTiming(e.target.value as '1/2' | '2/2')} className="bg-white border border-gray-100 rounded-[1.5rem] px-8 py-4 font-black text-indigo-600 shadow-sm outline-none">
            <option value="1/2">1/2</option>
            <option value="2/2">2/2</option>
          </select>
        </div>
      </div>

      {/* Budget Summary and Month Summary side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Budget Summary - Compact Version */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
          <div className="p-4 border-b border-gray-50 bg-gray-50/30"><h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">BUDGET SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50"><th className="p-3 pl-6">Category</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {categorySummary.map((item) => (
                <tr key={item.category}><td className="p-3 pl-6 font-bold text-gray-700 text-sm">{item.category}</td><td className="p-3 pr-6 text-right font-black text-gray-900 text-sm">{formatCurrency(item.total)}</td></tr>
              ))}
              <tr className="bg-indigo-50/30"><td className="p-3 pl-6 text-xs font-black text-indigo-600 uppercase">Grand Total</td><td className="p-3 pr-6 text-right text-lg font-black text-indigo-600">{formatCurrency(grandTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Month Summary - New Component */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
          <div className="p-4 border-b border-gray-50 bg-gray-50/30"><h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">MONTH SUMMARY</h3></div>
          <table className="w-full text-left">
            <thead><tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50"><th className="p-3 pl-6">Item</th><th className="p-3 pr-6 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Projected Salary</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-gray-400 font-bold text-sm">₱</span>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={projectedSalary} 
                      onChange={(e) => setProjectedSalary(e.target.value)} 
                      className="bg-transparent border-none text-sm font-black text-gray-900 w-28 text-right outline-none focus:bg-indigo-50 rounded px-1"
                      aria-label="Projected Salary"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Actual Salary</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-gray-400 font-bold text-sm">₱</span>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={actualSalary} 
                      onChange={(e) => setActualSalary(e.target.value)} 
                      placeholder="Enter actual"
                      className="bg-transparent border-none text-sm font-black text-gray-900 w-28 text-right outline-none focus:bg-indigo-50 rounded px-1 placeholder:text-gray-300"
                      aria-label="Actual Salary"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-3 pl-6 font-bold text-gray-700 text-sm">Total Spend</td>
                <td className="p-3 pr-6 text-right font-black text-gray-900 text-sm">{formatCurrency(totalSpend)}</td>
              </tr>
              <tr className={`${remaining >= 0 ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                <td className="p-3 pl-6 text-xs font-black uppercase">Remaining</td>
                <td className={`p-3 pr-6 text-right text-lg font-black ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(remaining)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Tables - Full Width and Stacked for FIXED, UTILITIES, LOANS, SUBSCRIPTIONS, PURCHASES */}
      <div className="space-y-6">
        {/* Fixed category - full width with account and settle columns */}
        {categories.filter(cat => cat.name === 'Fixed').map((cat) => {
          const items = setupData[cat.name] || [];
          return (
            <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
              <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                <span className="text-lg font-black text-indigo-600">{formatCurrency(items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                      <th className="p-4 pl-10">Name</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Account</th>
                      <th className="p-4 text-center">Actions</th>
                      <th className="p-4 pr-10 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.length > 0 ? items.map((item) => {
                      return (
                        <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                          <td className="p-4 pl-10">
                            <input 
                              type="text" 
                              value={item.name} 
                              onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} 
                              className="bg-transparent border-none text-sm font-bold w-full" 
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-400 font-bold">₱</span>
                              <input 
                                type="number" 
                                value={item.amount} 
                                onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} 
                                className="bg-transparent border-none text-sm font-black w-24" 
                              />
                            </div>
                          </td>
                          <td className="p-4">
                            <select 
                              value={item.accountId || ''} 
                              onChange={(e) => handleSetupUpdate(cat.name, item.id, 'accountId', e.target.value)}
                              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">Select Account</option>
                              {accounts.filter(acc => acc.type === 'Debit').map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.bank} ({acc.classification})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {item.settled ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Item settled" title="Settled" />
                              ) : (
                                <button 
                                  onClick={() => handleSetupUpdate(cat.name, item.id, 'settled', true)}
                                  className="px-3 py-1 bg-green-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-green-700 transition-colors"
                                >
                                  Settle
                                </button>
                              )}
                              <button 
                                onClick={() => handleSetupToggle(cat.name, item.id)} 
                                className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right">
                            <button 
                              onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} 
                              className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg"
                            >
                              Exclude
                            </button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400 text-sm font-medium">
                          No items yet. Click "Add Item" below to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600 border-t border-gray-50">+ Add Item</button>
              </div>
            </div>
          );
        })}

        {/* Other full-width categories: Utilities, Loans, Subscriptions, Purchases */}
        {categories.filter(cat => ['Utilities', 'Loans', 'Subscriptions', 'Purchases'].includes(cat.name)).map((cat) => {
          const items = setupData[cat.name] || [];
          
          // QA: For Loans category, filter installments by timing AND start date
          // Fix for Issue #1 & #2: Missing loan items and incorrect scheduling
          let relevantInstallments: Installment[] = [];
          if (cat.name === 'Loans') {
            relevantInstallments = installments.filter(inst => {
              // Filter by timing (if set, must match selected timing)
              const timingMatch = !inst.timing || inst.timing === selectedTiming;
              // Filter by start date (only show if on/after start date)
              const dateMatch = shouldShowInstallment(inst, selectedMonth);
              return timingMatch && dateMatch;
            });
          }
          
          // PROTOTYPE: Calculate total including installment monthly amounts (only included ones)
          const itemsTotal = items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          const installmentsTotal = relevantInstallments
            .filter(inst => !excludedInstallmentIds.has(inst.id))
            .reduce((s, inst) => s + inst.monthlyAmount, 0);
          const categoryTotal = itemsTotal + installmentsTotal;
          
          return (
            <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
              <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                <span className="text-lg font-black text-indigo-600">{formatCurrency(categoryTotal)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                      <th className="p-4 pl-10">Name</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4 text-center">Actions</th>
                      <th className="p-4 pr-10 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.length > 0 ? items.map((item) => {
                      let isPaid = false, linkedBiller, schedule;
                      const isBiller = item.isBiller || billers.some(b => b.id === item.id);
                      
                      if (isBiller) {
                        linkedBiller = billers.find(b => b.id === item.id);
                        schedule = linkedBiller?.schedules.find(s => s.month === selectedMonth);
                        // FIX: For billers with schedules, ONLY use schedule.amountPaid
                        // This prevents double-counting when transactions match multiple months via grace period
                        if (schedule) {
                          isPaid = !!schedule.amountPaid;
                        } else {
                          // Fallback to transaction matching if no schedule found
                          isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                        }
                      } else {
                        // For non-biller items (like Purchases), only check transactions
                        isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                      }
                      return (
                        <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                          <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold w-full" /></td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1"><span className="text-gray-400 font-bold">₱</span><input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} className="bg-transparent border-none text-sm font-black w-24" /></div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              {isBiller && (
                                isPaid ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                ) : (
                                  <button 
                                    onClick={() => { 
                                      if(linkedBiller && schedule) {
                                        // QA: Check for existing transaction to enable editing
                                        const existingTx = findExistingTransaction(
                                          linkedBiller.name,
                                          schedule.expectedAmount,
                                          selectedMonth
                                        );
                                        
                                        setShowPayModal({biller: linkedBiller, schedule}); 
                                        setPayFormData({
                                          transactionId: existingTx?.id || '',
                                          amount: existingTx?.amount.toString() || schedule.expectedAmount.toString(),
                                          receipt: existingTx ? 'Receipt on file' : '',
                                          datePaid: existingTx ? new Date(existingTx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                          accountId: existingTx?.payment_method_id || payFormData.accountId
                                        }); 
                                      } 
                                    }} 
                                    className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                  >
                                    Pay
                                  </button>
                                )
                              )}
                              {/* Add Pay button or checkmark for Purchases category items that are not billers */}
                              {!isBiller && cat.name === 'Purchases' && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
                                isPaid ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                ) : (
                                  <button 
                                    onClick={() => {
                                      setTransactionFormData({
                                        name: item.name,
                                        date: new Date().toISOString().split('T')[0],
                                        amount: item.amount,
                                        accountId: item.accountId || accounts[0]?.id || ''
                                      });
                                      setShowTransactionModal(true);
                                    }}
                                    className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                  >
                                    Pay
                                  </button>
                                )
                              )}
                              <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right"><button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Exclude</button></td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400 text-sm font-medium">
                          No items yet. Click "Add Item" below to get started.
                        </td>
                      </tr>
                    )}
                    {/* PROTOTYPE: Render installments for Loans category */}
                    {cat.name === 'Loans' && relevantInstallments.length > 0 && (
                      <>
                        {relevantInstallments.map((installment) => {
                          const account = accounts.find(a => a.id === installment.accountId);
                          const isIncluded = !excludedInstallmentIds.has(installment.id);
                          // Check payment status using transaction matching (simplified for now)
                          const isPaid = checkIfPaidByTransaction(
                            installment.name, 
                            installment.monthlyAmount, 
                            selectedMonth
                          );
                          
                          return (
                            <tr key={`installment-${installment.id}`} className={`${isIncluded ? 'bg-blue-50/30' : 'bg-gray-50 opacity-60'}`}>
                              <td className="p-4 pl-10">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-900">{installment.name}</span>
                                  <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 rounded text-blue-600">
                                    INSTALLMENT {installment.timing ? `• ${installment.timing}` : ''}
                                  </span>
                                </div>
                                {account && (
                                  <div className="text-[10px] text-gray-400 font-medium mt-1">
                                    {account.bank} • {installment.termDuration}
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1">
                                  <span className="text-gray-400 font-bold">₱</span>
                                  <span className="text-sm font-black">{formatCurrency(installment.monthlyAmount).replace('₱', '')}</span>
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isPaid ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setTransactionFormData({
                                          name: `${installment.name} - ${selectedMonth} ${new Date().getFullYear()}`,
                                          date: new Date().toISOString().split('T')[0],
                                          amount: installment.monthlyAmount.toString(),
                                          accountId: installment.accountId || accounts[0]?.id || ''
                                        });
                                        setShowTransactionModal(true);
                                      }}
                                      className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                    >
                                      Pay
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => {
                                      setExcludedInstallmentIds(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(installment.id)) {
                                          newSet.delete(installment.id);
                                        } else {
                                          newSet.add(installment.id);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${isIncluded ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right">
                                <button 
                                  onClick={() => {
                                    setConfirmModal({
                                      show: true,
                                      title: 'Exclude Installment',
                                      message: `Are you sure you want to exclude "${installment.name}" from this budget period? This will not delete the installment, just exclude it from this budget.`,
                                      onConfirm: () => {
                                        setExcludedInstallmentIds(prev => new Set([...prev, installment.id]));
                                        setConfirmModal(prev => ({ ...prev, show: false }));
                                      }
                                    });
                                  }}
                                  className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  Exclude
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
                <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600 border-t border-gray-50">+ Add Item</button>
              </div>
            </div>
          );
        })}

        {/* PROTOTYPE: Credit Card Regular Purchases Section */}
        {(() => {
          // Get all credit card accounts
          const creditCardAccounts = accounts.filter(acc => acc.classification === 'Credit Card' && acc.billingDate);
          
          if (creditCardAccounts.length === 0) return null;
          
          // Aggregate purchases for each credit card for the selected month
          const monthIndex = MONTHS.indexOf(selectedMonth);
          const currentYear = new Date().getFullYear();
          
          return creditCardAccounts.map(account => {
            const cycleSummaries = aggregateCreditCardPurchases(account, transactions, installments);
            
            // Find the cycle that contains the selected month
            const relevantCycle = cycleSummaries.find(cycle => {
              const cycleMonth = cycle.cycleStart.getMonth();
              const cycleYear = cycle.cycleStart.getFullYear();
              // Match if cycle overlaps with selected month
              return (cycleMonth === monthIndex && cycleYear === currentYear) ||
                     (cycle.cycleEnd.getMonth() === monthIndex && cycle.cycleEnd.getFullYear() === currentYear);
            });
            
            if (!relevantCycle || relevantCycle.transactionCount === 0) return null;
            
            return (
              <div key={`cc-${account.id}`} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden w-full">
                <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">Credit Card Purchases</h3>
                    <p className="text-[10px] text-gray-500 font-medium mt-1">{account.bank} • {relevantCycle.cycleLabel}</p>
                  </div>
                  <span className="text-lg font-black text-purple-600">{formatCurrency(relevantCycle.totalAmount)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
                        <th className="p-4 pl-10">Transaction</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4 pr-10 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {relevantCycle.transactions.map((tx) => (
                        <tr key={tx.id} className="bg-purple-50/20">
                          <td className="p-4 pl-10">
                            <span className="text-sm font-bold text-gray-900">{tx.name}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs text-gray-500 font-medium">
                              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center space-x-1">
                              <span className="text-gray-400 font-bold">₱</span>
                              <span className="text-sm font-black">{formatCurrency(tx.amount).replace('₱', '')}</span>
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right">
                            {/* QA: Add edit button for transactions - Fix for Issue #6 */}
                            <button
                              onClick={() => {
                                // Format date as YYYY-MM-DD for input
                                const dateStr = new Date(tx.date).toISOString().split('T')[0];
                                setTransactionFormData({
                                  id: tx.id,
                                  name: tx.name,
                                  date: dateStr,
                                  amount: tx.amount.toString(),
                                  accountId: tx.payment_method_id
                                });
                                setShowTransactionModal(true);
                              }}
                              className="text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-purple-100/30">
                        <td colSpan={2} className="p-4 pl-10 text-xs font-black text-gray-700 uppercase">
                          Total Regular Purchases
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-400 font-bold">₱</span>
                            <span className="text-sm font-black text-purple-600">{formatCurrency(relevantCycle.totalAmount).replace('₱', '')}</span>
                          </div>
                        </td>
                        <td className="p-4 pr-10 text-right">
                          <span className="text-[9px] font-bold text-purple-600 uppercase tracking-widest">
                            {relevantCycle.transactionCount} txn(s)
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="p-4 border-t border-gray-50 bg-gray-50/50">
                    <p className="text-[10px] text-gray-500 font-medium text-center">
                      <span className="font-bold">PROTOTYPE:</span> Regular credit card purchases are auto-aggregated from transactions. 
                      Excludes installment payments.
                    </p>
                  </div>
                </div>
              </div>
            );
          });
        })()}

        {/* Remaining categories (excluding Fixed, Utilities, Loans, Subscriptions, Purchases) - keep in grid if needed */}
        {categories.filter(cat => !['Fixed', 'Utilities', 'Loans', 'Subscriptions', 'Purchases'].includes(cat.name)).length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {categories.filter(cat => !['Fixed', 'Utilities', 'Loans', 'Subscriptions', 'Purchases'].includes(cat.name)).map((cat) => {
              const items = setupData[cat.name] || [];
              return (
                <div key={cat.id} className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.25em]">{cat.name}</h3>
                    <span className="text-lg font-black text-indigo-600">{formatCurrency(items.filter(i => i.included).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-gray-50">
                        {items.map((item) => {
                          let isPaid = false, linkedBiller, schedule;
                          const isBiller = item.isBiller || billers.some(b => b.id === item.id);
                          
                          if (isBiller) {
                            linkedBiller = billers.find(b => b.id === item.id);
                            schedule = linkedBiller?.schedules.find(s => s.month === selectedMonth);
                            // FIX: For billers with schedules, ONLY use schedule.amountPaid
                            // This prevents double-counting when transactions match multiple months via grace period
                            if (schedule) {
                              isPaid = !!schedule.amountPaid;
                            } else {
                              // Fallback to transaction matching if no schedule found
                              isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                            }
                          } else {
                            // For non-biller items, only check transactions
                            isPaid = checkIfPaidByTransaction(item.name, item.amount, selectedMonth);
                          }
                          return (
                            <tr key={item.id} className={`${item.included ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                              <td className="p-4 pl-10"><input type="text" value={item.name} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold w-full" /></td>
                              <td className="p-4">
                                <div className="flex items-center space-x-1"><span className="text-gray-400 font-bold">₱</span><input type="number" value={item.amount} onChange={(e) => handleSetupUpdate(cat.name, item.id, 'amount', e.target.value)} className="bg-transparent border-none text-sm font-black w-24" /></div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  {isBiller && (
                                    isPaid ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" aria-label="Payment completed" title="Paid" />
                                    ) : (
                                      <button 
                                        onClick={() => { 
                                          if(linkedBiller && schedule) {
                                            // QA: Check for existing transaction to enable editing
                                            const existingTx = findExistingTransaction(
                                              linkedBiller.name,
                                              schedule.expectedAmount,
                                              selectedMonth
                                            );
                                            
                                            setShowPayModal({biller: linkedBiller, schedule}); 
                                            setPayFormData({
                                              transactionId: existingTx?.id || '',
                                              amount: existingTx?.amount.toString() || schedule.expectedAmount.toString(),
                                              receipt: existingTx ? 'Receipt on file' : '',
                                              datePaid: existingTx ? new Date(existingTx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                              accountId: existingTx?.payment_method_id || payFormData.accountId
                                            }); 
                                          } 
                                        }} 
                                        className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                      >
                                        Pay
                                      </button>
                                    )
                                  )}
                                  <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>
                                </div>
                              </td>
                              <td className="p-4 pr-10 text-right"><button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Exclude</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button onClick={() => addItemToCategory(cat.name)} className="w-full p-4 text-[10px] font-black text-gray-400 uppercase hover:text-indigo-600">+ Add Item</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowPayModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
            {/* QA: Consistent Pay form - receipt upload added back, name in title */}
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Pay {showPayModal.biller.name}
            </h2>
            <p className="text-gray-500 text-sm mb-8">
              {payFormData.transactionId 
                ? `Updating payment for ${showPayModal.schedule.month}`
                : `Recording payment for ${showPayModal.schedule.month}`}
            </p>
            <form onSubmit={handlePaySubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input required type="number" step="0.01" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                  <input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                  <select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setPayFormData({...payFormData, receipt: e.target.files?.[0]?.name || ''})} />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">
                  {payFormData.transactionId ? 'Update Payment' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QA: Consistent Transaction Form Modal - with receipt upload */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowTransactionModal(false)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              {transactionFormData.id ? `Edit Payment` : `Pay ${transactionFormData.name || 'Item'}`}
            </h2>
            <p className="text-gray-500 text-sm mb-8">
              {transactionFormData.id 
                ? 'Update the payment details below' 
                : 'Record a payment transaction'}
            </p>
            <form onSubmit={handleTransactionSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input 
                    required 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={transactionFormData.amount} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, amount: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                  <input 
                    required 
                    type="date" 
                    value={transactionFormData.date} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, date: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                  <select 
                    value={transactionFormData.accountId} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, accountId: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Upload Receipt (Optional)</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">Click or drag to upload receipt</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">
                  {transactionFormData.id ? 'Update Payment' : 'Submit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all">Proceed</button>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
      </div>
    </div>
  </div>
);

export default Budget;
