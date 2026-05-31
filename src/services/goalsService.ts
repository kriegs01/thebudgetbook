import { supabase } from '../utils/supabaseClient';
import { getCachedUser } from '../utils/authCache'; // <-- Use your caching utility

// Helper to get current user ID safely using the cache
const getCurrentUserId = async () => {
  try {
    const user = await getCachedUser();
    return user.id;
  } catch (error) {
    // getCachedUser throws an error if not authenticated
    console.error("Could not get cached user:", error);
    return null;
  }
};

// --- DEFENSIVE UUID VALIDATION ---
// A small utility to validate the UUID format before sending it to the DB.
const isValidUuid = (id: string | null): id is string => {
    if (!id) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
};


export const getGoals = async () => {
  const { data, error } = await supabase.from('goals').select('*');
  if (error) {
    console.error('Error fetching goals:', error);
    throw new Error(error.message);
  }
  return data;
};

export const getGoal = async (goalId: string) => {
  if (!isValidUuid(goalId)) {
    const errorMessage = `[getGoal] Aborting. Invalid Goal ID format: ${goalId}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId);
    
  if (error) {
    console.error('Error fetching goal:', error);
    throw new Error(error.message);
  }
  return data;
};

export const addGoal = async (goal: { name: string; description?: string; is_public?: boolean }) => {
  const userId = await getCurrentUserId();
  
  // --- DEFENSIVE LOGGING & VALIDATION ---
  console.log('[addGoal] Attempting to insert with user_id:', userId);
  if (!isValidUuid(userId)) {
      const errorMessage = `[addGoal] Aborting. Invalid User ID format: ${userId}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
  }

  const { data, error } = await supabase.from('goals').insert([{ ...goal, user_id: userId }]).select();
  
  if (error) {
    // The full error object is logged here, as requested.
    console.error('Full error object from addGoal:', error);
    throw new Error(error.message);
  }
  return data;
};

export const updateGoal = async (id: string, updates: { name?: string; description?: string; is_public?: boolean }) => {
  const userId = await getCurrentUserId();

  if (!isValidUuid(userId) || !isValidUuid(id)) {
      const errorMessage = `[updateGoal] Aborting. Invalid User or Goal ID format. UserID: ${userId}, GoalID: ${id}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
  }

  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select();

  if (error) {
    console.error('Error updating goal:', error);
    throw new Error(error.message);
  }
  return data;
};

export const deleteGoal = async (goalId: string) => {
  const userId = await getCurrentUserId();

  if (!isValidUuid(userId) || !isValidUuid(goalId)) {
    const errorMessage = `[deleteGoal] Aborting. Invalid User or Goal ID format. UserID: ${userId}, GoalID: ${goalId}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // RLS on the 'goals' table will prevent unauthorized deletion.
  // A 'CASCADE' delete on the foreign key in the database should handle deleting associated goal_items.
  const { data, error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId)
    .select();

  if (error) {
    console.error('Error deleting goal:', error);
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
  // The user_id is not on the goal_items table. 
  // RLS policies will handle security based on the goal_id and the user.
  const { data, error } = await supabase.from('goal_items').insert([item]).select();
  
  if (error) {
    console.error('Full error object from addGoalItem:', error);
    throw new Error(error.message);
  }
  return data;
};
