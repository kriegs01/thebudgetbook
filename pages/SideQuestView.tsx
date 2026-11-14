import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Plus, Loader2, Target, Pencil, CheckCircle2, X, Link, Trash2, Circle, Rocket, Calendar } from 'lucide-react';
import { useTheme } from '../src/contexts/ThemeContext';
import { getSideQuestById, getSideQuestExpenses, getSideQuestObjectives, createSideQuestObjective, createSideQuestExpense, updateSideQuestExpense, deleteSideQuestExpense, deleteSideQuestObjective, updateSideQuestObjective, updateSideQuest } from '../src/services/sideQuestsService';
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

      // --- RESIZABLE PANEL STATE ---
  const headerRowRef = useRef<HTMLTableRowElement>(null); // 🟢 NEW: Ref to measure the table
  const [panelWidth, setPanelWidth] = useState(700);
  const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
    // 🟢 Support both Mouse and Touch events
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      
      // Extract the X coordinate depending on the device type
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      let newWidth = window.innerWidth - clientX;
      
            let maxAllowedWidth = window.innerWidth * 0.9;
      if (headerRowRef.current) {
        const columns = Array.from(headerRowRef.current.children);
        
        // 🟢 FIXED: The first column stretches, so we ignore it in the measurement (.slice(1))
        const staticColumnsWidth = columns.slice(1).reduce((sum, col) => sum + (col as HTMLElement).offsetWidth, 0);
        
        // Static columns + 250px (First column's minimum) + 88px (Panel padding/borders)
        const exactFitWidth = staticColumnsWidth + 250 + 88; 
        
        if (exactFitWidth < maxAllowedWidth) {
          maxAllowedWidth = exactFitWidth;
        }
      }

      
      if (newWidth < 400) newWidth = 400;
      if (newWidth > maxAllowedWidth) newWidth = maxAllowedWidth;
      
      setPanelWidth(newWidth);
    };

    const handleUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      // 🟢 Add Touch Listeners
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [isDragging]);




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

  const [editingObjective, setEditingObjective] = useState<SideQuestObjective | null>(null);
  const [editingExpense, setEditingExpense] = useState<SideQuestExpense | null>(null);


   // --- MODAL STATE ---
  const [showAddObjective, setShowAddObjective] = useState(false);
  const [objStep, setObjStep] = useState(1); // 🟢 Tracks which card is visible
  const [needsBenchmarking, setNeedsBenchmarking] = useState(false); // 🟢 Tracks the toggle switch
  
  const [objForm, setObjForm] = useState({ name: '', targetAmount: '', criteria_schema: [] as CriteriaDefinition[] });
  const [isSubmitting, setIsSubmitting] = useState(false);


  // --- SMART SUGGESTIONS ---
  const getSuggestions = () => {
    if (quest?.type === 'Travel') return ['Airfare', 'Accommodation', 'Food', 'Activities', 'Transport'];
    if (quest?.type === 'Renovation') return ['Materials', 'Labor', 'Permits', 'Furnishings', 'Tools'];
    if (quest?.type === 'Event') return ['Venue', 'Catering', 'Decorations', 'Entertainment', 'Attire'];
    return ['Essentials', 'Supplies', 'Miscellaneous'];
  };

// 🟢 CRITERIA BUILDER HANDLERS
const addCriteriaProperty = (type: CriteriaType) => {
  const newProperty: CriteriaDefinition = {
    id: `crit_${Date.now()}`,
    name: '', // User will type the name (e.g., "Baggage")
    type,
    options: (type === 'select' || type === 'multi-select') ? [] : undefined
  };
  setObjForm(prev => ({ ...prev, criteria_schema: [...prev.criteria_schema, newProperty] }));
};

const updateCriteriaProperty = (id: string, updates: Partial<CriteriaDefinition>) => {
  setObjForm(prev => ({
    ...prev,
    criteria_schema: prev.criteria_schema.map(c => c.id === id ? { ...c, ...updates } : c)
  }));
};

const removeCriteriaProperty = (id: string) => {
  setObjForm(prev => ({
    ...prev,
    criteria_schema: prev.criteria_schema.filter(c => c.id !== id)
  }));
};


      const handleEditObjectiveClick = (e: React.MouseEvent, obj: SideQuestObjective) => {
    e.preventDefault(); // 🟢 Added to stop all default behaviors
    e.stopPropagation(); // 🟢 Ensure the parent card click NEVER fires
    
    setEditingObjective(obj);
    setObjForm({ 
      name: obj.name, 
      targetAmount: (obj.targetAmount || '').toString(), 
      criteria_schema: obj.criteria_schema || [] 
    });
    
    // 🟢 Reset step and auto-enable the toggle if criteria exists (Safely cast to boolean)
    setObjStep(1);
    setNeedsBenchmarking(Array.isArray(obj.criteria_schema) && obj.criteria_schema.length > 0); 
    
    setShowAddObjective(true);
  };


  // --- LAUNCH QUEST HANDLER ---
  const handleLaunchQuest = async () => {
    if (!quest) return;
    
    if (!window.confirm("Ready to launch this quest? This will lock in your planning phase and switch it to Active mode to track real-world transactions!")) return;

    try {
      const { data, error } = await updateSideQuest(quest.id, { status: 'active' });
      if (!error && data) {
        setQuest(prev => prev ? { ...prev, status: 'active' } : prev);
      } else {
        alert("Failed to launch quest. Please try again.");
      }
    } catch (err) {
      console.error(err);
    }
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
      if (editingObjective) {
        // UPDATE EXISTING
        const res = await updateSideQuestObjective(editingObjective.id, {
          name: objForm.name.trim(),
          targetAmount: parseFloat(objForm.targetAmount) || 0,
          criteria_schema: objForm.criteria_schema // 🟢 Our previous fix to save schema edits
        });
        if (res.data) {
          setObjectives(prev => prev.map(o => o.id === editingObjective.id ? { ...o, ...res.data } : o));
          setShowAddObjective(false);
          
          // 🟢 NEW RESETS ADDED HERE
          setObjStep(1); 
          setNeedsBenchmarking(false);
          
          setEditingObjective(null);
          setObjForm({ name: '', targetAmount: '', criteria_schema: [] });
        }
      } else {
        // CREATE NEW
        const res = await createSideQuestObjective({
          questId: quest.id,
          name: objForm.name.trim(),
          targetAmount: parseFloat(objForm.targetAmount) || 0,
          criteria_schema: objForm.criteria_schema
        });
        if (res.data) {
          setObjectives(prev => [...prev, res.data!]);
          setShowAddObjective(false);
          
          // 🟢 NEW RESETS ADDED HERE
          setObjStep(1); 
          setNeedsBenchmarking(false);
          
          setObjForm({ name: '', targetAmount: '', criteria_schema: [] });
        }
      }
    } catch (err: any) {
      alert(`App Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };



  
      // --- ADD EXPENSE STATE ---
    const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseStep, setExpenseStep] = useState(1); // 🟢 Tracks Carousel Step

    const [expenseForm, setExpenseForm] = useState({ 
    name: '', 
    amount: '', 
    benchmarkUrl: '',
    subsetGroup: '',
    criteriaValues: {} as Record<string, any> // 🟢 Add this to hold the dynamic answers
  });

    // --- SCROLL INDICATOR STATE ---
  const criteriaScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  const handleCriteriaScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Show pill if we haven't hit the bottom (with a 10px buffer)
    setShowScrollIndicator(scrollTop + clientHeight < scrollHeight - 10);
  };

  // Auto-check if scrolling is needed the moment Card 2 opens
  useEffect(() => {
    if (expenseStep === 2) {
      setTimeout(() => {
        if (criteriaScrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = criteriaScrollRef.current;
          setShowScrollIndicator(scrollTop + clientHeight < scrollHeight - 10);
        }
      }, 150); // Slight delay to let the DOM render the absolute cards first
    }
  }, [expenseStep]);


  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const handleEditExpenseClick = (expense: SideQuestExpense) => {
    setEditingExpense(expense);
    setExpenseForm({ 
      name: expense.name, 
      amount: expense.amount.toString(), 
      benchmarkUrl: expense.benchmarkUrl || '',
      subsetGroup: expense.subset_group || '',
      criteriaValues: expense.criteria_values || {}
    });
    setExpenseStep(1);
    setShowAddExpense(true);
  };


        // --- ADD EXPENSE HANDLER ---
    const handleAddExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!quest || !activeObjective || !expenseForm.name.trim()) return;
  
      setIsSubmittingExpense(true);
      
      try {
        if (editingExpense) {
          // UPDATE EXISTING
          const res = await updateSideQuestExpense(editingExpense.id, {
            name: expenseForm.name.trim(),
            amount: parseFloat(expenseForm.amount) || 0,
            benchmarkUrl: expenseForm.benchmarkUrl.trim(),
            subset_group: expenseForm.subsetGroup.trim() || null,
            criteria_values: expenseForm.criteriaValues
          } as any); 
          
          if (res.data) {
            setExpenses(prev => prev.map(exp => exp.id === editingExpense.id ? { ...exp, ...res.data } : exp));
            setShowAddExpense(false);
            setEditingExpense(null);
            setExpenseStep(1);
            setExpenseForm({ name: '', amount: '', benchmarkUrl: '', subsetGroup: '', criteriaValues: {} });
          } else if (res.error) {
            alert(`Failed to update item: ${res.error.message}`);
          }
        } else {
          // CREATE NEW
          const res = await createSideQuestExpense({
            questId: quest.id,
            objectiveId: activeObjective.id,
            name: expenseForm.name.trim(),
            amount: parseFloat(expenseForm.amount) || 0,
            benchmarkUrl: expenseForm.benchmarkUrl.trim(),
            subset_group: expenseForm.subsetGroup.trim() || null,
            criteria_values: expenseForm.criteriaValues,
            isCompleted: false
          } as any);

          if (res.data) {
            setExpenses(prev => [...prev, res.data!]);
            setShowAddExpense(false);
            setExpenseStep(1);
            setExpenseForm({ name: '', amount: '', benchmarkUrl: '', subsetGroup: '', criteriaValues: {} });
          } else if (res.error) {
            alert(`Failed to add item: ${res.error.message}`);
          }
        }
      } catch (err) {
        console.error("Error saving expense:", err);
        alert("An unexpected error occurred while saving.");
      } finally {
        setIsSubmittingExpense(false);
      }
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
  
      const handleDeleteObjective = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // Only stops propagation if an event was passed
    
    if (!window.confirm("Are you sure you want to delete this Category? All items inside will be lost.")) return;
    
    const { error } = await deleteSideQuestObjective(id);
    if (!error) {
      setObjectives(prev => prev.filter(o => o.id !== id));
      // Close the workspace panel if the deleted category is currently open
      if (activeObjective?.id === id) {
        setActiveObjective(null);
      }
    } else {
      alert("Failed to delete category. Please try again.");
    }
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

  // 🟢 FORMAT CUSTOM CRITERIA VALUES FOR THE TABLE
  const renderCriteriaValue = (type: string, value: any) => {
    if (value === undefined || value === null || value === '') return <span className="text-gray-300 dark:text-gray-600">-</span>;
    
    switch (type) {
      case 'checkbox':
        return value ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <X className="w-5 h-5 text-gray-300" />;
      case 'date':
        return <span className="whitespace-nowrap">{formatDate(value)}</span>;
      case 'select':
      case 'multi-select':
        // Handle both arrays (multi) and strings (single)
        const opts = Array.isArray(value) ? value : [value];
        return (
          <div className="flex gap-1 flex-wrap">
            {opts.map((opt, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-md text-[10px] uppercase tracking-widest whitespace-nowrap">
                {opt}
              </span>
            ))}
          </div>
        );
      case 'number':
      case 'text':
      default:
        return <span className="whitespace-nowrap truncate max-w-[200px] block">{value.toString()}</span>;
    }
  };


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
          <p className="text-sm font-bold text-gray-500 flex items-center gap-1.5 mb-1">
            <Calendar className="w-4 h-4 shrink-0" /> {formatDate(quest.targetDate)}
          </p>
          
          <div className="text-3xl md:text-5xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight leading-none mt-2">
            {getCountdown(quest.targetDate)}
          </div>

          <span className={`text-[10px] font-black uppercase tracking-widest text-white px-3 py-1 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] inline-block mt-4 ${getAccentClasses('bg')}`}>
            {quest.type}
          </span>
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
                    <p className="text-[7px] sm:text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">Allocated Goals</p>
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

                                {/* 🟢 MOBILE LAUNCH BUTTON (Requires at least 1 Fund Goal) */}
                {(!quest.status || quest.status === 'planning') && objectives.length > 0 && (
                  <button 
                    onClick={handleLaunchQuest}
                    className={`md:hidden mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none transition-all ${getAccentClasses('bg')}`}
                  >
                    <Rocket className="w-5 h-5 stroke-[2.5]" /> 
                    Launch Quest
                  </button>
                )}




              </>
            );
          })()}
        </div>

      </div>




                  {/* 🟢 OBJECTIVES SECTION */}
      <div className="pt-2 relative z-10">
        
        {/* SECTION HEADER & BUTTON */}
        <div className="flex items-center justify-between mb-4 pl-2">
          <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            Fund Goals
          </h3>
          <button 
            onClick={() => setShowAddObjective(true)}
            className={`flex items-center gap-1 px-4 py-2 text-white rounded-xl font-black text-[10px] uppercase tracking-widest border-[3px] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[1px] active:shadow-none transition-all ${getAccentClasses('bg')}`}
          >
            <Plus className="w-4 h-4" /> Add Goal
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
                    
                    {/* NEW EDIT BUTTON */}
                    <button 
                      onClick={(e) => handleEditObjectiveClick(e, obj)}
                      className="p-2 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                    >
                      <Pencil className="w-4 h-4" strokeWidth={2.5} />
                    </button>

                    {/* 🟢 NEW DELETE BUTTON */}
                        <button 
                          onClick={(e) => handleDeleteObjective(obj.id, e)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                          aria-label="Delete Category"
                        >

                        <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>

                  </div>
                  
                
              );
            })}
          </div>
        )}

                       {/* 🟢 LAUNCH FAB (Desktop Only, Requires at least 1 Fund Goal) */}
      {(!quest.status || quest.status === 'planning') && objectives.length > 0 && (
        <div className="hidden md:block fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500">
          <button 
            onClick={handleLaunchQuest}
            className={`flex items-center justify-center px-8 py-4 rounded-full font-black text-sm uppercase tracking-widest text-white border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${getAccentClasses('bg')}`}
            title="Launch Quest"
          >
            <Rocket className="w-5 h-5 stroke-[2.5]" /> 
            <span className="ml-2">Launch Quest</span>
          </button>
        </div>
      )}



      </div>



                  {/* 🟢 ADD GOAL MODAL - STACKED CARDS */}
      {showAddObjective && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => { setShowAddObjective(false); setObjStep(1); setNeedsBenchmarking(false); }}>
          
                    {/* 🟢 Removed "grid", added "relative" */}
          <form onSubmit={handleAddObjective} className="w-full max-w-sm relative" onClick={e => e.stopPropagation()}>

            
                        {/* 🟢 Removed [grid-area:1/1], added "relative w-full" */}
            <div className={`relative w-full bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 transition-all duration-500 flex flex-col ${

              objStep === 2 
                ? 'scale-95 -translate-y-6 opacity-40 pointer-events-none z-0 shadow-none' 
                : 'scale-100 translate-y-0 opacity-100 z-20 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
            }`}>
              
              <button type="button" onClick={() => { setShowAddObjective(false); setObjStep(1); setNeedsBenchmarking(false); }} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border-2 border-black bg-gray-100 dark:bg-gray-800 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all">
                <X className="w-4 h-4 text-gray-900 dark:text-white" />
              </button>
              
              <div className="mb-6 pr-8">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">
                  {editingObjective ? 'Edit Goal' : 'New Goal'}
                </h2>
                <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">
                  {editingObjective ? `Editing ${editingObjective.name}` : 'Create a budget category'}
                </p>
              </div>


              <div className="space-y-5 flex-1">
                
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
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Goal Name</label>
                  <input required type="text" placeholder="e.g. Airfare"
                    value={objForm.name} onChange={(e) => setObjForm({...objForm, name: e.target.value})} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Target Budget <span className="text-gray-300">(Optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400">₱</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={objForm.targetAmount} onChange={(e) => setObjForm({...objForm, targetAmount: e.target.value})} 
                      className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 pl-8 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30 transition-colors" />
                  </div>
                </div>

                {/* 🟢 NEW: BENCHMARK TOGGLE */}
                <div className="pt-2">
                  <label className="flex items-center justify-between cursor-pointer group bg-gray-50 dark:bg-gray-800 border-[3px] border-black p-4 rounded-xl transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                    <div>
                      <span className="block text-[11px] font-black uppercase tracking-widest text-gray-900 dark:text-white">Enable Benchmarking</span>
                      <span className="block text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Compare features & options</span>
                    </div>
                    {/* The custom switch UI */}
                    <div className={`relative w-12 h-6 rounded-full border-[3px] border-black transition-colors duration-300 ${needsBenchmarking ? getAccentClasses('bg') : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)] transition-transform duration-300 ${needsBenchmarking ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </div>
                    <input type="checkbox" className="hidden" checked={needsBenchmarking} onChange={(e) => setNeedsBenchmarking(e.target.checked)} />
                  </label>
                </div>

              </div>

              <div className="pt-6 mt-auto">
                {needsBenchmarking ? (
                  <button 
                    type="button" 
                    disabled={!objForm.name.trim()}
                    onClick={() => setObjStep(2)}
                    className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}
                  >
                    Next: Properties
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    disabled={isSubmitting || !objForm.name.trim()}
                    className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Goal'}
                  </button>
                )}
              </div>

            </div>

                        {/* 🟢 Removed [grid-area:1/1], added "absolute inset-0 w-full h-full" */}
            {needsBenchmarking && (
              <div className={`absolute inset-0 w-full h-full bg-[#FCF6E8] dark:bg-gray-950 border-[4px] border-black rounded-[2rem] p-6 transition-all duration-500 flex flex-col ${

                objStep === 1 
                  ? 'scale-95 translate-y-6 opacity-40 pointer-events-none z-0 shadow-none' 
                  : 'scale-100 translate-y-0 opacity-100 z-30 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
              }`}>
                
                <div className="mb-6">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Custom Properties</h2>
                  <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">{objForm.name || 'New Goal'}</p>
                </div>

                {/* 🟢 SCROLLABLE BUILDER AREA */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[50vh] space-y-4">
                  
                  <div className="space-y-3">
                    {objForm.criteria_schema.map((prop) => (
                      <div key={prop.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2.5 rounded-xl border-2 border-transparent focus-within:border-gray-300 transition-all shadow-sm">
                        <div className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[9px] font-bold uppercase text-gray-600 dark:text-gray-300 tracking-wider w-20 text-center">
                          {prop.type}
                        </div>
                        <div className="flex-1">
                          <input type="text" placeholder="Property Name (e.g. Baggage)" value={prop.name}
                            onChange={(e) => updateCriteriaProperty(prop.id, { name: e.target.value })}
                            className="w-full bg-transparent text-sm font-bold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none" />
                          {(prop.type === 'select' || prop.type === 'multi-select') && (
                            <input type="text" placeholder="Options (comma separated)" value={prop.options?.join(', ')}
                              onChange={(e) => updateCriteriaProperty(prop.id, { options: e.target.value.split(',').map(s => s.trim()) })}
                              className="w-full mt-1.5 text-[10px] bg-gray-50 dark:bg-gray-900 rounded p-1.5 font-bold text-gray-600 dark:text-gray-400 focus:outline-none border border-gray-200 dark:border-gray-700" />
                          )}
                        </div>
                        <button type="button" onClick={() => removeCriteriaProperty(prop.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Property Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {['text', 'number', 'select', 'checkbox', 'date'].map((type) => (
                      <button key={type} type="button" onClick={() => addCriteriaProperty(type as CriteriaType)}
                        className="px-3 py-1.5 rounded-lg border-2 border-black bg-white dark:bg-gray-900 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300 hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 transition-all">
                        + {type}
                      </button>
                    ))}
                  </div>

                </div>

                <div className="pt-6 mt-auto flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setObjStep(1)}
                    className="px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-gray-700 bg-gray-100 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all"
                  >
                    Back
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}
                  >
                    {isSubmitting ? 'Saving...' : 'Create Goal'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>,
        document.body // 🟢 ADD THIS LINE
      )}

            


                        {/* 🟢 ACTIVE OBJECTIVE WORKSPACE (Notion-Style Side-Peek Panel) */}
                        {activeObjective && createPortal(
        <>
                    {/* DIMMED BACKDROP (Click to close) */}
          <div 
            className="fixed inset-0 z-[9990] bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setActiveObjective(null)}
          />

          {/* 🟢 NEW: INVISIBLE DRAG OVERLAY */}
          {/* This completely stops text selection and captures the mouse smoothly while resizing */}
          {isDragging && (
            <div className="fixed inset-0 z-[99999] cursor-col-resize select-none" />
          )}

          {/* SLIDE-IN PANEL */}
          <div 
            className={`fixed top-0 right-0 bottom-0 z-[9999] bg-[#FCF6E8] dark:bg-gray-950 md:border-l-[4px] border-black shadow-[-8px_0_20px_rgba(0,0,0,0.3)] flex flex-col ${!isDragging ? 'transition-[width] duration-75' : ''} animate-in slide-in-from-right duration-300`}
            style={{ 

              width: window.innerWidth >= 768 ? `${panelWidth}px` : '100%', 
            }}
          >
            
                        {/* 🟢 DRAG HANDLE (Desktop & Tablet) */}
            <div 
              className="hidden md:block absolute top-0 bottom-0 left-[-6px] w-3 cursor-col-resize z-[10000] group"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onTouchStart={(e) => {
                // 🟢 Triggers drag state when an iPad/Touch user grabs the handle
                setIsDragging(true);
              }}
            >
              {/* Visual Indicator on Hover/Active */}
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-16 rounded-full transition-colors ${isDragging ? 'bg-indigo-500' : 'bg-black/10 dark:bg-white/10 group-hover:bg-indigo-400/50'}`} />
            </div>


            
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
                    {activeObjective.criteria_schema && activeObjective.criteria_schema.length > 0 
                      ? 'Benchmark Items' 
                      : 'Checklist Items'}
                  </h3>
                </div>


                {(() => {
                  const activeExpenses = expenses.filter(e => e.objectiveId === activeObjective.id);
                  
                    if (activeExpenses.length === 0) return (
                    <div className="bg-white dark:bg-gray-900 border-[4px] border-dashed border-gray-300 dark:border-gray-700 rounded-[2rem] p-8 flex flex-col items-center text-center">
                      <p className="text-sm font-bold text-gray-400">
                        {activeObjective.criteria_schema && activeObjective.criteria_schema.length > 0
                          ? `Ready to add options and benchmark links for ${activeObjective.name}.`
                          : `Ready to add specific expenses for ${activeObjective.name}.`}
                      </p>
                    </div>
                  );


                                   return (
                    <div className="space-y-8 pb-32">
                      
                      {/* 🟢 MOBILE TIER-CARD LAYOUT (Hidden on Desktop) */}
                      <div className="md:hidden flex overflow-x-auto snap-x snap-mandatory gap-4 pb-6 px-1 hide-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mt-3">
                        {activeExpenses.map((expense, idx) => {
                          const colorClass = EXPENSE_COLORS[idx % EXPENSE_COLORS.length];
                          return (
                            <div 
                              key={`mobile-${expense.id}`} 
                              className={`shrink-0 w-[280px] snap-center bg-white dark:bg-gray-900 border-[3px] border-black rounded-[2rem] p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col transition-opacity ${expense.isCompleted ? 'opacity-75' : ''}`}
                            >
                              {/* Header: Toggle, Title, Actions */}
                              <div className="flex justify-between items-start gap-3 mb-4">
                                <button 
                                  onClick={() => handleToggleExpense(expense.id, expense.isCompleted)}
                                  className="shrink-0 active:scale-90 transition-all relative mt-0.5"
                                >
                                  {!expense.isCompleted && (
                                    <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-black ${colorClass}`} />
                                  )}
                                  {expense.isCompleted ? (
                                    <CheckCircle2 className={`w-7 h-7 ${getAccentClasses('text')}`} strokeWidth={2.5} />
                                  ) : (
                                    <Circle className="w-7 h-7 text-gray-300 dark:text-gray-600" strokeWidth={2.5} />
                                  )}
                                </button>
                                
                                <div className="flex-1 min-w-0">
                                  <h4 className={`text-base font-black text-gray-900 dark:text-white leading-tight ${expense.isCompleted ? 'line-through text-gray-500' : ''}`}>
                                    {expense.name}
                                  </h4>
                                  {expense.benchmarkUrl && (
                                    <a href={expense.benchmarkUrl} target="_blank" rel="noopener noreferrer"
                                      className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold transition-colors ${expense.isCompleted ? 'text-gray-400' : 'text-indigo-500 hover:text-indigo-600'}`}>
                                      <Link className="w-3 h-3" strokeWidth={3} /> View Link
                                    </a>
                                  )}
                                </div>

                                <div className="flex flex-col gap-1 shrink-0">
                                  <button onClick={() => handleEditExpenseClick(expense)} className="p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all">
                                    <Pencil className="w-4 h-4" strokeWidth={2.5} />
                                  </button>
                                  <button onClick={() => handleDeleteExpense(expense.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                    <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                                  </button>
                                </div>
                              </div>

                              {/* Prominent Amount Ticket */}
                              <div className="bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 mb-4 text-center">
                                <span className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Amount</span>
                                <span className="text-xl font-black text-gray-900 dark:text-white leading-none">
                                  {formatCurrency(expense.amount)}
                                </span>
                              </div>

                              {/* Criteria/Features List */}
                              {activeObjective.criteria_schema && activeObjective.criteria_schema.length > 0 && (
                                <div className="space-y-2.5 border-t-2 border-dashed border-gray-200 dark:border-gray-800 pt-4 flex-1">
                                  {activeObjective.criteria_schema.map(prop => (
                                    <div key={prop.id} className="flex justify-between items-center gap-4 text-sm">
                                      <span className="font-bold text-gray-500 text-xs">{prop.name}</span>
                                      <span className="font-black text-gray-900 dark:text-gray-100 text-right text-xs">
                                        {renderCriteriaValue(prop.type, expense.criteria_values?.[prop.id])}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 🟢 DESKTOP SPREADSHEET MATRIX (Hidden on Mobile) */}
                      <div className="hidden md:block w-full overflow-x-auto pb-4 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white dark:bg-gray-900 custom-scrollbar mt-3">
                        <table className="w-full text-left border-collapse">
                          
                          {/* TABLE HEADER */}
                          <thead>
                            <tr ref={headerRowRef} className="border-b-[3px] border-black bg-gray-50 dark:bg-gray-800">
                              <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 p-4 border-r-[3px] border-black text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[250px] w-full">
                                Item
                              </th>
                              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500 border-r-[3px] border-black whitespace-nowrap w-px">
                                Amount
                              </th>
                              {activeObjective.criteria_schema?.map(prop => (
                                <th key={prop.id} className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500 border-r-[3px] border-black whitespace-nowrap w-px px-6">
                                  {prop.name}
                                </th>
                              ))}
                              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap text-center w-[120px]">
                                Action
                              </th>
                            </tr>
                          </thead>

                          {/* TABLE BODY */}
                          <tbody>
                            {activeExpenses.map((expense, idx) => {
                              const colorClass = EXPENSE_COLORS[idx % EXPENSE_COLORS.length];
                              const isHovered = hoveredExpenseId === expense.id;
                              
                              return (
                                <tr 
                                  key={expense.id}
                                  onMouseEnter={() => setHoveredExpenseId(expense.id)}
                                  onMouseLeave={() => setHoveredExpenseId(null)}
                                  className={`border-b-[3px] border-gray-200 dark:border-gray-800 last:border-0 transition-colors ${expense.isCompleted ? 'opacity-75' : ''} ${isHovered && !expense.isCompleted ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                                >
                                  {/* Frozen Left Cell */}
                                  <td className={`sticky left-0 z-10 p-4 border-r-[3px] border-black transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] ${expense.isCompleted ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'} ${isHovered && !expense.isCompleted ? 'bg-indigo-50/80 dark:bg-indigo-900/20' : ''}`}>
                                    <div className="flex items-center gap-3 min-w-[200px]">
                                      <button 
                                        onClick={() => handleToggleExpense(expense.id, expense.isCompleted)}
                                        className="shrink-0 active:scale-90 transition-all relative"
                                      >
                                        {!expense.isCompleted && (
                                          <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-black ${colorClass}`} />
                                        )}
                                        {expense.isCompleted ? (
                                          <CheckCircle2 className={`w-6 h-6 ${getAccentClasses('text')}`} strokeWidth={3} />
                                        ) : (
                                          <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600 hover:text-black dark:hover:text-white transition-colors" strokeWidth={3} />
                                        )}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <h4 className={`text-sm font-black text-gray-900 dark:text-white truncate ${expense.isCompleted ? 'line-through text-gray-500' : ''}`}>
                                          {expense.name}
                                        </h4>
                                        {expense.benchmarkUrl && (
                                          <a href={expense.benchmarkUrl} target="_blank" rel="noopener noreferrer"
                                            className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold transition-colors ${expense.isCompleted ? 'text-gray-400' : 'text-indigo-500 hover:text-indigo-600'}`}>
                                            <Link className="w-3 h-3" strokeWidth={3} /> URL
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  
                                  {/* Amount Cell */}
                                  <td className="p-4 border-r-[3px] border-black font-black text-gray-900 dark:text-white whitespace-nowrap w-px">
                                    {formatCurrency(expense.amount)}
                                  </td>
                                  
                                  {/* Dynamic Criteria Value Cells */}
                                  {activeObjective.criteria_schema?.map(prop => (
                                    <td key={prop.id} className="p-4 border-r-[3px] border-black text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap w-px px-6">
                                      {renderCriteriaValue(prop.type, expense.criteria_values?.[prop.id])}
                                    </td>
                                  ))}
                                  
                                  {/* Actions Cell */}
                                  <td className="p-4 text-center whitespace-nowrap w-[120px]">
                                    <div className="flex items-center justify-center gap-1">
                                      <button 
                                        onClick={() => handleEditExpenseClick(expense)}
                                        className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                                      >
                                        <Pencil className="w-4 h-4" strokeWidth={3} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteExpense(expense.id)}
                                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" strokeWidth={3} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );

                          

                  

                })()}
              </div>


            </div>
            {/* PANEL-SCOPED FLOATING ADD BUTTON */}
            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 z-[100]">

              <button 
                onClick={() => setShowAddExpense(true)}
                className={`flex items-center justify-center gap-2 w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-4 rounded-full font-black text-sm uppercase tracking-widest text-white border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${getAccentClasses('bg')}`}
                title="Add Item"
              >
                <Plus className="w-6 h-6 md:w-5 md:h-5 stroke-[3]" /> 
                <span className="hidden md:inline-block">Add Item</span>
              </button>
            </div>




            
          </div>
        </>,
        document.body
      )}

{/* 🟢 ADD EXPENSE (CHECKLIST ITEM) MODAL - STACKED CARDS */}
{showAddExpense && createPortal(
  <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => { setShowAddExpense(false); setExpenseStep(1); }}>
    
    {(() => {
      // Evaluate if this category has custom criteria
      const hasCriteria = Array.isArray(activeObjective?.criteria_schema) && activeObjective!.criteria_schema.length > 0;
      
      // Evaluate if the user has answered at least one custom property
      const hasAnswers = Object.values(expenseForm.criteriaValues).some(val => 
        val !== '' && val !== false && val !== null && val !== undefined
      );

      return (
        // The CSS Grid overlap trick: both cards live in row 1, column 1, stacking perfectly.
        <div className="w-full max-w-sm relative" onClick={e => e.stopPropagation()}>
          
          {/* 🟢 CARD 1: CORE DETAILS */}
          <div className={`relative w-full bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 transition-all duration-500 flex flex-col ${
            expenseStep === 2 
              ? 'scale-95 -translate-y-6 opacity-40 pointer-events-none z-0 shadow-none' 
              : 'scale-100 translate-y-0 opacity-100 z-20 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
          }`}>
            
            <button onClick={() => { setShowAddExpense(false); setExpenseStep(1); }} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border-2 border-black bg-gray-100 dark:bg-gray-800 hover:-translate-y-0.5 active:scale-95 transition-all">
              <X className="w-4 h-4 text-gray-900 dark:text-white" />
            </button>
            
            <div className="mb-6 pr-8">
              <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Add Item</h2>
              <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">To: {activeObjective?.name}</p>
            </div>

            <div className="space-y-5 flex-1">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Expense Name</label>
                <input required type="text" placeholder="e.g. Cebu Pacific Flight"
                  value={expenseForm.name} onChange={(e) => setExpenseForm({...expenseForm, name: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50 dark:focus:bg-indigo-900/30" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Benchmarked Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-gray-400">₱</span>
                  <input required type="number" min="0" step="0.01" placeholder="0.00"
                    value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 pl-8 outline-none text-sm font-black dark:text-gray-100 focus:bg-indigo-50" />
                </div>
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <Link className="w-3 h-3" /> Benchmark URL <span className="text-gray-300">(Optional)</span>
                </label>
                <input type="url" placeholder="https://..."
                  value={expenseForm.benchmarkUrl} onChange={(e) => setExpenseForm({...expenseForm, benchmarkUrl: e.target.value})} 
                  className="w-full bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 outline-none text-xs font-bold text-gray-500 focus:bg-indigo-50" />
              </div>
            </div>

            <div className="pt-6 mt-auto">
              {hasCriteria ? (
                <button 
                  type="button" 
                  disabled={!expenseForm.name.trim() || !expenseForm.amount}
                  onClick={() => setExpenseStep(2)}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('bg')}`}
                >
                  Next: Properties
                </button>
              ) : (
                <button 
                  type="button" 
                  disabled={isSubmittingExpense || !expenseForm.name.trim() || !expenseForm.amount}
                  onClick={(e) => handleAddExpense(e as any)}
                  className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${getAccentClasses('bg')}`}
                >
                  {isSubmittingExpense ? 'Adding...' : 'Add Item'}
                </button>
              )}
            </div>
          </div>

                    {/* 🟢 CARD 2: CUSTOM CRITERIA (Peeking from behind) */}
          {hasCriteria && (
            <div className={`absolute inset-0 w-full h-full bg-[#FCF6E8] dark:bg-gray-950 border-[4px] border-black rounded-[2rem] p-6 transition-all duration-500 flex flex-col ${
              expenseStep === 1 
                ? 'scale-95 translate-y-6 opacity-40 pointer-events-none z-0 shadow-none' 
                : 'scale-100 translate-y-0 opacity-100 z-30 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
            }`}>
              
              <div className="mb-6">
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight leading-none">Custom Properties</h2>
                <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest truncate">{expenseForm.name || 'New Item'}</p>
              </div>

              {/* 🟢 SCROLLABLE AREA WITH SMART PILL */}
              <div className="relative flex-1 min-h-0 mb-2">
                <div 
                  ref={criteriaScrollRef}
                  onScroll={handleCriteriaScroll}
                  className="h-full overflow-y-auto custom-scrollbar pr-2 space-y-4 pb-8"
                >
                  {activeObjective.criteria_schema?.map(prop => (
                    <div key={prop.id}>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{prop.name}</label>
                      
                      {prop.type === 'text' && (
                        <input type="text" placeholder="..." value={expenseForm.criteriaValues[prop.id] || ''}
                          onChange={e => setExpenseForm(prev => ({...prev, criteriaValues: {...prev.criteriaValues, [prop.id]: e.target.value}}))}
                          className="w-full bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-bold focus:bg-indigo-50" />
                      )}

                      {prop.type === 'number' && (
                        <input type="number" placeholder="0" value={expenseForm.criteriaValues[prop.id] || ''}
                          onChange={e => setExpenseForm(prev => ({...prev, criteriaValues: {...prev.criteriaValues, [prop.id]: Number(e.target.value)}}))}
                          className="w-full bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-bold focus:bg-indigo-50" />
                      )}

                      {prop.type === 'date' && (
                        <input type="date" value={expenseForm.criteriaValues[prop.id] || ''}
                          onChange={e => setExpenseForm(prev => ({...prev, criteriaValues: {...prev.criteriaValues, [prop.id]: e.target.value}}))}
                          className="relative appearance-none w-full h-[48px] py-0 px-3 bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl outline-none text-sm font-bold focus:bg-indigo-50" />
                      )}

                      {(prop.type === 'select' || prop.type === 'multi-select') && (
                        <select value={expenseForm.criteriaValues[prop.id] || ''}
                          onChange={e => setExpenseForm(prev => ({...prev, criteriaValues: {...prev.criteriaValues, [prop.id]: e.target.value}}))}
                          className="w-full bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl p-3 outline-none text-sm font-bold focus:bg-indigo-50"
                        >
                          <option value="">Select option...</option>
                          {prop.options?.filter(Boolean).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}

                      {prop.type === 'checkbox' && (
                        <label className="flex items-center gap-3 bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl p-3 cursor-pointer">
                          <input type="checkbox" checked={!!expenseForm.criteriaValues[prop.id]}
                            onChange={e => setExpenseForm(prev => ({...prev, criteriaValues: {...prev.criteriaValues, [prop.id]: e.target.checked}}))}
                            className="w-5 h-5 accent-black" />
                          <span className="text-sm font-bold text-gray-900 dark:text-white">Yes / True</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div> {/* <-- Closes the scrolling div */}

                {/* 🟢 THE FLOATING PILL */}
                {showScrollIndicator && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] pointer-events-none transition-opacity animate-in fade-in duration-300 z-10">
                    More Below ↓
                  </div>
                )}
              </div> {/* <-- Closes the relative flex-1 container */}

              <div className="pt-6 mt-auto flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setExpenseStep(1)}
                  className="px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-gray-700 bg-gray-100 border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all"
                >
                  Back
                </button>
                <button 
                  type="button" 
                  disabled={isSubmittingExpense}
                  onClick={(e) => handleAddExpense(e as any)}
                  className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}
                >
                  {isSubmittingExpense ? 'Saving...' : (hasAnswers ? 'Done' : 'Skip & Add')}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    })()}
  </div>,
  document.body
)}

    </div>
  );
}

