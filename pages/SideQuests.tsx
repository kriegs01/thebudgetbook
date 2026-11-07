import React, { useState, useEffect, useRef } from 'react';
import { Compass, Plus, MapPin, Target, X, Loader2, ArrowRight, Pencil, Trash2, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../src/components/PageHeader';
import { useTheme } from '../src/contexts/ThemeContext';
import { getSideQuests, createSideQuest, updateSideQuest, deleteSideQuest } from '../src/services/sideQuestsService';
import { PixabayImagePicker } from '../src/components/PixabayImagePicker'; // Adjust this import path if yours differs!
import type { SideQuest } from '../types';

export default function SideQuests() {
  const { getAccentClasses } = useTheme();
  const navigate = useNavigate();

  const [quests, setQuests] = useState<SideQuest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeQuestIndex, setActiveQuestIndex] = useState(0);

  // Modal States
  const [showModal, setShowModal] = useState<'add' | 'edit' | null>(null);
  const [showPixabayModal, setShowPixabayModal] = useState(false);
  const [editQuestId, setEditQuestId] = useState<string | null>(null);
  
  // Form States
  const [questName, setQuestName] = useState('');
  const [questTargetAmount, setQuestTargetAmount] = useState('');
  const [questDate, setQuestDate] = useState('');
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const getQuestImage = (quest: SideQuest) => {
    if (quest.coverPhotoUrl) return quest.coverPhotoUrl;
    switch (quest.type) {
      case 'Travel': return 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=800&auto=format&fit=crop';
      case 'Renovation': return 'https://images.unsplash.com/photo-1581094722064-328d158ce774?q=80&w=800&auto=format&fit=crop';
      case 'Event': return 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=800&auto=format&fit=crop';
      default: return 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=800&auto=format&fit=crop';
    }
  };

  const loadQuests = async () => {
    setLoading(true);
    const { data } = await getSideQuests();
    setQuests(data || []);
    setLoading(false);
  };

  useEffect(() => { loadQuests(); }, []);

  useEffect(() => {
    const handleOpenAdd = () => openModal('add');
    window.addEventListener('open_add_sidequest_modal', handleOpenAdd);
    return () => window.removeEventListener('open_add_sidequest_modal', handleOpenAdd);
  }, []);

  const handleScroll = () => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    setActiveQuestIndex(Math.round(scrollLeft / clientWidth));
  };

  const scrollToQuest = (index: number) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollTo({ left: index * carouselRef.current.clientWidth, behavior: 'smooth' });
    setActiveQuestIndex(index);
  };

  const openModal = (mode: 'add' | 'edit', quest?: SideQuest) => {
    setShowModal(mode);
    if (mode === 'edit' && quest) {
      setEditQuestId(quest.id);
      setQuestName(quest.name);
      setQuestTargetAmount(quest.targetAmount.toString());
      setQuestDate(quest.targetDate);
      setCoverPhotoUrl(quest.coverPhotoUrl || '');
    } else {
      setEditQuestId(null);
      setQuestName('');
      setQuestTargetAmount('');
      setQuestDate('');
      setCoverPhotoUrl('');
    }
  };

    // 🟢 NEW: Stable callback to prevent the Pixabay component from infinitely re-rendering
    const handleSelectCoverPhoto = React.useCallback((url: string) => {
      setCoverPhotoUrl(url);
      setShowPixabayModal(false);
    }, []);
  

  const handleSaveQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questName || !questTargetAmount || !questDate) return;

    if (showModal === 'add') {
      const { data, error } = await createSideQuest({
        name: questName,
        type: 'Travel', 
        targetDate: questDate,
        targetAmount: parseFloat(questTargetAmount),
        coverPhotoUrl,
        isCompleted: false,
        isArchived: false,
      });
      if (!error && data) {
        setQuests(prev => [...prev, data]);
        setTimeout(() => scrollToQuest(quests.length), 100);
      }
    } else if (showModal === 'edit' && editQuestId) {
      const { data, error } = await updateSideQuest(editQuestId, {
        name: questName,
        targetDate: questDate,
        targetAmount: parseFloat(questTargetAmount),
        coverPhotoUrl,
      });
      if (!error && data) {
        setQuests(prev => prev.map(q => q.id === editQuestId ? { ...q, ...data } : q));
      }
    }
    setShowModal(null);
  };

  const handleDeleteQuest = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this SideQuest?")) return;
    const { error } = await deleteSideQuest(id);
    if (!error) setQuests(prev => prev.filter(q => q.id !== id));
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 pb-28 lg:pb-10 w-full max-w-7xl mx-auto px-4 md:px-8 pt-4 lg:pt-8">
      
      <PageHeader 
        title="SideQuests"
        subtitle="Plan, fund, and conquer your next big adventures"
        icon={
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
            <Compass className="w-5 h-5" />
          </div>
        }
        actions={
          <button 
            onClick={() => openModal('add')}
            className={`hidden md:flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')}`}
          >
            <Plus className="w-4 h-4" />
            <span>New Quest</span>
          </button>
        }
      />

      <div className="mt-8">
        {loading ? (
           <div className="flex flex-col items-center justify-center py-20 text-gray-400">
             <Loader2 className="w-8 h-8 animate-spin mb-4" />
             <p className="text-sm font-bold uppercase tracking-widest">Loading Quests...</p>
           </div>
        ) : quests.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border-[4px] border-dashed border-gray-300 dark:border-gray-700 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
            <Target className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-xl font-black text-gray-500 uppercase tracking-widest">No Active Quests</h3>
            <p className="text-sm font-bold text-gray-400 mt-2">Start a new SideQuest to begin tracking your goals.</p>
          </div>
        ) : (
          <div className="relative w-full">
            <div 
              ref={carouselRef}
              onScroll={handleScroll}
              className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 hide-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {quests.map((quest) => {
                const stashFunded = quest.targetAmount * 0.15; 
                const progressPercent = quest.targetAmount > 0 ? (stashFunded / quest.targetAmount) * 100 : 0;

                return (
                  <div key={quest.id} className="shrink-0 w-full md:w-[600px] snap-center snap-always pt-6 pr-4 md:pt-10 md:pr-8">
                    
                  {/* 🟢 ADDED overflow-hidden to clip the watermark! */}
                  <div className="bg-white dark:bg-gray-900 border-[4px] border-black rounded-[2rem] p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] h-full transition-all flex flex-col relative isolate overflow-hidden">
                    
                    {/* 🟢 FADED INSTAX WATERMARK */}
                    <div className="absolute -top-12 -right-8 md:-top-16 md:-right-12 w-40 md:w-56 p-2 pb-10 md:pb-14 bg-[#FCF6E8] border-[3px] border-black transform rotate-12 z-0 opacity-30 dark:opacity-20 pointer-events-none mix-blend-multiply dark:mix-blend-screen transition-all">
                      <div 
                        className="w-full aspect-square border-2 border-black bg-gray-200"
                        style={{ backgroundImage: `url('${getQuestImage(quest)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                      />
                    </div>

                    {/* 🟢 ADDED relative z-10 so text stays on top of the watermark */}
                    <div className="relative z-10 flex justify-between items-start mb-8 pr-24 md:pr-28">
                      <div className="min-w-0">
                        
                        <h2 className={`font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mt-0 mb-2 leading-none line-clamp-3 ${
                          quest.name.length > 16 ? 'text-base md:text-lg' : 
                          quest.name.length > 10 ? 'text-lg md:text-xl' : 
                          'text-2xl md:text-3xl'
                        }`}>
                          {quest.name}
                        </h2>
                        
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100 border-2 border-black px-3 py-1 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] inline-block">
                          {quest.type}
                        </span>
                        
                        <p className="text-xs font-bold text-gray-500 flex items-center gap-1 mt-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{formatDate(quest.targetDate)}</span>
                        </p>

                      </div>
                    </div>

                    {/* STASH PROGRESS (also wrapped in relative z-10) */}
                    <div className="relative z-10 space-y-2 mb-8 flex-1">

                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="text-gray-500">Funded (Stash)</span>
                          <span className="text-gray-900 dark:text-white">{progressPercent.toFixed(0)}%</span>
                        </div>
                        <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-full overflow-hidden shadow-[inset_1px_1px_0px_0px_rgba(0,0,0,0.1)]">
                          <div className="h-full border-r-2 border-black bg-emerald-400 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>

                      {/* FOOTER: TARGET GOAL & 3-PART BUTTON GROUP */}
                      <div className="border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-5 mt-auto flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Target Goal</p>
                          <p className="text-2xl font-black text-amber-400">{formatCurrency(quest.targetAmount)}</p>
                        </div>
                        
                        <div className="flex gap-2">
                          <button 
                            onClick={() => navigate(`/sidequests/${quest.id}`)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-white border-[3px] border-black rounded-xl font-black text-[12px] uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${getAccentClasses('bg')}`}
                          >
                            View Quest
                          </button>
                          
                          <button 
                            onClick={() => openModal('edit', quest)}
                            className="w-14 flex items-center justify-center bg-amber-300 text-black border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-amber-400"
                            aria-label="Edit Quest"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>

                          <button 
                            onClick={() => handleDeleteQuest(quest.id)}
                            className="w-14 flex items-center justify-center bg-red-400 text-black border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-red-500"
                            aria-label="Delete Quest"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* INDICATOR DOTS */}
            {quests.length > 1 && (
              <div className="flex justify-center items-center gap-2 mt-2">
                {quests.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => scrollToQuest(idx)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      idx === activeQuestIndex 
                        ? `w-8 ${getAccentClasses('bg')} border border-black` 
                        : 'w-2.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADD / EDIT QUEST MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-md p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-[4px] border-black relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mb-6">
              {showModal === 'add' ? 'New SideQuest' : 'Edit Quest'}
            </h2>
            
            <form onSubmit={handleSaveQuest} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Quest Name</label>
                <input required type="text" placeholder="e.g. Out of town trip" value={questName} onChange={e => setQuestName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Target Date</label>
                   <input required type="date" value={questDate} onChange={e => setQuestDate(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Goal Amount (₱)</label>
                   <input required type="number" step="0.01" placeholder="20000" value={questTargetAmount} onChange={e => setQuestTargetAmount(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              
              {/* IMAGE SEARCH FIELD */}
                            {/* 🟢 NEW: PROMINENT IMAGE SEARCH FIELD */}
                            <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Cover Photo URL (Optional)</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    placeholder="Paste URL or search..." 
                    value={coverPhotoUrl} 
                    onChange={e => setCoverPhotoUrl(e.target.value)} 
                    className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPixabayModal(true)} 
                    className="shrink-0 flex items-center justify-center gap-2 px-4 bg-indigo-200 text-indigo-900 border-[3px] border-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-300 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Search</span>
                  </button>
                </div>
              </div>

              {/* Cover Preview */}
              {coverPhotoUrl && (
                <div className="mt-2 w-full h-32 rounded-xl border-[3px] border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
                  <img src={coverPhotoUrl} alt="Cover preview" className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => setCoverPhotoUrl('')}
                    className="absolute top-2 right-2 p-1.5 bg-red-400 text-black border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}


              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(null)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button type="submit" className={`flex-1 py-3 text-white rounded-xl font-black text-[10px] uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 active:shadow-none transition-all ${getAccentClasses('bg')}`}>
                  {showModal === 'add' ? 'Create Quest' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PIXABAY SEARCH MODAL */}
      {showPixabayModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-[2rem] w-full max-w-2xl p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-[4px] border-black relative max-h-[85vh] flex flex-col">
            <button onClick={() => setShowPixabayModal(false)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors z-10">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight mb-4">Search Cover Photo</h2>
            
            <div className="flex-1 overflow-hidden rounded-xl border-[3px] border-black relative bg-gray-50 dark:bg-gray-800">
              <PixabayImagePicker 
                isOpen={true} 
                onClose={() => setShowPixabayModal(false)}
                onSelect={handleSelectCoverPhoto} 
              />
            </div>



          </div>
        </div>
      )}
    </div>
  );
}
