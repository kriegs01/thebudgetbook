/**
 * Migration Utilities
 * 
 * Helper functions to migrate data from localStorage to Supabase
 */

import { createTransaction } from '../src/services/transactionsService';
import { initializeDefaultCategories } from '../src/services/categoriesService';
import { INITIAL_CATEGORIES } from '../constants';

/**
 * Migrate transactions from localStorage to Supabase
 */
export const migrateTransactionsFromLocalStorage = async () => {
  try {
    // Check if migration has already been done
    const migrationDone = localStorage.getItem('transactions_migrated');
    if (migrationDone === 'true') {
      console.log('Transactions already migrated. Skipping...');
      return { success: true, message: 'Transactions already migrated', count: 0 };
    }

    // Get transactions from localStorage
    const transactionsStr = localStorage.getItem('transactions');
    if (!transactionsStr) {
      console.log('No transactions found in localStorage');
      localStorage.setItem('transactions_migrated', 'true');
      return { success: true, message: 'No transactions to migrate', count: 0 };
    }

    let transactions;
    try {
      transactions = JSON.parse(transactionsStr);
    } catch (err) {
      console.error('Failed to parse transactions from localStorage:', err);
      return { success: false, message: 'Failed to parse localStorage data', count: 0 };
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      console.log('No valid transactions found in localStorage');
      localStorage.setItem('transactions_migrated', 'true');
      return { success: true, message: 'No valid transactions to migrate', count: 0 };
    }

    // Migrate each transaction
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const tx of transactions) {
      try {
        // Transform localStorage format to Supabase format
        const supabaseTx = {
          name: tx.name || 'Unnamed Transaction',
          date: tx.date || new Date().toISOString(),
          amount: parseFloat(tx.amount) || 0,
          payment_method_id: tx.paymentMethodId || tx.payment_method_id
        };

        const { error } = await createTransaction(supabaseTx);
        if (error) {
          console.error('Failed to migrate transaction:', error);
          failCount++;
          errors.push(`Transaction "${tx.name}": ${error}`);
        } else {
          successCount++;
        }
      } catch (err) {
        console.error('Error migrating transaction:', err);
        failCount++;
        errors.push(`Transaction "${tx.name}": ${err}`);
      }
    }

    // Mark migration as complete
    localStorage.setItem('transactions_migrated', 'true');

    return {
      success: failCount === 0,
      message: `Migrated ${successCount} transactions (${failCount} failed)`,
      count: successCount,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    console.error('Error during transaction migration:', err);
    return { success: false, message: `Migration failed: ${err}`, count: 0 };
  }
};

/**
 * Migrate default categories to Supabase
 */
export const migrateDefaultCategories = async () => {
  try {
    // Check if migration has already been done
    const migrationDone = localStorage.getItem('categories_migrated');
    if (migrationDone === 'true') {
      console.log('Categories already migrated. Skipping...');
      return { success: true, message: 'Categories already migrated', count: 0 };
    }

    // Prepare categories in the format expected by the service
    const categoriesData = INITIAL_CATEGORIES.map(cat => ({
      name: cat.name,
      subcategories: cat.subcategories
    }));

    // Initialize categories in Supabase
    const { data, error } = await initializeDefaultCategories(categoriesData);

    if (error) {
      console.error('Failed to migrate categories:', error);
      return { success: false, message: `Failed to migrate categories: ${error}`, count: 0 };
    }

    // Count successful migrations
    const successCount = data?.filter(result => result.data && !result.error).length || 0;

    // Mark migration as complete
    localStorage.setItem('categories_migrated', 'true');

    return {
      success: true,
      message: `Migrated ${successCount} categories`,
      count: successCount
    };
  } catch (err) {
    console.error('Error during category migration:', err);
    return { success: false, message: `Migration failed: ${err}`, count: 0 };
  }
};

/**
 * Run all migrations
 */
export const runAllMigrations = async () => {
  console.log('Starting data migration...');

  const results = {
    transactions: await migrateTransactionsFromLocalStorage(),
    categories: await migrateDefaultCategories()
  };

  console.log('Migration complete:', results);
  return results;
};

/**
 * Reset migration flags (for testing purposes)
 */
export const resetMigrationFlags = () => {
  localStorage.removeItem('transactions_migrated');
  localStorage.removeItem('categories_migrated');
  console.log('Migration flags reset');
};
