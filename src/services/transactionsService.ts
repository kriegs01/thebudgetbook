/**
 * Transactions Service
 * 
 * Provides CRUD operations for the transactions table in Supabase.
 * 
 * IMPORTANT: Account Balance Calculation
 * ---------------------------------------
 * Account balances are NOT updated when transactions are created or deleted.
 * Instead, balances are calculated dynamically from the transactions table.
 * 
 * Implementation:
 * - The balance field in the accounts table represents the INITIAL balance
 * - Current balance = initial balance ± all transactions for that account
 * - Use accountBalanceCalculator utility to calculate current balances
 * 
 * Benefits:
 * - No race conditions - balance is calculated, not stored
 * - No partial failure issues - transactions are source of truth
 * - Always consistent - balance is derived from transactions
 * - Easy to audit and recalculate
 */

import { supabase, getTableName } from '../utils/supabaseClient';
import type {
  SupabaseTransaction,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../types/supabase';
import { getCachedUser } from '../utils/authCache';

/**
 * Internal helper to automatically dispatch shared transactions (Loans, Transfers)
 * into the connected Budee's pending inbox.
 */
const syncToBudeeInbox = async (transactionId: string, transaction: any, userId: string) => {
  try {
    const targetName = transaction.borrower_name || transaction.person_name;
    if (!targetName) return;

    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const peopleTable = isTestMode ? 'people_test' : 'people';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    // Lookup local profile to see if they are linked to a real user
    const { data: person } = await supabase
      .from(peopleTable)
      .select('friend_user_id')
      .eq('user_id', userId)
      .eq('name', targetName)
      .single();

    if (person?.friend_user_id) {
      await supabase.from(pendingTable).insert([{
        sender_user_id: userId,
        receiver_user_id: person.friend_user_id,
        amount: transaction.amount,
        transaction_type: transaction.transaction_type || 'payment',
        name: transaction.name,
        source_transaction_id: transactionId,
        status: 'pending'
      }]);
    }
  } catch (e) {
    console.error('Failed to sync to Budee inbox:', e);
  }
};

/**
 * Get all transactions for the current user
 */
export const getAllTransactions = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('id', { ascending: false }); // Secondary sort for deterministic ordering

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return { data: null, error };
  }
};

/**
 * Get a single transaction by ID for the current user
 */
export const getTransactionById = async (id: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return { data: null, error };
  }
};

/**
 * Create a new transaction for the current user
 * Note: Account balances are calculated dynamically from transactions, not updated here
 */
export const createTransaction = async (transaction: CreateTransactionInput) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .insert([{ ...transaction, user_id: user.id }])
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST204' && error.message && error.message.includes('borrower_name')) {
        console.warn('borrower_name column not found in database. Retrying without it...');
        const { borrower_name, ...txWithoutBorrower } = transaction;
        
        const { data: retryData, error: retryError } = await supabase
          .from(getTableName('transactions'))
          .insert([{ ...txWithoutBorrower, user_id: user.id }])
          .select()
          .single();
          
        if (retryError) throw retryError;
        if (retryData) await syncToBudeeInbox(retryData.id, txWithoutBorrower, user.id);
        return { data: retryData, error: null };
      }
      throw error;
    }

    if (data) await syncToBudeeInbox(data.id, transaction, user.id);

    return { data, error: null };
  } catch (error) {
    console.error('Error creating transaction:', error);
    return { data: null, error };
  }
};

/**
 * Checks if there are any past shared transactions that haven't been pushed to the Budee's inbox.
 */
export const getUnsyncedHistoricalTransactionsCount = async () => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const peopleTable = isTestMode ? 'people_test' : 'people';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    // 1. Get all locally linked profiles
    const { data: people } = await supabase
      .from(peopleTable)
      .select('name, friend_user_id')
      .eq('user_id', user.id)
      .not('friend_user_id', 'is', null);

    if (!people || people.length === 0) return { count: 0, error: null };

    // 2. Fetch all user transactions to filter locally
    const { data: allTxs } = await supabase.from(getTableName('transactions')).select('*').eq('user_id', user.id);
    if (!allTxs || allTxs.length === 0) return { count: 0, error: null };

    // 3. Find missing ones
    const { data: existingPending } = await supabase.from(pendingTable).select('source_transaction_id').eq('sender_user_id', user.id);
    const existingIds = new Set(existingPending?.map(p => p.source_transaction_id) || []);
    const linkedNames = new Map(people.map(p => [p.name, p.friend_user_id]));

    const unsyncedTxs = allTxs.filter(tx => {
      if (existingIds.has(tx.id)) return false;
      if (tx.notes && tx.notes.includes('Received via Budee Sync')) return false;
      if (tx.transaction_type === 'cash_in' && (tx.name.startsWith('Loan from ') || tx.name.startsWith('Transfer from '))) return false;
      if (tx.transaction_type === 'loan' && tx.amount < 0) return false;
      const targetName = tx.borrower_name || (tx as any).person_name;
      return targetName && linkedNames.has(targetName);
    });

    return { count: unsyncedTxs.length, error: null };
  } catch (error) {
    console.error('Error counting historical transactions:', error);
    return { count: 0, error };
  }
};

/**
 * Retrieves the actual list of past shared transactions that haven't been pushed to the Budee's inbox.
 */
export const getUnsyncedHistoricalTransactions = async () => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const peopleTable = isTestMode ? 'people_test' : 'people';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    const { data: people } = await supabase
      .from(peopleTable)
      .select('name, friend_user_id')
      .eq('user_id', user.id)
      .not('friend_user_id', 'is', null);

    if (!people || people.length === 0) return { data: [], count: 0, error: null };

    const { data: allTxs } = await supabase.from(getTableName('transactions')).select('*').eq('user_id', user.id).order('date', { ascending: false });
    if (!allTxs || allTxs.length === 0) return { data: [], count: 0, error: null };

    const { data: existingPending } = await supabase.from(pendingTable).select('source_transaction_id').eq('sender_user_id', user.id);
    const existingIds = new Set(existingPending?.map(p => p.source_transaction_id) || []);
    const linkedNames = new Map(people.map(p => [p.name, p.friend_user_id]));

    const unsyncedTxs = allTxs.filter(tx => {
      if (existingIds.has(tx.id)) return false;
      if (tx.notes && tx.notes.includes('Received via Budee Sync')) return false;
      if (tx.transaction_type === 'cash_in' && (tx.name.startsWith('Loan from ') || tx.name.startsWith('Transfer from '))) return false;
      if (tx.transaction_type === 'loan' && tx.amount < 0) return false;
      const targetName = tx.borrower_name || (tx as any).person_name;
      return targetName && linkedNames.has(targetName);
    }).map(tx => {
      const targetName = tx.borrower_name || (tx as any).person_name;
      return {
         ...tx,
         friend_user_id: linkedNames.get(targetName),
         targetName
      };
    });

    return { data: unsyncedTxs, count: unsyncedTxs.length, error: null };
  } catch (error) {
    console.error('Error getting unsynced historical transactions:', error);
    return { data: [], count: 0, error };
  }
};

/**
 * Syncs only the specific transactions the user selected from the review modal.
 */
export const syncSpecificHistoricalTransactions = async (transactionsToSync: any[]) => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    const toInsert = transactionsToSync.map(tx => ({
      sender_user_id: user.id,
      receiver_user_id: tx.friend_user_id,
      amount: tx.amount,
      transaction_type: tx.transaction_type || 'payment',
      name: tx.name,
      source_transaction_id: tx.id,
      status: 'pending'
    }));

    if (toInsert.length > 0) {
      const { error } = await supabase.from(pendingTable).insert(toInsert);
      if (error) throw error;
    }
    return { count: toInsert.length, error: null };
  } catch (error) {
    console.error('Error syncing specific historical transactions:', error);
    return { count: 0, error };
  }
};

/**
 * Retroactively syncs any past shared transactions into the connected Budee's inbox.
 * Useful for pushing old loans/transfers to a friend after you just linked their profile.
 */
export const syncHistoricalSharedTransactions = async () => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const peopleTable = isTestMode ? 'people_test' : 'people';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    // 1. Get all locally linked profiles
    const { data: people } = await supabase
      .from(peopleTable)
      .select('name, friend_user_id')
      .eq('user_id', user.id)
      .not('friend_user_id', 'is', null);

    if (!people || people.length === 0) return { count: 0, error: null };

    // 2. Fetch all user transactions to filter locally (safest approach)
    const { data: allTxs } = await supabase.from(getTableName('transactions')).select('*').eq('user_id', user.id);
    if (!allTxs || allTxs.length === 0) return { count: 0, error: null };

    // 3. Find missing ones
    const { data: existingPending } = await supabase.from(pendingTable).select('source_transaction_id').eq('sender_user_id', user.id);
    const existingIds = new Set(existingPending?.map(p => p.source_transaction_id) || []);
    const linkedNames = new Map(people.map(p => [p.name, p.friend_user_id]));

    const toInsert = allTxs
      .filter(tx => !existingIds.has(tx.id))
      .map(tx => {
        const targetName = tx.borrower_name || (tx as any).person_name;
        const friendId = targetName ? linkedNames.get(targetName) : null;
        if (!friendId) return null;
        return {
          sender_user_id: user.id,
          receiver_user_id: friendId,
          amount: tx.amount,
          transaction_type: tx.transaction_type || 'payment',
          name: tx.name,
          source_transaction_id: tx.id,
          status: 'pending'
        };
      }).filter(Boolean);

    if (toInsert.length > 0) await supabase.from(pendingTable).insert(toInsert);
    return { count: toInsert.length, error: null };
  } catch (error) {
    console.error('Error syncing historical transactions:', error);
    return { count: 0, error };
  }
};

/**
 * Get pending inbox transactions for the current user
 */
export const getPendingTransactions = async () => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    const { data, error } = await supabase
      .from(pendingTable)
      .select('*')
      .eq('receiver_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Fetch sender profiles so we can display their names/monograms in the Bell dropdown
    if (data && data.length > 0) {
      const senderIds = [...new Set(data.map(tx => tx.sender_user_id))];
      const { data: profiles } = await supabase.from('user_profiles').select('*').in('user_id', senderIds);
      
      return { 
        data: data.map(tx => ({
          ...tx,
          sender_profile: profiles?.find(p => p.user_id === tx.sender_user_id)
        })), 
        error: null 
      };
    }
    
    return { data: [], error: null };
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    return { data: [], error };
  }
};

/**
 * Resolve (accept/decline) a pending inbox transaction
 */
export const resolvePendingTransaction = async (pendingTxId: string, action: 'accept' | 'decline', accountId?: string) => {
  try {
    const user = await getCachedUser();
    const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
    const pendingTable = isTestMode ? 'pending_transactions_test' : 'pending_transactions';

    // 1. Update inbox status
    const { data: pendingTx, error: updateErr } = await supabase.from(pendingTable).update({ status: action === 'accept' ? 'accepted' : 'declined' }).eq('id', pendingTxId).eq('receiver_user_id', user.id).select().single();
    if (updateErr) throw updateErr;

    // 2. If accepted, create mirrored transaction directly (bypassing the sync hook to avoid infinite loops)
    if (action === 'accept' && pendingTx && accountId) {
      const peopleTable = isTestMode ? 'people_test' : 'people';
      const { data: localProfile } = await supabase.from(peopleTable).select('name').eq('user_id', user.id).eq('friend_user_id', pendingTx.sender_user_id).single();
      
      const personName = localProfile?.name || 'Budee User';
      
      let finalType = 'cash_in';
      let finalName = `Transfer from ${personName}`;
      if (pendingTx.transaction_type === 'loan') {
        finalType = 'loan';
        finalName = `Loan from ${personName}`;
      } else if (pendingTx.transaction_type === 'loan_payment') {
        finalType = 'loan_payment';
        finalName = `Payment from ${personName}`;
      }

      const newTx = {
        name: finalName,
        date: new Date().toISOString(),
        amount: -Math.abs(pendingTx.amount), // negative = cash in
        payment_method_id: accountId,
        transaction_type: finalType, 
        person_name: personName,
        borrower_name: (finalType === 'loan' || finalType === 'loan_payment') ? personName : null,
        user_id: user.id,
        notes: 'Received via Budee Sync'
      };

      const txTable = isTestMode ? 'transactions_test' : 'transactions';
      const { error: txErr } = await supabase.from(txTable).insert([newTx]);
      if (txErr) throw txErr;
    }

    return { error: null };
  } catch (error) {
    console.error('Error resolving pending transaction:', error);
    return { error };
  }
};

/**
 * Update an existing transaction
 */
export const updateTransaction = async (id: string, updates: UpdateTransactionInput) => {
  try {
    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST204' && error.message && error.message.includes('borrower_name')) {
        console.warn('borrower_name column not found in database. Retrying without it...');
        const { borrower_name, ...updatesWithoutBorrower } = updates;
        
        const { data: retryData, error: retryError } = await supabase
          .from(getTableName('transactions'))
          .update(updatesWithoutBorrower)
          .eq('id', id)
          .select()
          .single();
          
        if (retryError) throw retryError;
        return { data: retryData, error: null };
      }
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating transaction:', error);
    return { data: null, error };
  }
};

/**
 * Recalculate a payment schedule's amount_paid and status by summing all linked transactions.
 * Must be called after any transaction update that may change the total paid amount for a schedule.
 */
const recalculateScheduleFromTransactions = async (scheduleId: string): Promise<void> => {
  try {
    // Get all transactions for this schedule
    const { data: txs } = await getTransactionsByPaymentSchedule(scheduleId);

    // Fetch the schedule to obtain expected_amount and current state
    const { data: schedule, error: scheduleError } = await supabase
      .from(getTableName('monthly_payment_schedules'))
      .select('id, expected_amount, amount_paid, status')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      console.error('[Transactions] Could not fetch schedule for recalculation:', scheduleId);
      return;
    }

    // Sum all transaction amounts (payment transactions store positive amounts)
    const totalPaid = Math.max(0, (txs || []).reduce((sum, tx) => sum + tx.amount, 0));

    // Determine new status
    let newStatus: 'pending' | 'paid' | 'partial' | 'overdue' = 'pending';
    if (schedule.expected_amount > 0 && totalPaid >= schedule.expected_amount) {
      newStatus = 'paid';
    } else if (totalPaid > 0) {
      newStatus = 'partial';
    }

    // Skip DB write if nothing changed
    if (totalPaid === schedule.amount_paid && newStatus === schedule.status) {
      return;
    }

    await supabase
      .from(getTableName('monthly_payment_schedules'))
      .update({
        amount_paid: totalPaid,
        status: newStatus,
        ...(totalPaid === 0 ? { date_paid: null, receipt: null, account_id: null } : {}),
      })
      .eq('id', scheduleId);

    console.log('[Transactions] Payment schedule recalculated from transactions:', {
      scheduleId,
      totalPaid,
      newStatus,
    });
  } catch (error) {
    console.error('[Transactions] Error recalculating schedule:', error);
  }
};

/**
 * Update a transaction and resync the linked payment schedule status.
 * Use this instead of updateTransaction when the transaction might be linked to a payment
 * schedule (e.g. installment or biller payments), so that editing the amount correctly
 * recalculates the schedule's amount_paid and status (partial/paid/pending).
 */
export const updateTransactionAndSyncSchedule = async (id: string, updates: UpdateTransactionInput) => {
  // Fetch the current transaction to discover its payment_schedule_id
  const { data: currentTx, error: fetchError } = await getTransactionById(id);
  if (fetchError || !currentTx) {
    return { data: null, error: fetchError || new Error('Transaction not found') };
  }

  // Perform the standard update
  const result = await updateTransaction(id, updates);
  if (result.error) {
    return result;
  }

  // Recalculate the linked schedule if one exists
  if (currentTx.payment_schedule_id) {
    await recalculateScheduleFromTransactions(currentTx.payment_schedule_id);
  }

  return result;
};

/**
 * Delete a transaction
 */
export const deleteTransaction = async (id: string) => {
  try {
    const { error } = await supabase
      .from(getTableName('transactions'))
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return { error };
  }
};

/**
 * Get transactions by payment method for the current user
 */
export const getTransactionsByPaymentMethod = async (paymentMethodId: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_method_id', paymentMethodId)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by payment method:', error);
    return { data: null, error };
  }
};

/**
 * Get transactions within a date range for the current user
 */
export const getTransactionsByDateRange = async (startDate: string, endDate: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by date range:', error);
    return { data: null, error };
  }
};

/**
 * Get transaction total for a specific period for the current user
 */
export const getTransactionTotal = async (startDate?: string, endDate?: string) => {
  try {
    const user = await getCachedUser();

    let query = supabase.from(getTableName('transactions')).select('amount')
      .eq('user_id', user.id);
    
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    const total = data?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    return { data: total, error: null };
  } catch (error) {
    console.error('Error calculating transaction total:', error);
    return { data: null, error };
  }
};

/**
 * Create a transaction for a payment schedule payment for the current user
 * This links the transaction to a payment schedule
 * Note: Account balances are calculated dynamically from transactions, not updated here
 */
export const createPaymentScheduleTransaction = async (
  scheduleId: string,
  transaction: {
    name: string;
    date: string;
    amount: number;
    paymentMethodId: string;
  }
) => {
  try {
    const user = await getCachedUser();

    // Create the transaction with payment_schedule_id
    const transactionData: CreateTransactionInput = {
      name: transaction.name,
      date: transaction.date,
      amount: transaction.amount,
      payment_method_id: transaction.paymentMethodId,
      payment_schedule_id: scheduleId,
    };

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .insert([{ ...transactionData, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    
    console.log('[Transactions] Created payment schedule transaction:', {
      transactionId: data.id,
      scheduleId,
      amount: transaction.amount,
    });

    return { data, error: null };
  } catch (error) {
    console.error('Error creating payment schedule transaction:', error);
    return { data: null, error };
  }
};

/**
 * Get transactions for a specific payment schedule for the current user
 */
export const getTransactionsByPaymentSchedule = async (scheduleId: string) => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_schedule_id', scheduleId)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching transactions by payment schedule:', error);
    return { data: null, error };
  }
};

/**
 * Delete a transaction and revert payment schedule status if linked.
 * Deletes the transaction first, then recalculates the schedule by re-summing all
 * remaining linked transactions. This is more reliable than delta subtraction because
 * it is immune to stale amount_paid values caused by edits, double-counting, or any
 * other prior inconsistency.
 * Note: Account balances are calculated dynamically from transactions, so no balance reversion needed.
 */
export const deleteTransactionAndRevertSchedule = async (transactionId: string) => {
  try {
    // Fetch the transaction first to capture its payment_schedule_id
    const { data: transaction, error: fetchError } = await getTransactionById(transactionId);
    
    if (fetchError || !transaction) {
      throw new Error('Transaction not found');
    }

    const scheduleId = transaction.payment_schedule_id;
    const user = await getCachedUser();

    // If this transaction has a linked credit_payment counterpart, delete it first.
    // The credit_payment row stores `related_transaction_id = transactionId` so we can
    // find it with a simple query and remove it before the primary transaction is gone.
    const { data: counterparts } = await supabase
      .from(getTableName('transactions'))
      .select('id')
      .eq('related_transaction_id', transactionId)
      .eq('transaction_type', 'credit_payment')
      .eq('user_id', user.id);

    if (counterparts && counterparts.length > 0) {
      for (const cp of counterparts) {
        const { error: cpDeleteError } = await deleteTransaction(cp.id);
        if (cpDeleteError) {
          console.error('[Transactions] Failed to delete credit_payment counterpart:', cp.id, cpDeleteError);
        } else {
          console.log('[Transactions] Deleted credit_payment counterpart:', cp.id);
        }
      }
    }

    // Delete the transaction
    const { error: deleteError } = await deleteTransaction(transactionId);
    if (deleteError) throw deleteError;

    console.log('[Transactions] Transaction deleted successfully:', transactionId);

    // Recalculate the linked payment schedule from all remaining transactions.
    // By re-summing after deletion we always get a correct amount_paid / status,
    // regardless of any prior drift between the stored amount_paid and actual transactions.
    if (scheduleId) {
      await recalculateScheduleFromTransactions(scheduleId);
    }

    return { error: null };
  } catch (error) {
    console.error('Error deleting transaction and reverting schedule:', error);
    return { error };
  }
};

/**
 * Create a transfer between two accounts
 * Creates two linked transactions: positive on source (out), negative on destination (in)
 * Note: user_id must be set on both rows to satisfy Supabase Row Level Security (RLS) policies.
 * RLS requires auth.uid() to match the user_id column on every insert.
 */
export const createTransfer = async (
  sourceAccountId: string,
  destinationAccountId: string,
  amount: number,
  date: string,
  feeAmount: number = 0
) => {
  try {
    // Fetch the current authenticated user — required for RLS compliance on insert
    const user = await getCachedUser();

    // Create the outgoing transaction (positive - money leaving)
    const { data: outgoingTx, error: outgoingError } = await supabase
      .from(getTableName('transactions'))
      .insert([{
        name: 'Transfer Out',
        date,
        amount: Math.abs(amount), // Positive for source account (money out)
        payment_method_id: sourceAccountId,
        transaction_type: 'transfer',
        notes: `Transfer to another account`,
        user_id: user.id // Required by RLS policy
      }])
      .select()
      .single();

    if (outgoingError) throw outgoingError;

    // Create the incoming transaction (negative - money arriving)
    const { data: incomingTx, error: incomingError } = await supabase
      .from(getTableName('transactions'))
      .insert([{
        name: 'Transfer In',
        date,
        amount: -Math.abs(amount), // Negative for receiving account (money in)
        payment_method_id: destinationAccountId,
        transaction_type: 'transfer',
        notes: `Transfer from another account`,
        related_transaction_id: outgoingTx.id,
        user_id: user.id // Required by RLS policy
      }])
      .select()
      .single();

    if (incomingError) throw incomingError;

    // Link the outgoing transaction to the incoming one
    await supabase
      .from(getTableName('transactions'))
      .update({ related_transaction_id: incomingTx.id })
      .eq('id', outgoingTx.id);

    // Create the fee transaction if a fee was provided
    let feeTx = null;
    if (feeAmount > 0) {
      const { data: feeData, error: feeError } = await supabase
        .from(getTableName('transactions'))
        .insert([{
          name: 'Transfer Fee',
          date,
          amount: Math.abs(feeAmount), // Positive because money is leaving (expense)
          payment_method_id: sourceAccountId,
          transaction_type: 'payment', // Logged as a standard expense
          notes: `Bank fee for transfer`,
          related_transaction_id: outgoingTx.id, // Group it with the transfer
          user_id: user.id
        }])
        .select()
        .single();
        
      if (feeError) throw feeError;
      feeTx = feeData;
    }

    return { data: { outgoing: outgoingTx, incoming: incomingTx, fee: feeTx }, error: null };
  } catch (error) {
    console.error('Error creating transfer:', error);
    return { data: null, error };
  }
};

/**
 * Upload a receipt image to Supabase Storage and return the storage path.
 * Files are stored under {userId}/{transactionId}/{timestamp}.{ext} in the
 * "transaction-receipts" bucket. The path (not the full URL) is returned so
 * that signed URLs can be generated at display time regardless of bucket visibility.
 */
export const uploadTransactionReceipt = async (
  transactionId: string,
  file: File
): Promise<{ path: string | null; error: unknown }> => {
  try {
    const user = await getCachedUser();
    const rawExt = (file.name.split('.').pop() ?? '').toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
    const ext = allowedExtensions.includes(rawExt) ? rawExt : 'jpg';
    const path = `${user.id}/${transactionId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('transaction-receipts')
      .upload(path, file, { upsert: true });

    if (uploadError) throw uploadError;

    return { path, error: null };
  } catch (error) {
    console.error('Error uploading receipt:', error);
    return { path: null, error };
  }
};

/**
 * Create a short-lived signed URL for displaying a stored receipt.
 * Accepts either a storage path ("userId/txId/ts.jpg") or a legacy full
 * public URL (https://...supabase.co/.../transaction-receipts/...).
 * Signed URLs work regardless of whether the bucket is public or private.
 */
export const getReceiptSignedUrl = async (
  receiptValue: string
): Promise<string | null> => {
  try {
    // If the stored value is a full URL, extract the path after the bucket name
    const marker = '/transaction-receipts/';
    const idx = receiptValue.indexOf(marker);
    const path = idx >= 0 ? receiptValue.slice(idx + marker.length) : receiptValue;

    const { data, error } = await supabase.storage
      .from('transaction-receipts')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Error creating receipt signed URL:', error);
    return null;
  }
};

/**
 * Batch delete transactions, reverting payment schedule status for each.
 * Iterates sequentially so that every deletion's schedule-reversion logic is preserved.
 * Returns an array of per-ID errors for any that failed.
 */
export const batchDeleteTransactions = async (
  ids: string[]
): Promise<{ errors: { id: string; error: unknown }[] }> => {
  const errors: { id: string; error: unknown }[] = [];
  for (const id of ids) {
    const { error } = await deleteTransactionAndRevertSchedule(id);
    if (error) errors.push({ id, error });
  }
  return { errors };
};

/**
 * Get loan transactions with their payment history for the current user
 */
export const getLoanTransactionsWithPayments = async (accountId: string) => {
  try {
    const user = await getCachedUser();

    // Get all loan transactions for this account
    const { data: loans, error: loansError } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_method_id', accountId)
      .eq('transaction_type', 'loan')
      .order('date', { ascending: false });

    if (loansError) throw loansError;

    // Early return if no loans
    if (!loans || loans.length === 0) {
      return { data: [], error: null };
    }

    // Batch-fetch ALL payments for all loans in a single query (avoids N+1)
    const loanIds = loans.map(l => l.id);
    const { data: allPayments, error: paymentsError } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .in('related_transaction_id', loanIds)
      .eq('transaction_type', 'loan_payment')
      .order('date', { ascending: true });

    if (paymentsError) {
      console.error('Error fetching loan payments:', paymentsError);
    }

    // Group payments by their parent loan id
    const paymentsByLoanId = new Map<string, any[]>();
    for (const payment of (allPayments || [])) {
      if (payment.related_transaction_id) {
        const existing = paymentsByLoanId.get(payment.related_transaction_id);
        if (existing) {
          existing.push(payment);
        } else {
          paymentsByLoanId.set(payment.related_transaction_id, [payment]);
        }
      }
    }

    const loansWithPayments = loans.map(loan => {
      const payments = paymentsByLoanId.get(loan.id) || [];
      // Loan payments are stored as negative amounts (they increase balance)
      // Use Math.abs to get the actual payment amount
      const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
      const remainingBalance = Math.abs(loan.amount) - totalPaid;
      return { ...loan, payments, totalPaid, remainingBalance };
    });

    return { data: loansWithPayments, error: null };
  } catch (error) {
    console.error('Error fetching loan transactions:', error);
    return { data: null, error };
  }
};

/**
 * Get all stash top-up transactions for the current user.
 * These are transactions that have wallet_id set (IS NOT NULL).
 * Used by the Stash section in Budget Setup to show funded/remaining per wallet per month.
 */
export const getAllStashTransactions = async () => {
  try {
    const user = await getCachedUser();

    const { data, error } = await supabase
      .from(getTableName('transactions'))
      .select('*')
      .eq('user_id', user.id)
      .not('wallet_id', 'is', null)
      .order('date', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching stash transactions:', error);
    return { data: null, error };
  }
};
