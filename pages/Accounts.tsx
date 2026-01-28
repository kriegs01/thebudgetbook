import React, { useState } from 'react';
import { Account, ViewMode, AccountClassification } from '../types';
import { Plus, Landmark, CreditCard, LayoutGrid, List, MoreVertical, TrendingUp, Trash2, AlertTriangle } from 'lucide-react';

interface AccountsProps {
  accounts: Account[];
  onAdd: (a: Account) => void;
  onDelete?: (id: string) => void;
}

const Accounts: React.FC<AccountsProps> = ({ accounts, onAdd, onDelete }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [showModal, setShowModal] = useState(false);
  
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

  const [formData, setFormData] = useState({ 
    bank: '', classification: 'Checking' as AccountClassification, balance: '', type: 'Debit' as 'Debit' | 'Credit',
    creditLimit: '', billingDate: '', dueDate: '' 
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      bank: formData.bank,
      classification: formData.classification,
      balance: parseFloat(formData.balance),
      type: formData.type,
      creditLimit: formData.type === 'Credit' ? parseFloat(formData.creditLimit) : undefined,
      billingDate: formData.type === 'Credit' ? formData.billingDate : undefined,
      dueDate: formData.type === 'Credit' ? formData.dueDate : undefined
    });
    setShowModal(false);
  };

  const handleDeleteTrigger = (id: string, bank: string) => {
    setConfirmModal({
      show: true,
      title: 'Remove Account',
      message: `Are you sure you want to permanently remove the account: "${bank}"? This might affect your recorded balances.`,
      onConfirm: () => {
        onDelete?.(id);
        setConfirmModal(p => ({ ...p, show: false }));
      }
    });
  };

  const renderAccount = (acc: Account) => (
    <div key={acc.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all relative group overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 ${acc.type === 'Credit' ? 'bg-purple-500' : 'bg-green-500'}`}></div>
      
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3 rounded-xl ${acc.type === 'Credit' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
          {acc.type === 'Credit' ? <CreditCard className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
        </div>
        <button onClick={() => handleDeleteTrigger(acc.id, acc.bank)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 leading-tight">{acc.bank}</h3>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{acc.classification}</p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-400 font-medium">Balance</p>
          <p className={`text-2xl font-bold text-gray-900`}>{formatCurrency(acc.balance)}</p>
        </div>
      </div>
    </div>
  );

  const debitAccounts = accounts.filter(a => a.type === 'Debit');
  const creditAccounts = accounts.filter(a => a.type === 'Credit');

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-gray-900 uppercase">ACCOUNTS</h2>
        <div className="flex items-center space-x-4">
          <button onClick={() => setShowModal(true)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      <section>
        <div className="flex items-center space-x-2 mb-6">
          <TrendingUp className="w-5 h-5 text-green-500" />
          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-widest text-sm">Debit & Assets</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {debitAccounts.map(renderAccount)}
        </div>
      </section>

      <section>
        <div className="flex items-center space-x-2 mb-6">
          <CreditCard className="w-5 h-5 text-purple-500" />
          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-widest text-sm">Credit & Liabilities</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {creditAccounts.map(renderAccount)}
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
            <div className="bg-gray-900 md:w-1/3 p-8 text-white flex flex-col justify-between">
              <div>
                <Landmark className="w-12 h-12 mb-6 text-indigo-400" />
                <h2 className="text-2xl font-black mb-2 uppercase">Connect Account</h2>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-8 flex-1 bg-white space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Bank Name</label><input required type="text" value={formData.bank} onChange={(e) => setFormData({...formData, bank: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500" /></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Type</label><select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as 'Debit' | 'Credit'})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500"><option value="Debit">Debit</option><option value="Credit">Credit</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Classification</label><select value={formData.classification} onChange={(e) => setFormData({...formData, classification: e.target.value as AccountClassification})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500"><option>Checking</option><option>Savings</option><option>Credit Card</option><option>Loan</option></select></div>
                <div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Balance</label><input required type="number" value={formData.balance} onChange={(e) => setFormData({...formData, balance: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500" /></div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 py-4 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700">Add Account</button>
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
        <button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100">
          Proceed
        </button>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export default Accounts;