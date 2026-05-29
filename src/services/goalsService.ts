import { supabase } from '../utils/supabaseClient';

// Helper to get current user ID safely
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

export const getGoals = async () => {
  const { data, error } = await supabase.from('goals').select('*');
  if (error) {
    console.error('Error fetching goals:', error);
    throw new Error(error.message);
  }
  return data;
};

export const addGoal = async (goal: { name: string; description?: string; is_public?: boolean }) => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');
  const { data, error } = await supabase.from('goals').insert([{ ...goal, user_id: userId }]).select();
  if (error) {
    console.error('Full error object from addGoal:', error);
    throw new Error(error.message);
  }
  return data;
};

export const getGoalItems = async (goalId: string) => {
  const { data, error } = await supabase.from('goal_items').select('*').eq('goal_id', goalId);
  if (error) {
    console.error('Error fetching goal items:', error);
    throw new Error(error.message);
  }
  return data;
};

export const addGoalItem = async (item: { goal_id: string; name: string; price: number; image_url?: string; item_url?: string }) => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');
  const { data, error } = await supabase.from('goal_items').insert([{ ...item, user_id: userId }]).select();
  if (error) {
    console.error('Full error object from addGoalItem:', error);
    throw new Error(error.message);
  }
  return data;
};
