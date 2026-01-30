import React, { useState } from 'react';
import { SavingsJar, Account } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface SavingsProps {
  jars: SavingsJar[];
  accounts: Account[];
  onAdd: (s: SavingsJar) => void;
  onDelete?: (id: string) => void;
}

const Savings: React.FC<SavingsProps> = ({ jars, accounts, onAdd, onDelete }) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', accountId: accounts[0]?.id || '', currentBalance: '' });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAdd({
      id: '', // Will be replaced by Supabase UUID
      name: formData.name,
      accountId: formData.accountId,
      currentBalance: parseFloat(formData.currentBalance)
    });
    setShowModal(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete savings goal: ${name}?`)) {
      onDelete?.(id);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-gray-900 uppercase">SAVINGS GOALS</h2>
          <p className="text-gray-500 text-sm">Track your progress and save for the future.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-700 shadow-lg flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>New Jar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jars.map((jar) => {
          const account = accounts.find(a => a.id === jar.accountId);
          return (
            <div key={jar.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex items-center space-x-5 relative group">
              <div className="w-16 h-16 flex-shrink-0 bg-green-50 rounded-2xl flex items-center justify-center p-2 relative overflow-hidden">
                <img src="https://cdn-icons-png.flaticon.com/512/2855/2855581.png" alt="Jar" className="w-12 h-12 object-contain z-10" />
                <div className="absolute inset-x-0 bottom-0 bg-green-200/50" style={{ height: '40%' }}></div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 truncate mb-1">{jar.name}</h3>
                <p className="text-[10px] text-gray-500 uppercase font-black">{account?.bank || 'Vault'}</p>
                <p className="text-xl font-black text-gray-900">{formatCurrency(jar.currentBalance)}</p>
              </div>
              <button onClick={() => handleDelete(jar.id, jar.name)} className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-gray-900 mb-6 uppercase">New Savings Goal</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Goal Name</label><input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-green-500 font-bold" /></div>
              <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Current Balance</label><input required type="number" value={formData.currentBalance} onChange={(e) => setFormData({...formData, currentBalance: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-green-500 font-bold" /></div>
              <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Account</label><select value={formData.accountId} onChange={(e) => setFormData({...formData, accountId: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-green-500 font-bold">{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}</select></div>
              <div className="flex space-x-3 pt-4"><button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">Add Jar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Savings;