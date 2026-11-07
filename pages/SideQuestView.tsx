import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Plus, Loader2, Target, CheckCircle2, X, Link, Trash2, Circle } from 'lucide-react';
import { useTheme } from '../src/contexts/ThemeContext';
import { getSideQuestById, getSideQuestExpenses, getSideQuestObjectives, createSideQuestObjective, createSideQuestExpense, updateSideQuestExpense, deleteSideQuestExpense, deleteSideQuestObjective } from '../src/services/sideQuestsService';
import type { SideQuest, SideQuestExpense, SideQuestObjective } from '../types';
import { createPortal } from 'react-dom';


export default function SideQuestView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getAccentClasses } = useTheme();

  const [quest, setQuest] = useState<SideQuest | null>(null);
  const [objectives, setObjectives] = useState<SideQuestObjective[]>([]);
  const [expenses, setExpenses] = useState<SideQuestExpense[]>([]);
  const [loading, setLoading] = useState(true);

        // --- ACTIVE OBJECTIVE WORKSPACE ---
        const [activeObjective, setActiveObjective] = useState<SideQuestObjective | null>(null);

        // 🟢 SYNC WORKSPACE STATE WITH GLOBAL NAV
        useEffect(() => {
          // Tell the global App.tsx if the workspace is open or closed
          window.dispatchEvent(new CustomEvent('sidequest_workspace_state', { 
            detail: { isOpen: !!activeObjective } 
          }));
          
          // Cleanup when leaving the page
          return () => {
            window.dispatchEvent(new CustomEvent('sidequest_workspace_state', { 
              detail: { isOpen: false } 
            }));
          };
        }, [activeObjective]);
    
        // 🟢 LISTEN FOR THE GLOBAL FAB CLICK
        useEffect(() => {
          const handleGlobalAdd = () => {
            if (activeObjective) {
              setShowAddExpense(true); // Open Add Item modal
            } else {
              setShowAddObjective(true); // Open Add Objective modal
            }
          };
    
          window.addEventListener('open_sidequest_action', handleGlobalAdd);
          return () => window.removeEventListener('open_sidequest_action', handleGlobalAdd);
        }, [activeObjective]);
    

  // --- YARDSTICK STATE & COLORS ---
  const [hoveredExpenseId, setHoveredExpenseId] = useState<string | null>(null);
  
  // A palette of vibrant Tailwind background colors for the markers
  const EXPENSE_COLORS = [
    'bg-indigo-400', 'bg-rose-400', 'bg-amber-400', 
    'bg-emerald-400', 'bg-sky-400', 'bg-fuchsia-400'
  ];



  // --- MODAL STATE ---
  const [showAddObjective, setShowAddObjective] = useState(false);
  const [objForm, setObjForm] = useState({ name: '', targetAmount: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- SMART SUGGESTIONS ---
  const getSuggestions = () => {
    if (quest?.type === 'Travel') return ['Airfare', 'Accommodation', 'Food', 'Activities', 'Transport'];
    if (quest?.type === 'Renovation') return ['Materials', 'Labor', 'Permits', 'Furnishings', 'Tools'];
    if (quest?.type === 'Event') return ['Venue', 'Catering', 'Decorations', 'Entertainment', 'Attire'];
    return ['Essentials', 'Supplies', 'Miscellaneous'];
  };

       // --- SUBMIT HANDLER WITH GUARDRAIL ---
  const handleAddObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quest || !objForm.name.trim()) return;
    
    const targetVal = parseFloat(objForm.targetAmount) || 0;
    const masterCeiling = quest.targetAmount || 0; // The global quest goal

    // 🛑 THE BUDGET GUARDRAIL
    if (masterCeiling > 0) {
      const currentAllocated = objectives.reduce((sum, o) => sum + (o.targetAmount || 0), 0);
      if (currentAllocated + targetVal > masterCeiling) {
        const proceed = window.confirm(
          `Warning: This objective brings your total allocations to ${formatCurrency(currentAllocated + targetVal)}, which exceeds your master ceiling of ${formatCurrency(masterCeiling)}.\n\nProceed anyway?`
        );
        if (!proceed) return; // Stops the submission if they click Cancel
      }
    }

    setIsSubmitting(true);
    
    try {
      const res = await createSideQuestObjective({
        questId: quest.id,
        name: objForm.name.trim(),
        targetAmount: targetVal
      });
      
      if (res.error) {
        alert(`Failed to create: ${res.error.message || 'Unknown error'}`);
      } else if (res.data) {
        setObjectives(prev => [...prev, res.data!]);
        setShowAddObjective(false);
        setObjForm({ name: '', targetAmount: '' });
      }
    } catch (err: any) {
      alert(`App Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  
      // --- ADD EXPENSE STATE ---
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ 
    name: '', 
    amount: '', 
    benchmarkUrl: '',
    subsetGroup: ''
  });
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

    // --- ADD EXPENSE HANDLER ---
    const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!quest || !activeObjective || !expenseForm.name.trim()) return;
  
      setIsSubmittingExpense(true);
      const res = await createSideQuestExpense({
        questId: quest.id,
        objectiveId: activeObjective.id,
        name: expenseForm.name.trim(),
        amount: parseFloat(expenseForm.amount) || 0,
        benchmarkUrl: expenseForm.benchmarkUrl.trim(),
        subset_group: expenseForm.subsetGroup.trim() || null // 🟢 Added this line!
      });
  
      if (res.data) {
        setExpenses(prev => [...prev, res.data!]);
        setShowAddExpense(false);
        setExpenseForm({ name: '', amount: '', benchmarkUrl: '', subsetGroup: '' }); // 🟢 Reset it here too
      } else {
        alert(`Failed to add expense: ${res.error?.message}`);
      }
      setIsSubmittingExpense(false);
    };
  

    // --- DELETE & TOGGLE ACTIONS ---
  
    const handleToggleExpense = async (expenseId: string, currentStatus: boolean) => {
      // Optimistic UI update for instant feedback
      setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, isCompleted: !currentStatus } : e));
      const res = await updateSideQuestExpense(expenseId, { isCompleted: !currentStatus });
      if (res.error) {
        // Revert if database fails
        setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, isCompleted: currentStatus } : e));
        alert("Failed to update status");
      }
    };
  
    const handleDeleteExpense = async (expenseId: string) => {
      if (!window.confirm("Delete this benchmark?")) return;
      setExpenses(prev => prev.filter(e => e.id !== expenseId));
      await deleteSideQuestExpense(expenseId);
    };
  
    const handleDeleteObjective = async (objectiveId: string) => {
      if (!window.confirm("Delete this objective and all its expenses?")) return;
      setActiveObjective(null); // Close the panel
      setObjectives(prev => prev.filter(o => o.id !== objectiveId));
      await deleteSideQuestObjective(objectiveId);
    };
  


  const formatCurrency = (val: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const getCountdown = (dateStr: string) => {
    const total = Date.parse(dateStr) - Date.parse(new Date().toString());
    if (total <= 0) return "Time's up!";
    
    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    
    if (days === 0) return `${hours} Hours to go!`;
    return `${days} Days, ${hours} Hrs to go!`;
  };


  const getQuestImage = (q: SideQuest) => {
    if (q.coverPhotoUrl) return q.coverPhotoUrl;
    switch (q.type) {
      case 'Travel': return 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=800&auto=format&fit=crop';
      case 'Renovation': return 'https://images.unsplash.com/photo-1581094722064-328d158ce774?q=80&w=800&auto=format&fit=crop';
      case 'Event': return 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=800&auto=format&fit=crop';
      default: return 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=800&auto=format&fit=crop';
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setLoading(true);
      
      const [questRes, objRes, expRes] = await Promise.all([
        getSideQuestById(id),
        getSideQuestObjectives(id),
        getSideQuestExpenses(id)
      ]);
      
      if (questRes.data) setQuest(questRes.data);
      if (objRes.data) setObjectives(objRes.data);
      if (expRes.data) setExpenses(expRes.data);
      
      setLoading(false);
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">Loading Quest...</p>
      </div>
    );
  }

  if (!quest) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-black text-gray-900 uppercase">Quest Not Found</h2>
        <button onClick={() => navigate('/sidequests')} className="mt-4 px-6 py-2 bg-black text-white rounded-xl font-bold">Go Back</button>
      </div>
    );
  }

  // Calculate Progress based on actual checklist items later. For now, mock or use 0.
  const totalFunded = expenses.filter(e => e.isCompleted).reduce((sum, e) => sum + e.amount, 0);
  const progressPercent = quest.targetAmount > 0 ? (totalFunded / quest.targetAmount) * 100 : 0;

  return (
<div className="space-y-6 animate-in slide-in-from-right-4 duration-500 pb-32 lg:pb-10 w-full max-w-7xl mx-auto px-2 md:px-6 lg:px-8 pt-4 lg:pt-8">
      
            {/* HEADER ROW */}
            <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/sidequests')}
            className="hidden md:flex items-center justify-center w-12 h-12 rounded-2xl border-[3px] border-black bg-white dark:bg-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all"
          >
            <ChevronLeft className="w-6 h-6 text-gray-900 dark:text-white" />
          </button>
          <div className="min-w-0 pr-4">
            {/* 🟢 Quest Name is now the Page H1 */}
            <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none truncate">
              {quest.name}
            </h1>
            <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-widest">Quest Progress</p>
          </div>
        </div>
      </div>

               {/* HERO STATUS CARD */}
      {/* Note: overflow-hidden and isolate are crucial here for the blend mode and clipping! */}
      <div className="bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative isolate mt-8 overflow-hidden">
        
        {/* 🟢 REINFORCED FADED INSTAX WATERMARK */}
        <div className="absolute -top-16 -right-12 md:-top-32 md:-right-16 w-56 md:w-96 p-3 pb-12 md:pb-20 bg-[#FCF6E8] border-[3px] border-black transform rotate-12 md:rotate-[15deg] z-0 opacity-25 md:opacity-20 pointer-events-none mix-blend-multiply dark:mix-blend-screen transition-all">
          <div 
            className="w-full aspect-square border-2 border-black bg-gray-200"
            style={{ backgroundImage: `url('${getQuestImage(quest)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        </div>

        {/* CARD CONTENT STACK */}
        <div className="relative z-10 pr-16 md:pr-32">
          <span className={`text-[10px] font-black uppercase tracking-widest text-white px-3 py-1 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] inline-block mb-4 ${getAccentClasses('bg')}`}>
            {quest.type}
          </span>
          
          <p className="text-sm font-bold text-gray-500 flex items-center gap-1.5 mb-1">
            <MapPin className="w-4 h-4 shrink-0" /> {formatDate(quest.targetDate)}
          </p>
          
          <div className="text-3xl md:text-5xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight leading-none mt-2">
            {getCountdown(quest.targetDate)}
          </div>
        </div>

                {/* 🟢 UPGRADED PROGRESS BAR & MASTER MATHS */}
                <div className="relative z-10 mt-10 border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-6">
          {(() => {
            const masterCeiling = quest.targetAmount || 0; // Using the global quest goal!
            const totalAllocatedTargets = objectives.reduce((sum, obj) => sum + (obj.targetAmount || 0), 0);
            const totalLockedSpent = expenses.filter(e => e.isCompleted).reduce((sum, e) => sum + e.amount, 0);
            
            const hasCeiling = masterCeiling > 0;
            
            // Progress basis: Use Master Ceiling. If none, fall back to Allocated Targets. 
            const progressBasis = hasCeiling ? masterCeiling : (totalAllocatedTargets > 0 ? totalAllocatedTargets : 1);
            const progressPercent = (totalLockedSpent / progressBasis) * 100;
            
            return (
              <>
                {/* DYNAMIC METRICS GRID (2 or 3 Columns) */}
                <div className={`grid ${hasCeiling ? 'grid-cols-3' : 'grid-cols-2'} gap-1 sm:gap-2 md:gap-4 items-end mb-4 w-full`}>
                  
                  {/* Master Ceiling (Only renders if > 0) */}
                  {hasCeiling && (
                    <div className="text-left min-w-0">
                      <p className="text-[7px] sm:text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">Master Ceiling</p>
                      <p className="text-sm sm:text-lg md:text-2xl font-black tracking-tighter sm:tracking-tight text-gray-900 dark:text-white leading-none mt-1 truncate">
                        {formatCurrency(masterCeiling)}
                      </p>
                    </div>
                  )}
                  
                  {/* Allocated Column (Adjusts borders/alignment dynamically) */}
                  <div className={`${hasCeiling ? 'text-center border-x-2 border-gray-100 dark:border-gray-800 px-1 sm:px-2 md:px-4' : 'text-left'} min-w-0`}>
                    <p className="text-[7px] sm:text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">Allocated Targets</p>
                    <p className={`text-sm sm:text-lg md:text-2xl font-black tracking-tighter sm:tracking-tight leading-none mt-1 truncate ${hasCeiling && totalAllocatedTargets > masterCeiling ? 'text-red-500' : 'text-indigo-500'}`}>
                      {formatCurrency(totalAllocatedTargets)}
                    </p>
                  </div>
                  
                  {/* Locked-In Column */}
                  <div className="text-right min-w-0">
                    <p className="text-[7px] sm:text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">Locked-In Spent</p>
                    <p className="text-sm sm:text-lg md:text-2xl font-black tracking-tighter sm:tracking-tight text-emerald-500 leading-none mt-1 truncate">
                      {formatCurrency(totalLockedSpent)}
                    </p>
                  </div>

                </div>
                
                <div className="h-6 w-full bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-full overflow-hidden shadow-[inset_1px_1px_0px_0px_rgba(0,0,0,0.1)]">
                  <div 
                    className="h-full border-r-2 border-black bg-emerald-400 transition-all duration-1000" 
                    style={{ width: `${Math.min(100, progressPercent)}%` }} 
                  />
                </div>
              </>
            );
          })()}
        </div>

      </div>




                  {/* 🟢 OBJECTIVES SECTION */}
      <div className="pt-4 relative z-10">
        
        {/* SECTION HEADER & BUTTON */}
        <div className="flex items-center justify-between mb-4 pl-2">
          <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            Objectives
          </h3>
          <button 
            onClick={() => setShowAddObjective(true)}
            className={`flex items-center gap-1 px-4 py-2 text-white rounded-xl font-black text-[10px] uppercase tracking-widest border-[3px] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[1px] active:shadow-none transition-all ${getAccentClasses('bg')}`}
          >
            <Plus className="w-4 h-4" /> Add Objective
          </button>
        </div>

        {objectives.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border-[4px] border-dashed border-gray-300 dark:border-gray-700 rounded-[2rem] p-10 flex flex-col items-center text-center">
            <Target className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-black text-gray-500 uppercase tracking-widest">No Objectives Yet</h3>
            <p className="text-sm font-bold text-gray-400 mt-2">Break this quest down into categories like Airfare, Accommodations, or Materials.</p>
          </div>
                ) : (
                  <div className="space-y-3">
                    {/* SINGLE-LINE OBJECTIVES LIST */}
                    {objectives.map(obj => {
                      // Calculate progress specifically for this objective
                      const objExpenses = expenses.filter(e => e.objectiveId === obj.id);
                      const objTotal = objExpenses.reduce((sum, e) => sum + e.amount, 0);
        
              const objProgress = obj.targetAmount > 0 ? (objTotal / obj.targetAmount) * 100 : 0;
              
              return (
                <div 
                  key={obj.id} 
                  onClick={() => setActiveObjective(obj)}
                  className="bg-white dark:bg-gray-900 border-[3px] border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all cursor-pointer group flex items-center justify-between gap-4"
                >
                  
                  {/* Left: Title & Items Badge */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <h4 className="text-base md:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                      {obj.name}
                    </h4>
                    {objExpenses.length > 0 && (
                      <span className="hidden sm:inline-block shrink-0 text-[9px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                        {objExpenses.length} {objExpenses.length === 1 ? 'Item' : 'Items'}
                      </span>
                    )}
                  </div>
                  
                  {/* Right: Progress Bar & Amounts */}
                  <div className="flex items-center gap-3 md:gap-6 shrink-0">
                    
                    {/* Mini Progress Bar (Hidden on tight mobile screens) */}
                    <div className="hidden md:block w-24 lg:w-32 h-3 bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-full overflow-hidden shadow-[inset_1px_1px_0px_0px_rgba(0,0,0,0.1)]">
                      <div 
                        className={`h-full border-r-2 border-black transition-all duration-500 ${getAccentClasses('bg')}`} 
                        style={{ width: `${Math.min(100, objProgress)}%` }} 
                      />
                    </div>

                    {/* Numeric Stats */}
                    <div className="text-right">
                      <span className="block text-sm md:text-base font-black text-gray-900 dark:text-gray-100 leading-none">
                        {formatCurrency(objTotal)}
                      </span>
                      <span className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                        / {formatCurrency(obj.targetAmount)}
                      </span>
                    </div>
                    
                  </div>
                  
                </div>
              );
            })}
          </div>
        )}
      </div>



            {/* 🟢 ADD OBJECTIVE MODAL */}
            {showAddObjective && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAddObjective(false)}>

          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative" onClick={e => e.stopPropagation()}>
            
            <button onClick={() => setShowAddObjective(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border-2 border-black bg-gray-100 dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all">
              <X className="w-4 h-4 text-gray-900 dark:text-white" />
            </button>
            
            <div className="mb-6 pr-8">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">New Objective</h2>
              <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest">Create a budget category</p>
            </div>

            <form onSubmit={handleAddObjective} className="space-y-5">
              
              {/* SMART SUGGESTIONS CHIPS */}
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Quick Picks</p>
                <div className="flex flex-wrap gap-2">
                  {getSuggestions().map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setObjForm(prev => ({ ...prev, name: sug }))}
                      className="px-3 py-1.5 rounded-lg border-2 border-black bg-gray-50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Objective Name</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. Airfare"
                  value={objForm.name} 
                  onChange={(e) => setObjForm({...objForm, name: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Target Budget <span className="text-gray-300">(Optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400">₱</span>
                  <input 
                    type="number" 
                    min="0" step="0.01" 
                    placeholder="0.00"
                    value={objForm.targetAmount} 
                    onChange={(e) => setObjForm({...objForm, targetAmount: e.target.value})} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 pl-8 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmitting || !objForm.name.trim()}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:active:scale-100 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('bg')}`}
                >
                  {isSubmitting ? 'Creating...' : 'Create Objective'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

            


                        {/* 🟢 ACTIVE OBJECTIVE WORKSPACE (Notion-Style Side-Peek Panel) */}
                        {activeObjective && (
        <>
          {/* DIMMED BACKDROP (Click to close) */}
          <div 
            className="fixed inset-0 z-[9990] bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setActiveObjective(null)}
          />

          {/* SLIDE-IN PANEL */}
          <div className="fixed top-0 right-0 bottom-0 w-full md:w-[600px] lg:w-[700px] z-[9999] bg-[#FCF6E8] dark:bg-gray-950 md:border-l-[4px] border-black shadow-[-8px_0_20px_rgba(0,0,0,0.3)] animate-in slide-in-from-right duration-300 flex flex-col">

            
                        {/* HEADER NAV */}
                        <div className="shrink-0 sticky top-0 z-10 bg-[#FCF6E8]/90 dark:bg-gray-950/90 backdrop-blur-md px-4 py-4 md:px-8 md:py-6 flex items-center justify-between border-b-[3px] border-black shadow-sm">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveObjective(null)}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-[3px] border-black bg-white dark:bg-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[2px] active:shadow-none transition-all hover:-translate-y-0.5"
                  title="Close panel"
                >
                  <X className="w-4 h-4 text-black dark:text-white" strokeWidth={3} />
                </button>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                  {activeObjective.name}
                </h2>
              </div>
              <button 
                onClick={() => handleDeleteObjective(activeObjective.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                title="Delete Objective"
              >
                <Trash2 className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>


            {/* SCROLLABLE WORKSPACE CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 relative">
              
                            {/* WORKSPACE HERO / PROGRESS (The Yardstick) */}
                            {(() => {
                const activeExpenses = expenses.filter(e => e.objectiveId === activeObjective.id);
                const lockedInExpenses = activeExpenses.filter(e => e.isCompleted);
                const totalSpent = lockedInExpenses.reduce((sum, e) => sum + e.amount, 0);
                const target = activeObjective.targetAmount > 0 ? activeObjective.targetAmount : 1; // Prevent div by zero
                
                return (
                  <div className="bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative z-20">
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Locked In</p>
                        <p className="text-3xl font-black text-gray-900 dark:text-white leading-none">
                          {formatCurrency(totalSpent)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Target Ceiling</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white leading-none">
                          {formatCurrency(activeObjective.targetAmount)}
                        </p>
                      </div>
                    </div>
                    
                    {/* THE INTERACTIVE YARDSTICK */}
                    <div className="relative h-8 w-full bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-full overflow-hidden shadow-[inset_1px_1px_0px_0px_rgba(0,0,0,0.1)]">
                      {activeExpenses.map((expense, idx) => {
                        const percent = Math.min(100, (expense.amount / target) * 100);
                        const colorClass = EXPENSE_COLORS[idx % EXPENSE_COLORS.length];
                        const isHovered = hoveredExpenseId === expense.id;
                        const isLocked = expense.isCompleted;

                        // 1. If Locked In OR Hovered: Render the full colored fill from 0 to the amount
                        if (isHovered || isLocked) {
                          return (
                            <div 
                              key={`fill-${expense.id}`}
                              className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${colorClass} ${isLocked ? 'opacity-100 border-r-2 border-black z-10' : 'opacity-50 z-0'}`} 
                              style={{ width: `${percent}%` }} 
                            />
                          );
                        }

                        // 2. Default State: Render just the thin marker tick on the track
                        return (
                          <div 
                            key={`marker-${expense.id}`}
                            className={`absolute top-0 bottom-0 w-1 z-20 ${colorClass} opacity-80`}
                            style={{ left: `calc(${percent}% - 2px)` }}
                          />
                        );
                      })}
                    </div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-3 text-center">
                      Hover items below to compare against target
                    </p>
                  </div>
                );
              })()}


                            {/* EXPENSES CHECKLIST AREA */}
                            <div className="space-y-4 pb-24">
                <div className="flex items-center justify-between pl-2 border-l-4 border-indigo-500">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight pl-2">
                    Checklist Items
                  </h3>
                </div>

                {(() => {
                  const activeExpenses = expenses.filter(e => e.objectiveId === activeObjective.id);
                  
                  if (activeExpenses.length === 0) return (
                    <div className="bg-white dark:bg-gray-900 border-[4px] border-dashed border-gray-300 dark:border-gray-700 rounded-[2rem] p-8 flex flex-col items-center text-center">
                      <p className="text-sm font-bold text-gray-400">Ready to add specific expenses and benchmark links for {activeObjective.name}.</p>
                    </div>
                  );

                  return (
                    <div className="space-y-8 pb-32">
                      {Object.entries(
                        activeExpenses.reduce((groups, expense) => {
                          const groupName = expense.subset_group?.trim() || 'Ungrouped';
                          if (!groups[groupName]) groups[groupName] = [];
                          groups[groupName].push(expense);
                          return groups;
                        }, {} as Record<string, typeof activeExpenses>)
                      )
                      .sort(([groupA], [groupB]) => groupA === 'Ungrouped' ? -1 : groupB === 'Ungrouped' ? 1 : groupA.localeCompare(groupB))
                      .map(([groupName, groupedExpenses]) => (
                        <div key={groupName} className="space-y-3">
                          
                          {/* SUBSET HEADER */}
                          {groupName !== 'Ungrouped' && (
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2 mb-2 border-b-2 border-gray-200 dark:border-gray-800 pb-1">
                              {groupName}
                            </h3>
                          )}

                          {/* EXPENSE CARDS FOR THIS SUBSET */}
                          <div className="space-y-3">
                            {groupedExpenses.map((expense, idx) => {
                              const colorClass = EXPENSE_COLORS[idx % EXPENSE_COLORS.length];
                              const isHovered = hoveredExpenseId === expense.id;
                              
                              return (
                                /* 🟢 YOUR EXACT EXISTING EXPENSE CARD STARTS HERE */
                                <div 
                                  key={expense.id}
                                  onMouseEnter={() => setHoveredExpenseId(expense.id)}
                                  onMouseLeave={() => setHoveredExpenseId(null)}
                                  className={`bg-white dark:bg-gray-900 border-[3px] ${isHovered && !expense.isCompleted ? 'border-indigo-500 scale-[1.01]' : 'border-black'} rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between gap-4 transition-all hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] group ${expense.isCompleted ? 'bg-gray-50 dark:bg-gray-800/50 opacity-75' : ''}`}
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    
                                    {/* LOCK-IN TOGGLE */}
                                    <button 
                                      onClick={() => handleToggleExpense(expense.id, expense.isCompleted)}
                                      className="shrink-0 active:scale-90 transition-all relative"
                                    >
                                      {!expense.isCompleted && (
                                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black ${colorClass}`} />
                                      )}
                                      
                                      {expense.isCompleted ? (
                                        <CheckCircle2 className={`w-6 h-6 ${getAccentClasses('text')}`} strokeWidth={3} />
                                      ) : (
                                        <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600 hover:text-black dark:hover:text-white transition-colors" strokeWidth={3} />
                                      )}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                      <h4 className={`text-sm font-black text-gray-900 dark:text-white truncate ${expense.isCompleted ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
                                        {expense.name}
                                      </h4>
                                      {expense.benchmarkUrl && (
                                        <a 
                                          href={expense.benchmarkUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold transition-colors ${expense.isCompleted ? 'text-gray-400' : 'text-indigo-500 hover:text-indigo-600'}`}
                                        >
                                          <Link className="w-3 h-3" strokeWidth={3} /> View Benchmark
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                      <span className={`text-base font-black ${expense.isCompleted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                        {formatCurrency(expense.amount)}
                                      </span>
                                    </div>
                                    
                                    <button 
                                      onClick={() => handleDeleteExpense(expense.id)}
                                      className="opacity-100 md:opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    >
                                      <Trash2 className="w-4 h-4" strokeWidth={3} />
                                    </button>
                                  </div>
                                </div>
                                /* 🟢 YOUR EXACT EXISTING EXPENSE CARD ENDS HERE */
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );

                })()}
              </div>


            </div>

                                                {/* PANEL-SCOPED FLOATING ADD BUTTON (Desktop Only) */}
            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 z-50">
              <button 
                onClick={() => setShowAddExpense(true)}
                className={`hidden md:flex items-center justify-center gap-2 w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-4 rounded-full font-black text-sm uppercase tracking-widest text-white border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${getAccentClasses('bg')}`}
                title="Add Item"
              >

                <Plus className="w-6 h-6 md:w-5 md:h-5 stroke-[3]" /> 
                <span className="hidden md:inline-block">Add Item</span>
              </button>
            </div>


            
          </div>
        </>
      )}

{/* 🟢 ADD EXPENSE (CHECKLIST ITEM) MODAL */}
{showAddExpense && createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAddExpense(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative" onClick={e => e.stopPropagation()}>
            
            <button onClick={() => setShowAddExpense(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border-2 border-black bg-gray-100 dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all">
              <X className="w-4 h-4 text-gray-900 dark:text-white" />
            </button>
            
            <div className="mb-6 pr-8">
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Add Item</h2>
              <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">To: {activeObjective?.name}</p>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-5">
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Expense Name</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. Cebu Pacific Flight"
                  value={expenseForm.name} 
                  onChange={(e) => setExpenseForm({...expenseForm, name: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Group / Subset (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Hotels, Airbnbs"
                  value={expenseForm.subsetGroup} 
                  onChange={(e) => setExpenseForm({...expenseForm, subsetGroup: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                />
              </div>


              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Benchmarked Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400">₱</span>
                  <input 
                    required
                    type="number" 
                    min="0" step="0.01" 
                    placeholder="0.00"
                    value={expenseForm.amount} 
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 pl-8 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <Link className="w-3 h-3" /> Benchmark URL <span className="text-gray-300">(Optional)</span>
                </label>
                <input 
                  type="url" 
                  placeholder="https://..."
                  value={expenseForm.benchmarkUrl} 
                  onChange={(e) => setExpenseForm({...expenseForm, benchmarkUrl: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-xs font-bold text-gray-500 dark:text-gray-400 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" 
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmittingExpense || !expenseForm.name.trim() || !expenseForm.amount}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:active:scale-100 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('bg')}`}
                >
                  {isSubmittingExpense ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
