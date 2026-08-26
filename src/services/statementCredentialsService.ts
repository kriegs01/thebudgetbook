import { supabase } from '../utils/supabaseClient'; // Adjust this import path to match your actual Supabase client!

/**
 * Fetches the encrypted password for a specific bank.
 */
export const getStatementCredential = async (bankIdentifier: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('statement_credentials')
      .select('encrypted_password')
      .eq('user_id', user.id)
      .eq('bank_identifier', bankIdentifier)
      .single(); // Grab just the one record

    // PGRST116 is the Supabase error code for "no rows found". 
    // This just means they haven't saved a password for this bank yet!
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return { data: data?.encrypted_password || null, error: null };
  } catch (error) {
    console.error(`Error fetching credential for ${bankIdentifier}:`, error);
    return { data: null, error };
  }
};

/**
 * Saves or updates an encrypted password for a specific bank.
 */
export const saveStatementCredential = async (bankIdentifier: string, encryptedPassword: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // We use 'upsert' so if they change their password later, it just overwrites the old one
    const { data, error } = await supabase
      .from('statement_credentials')
      .upsert({ 
        user_id: user.id,
        bank_identifier: bankIdentifier,
        encrypted_password: encryptedPassword,
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'user_id, bank_identifier' // This matches the UNIQUE constraint we made in SQL
      });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Error saving credential for ${bankIdentifier}:`, error);
    return { data: null, error };
  }
};
