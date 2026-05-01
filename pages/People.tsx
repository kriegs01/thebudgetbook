import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, LayoutGrid, List, MoreVertical, Trash2, ArrowRight, ArrowLeft, X, AlertTriangle, User, Landmark, ArrowUpFromLine, ArrowDownToLine, ArrowLeftRight, BanknoteArrowDown } from 'lucide-react';
import { getAllPeople, createPerson, deletePerson } from '../src/services/peopleService';
import { getAllTransactions, createTransaction } from '../src/services/transactionsService';
import type { SupabasePerson, SupabaseTransaction } from '../src/types/supabase';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

export default function PeoplePage() {
  const [people, setPeople] = useState<SupabasePerson[]>([]);
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{show: boolean; id: string; name: string} | null>(null);

  const [showLoanPaymentModal, setShowLoanPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [loanPaymentForm, setLoanPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0] });

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

  const handleLoanPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;
    
    setIsSubmitting(true);
    const { error } = await createTransaction({
      name: 'Loan Payment Received',
      date: new Date(loanPaymentForm.date).toISOString(),
      amount: -Math.abs(parseFloat(loanPaymentForm.amount)), // Negative - money coming in
      payment_method_id: selectedLoan.payment_method_id,
      transaction_type: 'loan_payment',
      notes: `Payment for: ${selectedLoan.name}`,
      payment_schedule_id: null,
      related_transaction_id: selectedLoan.id,
    });
    setIsSubmitting(false);

    if (error) {
      alert('Failed to record loan payment. Please try again.');
    } else {
      setShowLoanPaymentModal(false);
      setSelectedLoan(null);
      setLoanPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0] });
      loadData();
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

  if (selectedPerson) {
    const personStats = getPersonStats(selectedPerson);
    const personTxs = transactions
      .filter(t => t.borrower_name === selectedPerson)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8 transition-colors duration-200">
        <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-8 duration-300 pb-20">
          <div className="flex items-center space-x-4 mb-6">
            <button 
              onClick={() => setSelectedPerson(null)}
              className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-lg flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
                {selectedPerson.substring(0, 2).toUpperCase()}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">{selectedPerson}</h1>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <Landmark className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Total Loans</h3>
              </div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{formatCurrency(personStats.totalLoanAmount)}</p>
            </div>
            
            <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                  <List className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Transactions</h3>
              </div>
              <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{personStats.txCount}</p>
            </div>
          </div>

          {/* Transactions List */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-6 md:p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest">Transaction History</h2>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {personTxs.length > 0 ? personTxs.map(tx => {
                const isMoneyOut = tx.amount > 0;
                let TxIcon = isMoneyOut ? ArrowUpFromLine : ArrowDownToLine;
                if (tx.transaction_type === 'transfer') TxIcon = ArrowLeftRight;
                if (tx.transaction_type === 'loan') TxIcon = Landmark;

                let remainingBalance = 0;
                let totalPaid = 0;
                if (tx.transaction_type === 'loan') {
                  totalPaid = transactions
                    .filter(t => t.related_transaction_id === tx.id && t.transaction_type === 'loan_payment')
                    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
                  remainingBalance = Math.abs(tx.amount) - totalPaid;
                }

                return (
                  <div key={tx.id} className="p-5 md:p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-2xl ${isMoneyOut ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
                        <TxIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{tx.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div>
                        <p className={`text-sm font-black ${isMoneyOut ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {formatCurrency(Math.abs(tx.amount))}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                          {tx.transaction_type === 'loan' ? 'Loan Given' : tx.transaction_type?.replace('_', ' ') || 'Payment'}
                        </p>
                      </div>
                      {tx.transaction_type === 'loan' && remainingBalance > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLoan({ ...tx, remainingBalance, totalPaid });
                            setShowLoanPaymentModal(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                        >
                          <BanknoteArrowDown className="w-3.5 h-3.5" />
                          Collect
                        </button>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <List className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest mb-1">No transactions</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">This person hasn't been linked to any transactions yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                  
                  <button 
                    onClick={() => setSelectedPerson(person.name)}
                    className="w-full mt-4 bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    View Profile
                  </button>
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
                      onClick={() => setSelectedPerson(person.name)}
                      className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-4 py-2 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-widest"
                    >
                      View
                    </button>
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

      {/* ── Receive Loan Payment Modal ─────────────────────────────────── */}
      {showLoanPaymentModal && selectedLoan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Receive Payment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Record payment for: {selectedLoan.name}</p>
            
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl transition-colors">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Original Loan:</span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(Math.abs(selectedLoan.amount))}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Paid:</span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(selectedLoan.totalPaid || 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Remaining:</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{formatCurrency(selectedLoan.remainingBalance || 0)}</span>
              </div>
            </div>

            <form onSubmit={handleLoanPaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                  <input 
                    autoFocus
                    type="number" 
                    step="0.01" 
                    min="0.01"
                    max={selectedLoan.remainingBalance || undefined}
                    required
                    value={loanPaymentForm.amount}
                    onChange={e => setLoanPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 pl-8 text-xl font-black outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  required
                  value={loanPaymentForm.date}
                  onChange={e => setLoanPaymentForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowLoanPaymentModal(false); setSelectedLoan(null); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || !loanPaymentForm.amount} className="flex-1 bg-purple-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 dark:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}