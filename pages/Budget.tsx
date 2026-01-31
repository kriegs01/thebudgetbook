
import React, { useState, useEffect } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory } from '../types';
import { Plus, Check, ChevronDown, Trash2, Save, FileText, ArrowRight, Upload, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend } from '../src/services/budgetSetupsService';
import { createTransaction } from '../src/services/transactionsService';

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
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Budget: React.FC<BudgetProps> = ({ accounts, billers, categories, savedSetups, setSavedSetups, onUpdateBiller, onMoveToTrash, onReloadSetups }) => {
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');

  // Categorized Setup State
  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Month Summary State - stored in Supabase with setup data
  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');

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

  // Modal States
  const [showPayModal, setShowPayModal] = useState<{ biller: Biller, schedule: PaymentSchedule } | null>(null);
  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });

  // Transaction form modal for Purchases
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionFormData, setTransactionFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    accountId: accounts[0]?.id || ''
  });

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
          const filteredExisting = newData[cat.name].filter(item => {
            if (item.isBiller) {
              const biller = billers.find(b => b.id === item.id);
              return biller && biller.timing === selectedTiming;
            }
            return true; // Keep non-biller items
          });

          const existingIds = new Set(filteredExisting.map(i => i.id));
          const newItems = matchingBillers
            .filter(b => !existingIds.has(b.id))
            .map(b => {
              const schedule = b.schedules.find(s => s.month === selectedMonth);
              return {
                id: b.id,
                name: b.name,
                amount: schedule ? schedule.expectedAmount.toString() : b.expectedAmount.toString(),
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

  const removeItemFromCategory = (category: string, id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Remove Item',
      message: `Are you sure you want to exclude "${name}" from the current budget setup?`,
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
          status: 'Saved'
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
          status: 'Saved',
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

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('[Budget] Submitting transaction to Supabase');
    console.log('[Budget] Transaction data:', transactionFormData);
    
    // Save transaction to Supabase instead of localStorage
    const transaction = {
      name: transactionFormData.name,
      date: new Date(transactionFormData.date).toISOString(),
      amount: parseFloat(transactionFormData.amount),
      payment_method_id: transactionFormData.accountId
    };
    
    try {
      const { data, error } = await createTransaction(transaction);
      
      if (error) {
        console.error('[Budget] Failed to save transaction:', error);
        alert('Failed to save transaction. Please try again.');
        return;
      }
      
      console.log('[Budget] Transaction saved successfully:', data);
      
      // Close the modal
      setShowTransactionModal(false);
    } catch (e) {
      console.error('[Budget] Error saving transaction:', e);
      alert('Failed to save transaction. Please try again.');
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    
    try {
      const { biller, schedule } = showPayModal;
      
      // Create a transaction record in Supabase
      console.log('[Budget] Creating transaction for payment');
      const transaction = {
        name: `${biller.name} - ${schedule.month} ${schedule.year}`,
        date: new Date(payFormData.datePaid).toISOString(),
        amount: parseFloat(payFormData.amount),
        payment_method_id: payFormData.accountId
      };
      
      const { data: transactionData, error: transactionError } = await createTransaction(transaction);
      
      if (transactionError) {
        console.error('[Budget] Failed to create transaction:', transactionError);
        alert('Failed to save transaction. Please try again.');
        return;
      }
      
      console.log('[Budget] Transaction created successfully:', transactionData);
      
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
      await onUpdateBiller({ ...biller, schedules: updatedSchedules });
      
      // Only close modal on success
      setShowPayModal(null);
    } catch (error) {
      console.error('Failed to update payment:', error);
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
                          <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full ${setup.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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
    const total = items.filter(i => i.included).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    return { category: cat.name, total };
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
          <button onClick={handleSaveSetup} className="flex items-center space-x-3 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl">
            <Save className="w-5 h-5" />
            <span>Save</span>
          </button>
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
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
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
                              Remove
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
                        isPaid = !!schedule?.amountPaid;
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
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <button 
                                    onClick={() => { 
                                      if(linkedBiller && schedule) { 
                                        setShowPayModal({biller: linkedBiller, schedule}); 
                                        setPayFormData({...payFormData, amount: schedule.expectedAmount.toString(), receipt: ''}); 
                                      } 
                                    }} 
                                    className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-indigo-700 transition-colors"
                                  >
                                    Pay
                                  </button>
                                )
                              )}
                              {/* Add Pay button for Purchases category items that are not billers */}
                              {!isBiller && cat.name === 'Purchases' && item.name !== 'New Item' && parseFloat(item.amount) > 0 && (
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
                              )}
                              <button onClick={() => handleSetupToggle(cat.name, item.id)} className={`w-8 h-8 rounded-xl border-2 transition-all flex items-center justify-center ${item.included ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200'}`}><Check className="w-4 h-4" /></button>
                            </div>
                          </td>
                          <td className="p-4 pr-10 text-right"><button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Remove</button></td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400 text-sm font-medium">
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
                            isPaid = !!schedule?.amountPaid;
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
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    ) : (
                                      <button 
                                        onClick={() => { 
                                          if(linkedBiller && schedule) { 
                                            setShowPayModal({biller: linkedBiller, schedule}); 
                                            setPayFormData({...payFormData, amount: schedule.expectedAmount.toString(), receipt: ''}); 
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
                              <td className="p-4 pr-10 text-right"><button onClick={() => removeItemFromCategory(cat.name, item.id, item.name)} className="text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-50 px-2 py-1 rounded-lg">Remove</button></td>
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
            <h2 className="text-2xl font-black text-gray-900 mb-2">Pay {showPayModal.biller.name}</h2>
            <p className="text-gray-500 text-sm mb-8">Recording payment for {showPayModal.schedule.month}</p>
            <form onSubmit={handlePaySubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Paid</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                  <input required type="number" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receipt Upload</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setPayFormData({...payFormData, receipt: e.target.files?.[0]?.name || ''})} />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label>
                  <input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account</label>
                  <select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}
                  </select>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl shadow-green-100">Submit Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Form Modal for Purchases */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowTransactionModal(false)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Add Purchase Transaction</h2>
            <p className="text-gray-500 text-sm mb-8">This will create a transaction and add it to your budget setup</p>
            <form onSubmit={handleTransactionSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Purchase Name</label>
                <input 
                  required 
                  type="text" 
                  value={transactionFormData.name} 
                  onChange={(e) => setTransactionFormData({...transactionFormData, name: e.target.value})} 
                  placeholder="e.g. Groceries, Gas, etc."
                  className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all" 
                />
              </div>
              
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
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                  <input 
                    required 
                    type="date" 
                    value={transactionFormData.date} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, date: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account</label>
                  <select 
                    value={transactionFormData.accountId} 
                    onChange={(e) => setTransactionFormData({...transactionFormData, accountId: e.target.value})} 
                    className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"
                  >
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-100">Add Purchase</button>
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
