import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, LayoutGrid, List, MoreVertical, Trash2, ArrowRight, X, AlertTriangle, User, Landmark } from 'lucide-react';
import { getAllPeople, createPerson, deletePerson } from '../src/services/peopleService';
import { getAllTransactions } from '../src/services/transactionsService';
import type { SupabasePerson, SupabaseTransaction } from '../src/types/supabase';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

export default function PeoplePage() {
  const [people, setPeople] = useState<SupabasePerson[]>([]);
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{show: boolean; id: string; name: string} | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [peopleRes, txRes] = await Promise.all([
      getAllPeople(),
      getAllTransactions()
    ]);
    
    if (peopleRes.data) setPeople(peopleRes.data);
    if (txRes.data) setTransactions(txRes.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPersonName.trim();
    if (!trimmed) return;
    
    // Prevent exact duplicates
    if (people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('A person with this name already exists.');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await createPerson({ name: trimmed });
    setIsSubmitting(false);

    if (error) {
      alert('Failed to add person. Please try again.');
    } else if (data) {
      setPeople(prev => [...prev, data]);
      setNewPersonName('');
      setShowAddModal(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmModal) return;
    
    const { error } = await deletePerson(confirmModal.id);
    if (error) {
      alert('Failed to delete person.');
    } else {
      setPeople(prev => prev.filter(p => p.id !== confirmModal.id));
      setConfirmModal(null);
    }
  };

  // Get aggregate stats from transactions
  const getPersonStats = (personName: string) => {
    const personTxs = transactions.filter(t => t.borrower_name === personName);
    const activeLoans = personTxs.filter(t => t.transaction_type === 'loan');
    const totalLoanAmount = activeLoans.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    
    return {
      txCount: personTxs.length,
      loanCount: activeLoans.length,
      totalLoanAmount
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
        
        {/* ── Header & Controllers ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 md:p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight transition-colors">People</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium transition-colors">Manage shared tracking and active loans</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="bg-gray-100 dark:bg-gray-800/80 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-700 transition-colors">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setShowAddModal(true)} 
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Person</span>
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 font-medium">Loading people...</div>
        ) : people.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] transition-colors">
            <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest mb-1">No people found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Add someone to start tracking shared expenses and loans.</p>
            <button onClick={() => setShowAddModal(true)} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
              Add your first person
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map(person => {
              const stats = getPersonStats(person.name);
              return (
                <div key={person.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] p-6 hover:shadow-lg transition-all group relative overflow-hidden">
                  <button 
                    onClick={() => setConfirmModal({ show: true, id: person.id, name: person.name })}
                    className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-xl flex items-center justify-center border border-indigo-100 dark:border-indigo-800 transition-colors">
                      {person.name.substring(0, 2).toUpperCase()}
                    </div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 truncate pr-8">{person.name}</h3>
                  </div>
                  
                  <div className="space-y-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Recorded Loans</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(stats.totalLoanAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transactions</span>
                      <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">{stats.txCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] overflow-hidden transition-colors">
            {people.map((person, i) => {
              const stats = getPersonStats(person.name);
              return (
                <div key={person.id} className={`flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i !== people.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-sm flex items-center justify-center border border-indigo-100 dark:border-indigo-800 transition-colors">
                      {person.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-gray-900 dark:text-gray-100">{person.name}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stats.txCount} transactions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Loans</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(stats.totalLoanAmount)}</p>
                    </div>
                    <button 
                      onClick={() => setConfirmModal({ show: true, id: person.id, name: person.name })}
                      className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Person Modal ───────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
            <button onClick={() => setShowAddModal(false)} className="absolute right-6 top-6 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Add New Person</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Link transactions and loans easily.</p>
            
            <form onSubmit={handleAddPerson} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Full Name or Alias</label>
                <input 
                  autoFocus
                  type="text" 
                  required
                  value={newPersonName}
                  onChange={e => setNewPersonName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-400"
                />
              </div>
              <button type="submit" disabled={isSubmitting || !newPersonName.trim()} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50">
                {isSubmitting ? 'Adding...' : 'Save Person'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}