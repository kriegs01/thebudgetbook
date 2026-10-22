import { supabase } from '../utils/supabaseClient'; // adjust path to match your client export

export interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  is_latest: boolean;
  highlights: string[];
  fixes: string[];
  created_at: string;
}

export const fetchChangelogs = async (): Promise<{ data: ChangelogEntry[] | null; error: any }> => {
  const { data, error } = await supabase
    .from('changelogs')
    .select('*')
    .order('release_date', { ascending: false });

  return { data, error };
};
