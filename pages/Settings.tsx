import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Globe, Bell, Lock, Trash2, AlertTriangle, RotateCcw, Plus, X, Database, Copy, Shield, User, Mail, Key } from 'lucide-react';
import { BudgetCategory } from '../types';
import { useTestEnvironment } from '../src/contexts/TestEnvironmentContext';
import { useAuth } from '../src/contexts/AuthContext';
import { supabase } from '../src/utils/supabaseClient';
import { SecuritySettings } from '../src/components/settings/SecuritySettings';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { updateUserEmail, updateUserPassword } from '../src/services/userProfileService';

interface SettingsProps {
  currency: string;
  setCurrency: (c: string) => void;
  categories: BudgetCategory[];
  setCategories: React.Dispatch<React.SetStateAction<BudgetCategory[]>>;
  onResetAll?: () => void;
}

const Settings: React.FC<SettingsProps> = ({ currency, setCurrency, categories, setCategories, onResetAll }) => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const [newSubcatNames, setNewSubcatNames] = useState<{ [id: string]: string }>({});

  // Auth context
  const { userProfile, updateProfile, refreshProfile, user } = useAuth();

  // Account management state
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Test Environment state
  const { isTestMode, setTestMode } = useTestEnvironment();
  const [isCopying, setIsCopying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCategories(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: newCatName.trim(), subcategories: [] }]);
    setNewCatName('');
    setShowAddCat(false);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Category',
      message: `Are you sure you want to permanently delete the category "${name}" and all its sub-links?`,
      onConfirm: () => {
        setCategories(prev => prev.filter(c => c.id !== id));
        setConfirmModal(p => ({ ...p, show: false }));
      }
    });
  };

  const handleAddSubcategory = (catId: string) => {
    const name = newSubcatNames[catId];
    if (!name?.trim()) return;
    setCategories(prev => prev.map(c => 
      c.id === catId ? { ...c, subcategories: [...c.subcategories, name.trim()] } : c
    ));
    setNewSubcatNames(prev => ({ ...prev, [catId]: '' }));
  };

  const handleDeleteSubcategory = (catId: string, subName: string) => {
    setConfirmModal({
      show: true,
      title: 'Remove Subcategory',
      message: `Remove "${subName}" from this category?`,
      onConfirm: () => {
        setCategories(prev => prev.map(c => 
          c.id === catId ? { ...c, subcategories: c.subcategories.filter(s => s !== subName) } : c
        ));
        setConfirmModal(p => ({ ...p, show: false }));
      }
    });
  };

  // Function to copy production data to test tables
  const copyProductionToTest = async () => {
    if (!confirm('This will replace all test data with current production data. Continue?')) {
      return;
    }

    setIsCopying(true);
    try {
      const tables = ['accounts', 'billers', 'installments', 'savings', 'transactions', 'budget_setups', 'monthly_payment_schedules'];
      
      for (const table of tables) {
        // Get all data from production table
        const { data: prodData, error: fetchError } = await supabase
          .from(table)
          .select('*');

        if (fetchError) {
          console.error(`Error fetching ${table}:`, fetchError);
          continue;
        }

        // Clear test table
        const { error: deleteError } = await supabase
          .from(`${table}_test`)
          .delete()
          .gte('created_at', '1970-01-01'); // Delete all records

        if (deleteError) {
          console.error(`Error clearing ${table}_test:`, deleteError);
        }

        // Insert production data into test table
        if (prodData && prodData.length > 0) {
          const { error: insertError } = await supabase
            .from(`${table}_test`)
            .insert(prodData);

          if (insertError) {
            console.error(`Error inserting into ${table}_test:`, insertError);
          }
        }
      }

      alert('Successfully copied production data to test environment!');
    } catch (error) {
      console.error('Error copying data:', error);
      alert('Failed to copy data. Check console for details.');
    } finally {
      setIsCopying(false);
    }
  };

  // Function to clear test data
  const clearTestData = async () => {
    if (!confirm('This will permanently delete all test environment data. Continue?')) {
      return;
    }

    setIsClearing(true);
    try {
      const tables = ['transactions_test', 'savings_test', 'installments_test', 'billers_test', 'budget_setups_test', 'monthly_payment_schedules_test', 'accounts_test'];
      
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .gte('created_at', '1970-01-01'); // Delete all records

        if (error) {
          console.error(`Error clearing ${table}:`, error);
        }
      }

      alert('Test data cleared successfully!');
    } catch (error) {
      console.error('Error clearing test data:', error);
      alert('Failed to clear test data. Check console for details.');
    } finally {
      setIsClearing(false);
    }
  };

  // Account management handlers
  const handleUpdateName = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setUpdateError('First and last name are required');
      return;
    }

    setIsUpdating(true);
    setUpdateError('');
    setUpdateMessage('');

    try {
      const { error } = await updateProfile(editFirstName, editLastName);
      if (error) throw error;

      setUpdateMessage('Name updated successfully!');
      setEditFirstName('');
      setEditLastName('');
      setTimeout(() => setUpdateMessage(''), 3000);
    } catch (error: any) {
      setUpdateError(error.message || 'Failed to update name');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim()) {
      setUpdateError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setUpdateError('Please enter a valid email address');
      return;
    }

    setIsUpdating(true);
    setUpdateError('');
    setUpdateMessage('');

    try {
      const { error } = await updateUserEmail(newEmail);
      if (error) throw error;

      setUpdateMessage('Email update sent! Please check your new email to confirm.');
      setNewEmail('');
      setTimeout(() => setUpdateMessage(''), 5000);
    } catch (error: any) {
      setUpdateError(error.message || 'Failed to update email');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setUpdateError('Please enter and confirm your new password');
      return;
    }

    if (newPassword.length < 6) {
      setUpdateError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setUpdateError('Passwords do not match');
      return;
    }

    setIsUpdating(true);
    setUpdateError('');
    setUpdateMessage('');

    try {
      const { error } = await updateUserPassword(newPassword);
      if (error) throw error;

      setUpdateMessage('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setUpdateMessage(''), 3000);
    } catch (error: any) {
      setUpdateError(error.message || 'Failed to update password');
    } finally {
      setIsUpdating(false);
    }
  };

  const sections = [
    {
      id: 'account',
      label: 'Account',
      icon: <User className="w-5 h-5" />,
      content: (
        <div className="space-y-6 pt-2">
          {/* User Info Display */}
          <div className="flex items-center space-x-4 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
              {userProfile ? 
                `${userProfile.first_name.charAt(0)}${userProfile.last_name.charAt(0)}`.toUpperCase() :
                user?.email?.charAt(0).toUpperCase() || 'U'
              }
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">
                {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'User'}
              </h3>
              <p className="text-sm text-gray-600">{user?.email || ''}</p>
            </div>
          </div>

          {/* Messages */}
          {updateMessage && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-800">{updateMessage}</p>
            </div>
          )}
          {updateError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800">{updateError}</p>
            </div>
          )}

          {/* Update Name */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <User className="w-5 h-5 text-gray-600" />
              <h4 className="text-sm font-bold text-gray-900 uppercase">Update Name</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">First Name</label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder={userProfile?.first_name || 'First Name'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Last Name</label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder={userProfile?.last_name || 'Last Name'}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={handleUpdateName}
              disabled={isUpdating || (!editFirstName && !editLastName)}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isUpdating ? 'Updating...' : 'Update Name'}
            </button>
          </div>

          {/* Update Email */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Mail className="w-5 h-5 text-gray-600" />
              <h4 className="text-sm font-bold text-gray-900 uppercase">Update Email</h4>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">New Email Address</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user?.email || 'new@email.com'}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-2">
                You'll receive a confirmation link at your new email address
              </p>
            </div>

            <button
              onClick={handleUpdateEmail}
              disabled={isUpdating || !newEmail}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isUpdating ? 'Updating...' : 'Update Email'}
            </button>
          </div>

          {/* Update Password */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <Key className="w-5 h-5 text-gray-600" />
              <h4 className="text-sm font-bold text-gray-900 uppercase">Change Password</h4>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <p className="text-xs text-gray-500">
                Password must be at least 6 characters long
              </p>
            </div>

            <button
              onClick={handleUpdatePassword}
              disabled={isUpdating || !newPassword || !confirmPassword}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isUpdating ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>
      )
    },
    { 
      id: 'categories', 
      label: 'Budget Categories', 
      icon: <Hash className="w-5 h-5" />,
      content: (
        <div className="space-y-6 pt-2">
          {categories.map(cat => (
            <div key={cat.id} className="p-4 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-900 uppercase tracking-widest">{cat.name}</span>
                <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {cat.subcategories.map(sub => (
                  <div key={sub} className="flex items-center space-x-2 px-3 py-1 bg-white border border-gray-200 rounded-full group">
                    <span className="text-[10px] font-bold text-gray-600">{sub}</span>
                    <button onClick={() => handleDeleteSubcategory(cat.id, sub)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="New Subcategory..." 
                  value={newSubcatNames[cat.id] || ''} 
                  onChange={(e) => setNewSubcatNames({ ...newSubcatNames, [cat.id]: e.target.value })}
                  className="flex-1 bg-white border border-gray-100 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:ring-1 focus:ring-indigo-200"
                />
                <button 
                  onClick={() => handleAddSubcategory(cat.id)}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {showAddCat ? (
            <form onSubmit={handleAddCategory} className="p-4 border-2 border-dashed border-indigo-200 rounded-[2rem] bg-indigo-50/30 space-y-4 animate-in zoom-in-95">
               <input 
                required
                autoFocus
                type="text" 
                placeholder="Category Name (e.g. Utilities)" 
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full bg-white border-transparent rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex space-x-2">
                <button type="button" onClick={() => setShowAddCat(false)} className="flex-1 bg-white text-gray-500 py-3 rounded-xl font-bold text-xs uppercase">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs uppercase shadow-lg shadow-indigo-100">Add Category</button>
              </div>
            </form>
          ) : (
            <button 
              onClick={() => setShowAddCat(true)}
              className="w-full p-4 border-2 border-dashed border-gray-200 rounded-[2rem] text-gray-400 text-xs font-black uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-500 transition-all flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Category</span>
            </button>
          )}
        </div>
      )
    },
    { 
      id: 'currency', 
      label: 'Currency & Regional', 
      icon: <Globe className="w-5 h-5" />,
      content: (
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Base Currency</label>
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-gray-50 border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="PHP">PHP - Philippine Peso (₱)</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="EUR">EUR - Euro (€)</option>
              <option value="GBP">GBP - British Pound (£)</option>
              <option value="JPY">JPY - Japanese Yen (¥)</option>
            </select>
          </div>
        </div>
      )
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Shield className="w-5 h-5" />,
      content: <SecuritySettings />
    },
    {
      id: 'test-environment',
      label: 'Test Environment',
      icon: <Database className="w-5 h-5" />,
      content: (
        <div className="space-y-6 pt-2">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-900 mb-1">About Test Environment</h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Test mode uses separate database tables (_test suffix) so you can safely experiment 
                  with new features without affecting your production data. Changes in test mode will 
                  not impact your actual financial records.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <div>
              <h4 className="font-black text-sm text-gray-900 uppercase mb-1">Test Mode</h4>
              <p className="text-xs text-gray-500">
                Current Environment: <span className={`font-bold ${isTestMode ? 'text-orange-600' : 'text-green-600'}`}>
                  {isTestMode ? 'TEST' : 'PRODUCTION'}
                </span>
              </p>
            </div>
            <button
              onClick={() => setTestMode(!isTestMode)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                isTestMode ? 'bg-orange-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  isTestMode ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="space-y-3">
            <PinProtectedAction
              featureId="test_environment"
              onVerified={copyProductionToTest}
              actionLabel="Copy Production to Test"
            >
              <button
                onClick={(e) => e.preventDefault()}
                disabled={isCopying}
                className="w-full flex items-center justify-center space-x-3 p-4 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Copy className="w-5 h-5" />
                <span>{isCopying ? 'Copying...' : '🔒 Copy Production to Test'}</span>
              </button>
            </PinProtectedAction>

            <PinProtectedAction
              featureId="test_environment"
              onVerified={clearTestData}
              actionLabel="Clear Test Data"
            >
              <button
                onClick={(e) => e.preventDefault()}
                disabled={isClearing}
                className="w-full flex items-center justify-center space-x-3 p-4 bg-red-600 text-white rounded-2xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Trash2 className="w-5 h-5" />
                <span>{isClearing ? 'Clearing...' : '🔒 Clear Test Data'}</span>
              </button>
            </PinProtectedAction>
          </div>
        </div>
      )
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 pb-20">
      <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-gray-100 flex items-center space-x-8 bg-gray-50/30">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-4xl font-black shadow-2xl">
            JD
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tight">Settings</h2>
            <p className="text-gray-500 font-medium">Personal Financial Profile & App Configuration</p>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {sections.map((section) => (
            <div key={section.id} className="p-4">
              <button 
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-6 rounded-[2rem] hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-6">
                  <div className="p-3.5 bg-gray-100 text-gray-500 rounded-2xl">
                    {section.icon}
                  </div>
                  <span className="font-black text-lg text-gray-700 uppercase tracking-tight">{section.label}</span>
                </div>
                {openSection === section.id ? <ChevronDown className="w-6 h-6 text-gray-400" /> : <ChevronRight className="w-6 h-6 text-gray-400" />}
              </button>
              {openSection === section.id && (
                <div className="px-10 md:px-24 pb-10 animate-in slide-in-from-top-4 duration-300">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-red-50/50 rounded-[3rem] border border-red-100 p-10 space-y-6">
        <div className="flex items-center space-x-4 text-red-600">
          <AlertTriangle className="w-8 h-8" />
          <h3 className="text-xl font-black uppercase tracking-widest">Danger Zone</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2rem] border border-red-100 flex flex-col justify-between">
            <div>
              <h4 className="text-red-700 font-black uppercase text-sm mb-2">Reset All Data</h4>
              <p className="text-red-600/70 text-xs mb-6 font-medium">Wipe all entries on all pages. Your app will return to an empty state.</p>
            </div>
            <PinProtectedAction
              featureId="danger_zone"
              onVerified={onResetAll ? onResetAll : () => console.warn('onResetAll not provided to Settings component')}
              actionLabel="Reset All Data"
            >
              <button 
                onClick={(e) => e.preventDefault()}
                className="flex items-center justify-center space-x-3 w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-100"
              >
                <RotateCcw className="w-5 h-5" />
                <span>🔒 Reset Everything</span>
              </button>
            </PinProtectedAction>
          </div>
        </div>
      </div>

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100">
          Proceed
        </button>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all">
          Cancel
        </button>
      </div>
    </div>
  </div>
);

export default Settings;