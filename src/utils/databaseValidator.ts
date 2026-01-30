/**
 * Database Setup Validator
 * 
 * Checks if all required Supabase tables exist
 */

import { supabase } from '../utils/supabaseClient';

export interface TableStatus {
  name: string;
  exists: boolean;
  error?: string;
}

export interface DatabaseStatus {
  allTablesExist: boolean;
  tables: TableStatus[];
}

/**
 * Check if a specific table exists by trying to query it
 */
const checkTableExists = async (tableName: string): Promise<TableStatus> => {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);

    if (error) {
      // Check if error is due to table not existing
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return { name: tableName, exists: false, error: 'Table does not exist' };
      }
      // Other errors (like RLS) mean table exists but there are other issues
      return { name: tableName, exists: true };
    }

    return { name: tableName, exists: true };
  } catch (err) {
    return { name: tableName, exists: false, error: String(err) };
  }
};

/**
 * Check all required tables
 */
export const validateDatabaseSetup = async (): Promise<DatabaseStatus> => {
  const requiredTables = [
    'accounts',
    'billers',
    'installments',
    'savings',
    'transactions',
    'trash',
    'categories',
    'budget_setups'
  ];

  const tableStatuses = await Promise.all(
    requiredTables.map(table => checkTableExists(table))
  );

  const allTablesExist = tableStatuses.every(status => status.exists);

  return {
    allTablesExist,
    tables: tableStatuses
  };
};

/**
 * Get missing tables list
 */
export const getMissingTables = (status: DatabaseStatus): string[] => {
  return status.tables
    .filter(table => !table.exists)
    .map(table => table.name);
};
