import React, { useState, useEffect, useCallback, useRef } from 'react';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { getGoals, addGoal, getGoalItems, addGoalItem } from '../src/services/goalsService';
import GoalItem from '../src/components/GoalItem';
import AddGoalItemModal from '../src/components/modals/AddGoalItemModal';
import AddGoalModal from '../src/components/modals/AddGoalModal';
import { useTheme } from '../src/contexts/ThemeContext';
import { Plus, Check, Target } from 'lucide-react';

const PageHeader: React.FC<any> = ({ title, subtitle, icon, actions, backButton }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const [highlightWidth, setHighlightWidth] = useState(0);

  useEffect(() => {
    if (titleContainerRef.current) {
      setHighlightWidth(titleContainerRef.current.offsetWidth);
    }
  }, [title, isMobile]);

  return (
    <header className={`${isMobile ? 'pt-16' : 'pt-12'} flex flex-row items-center justify-between gap-6 mb-4`}>
      <div className="flex flex-1 items-center gap-6">
        {backButton}
        <div className="flex-1">
          <div className="relative inline-block">
            <div ref={titleContainerRef} className="flex items-center gap-4">
              {icon && <div className="z-10 shrink-0">{icon}</div>}
              <h1 className={`font-titan text-[clamp(2rem,7.5vw,3.75rem)] uppercase tracking-tighter leading-none relative z-10 [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${icon ? getAccentClasses('text') : 'text-black dark:text-white'}`}>
                {title}
              </h1>
            </div>
            {highlightWidth > 0 && (
              <div
                className={`absolute bottom-0 left-0 h-4 ${getAccentClasses('bg')} opacity-40 -z-0 -rotate-1 -translate-x-2 transition-colors duration-300`}
                style={{ width: `${highlightWidth}px` }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 ml-1">
            <p className="text-[clamp(1rem,3vw,1.25rem)] font-bold italic text-black/50 dark:text-gray-400 transition-colors duration-300">
              {subtitle}
            </p>
          </div>
          <div className={`h-2 w-32 mt-2 bg-black dark:bg-white/20 transition-colors duration-300`} />
        </div>
      </div>
      {actions && <div className="flex items-center justify-end gap-3">{actions}</div>}
    </header>
  );
};

const GoalsPage: React.FC = () => {
  const [goals, setGoals] = useState<any[]>([]);
  const [goalItems, setGoalItems] = useState<any[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [isAddGoalModalOpen, setIsAddGoalModalOpen] = useState(false);
  const [isAddGoalItemModalOpen, setIsAddGoalItemModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getAccentClasses } = useTheme();

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedGoals = await getGoals();
      setGoals(fetchedGoals || []);
    } catch (err) { 
      setError('Failed to fetch goals.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGoalItems = async (goalId: string) => {
    try {
      const items = await getGoalItems(goalId);
      setGoalItems(items || []);
    } catch (err) {
      console.error('Failed to fetch goal items:', err);
    }
  };

  const handleAddGoal = async (goal: { name: string; description?: string; is_public?: boolean }) => {
    try {
      const newGoal = await addGoal(goal);
      setGoals([...goals, newGoal[0]]);
    } catch (err) {
        console.error('Failed to add goal:', err);
    }
  };

  const handleAddGoalItem = async (item: { name: string; price: number; imageUrl?: string; itemUrl?: string }) => {
    if (selectedGoal) {
      try {
        const newGoalItem = await addGoalItem({ ...item, goal_id: selectedGoal.id });
        setGoalItems([...goalItems, newGoalItem[0]]);
      } catch (err) {
          console.error('Failed to add goal item:', err);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <PageHeader title="Goals" subtitle="Your aspirations, within reach" icon={<div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}><Target className="w-7 h-7" /></div>} actions={<button onClick={() => setIsAddGoalModalOpen(true)} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] ${getAccentClasses('bg')}`}><Plus className="w-4 h-4" /><span className="hidden sm:inline">Add Goal</span></button>} />

      {goals.map((goal) => (
        <div key={goal.id} onClick={() => { setSelectedGoal(goal); fetchGoalItems(goal.id); }}>
          <h2>{goal.name}</h2>
          <p>{goal.description}</p>
        </div>
      ))}

      {selectedGoal && (
        <div>
          <h2>{selectedGoal.name} Items</h2>
          <button onClick={() => setIsAddGoalItemModalOpen(true)}>Add Item</button>
          {goalItems.map((item) => (
            <GoalItem key={item.id} {...item} />
          ))}
        </div>
      )}

      {isAddGoalModalOpen && (
        <AddGoalModal
          onClose={() => setIsAddGoalModalOpen(false)}
          onAddGoal={handleAddGoal}
        />
      )}

      {isAddGoalItemModalOpen && (
        <AddGoalItemModal
          onClose={() => setIsAddGoalItemModalOpen(false)}
          onAddItem={handleAddGoalItem}
        />
      )}
    </div>
  );
};

export default GoalsPage;
