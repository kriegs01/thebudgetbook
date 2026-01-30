/**
 * Supabase Demo Page
 * 
 * This page demonstrates basic CRUD operations using the Supabase services.
 * It can be used for testing and learning how to interact with the database.
 */

import React, { useState, useEffect } from 'react';
import {
  getAllAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../src/services/accountsService';
import type { SupabaseAccount } from '../src/types/supabase';

const SupabaseDemo: React.FC = () => {
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');

  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    
    const { data, error } = await getAllAccounts();
    
    if (error) {
      setError('Failed to fetch accounts. Check console for details.');
      console.error('Fetch error:', error);
    } else {
      setAccounts(data || []);
    }
    
    setLoading(false);
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      alert('Please enter an account name');
      return;
    }

    setLoading(true);
    setError(null);

    const newAccount = {
      bank: newAccountName,
      classification: 'Checking',
      balance: 0,
      type: 'Debit',
      credit_limit: null,
      billing_date: null,
      due_date: null,
    };

    const { data, error } = await createAccount(newAccount);

    if (error) {
      setError('Failed to create account. Check console for details.');
      console.error('Create error:', error);
    } else {
      setNewAccountName('');
      fetchAccounts(); // Refresh the list
    }

    setLoading(false);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await deleteAccount(id);

    if (error) {
      setError('Failed to delete account. Check console for details.');
      console.error('Delete error:', error);
    } else {
      fetchAccounts(); // Refresh the list
    }

    setLoading(false);
  };

  const handleUpdateBalance = async (id: string, currentBalance: number) => {
    const newBalance = prompt(`Enter new balance (current: ${currentBalance}):`);
    
    if (newBalance === null) return;

    const balance = parseFloat(newBalance);
    if (isNaN(balance)) {
      alert('Invalid balance amount');
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await updateAccount(id, { balance });

    if (error) {
      setError('Failed to update account. Check console for details.');
      console.error('Update error:', error);
    } else {
      fetchAccounts(); // Refresh the list
    }

    setLoading(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Supabase Integration Demo
        </h1>
        <p className="text-gray-600">
          This page demonstrates CRUD operations with the Supabase database.
          Try creating, updating, and deleting accounts below.
        </p>
      </div>

      {/* Connection Status */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">
          Connection Status
        </h2>
        <p className="text-blue-700">
          {loading ? (
            'Loading...'
          ) : error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            `Connected to Supabase. Found ${accounts.length} account(s).`
          )}
        </p>
      </div>

      {/* Create New Account */}
      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Create New Account
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            placeholder="Enter account name (e.g., Chase Checking)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={handleCreateAccount}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Create
          </button>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Accounts</h2>
        </div>
        
        {loading && accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No accounts found. Create one above to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">
                      {account.bank}
                    </h3>
                    <div className="mt-1 flex gap-4 text-sm text-gray-600">
                      <span>Type: {account.type}</span>
                      <span>Classification: {account.classification}</span>
                      <span className="font-semibold">
                        Balance: ${account.balance.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      ID: {account.id}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateBalance(account.id, account.balance)}
                      disabled={loading}
                      className="px-4 py-2 text-sm bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      Update Balance
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      disabled={loading}
                      className="px-4 py-2 text-sm bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          How to use this demo:
        </h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Create a new account by entering a name and clicking "Create"</li>
          <li>Update an account's balance by clicking "Update Balance"</li>
          <li>Delete an account by clicking "Delete" (will ask for confirmation)</li>
          <li>Check the browser console for detailed logs and error messages</li>
        </ul>
      </div>
    </div>
  );
};

export default SupabaseDemo;
