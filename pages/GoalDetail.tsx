import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGoal, getGoalItems, addGoalItem } from '@/services/goalsService';
import GoalItem from '@/components/GoalItem';
import AddGoalItemModal from '@/components/modals/AddGoalItemModal';
import { useTheme } from '@/contexts/ThemeContext';
import { Plus, ArrowLeft } from 'lucide-react';

const GoalDetailPage: React.FC = () => {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { getAccentClasses } = useTheme();

  const [goal, setGoal] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

  useEffect(() => {
    if (!goalId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [goalData, itemsData] = await Promise.all([
          getGoal(goalId),
          getGoalItems(goalId)
        ]);
        setGoal(goalData[0]);
        setItems(itemsData || []);
      } catch (err) {
        console.error('Failed to fetch goal details:', err);
        setError('Could not load goal details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [goalId]);

  const handleAddItem = async (item: { name: string; price: number; imageUrl?: string; itemUrl?: string }) => {
    if (goalId) {
      console.log('Inserting goal item with goal_id:', goalId); // <-- Added for debugging
      try {
        const { imageUrl, itemUrl, ...rest } = item;
        const newItem = await addGoalItem({
          ...rest,
          goal_id: goalId,
          image_url: imageUrl,
          item_url: itemUrl,
        });
        setItems([...items, newItem[0]]);
      } catch (err) {
        console.error('Failed to add item:', err);
      }
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><div>Loading goal details...</div></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">{error}</div>;
  }

  if (!goal) {
    return <div className="text-center py-10">Goal not found.</div>;
  }

  return (
    <div className="animate-in fade-in duration-500 pb-12 pt-16 md:pt-12">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">{goal.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{goal.description}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAddItemModalOpen(true)}
          className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] ${getAccentClasses('bg')}`}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Item</span>
        </button>
      </header>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => <GoalItem key={item.id} {...item} />)}
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <h3 className="text-xl font-medium text-gray-900 dark:text-white">No items in this goal yet.</h3>
          <p className="mt-2 text-gray-500">Add your first item to get started!</p>
        </div>
      )}

      {isAddItemModalOpen && (
        <AddGoalItemModal 
          onClose={() => setIsAddItemModalOpen(false)} 
          onAddItem={handleAddItem} 
        />
      )}
    </div>
  );
};

export default GoalDetailPage;
