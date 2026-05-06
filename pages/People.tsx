import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Plus, LayoutGrid, List, MoreVertical, Trash2, ArrowRight, ArrowLeft, X, AlertTriangle, User, Landmark, ArrowUpFromLine, ArrowDownToLine, ArrowLeftRight, BanknoteArrowDown, ChevronDown, ChevronUp, Edit2, Search, UserPlus, CheckSquare, Clock, RefreshCw, Check, MessageCircle } from 'lucide-react';
import { getAllPeople, createPerson, deletePerson } from '../src/services/peopleService';
import { getAllTransactions, createTransaction, deleteTransaction, updateTransaction, getUnsyncedHistoricalTransactionsCount, getUnsyncedHistoricalTransactions, syncSpecificHistoricalTransactions } from '../src/services/transactionsService';
import { getAllAccountsFrontend } from '../src/services/accountsService';
import { Account } from '../types';
import { searchUsers, sendFriendRequest, getFriendships } from '../src/services/friendshipsService';
import type { SupabasePerson, SupabaseTransaction, SupabaseUserProfile, SupabaseFriendship } from '../src/types/supabase';
import { combineDateWithCurrentTime } from '../src/utils/dateUtils';
import { useTheme } from '../src/contexts/ThemeContext';
import { supabase } from '../src/utils/supabaseClient';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(val);

interface PeoplePageProps {
  onStartChat?: (friendId: string) => void;
}

export default function PeoplePage({ onStartChat }: PeoplePageProps) {
  const { getAccentClasses } = useTheme();
  const [people, setPeople] = useState<SupabasePerson[]>([]);
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{show: boolean; id: string; name: string; hasTransactions?: boolean} | null>(null);

  const [showLoanPaymentModal, setShowLoanPaymentModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [loanPaymentForm, setLoanPaymentForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], accountId: '' });
  
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editTxModal, setEditTxModal] = useState<{id: string, name: string, amount: string, date: string} | null>(null);
  const [txConfirmModal, setTxConfirmModal] = useState<{show: boolean; id: string; name: string} | null>(null);
  
  // Budee Social features
  const [activeTab, setActiveTab] = useState<'balances' | 'history'>('balances');
  const [showFindFriendsModal, setShowFindFriendsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SupabaseUserProfile[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  
  const [friendships, setFriendships] = useState<SupabaseFriendship[]>([]);
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);
  const [editPersonForm, setEditPersonForm] = useState({ name: '', handle: '', matchedUserId: '' });
  const [linkState, setLinkState] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [matchedUsers, setMatchedUsers] = useState<SupabaseUserProfile[]>([]);
  const [mainTab, setMainTab] = useState<'profiles' | 'budies'>('profiles');
  const [friendProfiles, setFriendProfiles] = useState<SupabaseUserProfile[]>([]);
  const [linkBudeeModal, setLinkBudeeModal] = useState<SupabaseUserProfile | null>(null);
  const [selectedLocalPersonToLink, setSelectedLocalPersonToLink] = useState('');
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  // Review Sync Modal State
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [unsyncedTxsList, setUnsyncedTxsList] = useState<any[]>([]);
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
  const [isLoadingSyncList, setIsLoadingSyncList] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const myId = user?.id;

    const [peopleRes, txRes, friendRes, accountsRes] = await Promise.all([
      getAllPeople(),
      getAllTransactions(),
      getFriendships(),
      getAllAccountsFrontend()
    ]);
    
    let currentPeople = peopleRes.data || [];
    let currentTxs = txRes.data || [];
    const currentFriendships = friendRes.data || [];
    if (accountsRes.data) setAccounts(accountsRes.data);

    if (myId) {
      // 1. Force sync names for ALL existing linked profiles (updates legacy names to strict format)
      const linkedPeople = currentPeople.filter(p => p.friend_user_id);
      if (linkedPeople.length > 0) {
        const { data: linkedProfiles } = await supabase.from('user_profiles').select('*').in('user_id', linkedPeople.map(p => p.friend_user_id));
        if (linkedProfiles) {
          let needsUpdate = false;
          const updatedPeople = currentPeople.map(p => {
            if (p.friend_user_id) {
              const prof = linkedProfiles.find(lp => lp.user_id === p.friend_user_id);
              if (prof) {
                const correctName = `${prof.first_name} ${prof.last_name}${prof.username ? ` (@${prof.username})` : ''}`;
                if (p.name !== correctName) {
                  needsUpdate = true;
                  const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
                  const peopleTable = isTestMode ? 'people_test' : 'people';
                  supabase.from(peopleTable).update({ name: correctName }).eq('id', p.id).then();
                  
                  const txsToUpdate = currentTxs.filter(t => t.person_name === p.name || t.borrower_name === p.name);
                  txsToUpdate.forEach(tx => {
                    const updates: any = {};
                    if (tx.person_name === p.name) updates.person_name = correctName;
                    if (tx.borrower_name === p.name) updates.borrower_name = correctName;
                    updateTransaction(tx.id, updates).then();
                  });
                  return { ...p, name: correctName };
                }
              }
            }
            return p;
          });
          if (needsUpdate) {
            currentPeople = updatedPeople;
            getAllTransactions().then(res => { if (res.data) setTransactions(res.data); });
          }
        }
      }

      const validFriendships = currentFriendships.filter(f => f.status === 'accepted' || f.status === 'pending');
      const friendshipIds = validFriendships.map(f => f.user_id === myId ? f.friend_id : f.user_id);
      const linkedFriendIds = currentPeople.filter(p => p.friend_user_id).map(p => p.friend_user_id);
      
      const allProfileIdsToFetch = Array.from(new Set([...friendshipIds, ...linkedFriendIds]));
      
      if (allProfileIdsToFetch.length > 0) {
        const { data: fProfiles } = await supabase.from('user_profiles').select('*').in('user_id', allProfileIdsToFetch);
        if (fProfiles) setFriendProfiles(fProfiles);
      } else {
        setFriendProfiles([]);
      }
      
      const unsyncedRes = await getUnsyncedHistoricalTransactionsCount();
      setUnsyncedCount(unsyncedRes.count || 0);
    }

    setPeople(currentPeople);
    setTransactions(currentTxs);
    setFriendships(currentFriendships);
    setIsLoading(false);
  }, []);

  const handleCreateProfileForBudee = async (prof: SupabaseUserProfile) => {
    setIsSubmitting(true);
    try {
      const newName = `${prof.first_name} ${prof.last_name}${prof.username ? ` (@${prof.username})` : ''}`;
      const { data: newPerson, error: createErr } = await createPerson({ name: newName } as any);
      
      if (createErr) {
        console.error("Create failed:", createErr);
        alert("Failed to create profile.");
        return;
      }

      if (newPerson) {
        const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
        const peopleTable = isTestMode ? 'people_test' : 'people';
        let { error: updateErr } = await supabase.from(peopleTable).update({ friend_user_id: prof.user_id }).eq('id', newPerson.id);
        if (updateErr && updateErr.code === '42P01') {
          updateErr = (await supabase.from('people').update({ friend_user_id: prof.user_id }).eq('id', newPerson.id)).error;
        }

        if (updateErr) {
          console.error("Linking failed:", updateErr);
          alert(`Profile created, but failed to link Budee: ${updateErr.message}\n\nPlease check if 'friend_user_id' exists in the database.`);
          setPeople(prev => [...prev, { ...newPerson, name: newName }]); // Add to UI anyway
        } else {
          setPeople(prev => [...prev, { ...newPerson, friend_user_id: prof.user_id, name: newName }]);
        }
      }
      
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to create profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLinkBudeeToProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkBudeeModal || !selectedLocalPersonToLink) return;
    setIsSubmitting(true);
    try {
      const personRecord = people.find(p => p.id === selectedLocalPersonToLink);
      if (!personRecord) return;
      const newName = `${linkBudeeModal.first_name} ${linkBudeeModal.last_name}${linkBudeeModal.username ? ` (@${linkBudeeModal.username})` : ''}`;
      const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
      const peopleTable = isTestMode ? 'people_test' : 'people';
      
      let { error: updateErr } = await supabase.from(peopleTable).update({ friend_user_id: linkBudeeModal.user_id, name: newName }).eq('id', personRecord.id);
      if (updateErr && updateErr.code === '42P01') {
        updateErr = (await supabase.from('people').update({ friend_user_id: linkBudeeModal.user_id, name: newName }).eq('id', personRecord.id)).error;
      }

      if (updateErr) {
        console.error("Linking failed at database level:", updateErr);
        alert(`Failed to link profile: ${updateErr.message}\n\nPlease ensure 'friend_user_id' is added to the database.`);
        return;
      }

      setPeople(prev => prev.map(p => p.id === personRecord.id ? { ...p, friend_user_id: linkBudeeModal.user_id, name: newName } : p));
      
      const txsToUpdate = transactions.filter(t => (t as any).person_name === personRecord.name || t.borrower_name === personRecord.name);
      for (const tx of txsToUpdate) {
        const updates: any = {};
        if ((tx as any).person_name === personRecord.name) updates.person_name = newName;
        if (tx.borrower_name === personRecord.name) updates.borrower_name = newName;
        if (Object.keys(updates).length > 0) {
          await updateTransaction(tx.id, updates);
        }
      }
      setLinkBudeeModal(null);
      setSelectedLocalPersonToLink('');
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to link profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Instantly sync data if a notification payment is accepted globally
  useEffect(() => {
    const handleUpdate = () => loadData();
    window.addEventListener('transactions_updated', handleUpdate);
    return () => window.removeEventListener('transactions_updated', handleUpdate);
  }, [loadData]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await searchUsers(searchQuery.trim());
      setSearchResults(data || []);
      setIsSearching(false);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const handleDeleteTrigger = (id: string, name: string) => {
    const hasTransactions = transactions.some(t => 
      t.person_name === name || t.borrower_name === name || 
      (t.transaction_type === 'loan_payment' && t.related_transaction_id && 
       transactions.some(l => l.id === t.related_transaction_id && (l.person_name === name || l.borrower_name === name)))
    );
    setConfirmModal({ show: true, id, name, hasTransactions });
  };

  const handleDelete = async () => {
    if (!confirmModal) return;
    
    setIsSubmitting(true);
    try {
      if (confirmModal.hasTransactions) {
        const personTxs = transactions.filter(t => t.person_name === confirmModal.name || t.borrower_name === confirmModal.name);
        for (const tx of personTxs) {
          await updateTransaction(tx.id, { borrower_name: null, person_name: null });
        }
      }
      
      const { error } = await deletePerson(confirmModal.id);
      if (error) {
        alert('Failed to delete person.');
      } else {
        setPeople(prev => prev.filter(p => p.id !== confirmModal.id));
        setConfirmModal(null);
        loadData(); // Unconditionally sync connections state back to the UI
      }
    } catch (e) {
      console.error('Error deleting person:', e);
      alert('Failed to delete person.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !loanPaymentForm.accountId) return;
    
    setIsSubmitting(true);
    const isBorrowed = selectedLoan.isBorrowed;
    const { error } = await createTransaction({
      name: isBorrowed ? `Paid back ${selectedPerson}` : `Payment from ${selectedPerson}`,
      date: combineDateWithCurrentTime(loanPaymentForm.date),
      amount: isBorrowed ? Math.abs(parseFloat(loanPaymentForm.amount)) : -Math.abs(parseFloat(loanPaymentForm.amount)),
      payment_method_id: loanPaymentForm.accountId,
      transaction_type: 'loan_payment',
      notes: `Payment for: ${selectedLoan.name}`,
      payment_schedule_id: null,
      related_transaction_id: selectedLoan.id,
      person_name: selectedPerson,
      borrower_name: selectedPerson,
    });
    setIsSubmitting(false);

    if (error) {
      alert('Failed to record loan payment. Please try again.');
    } else {
      setShowLoanPaymentModal(false);
      setSelectedLoan(null);
      setLoanPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], accountId: '' });
      loadData();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteTx = async () => {
    if (!txConfirmModal) return;
    setIsSubmitting(true);
    const { error } = await deleteTransaction(txConfirmModal.id);
    setIsSubmitting(false);
    if (error) {
      alert('Failed to delete payment.');
    } else {
      loadData();
    }
    setTxConfirmModal(null);
  };

  const handleEditTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTxModal) return;
    setIsSubmitting(true);
    const { error } = await updateTransaction(editTxModal.id, {
      name: editTxModal.name,
      amount: -Math.abs(parseFloat(editTxModal.amount)), // payments are negative
      date: combineDateWithCurrentTime(editTxModal.date)
    });
    setIsSubmitting(false);
    if (error) {
      alert('Failed to update payment.');
    } else {
      setEditTxModal(null);
      loadData();
    }
  };

  const getFriendshipStatus = (fid?: string | null) => {
    if (!fid) return null;
    const f = friendships.find(f => f.user_id === fid || f.friend_id === fid);
    return f ? f.status : null;
  };

  const handleAddFriend = async (friendId: string, userProfile?: SupabaseUserProfile) => {
    setSentRequests(prev => new Set(prev).add(friendId));
    const { error } = await sendFriendRequest(friendId);
    if (error) {
      alert('Failed to send friend request. You may have already sent one or they are already connected.');
      setSentRequests(prev => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    } else {
      alert('Friend request sent successfully!');
    }
  };

  // Get aggregate stats from transactions
  const getPersonStats = (personName: string) => {
    const personTxs = transactions.filter(t => 
      t.person_name === personName || t.borrower_name === personName || 
      (t.transaction_type === 'loan_payment' && t.related_transaction_id && 
       transactions.some(l => l.id === t.related_transaction_id && (l.person_name === personName || l.borrower_name === personName)))
    );
    const activeLoans = personTxs.filter(t => t.transaction_type === 'loan');
    
    const loansGiven = activeLoans.filter(t => Number(t.amount || 0) > 0);
    const totalLoanGiven = loansGiven.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    
    const loansReceived = activeLoans.filter(t => Number(t.amount || 0) < 0);
    const totalLoanReceived = loansReceived.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    
    const loanPayments = personTxs.filter(t => t.transaction_type === 'loan_payment');
    
    const paymentsReceived = loanPayments.filter(t => Number(t.amount || 0) < 0);
    const totalPaidToYou = paymentsReceived.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    
    const paymentsMade = loanPayments.filter(t => Number(t.amount || 0) > 0);
    const totalPaidByYou = paymentsMade.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    
    return {
      txCount: personTxs.length,
      loanCount: activeLoans.length,
      totalLoanAmount: Math.max(0, totalLoanGiven - totalPaidToYou),
      totalOwedAmount: Math.max(0, totalLoanReceived - totalPaidByYou)
    };
  };

  if (selectedPerson) {
    const personStats = getPersonStats(selectedPerson);
    const personTxs = transactions
      .filter(t => 
        t.person_name === selectedPerson || t.borrower_name === selectedPerson || 
        (t.transaction_type === 'loan_payment' && t.related_transaction_id && 
         transactions.some(l => l.id === t.related_transaction_id && (l.person_name === selectedPerson || l.borrower_name === selectedPerson)))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return (
      <div className="w-full transition-colors duration-200">
        <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-8 duration-300 pb-20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
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
            
            <div className="flex items-center gap-2">
              {people.find(p => p.name === selectedPerson)?.friend_user_id && onStartChat && (
                <button
                  onClick={() => onStartChat(people.find(p => p.name === selectedPerson)!.friend_user_id!)}
                  className="p-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-sm"
                  title="Message"
                >
                  <MessageCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </button>
              )}
              <button 
                onClick={() => {
                  setEditPersonForm({ name: selectedPerson, handle: '', matchedUserId: '' });
                  setMatchedUsers([]);
                  setLinkState('idle');
                  setShowEditPersonModal(true);
                }}
                className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
              >
                <Edit2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Lent</h3>
                </div>
                {personStats.totalOwedAmount > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">You Owe</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(personStats.totalOwedAmount)}</p>
                  </div>
                )}
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

          {/* Tabs */}
          <div className="flex gap-6 border-b border-gray-200 dark:border-gray-800 mb-6 px-2 mt-8">
            <button
              onClick={() => setActiveTab('balances')}
              className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors relative ${activeTab === 'balances' ? getAccentClasses('text') : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            >
              Active Balances
              {activeTab === 'balances' && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-t-full ${getAccentClasses('indicator')}`}></span>}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors relative ${activeTab === 'history' ? getAccentClasses('text') : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            >
              Transaction History
              {activeTab === 'history' && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-t-full ${getAccentClasses('indicator')}`}></span>}
            </button>
          </div>

          {/* Transactions List */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] shadow-sm">
            <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {(() => {
                const mainTxs = personTxs.filter(t => t.transaction_type !== 'loan_payment' || !t.related_transaction_id);
                
                let displayTxs = mainTxs;
                if (activeTab === 'balances') {
                  displayTxs = mainTxs.filter(tx => {
                    if (tx.transaction_type !== 'loan') return false;
                    const payments = personTxs.filter(t => t.related_transaction_id === tx.id && t.transaction_type === 'loan_payment');
                    const totalPaid = payments.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    return (Math.abs(tx.amount) - totalPaid) > 0;
                  });
                }

                return displayTxs.length > 0 ? displayTxs.map((tx, index) => {
                  const isMoneyOut = tx.amount > 0;
                  let TxIcon = isMoneyOut ? ArrowUpFromLine : ArrowDownToLine;
                  if (tx.transaction_type === 'transfer') TxIcon = ArrowLeftRight;
                  if (tx.transaction_type === 'loan') TxIcon = Landmark;

                  const payments = tx.transaction_type === 'loan' 
                    ? personTxs.filter(t => t.related_transaction_id === tx.id && t.transaction_type === 'loan_payment')
                    : [];
                  const isExpanded = expandedTxIds.has(tx.id);

                  let remainingBalance = 0;
                  let totalPaid = 0;
                  const isBorrowed = tx.transaction_type === 'loan' && tx.amount < 0;
                  if (tx.transaction_type === 'loan') {
                    totalPaid = payments.reduce((sum, t) => sum + (isBorrowed ? (Number(t.amount) > 0 ? Number(t.amount) : 0) : (Number(t.amount) < 0 ? Math.abs(Number(t.amount)) : 0)), 0);
                    remainingBalance = Math.abs(tx.amount) - totalPaid;
                  }

                  let amountColorClass = isMoneyOut ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
                  let statusBadge = null;

                  if (tx.transaction_type === 'loan') {
                    if (remainingBalance <= 0) {
                      amountColorClass = 'text-green-500 dark:text-green-400 line-through decoration-2 opacity-60';
                      statusBadge = <span className="text-[9px] font-black uppercase tracking-widest text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded">Fully Paid</span>;
                    } else if (totalPaid > 0) {
                      amountColorClass = 'text-red-600 dark:text-red-400';
                      statusBadge = <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">Partial</span>;
                    } else {
                      amountColorClass = 'text-red-600 dark:text-red-400';
                      statusBadge = <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded">Unpaid</span>;
                    }
                  } else {
                    const typeLabel = tx.transaction_type?.replace('_', ' ') || 'Payment';
                    statusBadge = <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{typeLabel}</span>;
                  }

                  return (
                    <div key={tx.id} className={`flex flex-col hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${payments.length > 0 ? 'cursor-pointer' : ''} ${index === displayTxs.length - 1 ? 'rounded-b-[2.5rem]' : ''}`} onClick={() => payments.length > 0 && toggleExpand(tx.id)}>
                      <div className="p-4 md:p-5 flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`p-2.5 rounded-xl flex-shrink-0 ${isMoneyOut ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
                            <TxIcon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-base font-black text-gray-900 dark:text-gray-100 truncate">{tx.name}</p>
                              {statusBadge}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                {new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                              </p>
                              {payments.length > 0 && (
                                <>
                                  <span className="text-gray-300 dark:text-gray-600">•</span>
                                  <div className="flex items-center text-[10px] text-indigo-500 font-bold">
                                    {isExpanded ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
                                    {payments.length} payment(s)
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1.5 flex-shrink-0">
                          <div className="flex flex-col items-end">
                            <p className={`text-base font-black ${amountColorClass}`}>
                              {formatCurrency(Math.abs(tx.amount))}
                            </p>
                            {tx.transaction_type === 'loan' && totalPaid > 0 && remainingBalance > 0 && (
                              <p className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">
                                Collected: {formatCurrency(totalPaid)}
                              </p>
                            )}
                          </div>
                          {tx.transaction_type === 'loan' && remainingBalance > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLoan({ ...tx, remainingBalance, totalPaid, isBorrowed });
                                const defaultAcc = accounts.find(a => a.type === 'Debit')?.id || '';
                                setLoanPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], accountId: defaultAcc });
                                setShowLoanPaymentModal(true);
                              }}
                              className={`flex items-center gap-1 px-3 py-1.5 ${isBorrowed ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50'} rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors`}
                            >
                              {isBorrowed ? <ArrowUpFromLine className="w-3 h-3" /> : <BanknoteArrowDown className="w-3 h-3" />}
                              {isBorrowed ? 'Pay Back' : 'Collect'}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {isExpanded && payments.length > 0 && (
                        <div className={`px-4 md:px-5 pb-5 pt-1 bg-gray-50/50 dark:bg-gray-800/20 ${index === displayTxs.length - 1 ? 'rounded-b-[2.5rem]' : ''}`} onClick={e => e.stopPropagation()}>
                          <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 space-y-3">
                            {payments.map(payment => (
                              <div key={payment.id} className="flex justify-between items-center group relative">
                                <div>
                                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{payment.name}</p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{new Date(payment.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {new Date(payment.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-black text-green-600 dark:text-green-400">+{formatCurrency(Math.abs(payment.amount))}</span>
                                  <div className="relative">
                                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === payment.id ? null : payment.id); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all">
                                      <MoreVertical className="w-4 h-4"/>
                                    </button>
                                    {openMenuId === payment.id && (
                                      <>
                                        <div className="fixed inset-0 z-[10]" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}></div>
                                        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 py-1 z-[20]" onClick={e => e.stopPropagation()}>
                                      <button onClick={() => { setEditTxModal({id: payment.id, name: payment.name, amount: Math.abs(payment.amount).toFixed(2), date: payment.date.split('T')[0]}); setOpenMenuId(null); }} className="w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Edit2 className="w-3.5 h-3.5"/> Edit</button>
                                          <button onClick={() => { setTxConfirmModal({show: true, id: payment.id, name: payment.name}); setOpenMenuId(null); }} className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5"/> Delete</button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                      {activeTab === 'balances' ? <CheckSquare className="w-8 h-8 text-green-500" /> : <List className="w-8 h-8" />}
                    </div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest mb-1">
                      {activeTab === 'balances' ? 'All Settled Up' : 'No transactions'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      {activeTab === 'balances' ? "There are no active loans or balances here." : "This person hasn't been linked to any transactions yet."}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* ── Receive Loan Payment Modal ─────────────────────────────────── */}
        {showLoanPaymentModal && selectedLoan && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
              <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">{selectedLoan.isBorrowed ? 'Pay Back Loan' : 'Receive Payment'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">{selectedLoan.isBorrowed ? 'Record a payment to' : 'Record a payment from'} {selectedPerson}</p>
              
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
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{selectedLoan.isBorrowed ? 'Amount to Pay' : 'Amount Received'}</label>
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
                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{selectedLoan.isBorrowed ? 'Pay From' : 'Deposit To'}</label>
                    <select
                      required
                      value={loanPaymentForm.accountId}
                      onChange={e => setLoanPaymentForm(f => ({ ...f, accountId: e.target.value }))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all appearance-none"
                    >
                      <option value="" disabled>Select Account</option>
                      {accounts.filter(a => a.type === 'Debit').map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.bank}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setShowLoanPaymentModal(false); setSelectedLoan(null); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting || !loanPaymentForm.amount || !loanPaymentForm.accountId} className={`flex-1 ${selectedLoan.isBorrowed ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'} text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg dark:shadow-none disabled:opacity-50`}>
                    {isSubmitting ? 'Processing...' : (selectedLoan.isBorrowed ? 'Send Payment' : 'Record Payment')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Edit Transaction Modal ─────────────────────────────────────── */}
        {editTxModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
              <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Edit Payment</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Update the payment details below.</p>
              <form onSubmit={handleEditTxSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Name</label>
                  <input 
                    type="text" required value={editTxModal.name}
                    onChange={e => setEditTxModal(f => f ? ({ ...f, name: e.target.value }) : null)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 dark:text-gray-500">₱</span>
                    <input 
                      type="number" step="0.01" min="0.01" required value={editTxModal.amount}
                      onChange={e => setEditTxModal(f => f ? ({ ...f, amount: e.target.value }) : null)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 pl-8 text-xl font-black outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date</label>
                  <input 
                    type="date" required value={editTxModal.date}
                    onChange={e => setEditTxModal(f => f ? ({ ...f, date: e.target.value }) : null)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditTxModal(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting || !editTxModal.amount} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Delete Transaction Modal ─────────────────────────────────────── */}
        {txConfirmModal && txConfirmModal.show && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6 transition-colors">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">Delete Payment</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">Are you sure you want to delete payment "{txConfirmModal.name}"? This action cannot be undone.</p>
              <div className="flex flex-col w-full space-y-3">
                <button onClick={handleDeleteTx} disabled={isSubmitting} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50">
                  {isSubmitting ? 'Deleting...' : 'Proceed'}
                </button>
                <button onClick={() => setTxConfirmModal(null)} disabled={isSubmitting} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Profile Modal ─────────────────────────────────────────── */}
        {showEditPersonModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
              <button onClick={() => setShowEditPersonModal(false)} className="absolute right-6 top-6 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Edit Profile</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Update local alias.</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Local Alias</label>
                  <input
                    type="text"
                    value={editPersonForm.name}
                    onChange={e => setEditPersonForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">This display name is only visible to you.</p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowEditPersonModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
                    Cancel
                  </button>
                  <button type="button" disabled={isSubmitting} onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        const personRecord = people.find(p => p.name === selectedPerson);
                        
                        // Update the local people table with name and the permanent linked ID
                        const profileUpdates: any = {};
                        if (editPersonForm.name !== selectedPerson) profileUpdates.name = editPersonForm.name;
                        
                        if (Object.keys(profileUpdates).length > 0 && personRecord) {
                          const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
                          const peopleTable = isTestMode ? 'people_test' : 'people';
                          let { error: updateErr } = await supabase.from(peopleTable).update(profileUpdates).eq('id', personRecord.id);
                          if (updateErr && updateErr.code === '42P01') {
                            await supabase.from('people').update(profileUpdates).eq('id', personRecord.id);
                          }
                        }

                        const txsToUpdate = transactions.filter(t => (t as any).person_name === selectedPerson || t.borrower_name === selectedPerson);
                        
                        for (const tx of txsToUpdate) {
                          const updates: any = {};
                          if ((tx as any).person_name === selectedPerson) updates.person_name = editPersonForm.name;
                          if (tx.borrower_name === selectedPerson) updates.borrower_name = editPersonForm.name;
                          
                          if (Object.keys(updates).length > 0) {
                            await updateTransaction(tx.id, updates);
                          }
                        }

                        setShowEditPersonModal(false);
                        if (editPersonForm.name !== selectedPerson) {
                          setSelectedPerson(editPersonForm.name);
                        }
                        loadData();
                      } catch (e) {
                        console.error(e);
                        alert('Failed to update profile');
                      } finally {
                        setIsSubmitting(false);
                      }
                  }} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
        
        {unsyncedCount > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-[2.5rem] p-6 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl text-indigo-600 dark:text-indigo-400">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-widest">Sync Past Transactions</h4>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium mt-0.5">You have {unsyncedCount} existing transactions that haven't been shared with your linked Budies.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                setSyncModalOpen(true);
                setIsLoadingSyncList(true);
                const { data } = await getUnsyncedHistoricalTransactions();
                setUnsyncedTxsList(data || []);
                setSelectedSyncIds(new Set((data || []).map(t => t.id)));
                setIsLoadingSyncList(false);
              }}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shrink-0 disabled:opacity-50 shadow-md shadow-indigo-200 dark:shadow-none"
            >
              {isSubmitting ? 'Loading...' : 'Review & Sync'}
            </button>
          </div>
        )}

        {/* ── Header & Controllers ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 md:p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-colors ${getAccentClasses('bg')} ${getAccentClasses('shadow')}`}>
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight transition-colors">People</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium transition-colors">Manage shared tracking and active loans</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end sm:self-auto">
            {mainTab === 'profiles' && (
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
            )}
            <button
              onClick={() => setShowFindFriendsModal(true)}
              className={`flex items-center gap-2 bg-white dark:bg-gray-800 border px-5 py-3 rounded-xl font-bold transition-all shadow-sm ${getAccentClasses('text')} ${getAccentClasses('borderLight')} ${getAccentClasses('hoverLight')}`}
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Find Friends</span>
            </button>
            <button 
              onClick={() => setShowAddModal(true)} 
              className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-md dark:shadow-none ${getAccentClasses('bg')} ${getAccentClasses('shadow')}`}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Person</span>
            </button>
          </div>
        </div>

        <div className="flex gap-6 border-b border-gray-200 dark:border-gray-800 mb-6 px-2">
          <button
            onClick={() => setMainTab('profiles')}
            className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors relative ${mainTab === 'profiles' ? getAccentClasses('text') : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Local Profiles
            {mainTab === 'profiles' && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-t-full ${getAccentClasses('indicator')}`}></span>}
          </button>
          <button
            onClick={() => setMainTab('budies')}
            className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors relative ${mainTab === 'budies' ? getAccentClasses('text') : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            My Budies
            {mainTab === 'budies' && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-t-full ${getAccentClasses('indicator')}`}></span>}
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 font-medium">Loading people...</div>
        ) : mainTab === 'profiles' ? (
          people.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] transition-colors">
            <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest mb-1">No people found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Add someone to start tracking shared expenses and loans.</p>
            <button onClick={() => setShowAddModal(true)} className={`px-6 py-3 rounded-xl font-bold transition-colors ${getAccentClasses('lightBg')}`}>
              Add your first person
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map(person => {
              const stats = getPersonStats(person.name);
              const fStatus = getFriendshipStatus(person.friend_user_id);
              const budeeProf = friendProfiles.find(fp => fp.user_id === person.friend_user_id);
              return (
                <div key={person.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] p-6 hover:shadow-lg transition-all group relative overflow-hidden">
                  <button 
                    onClick={() => handleDeleteTrigger(person.id, person.name)}
                    className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-xl flex items-center justify-center border border-indigo-100 dark:border-indigo-800 transition-colors">
                      {person.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 pr-8">
                      <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 truncate">{person.name}</h3>
                      {budeeProf && (
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                          {budeeProf.username ? `@${budeeProf.username}` : budeeProf.email}
                        </p>
                      )}
                      {person.friend_user_id && fStatus === 'accepted' && (
                        <span className="inline-flex items-center gap-1 w-fit mt-0.5 text-[9px] font-bold px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded uppercase tracking-widest transition-colors">
                          <CheckSquare className="w-3 h-3" /> Linked
                        </span>
                      )}
                      {person.friend_user_id && fStatus === 'pending' && (
                        <span className="inline-flex items-center gap-1 w-fit mt-0.5 text-[9px] font-bold px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase tracking-widest transition-colors" title="Waiting confirmation">
                          <Clock className="w-3 h-3" /> Waiting confirmation from {person.name}
                        </span>
                      )}
                    </div>
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
              const fStatus = getFriendshipStatus(person.friend_user_id);
              const budeeProf = friendProfiles.find(fp => fp.user_id === person.friend_user_id);
              return (
                <div key={person.id} className={`flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i !== people.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-sm flex items-center justify-center border border-indigo-100 dark:border-indigo-800 transition-colors">
                      {person.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-gray-900 dark:text-gray-100 truncate">{person.name}</h3>
                        {person.friend_user_id && fStatus === 'accepted' && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded uppercase tracking-widest transition-colors" title="Linked">
                            <CheckSquare className="w-3 h-3" />
                          </span>
                        )}
                        {person.friend_user_id && fStatus === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase tracking-widest transition-colors" title="Waiting confirmation">
                            <Clock className="w-3 h-3" /> Waiting confirmation
                          </span>
                        )}
                      </div>
                      {budeeProf ? (
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{budeeProf.username ? `@${budeeProf.username}` : budeeProf.email}</p>
                      ) : (
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stats.txCount} transactions</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Loans</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(stats.totalLoanAmount)}</p>
                    </div>
                    {person.friend_user_id && fStatus === 'accepted' && onStartChat && (
                      <button 
                        onClick={() => onStartChat(person.friend_user_id!)}
                        className="p-2 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Message"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setSelectedPerson(person.name)}
                      className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-4 py-2 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-widest"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => handleDeleteTrigger(person.id, person.name)}
                      className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] overflow-hidden transition-colors">
          {friendProfiles.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest mb-1">No Budies Yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Search and connect with friends to see them here.</p>
              <button onClick={() => setShowFindFriendsModal(true)} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                Find Friends
              </button>
            </div>
          ) : (
            friendProfiles.map((prof, i) => {
              const fStatus = getFriendshipStatus(prof.user_id);
              const linkedPerson = people.find(p => p.friend_user_id === prof.user_id);
              const displayName = `${prof.first_name} ${prof.last_name}`;
              
              return (
                <div key={prof.user_id} className={`flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i !== friendProfiles.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-sm flex items-center justify-center border border-indigo-100 dark:border-indigo-800 uppercase">
                      {(prof.first_name?.charAt(0) || '')}{(prof.last_name?.charAt(0) || '')}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-gray-900 dark:text-gray-100 truncate">{displayName}</h3>
                        {fStatus === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase tracking-widest" title="Waiting confirmation">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{prof.username ? `@${prof.username}` : prof.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {linkedPerson ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl uppercase tracking-widest">
                        <CheckSquare className="w-3 h-3" /> Linked to {linkedPerson.name}
                      </span>
                    ) : fStatus === 'accepted' ? (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleCreateProfileForBudee(prof)}
                          disabled={isSubmitting}
                          className="text-xs font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors uppercase tracking-widest disabled:opacity-50"
                        >
                          Create Profile
                        </button>
                        <button 
                          onClick={() => { setLinkBudeeModal(prof); setSelectedLocalPersonToLink(''); }}
                          className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 px-4 py-2 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-widest"
                        >
                          Link Existing
                        </button>
                      </div>
                    ) : null}
                    {fStatus === 'accepted' && onStartChat && (
                      <button 
                        onClick={() => onStartChat(prof.user_id)}
                        className="p-2 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Message"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
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

      {/* ── Find Friends Modal (Social Sneak Peek) ─────────────────────── */}
      {showFindFriendsModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative transition-colors animate-in slide-in-from-top-10">
            <button onClick={() => { setShowFindFriendsModal(false); setSearchQuery(''); }} className="absolute right-6 top-6 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Find Friends</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Search by email or @handle to connect.</p>

            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="e.g. hello@budee.app"
                className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 pl-12 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="min-h-[150px]">
              {!searchQuery ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400 dark:text-gray-500">
                  <Users className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">Search for your friends to start tracking shared expenses automatically.</p>
                </div>
              ) : isSearching ? (
                <div className="space-y-4">
                  {[1, 2].map(i => (
                    <div key={i} className="flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                  {searchResults.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center uppercase">
                          {(user.first_name?.charAt(0) || '') + (user.last_name?.charAt(0) || '') || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{user.first_name} {user.last_name}</p>
                          <p className="text-[10px] text-gray-500 font-medium">Budee User</p>
                        </div>
                      </div>
                      {sentRequests.has(user.user_id) ? (
                        <p className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest text-right">
                          Waiting confirmation from<br />{user.first_name} {user.last_name}{user.username ? ` (@${user.username})` : ''}
                        </p>
                      ) : (
                        <button 
                          onClick={() => handleAddFriend(user.user_id, user)}
                          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400 rounded-full flex items-center justify-center mb-3">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">No registered users found</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">"{searchQuery}" isn't on Budee yet.</p>
                  <button className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors">
                    Invite to Budee
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Person Modal ─────────────────────────────────────── */}
      {confirmModal && confirmModal.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6 transition-colors">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight transition-colors">Delete Person</h3>
            
            {confirmModal.hasTransactions ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">
                "{confirmModal.name}" has associated loan transactions. Deleting them will unassign them from these transactions. Do you wish to proceed?
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed transition-colors">
                Are you sure you want to delete "{confirmModal.name}"? This action cannot be undone.
              </p>
            )}
            
            <div className="flex flex-col w-full space-y-3">
              <button onClick={handleDelete} disabled={isSubmitting} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none disabled:opacity-50">
                {isSubmitting ? 'Deleting...' : (confirmModal.hasTransactions ? 'Unassign & Delete' : 'Proceed')}
              </button>
              <button onClick={() => setConfirmModal(null)} disabled={isSubmitting} className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                Keep Person
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Budee Modal ─────────────────────────────────────────── */}
      {linkBudeeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative transition-colors animate-in zoom-in-95">
            <button onClick={() => { setLinkBudeeModal(null); setSelectedLocalPersonToLink(''); }} className="absolute right-6 top-6 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Link Budee</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Select a local profile to link with {linkBudeeModal.first_name}.</p>
            
            <form onSubmit={handleLinkBudeeToProfile} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Local Profile</label>
                <select
                  required
                  value={selectedLocalPersonToLink}
                  onChange={e => setSelectedLocalPersonToLink(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-transparent text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">Select a profile...</option>
                  {people.filter(p => !p.friend_user_id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setLinkBudeeModal(null); setSelectedLocalPersonToLink(''); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || !selectedLocalPersonToLink} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50">
                  {isSubmitting ? 'Linking...' : 'Link Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Review Sync Transactions Modal ─────────────────────────────── */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl relative transition-colors animate-in zoom-in-95 max-h-[90vh] flex flex-col">
            <button onClick={() => setSyncModalOpen(false)} className="absolute right-6 top-6 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1 uppercase tracking-tight">Review Past Transactions</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Select the transactions you want to share with your linked Budies.</p>
            
            <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-3">
              {isLoadingSyncList ? (
                <p className="text-center py-8 text-gray-500">Loading transactions...</p>
              ) : unsyncedTxsList.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No transactions found.</p>
              ) : (
                unsyncedTxsList.map(tx => (
                  <div key={tx.id} className={`p-4 rounded-2xl border transition-colors flex items-center gap-4 cursor-pointer ${selectedSyncIds.has(tx.id) ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700'}`} onClick={() => {
                    const newSet = new Set(selectedSyncIds);
                    if (newSet.has(tx.id)) newSet.delete(tx.id);
                    else newSet.add(tx.id);
                    setSelectedSyncIds(newSet);
                  }}>
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${selectedSyncIds.has(tx.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'}`}>
                      {selectedSyncIds.has(tx.id) && <Check className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{tx.name}</p>
                        <p className={`text-sm font-black ${tx.amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatCurrency(Math.abs(tx.amount))}</p>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-widest">{new Date(tx.date).toLocaleDateString()} · With: {tx.targetName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setSyncModalOpen(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={isSubmitting || selectedSyncIds.size === 0 || isLoadingSyncList} onClick={async () => {
                setIsSubmitting(true);
                try {
                  const toSync = unsyncedTxsList.filter(t => selectedSyncIds.has(t.id));
                  const { count, error } = await syncSpecificHistoricalTransactions(toSync);
                  if (error) throw error;
                  alert(`Successfully synced ${count} transactions! They will appear in your Budies' inboxes.`);
                  setSyncModalOpen(false);
                  const unsyncedRes = await getUnsyncedHistoricalTransactionsCount();
                  setUnsyncedCount(unsyncedRes.count || 0);
                } catch (e) {
                  alert('Failed to sync. Please try again.');
                } finally {
                  setIsSubmitting(false);
                }
              }} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50">
                {isSubmitting ? 'Syncing...' : `Sync ${selectedSyncIds.size} Transactions`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}