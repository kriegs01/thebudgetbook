import React, { useState, useEffect } from 'react';
import { BudgetItem, Account, Biller, PaymentSchedule, CategorizedSetupItem, SavedBudgetSetup, BudgetCategory } from '../types';
import { createBudgetSetupFrontend, updateBudgetSetupFrontend, getAllBudgetSetupsFrontend } from '../src/services/budgetSetupsService';
import { Plus, Check, Save } from 'lucide-react';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const Budget: React.FC<{
  accounts: Account[];
  billers: Biller[];
  categories: BudgetCategory[];
}> = ({ accounts, billers, categories }) => {
  const [savedSetups, setSavedSetups] = useState<SavedBudgetSetup[]>([]);
  const [view, setView] = useState<'summary' | 'setup'>('summary');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedTiming, setSelectedTiming] = useState<'1/2' | '2/2'>('1/2');
  const [setupData, setSetupData] = useState<{ [key: string]: CategorizedSetupItem[] }>({});
  const [projectedSalary, setProjectedSalary] = useState<string>('11000');
  const [actualSalary, setActualSalary] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load all setups from Supabase on mount or after save
  const reloadSetups = async () => {
    const { data, error } = await getAllBudgetSetupsFrontend();
    if (!error && data) setSavedSetups(data);
  };
  useEffect(() => { reloadSetups(); }, []);

  // When month/timing changes, load data from saved setups (if exists)
  useEffect(() => {
    const setup = savedSetups.find(s => s.month === selectedMonth && s.timing === selectedTiming);
    if (setup) {
      setSetupData(JSON.parse(JSON.stringify(setup.data)));
      setProjectedSalary(setup.data._projectedSalary ?? '11000');
      setActualSalary(setup.data._actualSalary ?? '');
      setEditingId(setup.id);
    } else {
      // Otherwise reset for new setup
      const empty: { [key: string]: CategorizedSetupItem[] } = {};
      categories.forEach(c => empty[c.name] = []);
      setSetupData(empty);
      setProjectedSalary('11000');
      setActualSalary('');
      setEditingId(null);
    }
  }, [selectedMonth, selectedTiming, savedSetups, categories]);

  // Field edit handler
  const handleSetupUpdate = (category: string, itemId: string, field: keyof CategorizedSetupItem, value: any) => {
    setSetupData(prev => ({
      ...prev,
      [category]: prev[category]?.map(item => item.id === itemId ? { ...item, [field]: value } : item) ?? []
    }));
  };

  // Save handler
  const handleSaveSetup = async () => {
    const total = Object.values(setupData).flat()
      .filter(item => item.included)
      .reduce((acc, item) => acc + Number(item.amount || 0), 0);

    const dataToSave = {
      ...JSON.parse(JSON.stringify(setupData)), // deep copy to avoid mutation issues
      _projectedSalary: projectedSalary,
      _actualSalary: actualSalary
    };

    try {
      if (editingId) {
        // Update existing
        const { error } = await updateBudgetSetupFrontend({
          id: editingId,
          month: selectedMonth,
          timing: selectedTiming,
          status: 'Saved',
          totalAmount: total,
          data: dataToSave
        });
        if (error) return alert("Failed to update setup");
      } else {
        // Create new
        const { error } = await createBudgetSetupFrontend({
          month: selectedMonth,
          timing: selectedTiming,
          status: 'Saved',
          totalAmount: total,
          data: dataToSave
        });
        if (error) return alert("Failed to create setup");
      }
      await reloadSetups();
      setView('summary');
      alert('Budget setup saved!');
    } catch (e) {
      alert('Save failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // ... the rest (rendering) remains unchanged, as in your current layout

  return (
    <div>
      <button onClick={() => setView('setup')}>Open Setup</button>
      <button onClick={handleSaveSetup}><Save className="inline" />Save</button>
      {/* ...your budget UI, categories, and summary */}
    </div>
  );
};

export default Budget;
