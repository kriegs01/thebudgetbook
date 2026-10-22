import { supabase } from '../utils/supabaseClient';
import { getCachedUser } from '../utils/authCache';
import { getAccountProfile } from '../utils/creditEngines/accountProfiles';


export const saveCreditStatement = async (payload: {
  account_id: string;
  statement_period: string; // e.g., '2026-10'
  cutoff_date: string;      // '2026-10-15'
  due_date: string;         // '2026-11-05'
  is_locked?: boolean;
}) => {
  try {
    const user = await getCachedUser();
    
    // Inject user_id to match your RLS policies
    const { data, error } = await supabase
      .from('credit_statements')
      .upsert(
        { ...payload, user_id: user.id }, 
        { onConflict: 'account_id, statement_period' }
      )
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[Statements Service] Error saving credit statement:', error);
    return { data: null, error };
  }
};


export const getCreditStatementsByPeriod = async (statementPeriod: string) => {
    try {
      const { data, error } = await supabase
        .from('credit_statements')
        .select('*')
        .eq('statement_period', statementPeriod);
        
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[Statements Service] Error fetching statements:', error);
      return { data: null, error };
    }
  };
  



  export const bulkSyncCreditStatements = async (accounts: any[]) => {
    try {
      // 🟢 THE FIX: Use standard Supabase auth instead of getCachedUser
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
  
      // 1. Grab all credit-like accounts
      const creditAccounts = accounts.filter(a => 
        a.type === 'Credit' || 
        a.classification === 'Credit Card' || 
        a.subtype === 'Loan_Bundle'
      );
  
      if (creditAccounts.length === 0) return;
  

    const statementsToUpsert: any[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth();

    // 2. Loop through all cards
    creditAccounts.forEach(account => {
      // Safely extract billing day
      let billingDay = 1;
      const rawDate = String(account.billingDate || account.billing_date || '1');
      const isoMatch = rawDate.match(/^\d{4}-\d{2}-(\d{2})/);
      if (isoMatch) billingDay = parseInt(isoMatch[1], 10);
      else {
        const match = rawDate.match(/\d+/);
        if (match) billingDay = parseInt(match[0], 10);
      }

      // Safely extract grace days
      let graceDays = 21;
      const rawDueDate = String(account.dueDate || account.due_date || '');
      const isoDueMatch = rawDueDate.match(/^\d{4}-\d{2}-(\d{2})/);
      if (isoDueMatch) graceDays = parseInt(isoDueMatch[1], 10);
      else {
        const match = rawDueDate.match(/\d+/);
        if (match) {
           const parsed = parseInt(match[0], 10);
           graceDays = (parsed > 0 && parsed <= 31) ? parsed : 21;
        }
      }

      const profile = getAccountProfile ? getAccountProfile(account) : null;

      // 3. Generate exactly 3 months of future-proofed statements
      for (let offset = 0; offset < 3; offset++) {
        const targetDate = new Date(currentYear, currentMonthIdx + offset, 1);
        const calcYear = targetDate.getFullYear();
        const calcMonthIdx = targetDate.getMonth();

        // Native JS Calendar Math (Handles 28-day Februaries)
        const cycleStart = new Date(calcYear, calcMonthIdx - 1, billingDay, 0, 0, 0);
        const cycleEnd = new Date(calcYear, calcMonthIdx, billingDay - 1, 23, 59, 59);

        const dueDateObj = new Date(cycleEnd);
        dueDateObj.setDate(dueDateObj.getDate() + graceDays);

        let statementPeriod = '';

        // Safely route naming (handles SPayLater vs Standard bank names)
        if (profile && profile.getStatementName) {
          const { targetMonth, targetYear } = profile.getStatementName(cycleStart, cycleEnd, dueDateObj);
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const mIdx = monthNames.indexOf(targetMonth) + 1;
          statementPeriod = `${targetYear}-${String(mIdx).padStart(2, '0')}`;
        } else {
          statementPeriod = `${calcYear}-${String(calcMonthIdx + 1).padStart(2, '0')}`;
        }

        const cutoffDateStr = cycleEnd.toISOString().split('T')[0];
        const dueDateStr = dueDateObj.toISOString().split('T')[0];

        statementsToUpsert.push({
          account_id: account.id,
          user_id: user.id,
          statement_period: statementPeriod,
          cutoff_date: cutoffDateStr,
          due_date: dueDateStr,
          is_locked: false
        });
      }
    });

    // 4. Batch push ALL cards and ALL months in a single network request
    const { error } = await supabase
      .from('credit_statements')
      .upsert(statementsToUpsert, { onConflict: 'account_id, statement_period' });

    if (error) throw error;
    console.log(`[Bulk Sync] Bam! Stamped ${statementsToUpsert.length} credit statements.`);

  } catch (error) {
    console.error('[Bulk Sync] Error syncing statements:', error);
  }
};
