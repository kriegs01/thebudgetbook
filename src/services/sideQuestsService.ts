import { supabase } from '../utils/supabaseClient';
import type { SideQuest, SideQuestExpense } from '../../types';

// Map Supabase Expense -> UI Expense
const mapExpenseToUI = (dbExpense: any): SideQuestExpense => ({
  id: dbExpense.id,
  questId: dbExpense.quest_id,
  name: dbExpense.name,
  estimatedAmount: dbExpense.estimated_amount,
  actualAmount: dbExpense.actual_amount,
  isPaid: dbExpense.is_paid,
  frontedByBudeeId: dbExpense.fronted_by_budee_id,
});

// Map Supabase Quest -> UI Quest
const mapQuestToUI = (dbQuest: any): SideQuest => ({
  id: dbQuest.id,
  name: dbQuest.name,
  type: dbQuest.type,
  targetDate: dbQuest.target_date,
  targetAmount: dbQuest.target_amount,
  linkedWalletId: dbQuest.linked_wallet_id,
  isCompleted: dbQuest.is_completed,
  isArchived: dbQuest.is_archived,
  budeeIds: dbQuest.budee_ids,
  expenses: (dbQuest.expenses || []).map(mapExpenseToUI),
  coverPhotoUrl: dbQuest.cover_photo_url,
});

// GET ALL
export const getSideQuests = async () => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { data: null, error: new Error('User not authenticated') };

  const { data, error } = await supabase
    .from('side_quests')
    .select(`*, expenses:side_quest_expenses(*)`)
    .eq('user_id', userData.user.id)
    .order('target_date', { ascending: true });

  if (error) return { data: null, error };
  return { data: data.map(mapQuestToUI), error: null };
};

// CREATE QUEST
export const createSideQuest = async (quest: Omit<SideQuest, 'id' | 'expenses'>) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { data: null, error: new Error('User not authenticated') };

  const { data, error } = await supabase
    .from('side_quests')
    .insert({
      user_id: userData.user.id,
      name: quest.name,
      type: quest.type,
      target_date: quest.targetDate,
      target_amount: quest.targetAmount,
      linked_wallet_id: quest.linkedWalletId || null,
      budee_ids: quest.budeeIds || [],
      cover_photo_url: quest.coverPhotoUrl || null,
    })
    .select()
    .single();

  if (error) return { data: null, error };
  return { data: mapQuestToUI({ ...data, expenses: [] }), error: null };
};

// ADD EXPENSE ITEM
export const addSideQuestExpense = async (expense: Omit<SideQuestExpense, 'id'>) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { data: null, error: new Error('User not authenticated') };

  const { data, error } = await supabase
    .from('side_quest_expenses')
    .insert({
      user_id: userData.user.id,
      quest_id: expense.questId,
      name: expense.name,
      estimated_amount: expense.estimatedAmount,
      is_paid: false,
      fronted_by_budee_id: expense.frontedByBudeeId || null
    })
    .select()
    .single();

  if (error) return { data: null, error };
  return { data: mapExpenseToUI(data), error: null };
};
// UPDATE QUEST
export const updateSideQuest = async (id: string, updates: Partial<SideQuest>) => {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.targetDate) payload.target_date = updates.targetDate;
    if (updates.targetAmount) payload.target_amount = updates.targetAmount;
    if (updates.coverPhotoUrl !== undefined) payload.cover_photo_url = updates.coverPhotoUrl;
  
    const { data, error } = await supabase.from('side_quests').update(payload).eq('id', id).select().single();
    if (error) return { data: null, error };
    return { data: mapQuestToUI({ ...data, expenses: [] }), error: null };
  };
  
  // DELETE QUEST
  export const deleteSideQuest = async (id: string) => {
    const { error } = await supabase.from('side_quests').delete().eq('id', id);
    return { error };
  };
  
  export const getSideQuestById = async (id: string) => {
    const { data, error } = await supabase
      .from('side_quests')
      .select('*')
      .eq('id', id)
      .single();
  
    if (error || !data) return { data: null, error };
  
    return {
      data: {
        id: data.id,
        name: data.name, // or title: data.title
        description: data.description,
        targetDate: data.target_date,
        type: data.type,
        coverPhotoUrl: data.cover_photo_url,
        
        // 👇 THIS IS THE MISSING LINK! Make sure this is mapped:
        targetAmount: data.target_amount, 
        
        isCompleted: data.is_completed
      },
      error: null
    };
  };
  
  

// GET QUEST EXPENSES (CHECKLIST)
export const getSideQuestExpenses = async (questId: string) => {
  const { data, error } = await supabase
    .from('side_quest_expenses')
    .select('*')
    .eq('quest_id', questId)
    .order('created_at', { ascending: true });
    
  if (error) return { data: [], error };
  
  const formatted = data.map(item => ({
    id: item.id,
    questId: item.quest_id,
    objectiveId: item.objective_id, // 🟢 NEW: Links to the parent Objective
    name: item.name,
    amount: item.amount,
    isCompleted: item.is_completed,
    benchmarkUrl: item.benchmark_url // 🟢 NEW: Optional link for planning
  }));
  
  return { data: formatted, error: null };
};


// GET OBJECTIVES FOR A QUEST
export const getSideQuestObjectives = async (questId: string) => {
  const { data, error } = await supabase
    .from('side_quest_objectives')
    .select('*')
    .eq('quest_id', questId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error };

  const formatted = data.map(obj => ({
    id: obj.id,
    questId: obj.quest_id,
    name: obj.name,
    targetAmount: obj.target_amount,
    expenses: [] // We'll attach the expenses to this in the UI!
  }));

  return { data: formatted, error: null };
};

// CREATE OBJECTIVE
export const createSideQuestObjective = async (objective: { questId: string, name: string, targetAmount?: number }) => {
  try {
    const { data, error } = await supabase
      .from('side_quest_objectives')
      .insert({
        quest_id: objective.questId,
        name: objective.name,
        target_amount: objective.targetAmount || 0
      })
      .select()
      .single();
      
    if (error) {
      console.error("Supabase API Error (createSideQuestObjective):", error);
      return { data: null, error };
    }
    
    return { 
      data: {
        id: data.id,
        questId: data.quest_id,
        name: data.name,
        targetAmount: data.target_amount,
        expenses: []
      }, 
      error: null 
    };
  } catch (err) {
    console.error("Service Catch Error:", err);
    return { data: null, error: { message: "Service execution failed" } };
  }
};

// CREATE EXPENSE (CHECKLIST ITEM)
export const createSideQuestExpense = async (expense: { questId: string, objectiveId: string, name: string, amount: number, benchmarkUrl?: string }) => {
  const { data, error } = await supabase
    .from('side_quest_expenses')
    .insert({
      quest_id: expense.questId,
      objective_id: expense.objectiveId,
      name: expense.name,
      amount: expense.amount,
      is_completed: false, // Always false by default
      benchmark_url: expense.benchmarkUrl || null
    })
    .select()
    .single();

  if (error) return { data: null, error };

  return {
    data: {
      id: data.id,
      questId: data.quest_id,
      objectiveId: data.objective_id,
      name: data.name,
      amount: data.amount,
      isCompleted: data.is_completed,
      benchmarkUrl: data.benchmark_url
    },
    error: null
  };
};

// --- OBJECTIVE ACTIONS ---

export const updateSideQuestObjective = async (id: string, updates: { name?: string, targetAmount?: number }) => {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.targetAmount !== undefined) payload.target_amount = updates.targetAmount;

  const { data, error } = await supabase
    .from('side_quest_objectives')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
    
  return { data, error };
};

export const deleteSideQuestObjective = async (id: string) => {
  const { error } = await supabase.from('side_quest_objectives').delete().eq('id', id);
  return { error };
};


// --- EXPENSE ACTIONS ---

export const updateSideQuestExpense = async (id: string, updates: { name?: string, amount?: number, benchmarkUrl?: string, isCompleted?: boolean }) => {
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.amount !== undefined) payload.amount = updates.amount;
  if (updates.benchmarkUrl !== undefined) payload.benchmark_url = updates.benchmarkUrl;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;

  const { data, error } = await supabase
    .from('side_quest_expenses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
    
  return { data, error };
};

export const deleteSideQuestExpense = async (id: string) => {
  const { error } = await supabase.from('side_quest_expenses').delete().eq('id', id);
  return { error };
};


