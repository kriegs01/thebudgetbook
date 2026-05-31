import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useMediaQuery from '@/hooks/useMediaQuery';
import useOnClickOutside from '@/hooks/useOnClickOutside';
import { getGoals, addGoal, updateGoal, deleteGoal } from '@/services/goalsService';
import AddGoalModal from '@/components/modals/AddGoalModal';
import PageHeader from '@/components/PageHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { Plus, Target, MoreVertical, Edit, Trash2, Eye } from 'lucide-react';

const GoalsPage: React.FC = () => {
  const [goals, setGoals] = useState<any[]>([]);
  const [goalToEdit, setGoalToEdit] = useState<any | null>(null);
  const [isAddGoalModalOpen, setIsAddGoalModalOpen] = useState(false);
  const [openMenuGoalId, setOpenMenuGoalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { getAccentClasses } = useTheme();
  const menuRef = useRef(null);
  useOnClickOutside(menuRef, () => setOpenMenuGoalId(null));

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

  const handleSaveGoal = async (goalData: { name: string; description?: string; is_public?: boolean }) => {
    try {
      if (goalToEdit) {
        const updated = await updateGoal(goalToEdit.id, goalData);
        setGoals(goals.map(g => (g.id === goalToEdit.id ? updated[0] : g)));
      } else {
        const newGoal = await addGoal(goalData);
        setGoals([...goals, newGoal[0]]);
      }
    } catch (err) {
      console.error('Failed to save goal:', err);
      setError('Failed to save goal.');
    } finally {
      setIsAddGoalModalOpen(false);
      setGoalToEdit(null);
    }
  };
  
  const handleEditClick = (goal: any) => {
    setGoalToEdit(goal);
    setIsAddGoalModalOpen(true);
    setOpenMenuGoalId(null);
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!window.confirm('Are you sure you want to delete this goal and all its items?')) return;
    try {
        await deleteGoal(goalId);
        setGoals(goals.filter(g => g.id !== goalId));
    } catch (err) {
        console.error('Failed to delete goal:', err);
        setError('Failed to delete goal. Please try again.');
    }
    setOpenMenuGoalId(null);
  };

  const handleViewClick = (goalId: string) => {
    navigate(`/goal/${goalId}`);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      <PageHeader 
        title="Goals" 
        subtitle="Your aspirations, within reach" 
        icon={<div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}><Target className="w-7 h-7" /></div>} 
        actions={
          <button 
            onClick={() => { setGoalToEdit(null); setIsAddGoalModalOpen(true); }} 
            className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] ${getAccentClasses('bg')}`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Goal</span>
          </button>
        } 
      />

      {goals.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No goals created</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new goal.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <div key={goal.id} className="bg-white dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl p-5 transition-all duration-300 border-2 border-black/5 dark:border-white/10 shadow-md hover:shadow-xl hover:scale-[1.02] flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white pr-4">{goal.name}</h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 h-10 line-clamp-2">{goal.description || 'No description.'}</p>
                    </div>
                    <div className="relative" ref={openMenuGoalId === goal.id ? menuRef : null}>
                        <button onClick={() => setOpenMenuGoalId(openMenuGoalId === goal.id ? null : goal.id)} className="p-2 rounded-full transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">
                            <MoreVertical size={20} />
                        </button>
                        {openMenuGoalId === goal.id && (
                            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 animate-in fade-in zoom-in-95">
                                <ul className="py-1">
                                    <li><button onClick={() => handleEditClick(goal)} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Edit size={16} /><span>Edit</span></button></li>
                                    <li><button onClick={() => handleDeleteGoal(goal.id)} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40"><Trash2 size={16} /><span>Delete</span></button></li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-auto">
                    <button onClick={() => handleViewClick(goal.id)} className={`w-full flex items-center justify-center gap-2 text-white px-4 py-2.5 rounded-lg font-bold text-sm transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] ${getAccentClasses('bg')}`}>
                        <Eye size={16} />
                        <span>View Items</span>
                    </button>
                </div>
            </div>
          ))}
        </div>
      )}

      {isAddGoalModalOpen && (
        <AddGoalModal
          initialData={goalToEdit}
          onClose={() => { setIsAddGoalModalOpen(false); setGoalToEdit(null); }}
          onSave={handleSaveGoal}
        />
      )}
    </div>
  );
};

export default GoalsPage;
