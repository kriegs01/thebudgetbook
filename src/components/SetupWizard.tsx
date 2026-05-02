import React, { useState } from 'react';
import { ArrowRight, Trash2, Plus, Landmark, CheckCircle2, ListPlus } from 'lucide-react';
import { BudgetCategory, Account } from '../../types';
import { INITIAL_CATEGORIES } from '../../constants';

interface SetupWizardProps {
  onComplete: (categories: BudgetCategory[], account: Account | null) => Promise<void>;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Categories State
  const [cats, setCats] = useState<BudgetCategory[]>(INITIAL_CATEGORIES);
  const [newCat, setNewCat] = useState('');

  // Step 2: Account State
  const [bank, setBank] = useState('');
  const [balance, setBalance] = useState('');

  const handleAddCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    setCats([...cats, { 
      id: Math.random().toString(36).substring(2, 9), 
      name: newCat.trim(), 
      subcategories: [] 
    }]);
    setNewCat('');
  };

  const handleRemoveCat = (id: string) => {
    setCats(cats.filter(c => c.id !== id));
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let account: Account | null = null;
    if (bank.trim() && balance) {
      account = {
        id: '',
        bank: bank.trim(),
        classification: 'Checking',
        balance: parseFloat(balance) || 0,
        openingBalance: parseFloat(balance) || 0,
        type: 'Debit'
      };
    }
    
    await onComplete(cats, account);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950 transition-colors animate-in fade-in duration-500 overflow-y-auto">
      <div className="max-w-xl w-full bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 md:p-10 shadow-2xl transition-colors my-auto">
        
        {/* Progress Indicator */}
        <div className="flex gap-2 mb-8">
          <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-gray-100 dark:bg-gray-800'} transition-colors`}></div>
          <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-100 dark:bg-gray-800'} transition-colors`}></div>
        </div>

        {step === 1 && (
          <div className="animate-in slide-in-from-right-8 duration-300">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mb-6">
              <ListPlus className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mb-2">Budget Categories</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-8 leading-relaxed">
              We've pre-loaded some standard categories as suggestions. Keep what you need, remove what you don't, or add your own.
            </p>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-2">
              {cats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <span className="font-bold text-gray-700 dark:text-gray-300">{cat.name}</span>
                  <button onClick={() => handleRemoveCat(cat.id)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCat} className="flex gap-2 mb-8">
              <input
                type="text"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                placeholder="Custom category name..."
                className="flex-1 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-all placeholder:text-gray-400"
              />
              <button type="submit" disabled={!newCat.trim()} className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 px-6 rounded-2xl font-bold hover:bg-indigo-200 transition-colors disabled:opacity-50">
                <Plus className="w-5 h-5" />
              </button>
            </form>

            <button onClick={() => setStep(2)} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none transition-all">
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in slide-in-from-right-8 duration-300">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-3xl flex items-center justify-center mb-6">
              <Landmark className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mb-2">First Account</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-8 leading-relaxed">
              Let's add the primary place where you keep your money (like a Checking account or Cash). You can add more later.
            </p>

            <form onSubmit={handleFinish} className="space-y-5 mb-8">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account Name</label>
                <input autoFocus required type="text" value={bank} onChange={e => setBank(e.target.value)} placeholder="e.g. Chase Checking" className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 outline-none focus:ring-2 focus:ring-green-500 font-bold transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Current Balance</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                  <input required type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00" className="w-full bg-gray-50 dark:bg-gray-800 dark:text-gray-100 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-green-500 transition-all" />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" disabled={isSubmitting} onClick={() => { setBank(''); setBalance(''); handleFinish({preventDefault: () => {}} as any); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                  Skip
                </button>
                <button type="submit" disabled={isSubmitting || !bank || !balance} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-green-700 shadow-xl shadow-green-100 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finish Setup</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};