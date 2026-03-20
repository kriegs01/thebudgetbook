import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Globe, Bell, Lock, Trash2, AlertTriangle, RotateCcw, Plus, X, Database, Copy, Shield, User, Mail, Key, MoreVertical, Check } from 'lucide-react';
import { BudgetCategory, Biller, Installment } from '../types';
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
  billers?: Biller[];
  installments?: Installment[];
  onUpdateBiller?: (biller: Biller) => Promise<void>;
}

const SETTING_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert { month: 'March', year: '2026' } → Date(2026, 2, 1) */
const billerDeactivationToDate = (d: { month: string; year: string } | undefined): Date | null => {
  if (!d) return null;
  const mi = SETTING_MONTHS.indexOf(d.month);
  const yr = parseInt(d.year, 10);
  if (mi < 0 || isNaN(yr)) return null;
  return new Date(yr, mi, 1);
};

/**
 * Parse an ISO lifecycle date string ("YYYY-MM-DD") as local-time month start.
 * Avoids UTC/local timezone mismatch: `new Date('2026-03-01')` is UTC midnight,
 * which in UTC+ timezones is the previous calendar day.
 */
const parseIsoAsLocal = (iso: string): Date => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1);
};

/** Format a 0-based monthIndex + year as "March 2026" */
const formatYearMonth = (year: number, monthIndex: number) =>
  `${SETTING_MONTHS[monthIndex]} ${year}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeactivationConflict {
  type: 'biller' | 'installment';
  id: string;
  name: string;
  lastActiveLabel: string; // "No end date" or "Until February 2026"
  biller?: Biller;
}

interface DeleteConflict {
  type: 'biller' | 'installment';
  id: string;
  name: string;
  currentCategory: string;
  reassignable: boolean;
  newCategoryId: string | null;
  biller?: Biller;
}

// ─── Component ───────────────────────────────────────────────────────────────

const Settings: React.FC<SettingsProps> = ({ currency, setCurrency, categories, setCategories, onResetAll, billers = [], installments = [], onUpdateBiller }) => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);

  // ── Category Settings modal state ──────────────────────────────────────────
  const [catSettingsModal, setCatSettingsModal] = useState<{ catId: string; catName: string } | null>(null);
  // Deactivation draft — null means "not set"
  const [catSettingsDraftMonth, setCatSettingsDraftMonth] = useState<number | null>(null);
  const [catSettingsDraftYear, setCatSettingsDraftYear] = useState<number | null>(null);
  // Reactivation draft — null means "not set"
  const [showReactivationPicker, setShowReactivationPicker] = useState(false);
  const [reactDraftMonth, setReactDraftMonth] = useState<number | null>(null);
  const [reactDraftYear, setReactDraftYear] = useState<number | null>(null);
  // Flexi mode
  const [catSettingsDraftFlexi, setCatSettingsDraftFlexi] = useState(true);
  // Subcategories draft (local to modal — only written on Save)
  const [localSubcats, setLocalSubcats] = useState<string[]>([]);
  const [newSubcatInput, setNewSubcatInput] = useState('');
  const [showSubcatSection, setShowSubcatSection] = useState(true);

  // ── Deactivation conflict modal ────────────────────────────────────────────
  const [deactConflictModal, setDeactConflictModal] = useState<{
    catId: string;
    catName: string;
    deactivatedAt: string;      // ISO date to save
    lastActiveLabel: string;    // human-readable last active month
    conflicts: DeactivationConflict[];
  } | null>(null);
  const [deactConflictSaving, setDeactConflictSaving] = useState(false);
  const [deactConflictError, setDeactConflictError] = useState<string | null>(null);
  // Full pending category update — stored when conflicts are found so the conflict modal can apply everything atomically
  const [deactConflictPendingCategory, setDeactConflictPendingCategory] = useState<BudgetCategory | null>(null);

  // ── Delete reassignment modal ──────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<{
    catId: string;
    catName: string;
    conflicts: DeleteConflict[];
  } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Shared confirm modal ───────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Category settings helpers
  // ─────────────────────────────────────────────────────────────────────────

  const openCatSettings = (cat: BudgetCategory) => {
    // Deactivation draft: pre-fill only if the category already has a date
    if (cat.deactivatedAt) {
      const parts = cat.deactivatedAt.split('-');
      setCatSettingsDraftYear(parseInt(parts[0], 10));
      setCatSettingsDraftMonth(parseInt(parts[1], 10));
    } else {
      setCatSettingsDraftMonth(null);
      setCatSettingsDraftYear(null);
    }

    // Reactivation draft: pre-fill only if already set
    if (cat.reactivatedFrom) {
      const parts = cat.reactivatedFrom.split('-');
      setReactDraftYear(parseInt(parts[0], 10));
      setReactDraftMonth(parseInt(parts[1], 10));
    } else {
      setReactDraftMonth(null);
      setReactDraftYear(null);
    }

    setShowReactivationPicker(!!cat.reactivatedFrom);
    setCatSettingsDraftFlexi(cat.flexiMode ?? true);
    setLocalSubcats(cat.subcategories ?? []);
    setNewSubcatInput('');
    setShowSubcatSection(true);
    setCatSettingsModal({ catId: cat.id, catName: cat.name });
  };

  const closeCatSettings = () => {
    setCatSettingsModal(null);
    setDeactConflictError(null);
  };

  /** Build conflicts for a proposed deactivation date */
  const buildDeactivationConflicts = (
    catName: string,
    proposedDeactivationDate: Date
  ): DeactivationConflict[] => {
    const conflicts: DeactivationConflict[] = [];

    // Check billers whose category matches this category
    for (const b of billers) {
      if (b.category !== catName && !b.category.startsWith(`${catName} -`)) continue;
      const endDate = billerDeactivationToDate(b.deactivationDate);
      // Conflict: biller has no end date, OR its end date is >= proposed deactivation
      if (!endDate || endDate >= proposedDeactivationDate) {
        conflicts.push({
          type: 'biller',
          id: b.id,
          name: b.name,
          lastActiveLabel: endDate
            ? `Until ${SETTING_MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`
            : 'No end date',
          biller: b,
        });
      }
    }

    // Check installments whose linked biller is in this category
    for (const inst of installments) {
      if (!inst.billerId) continue;
      const linkedBiller = billers.find(b => b.id === inst.billerId);
      if (!linkedBiller) continue;
      if (linkedBiller.category !== catName && !linkedBiller.category.startsWith(`${catName} -`)) continue;
      // Already covered by biller conflicts above (same biller)
      const already = conflicts.some(c => c.type === 'biller' && c.id === linkedBiller.id);
      if (!already) {
        const endDate = billerDeactivationToDate(linkedBiller.deactivationDate);
        if (!endDate || endDate >= proposedDeactivationDate) {
          conflicts.push({
            type: 'installment',
            id: inst.id,
            name: inst.name,
            lastActiveLabel: endDate
              ? `Until ${SETTING_MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`
              : 'No end date',
          });
        }
      }
    }

    return conflicts;
  };

  /** Save all category settings (subcategories + deactivation + reactivation + flexi).
   *  Runs deactivation conflict check inline — shows conflict modal and returns early if conflicts found. */
  const handleCatSettingsSave = () => {
    if (!catSettingsModal) return;
    const cat = categories.find(c => c.id === catSettingsModal.catId);
    if (!cat) return;

    // Build the full updated category
    const updated: BudgetCategory = { ...cat, subcategories: localSubcats, flexiMode: catSettingsDraftFlexi };

    // 1. Deactivation
    if (catSettingsDraftMonth !== null && catSettingsDraftYear !== null) {
      const isoDate = `${catSettingsDraftYear}-${String(catSettingsDraftMonth).padStart(2, '0')}-01`;
      updated.deactivatedAt = isoDate;
      updated.active = false;

      // Only run conflict check when the deactivation date has changed
      if (isoDate !== cat.deactivatedAt) {
        const proposedDate = new Date(catSettingsDraftYear, catSettingsDraftMonth - 1, 1);
        const conflicts = buildDeactivationConflicts(catSettingsModal.catName, proposedDate);
        if (conflicts.length > 0) {
          const prevMonthDate = new Date(proposedDate.getFullYear(), proposedDate.getMonth() - 1, 1);
          const lastActiveLabel = formatYearMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth());
          setDeactConflictPendingCategory(updated);
          setDeactConflictModal({
            catId: catSettingsModal.catId,
            catName: catSettingsModal.catName,
            deactivatedAt: isoDate,
            lastActiveLabel,
            conflicts,
          });
          closeCatSettings();
          return;
        }
      }
    } else {
      delete updated.deactivatedAt;
      updated.active = true;
    }

    // 2. Reactivation
    if (showReactivationPicker && reactDraftMonth !== null && reactDraftYear !== null) {
      const reactDate = new Date(reactDraftYear, reactDraftMonth - 1, 1);
      const deactDate = updated.deactivatedAt ? parseIsoAsLocal(updated.deactivatedAt) : null;
      if (!deactDate || reactDate > deactDate) {
        updated.reactivatedFrom = `${reactDraftYear}-${String(reactDraftMonth).padStart(2, '0')}-01`;
      }
    } else {
      delete updated.reactivatedFrom;
    }

    setCategories(prev => prev.map(c => c.id === catSettingsModal.catId ? updated : c));
    closeCatSettings();
  };

  /** Align conflicting billers to end on lastActiveMonth, then apply full pending category update */
  const handleAlignAndDeactivate = async () => {
    if (!deactConflictModal || !onUpdateBiller) return;
    setDeactConflictSaving(true);
    setDeactConflictError(null);

    const deactivationDate = parseIsoAsLocal(deactConflictModal.deactivatedAt);
    // Last active month = one month before deactivation
    const lastActive = new Date(deactivationDate.getFullYear(), deactivationDate.getMonth() - 1, 1);
    const lastActiveMon = SETTING_MONTHS[lastActive.getMonth()];
    const lastActiveYr = String(lastActive.getFullYear());

    try {
      for (const conflict of deactConflictModal.conflicts) {
        if (conflict.type === 'biller' && conflict.biller) {
          const updatedBiller: Biller = {
            ...conflict.biller,
            deactivationDate: { month: lastActiveMon, year: lastActiveYr },
          };
          await onUpdateBiller(updatedBiller);
        }
      }
      // Apply the full pending category update (includes subcats, flexi, deactivation, reactivation)
      if (deactConflictPendingCategory) {
        setCategories(prev => prev.map(c =>
          c.id === deactConflictModal.catId ? deactConflictPendingCategory : c
        ));
        setDeactConflictPendingCategory(null);
      }
      setDeactConflictModal(null);
    } catch {
      setDeactConflictError('Some items could not be updated. Please try again.');
    } finally {
      setDeactConflictSaving(false);
    }
  };

  // ─── Delete Category ───────────────────────────────────────────────────────

  const handleDeleteCategory = (catId: string, catName: string) => {
    // Scan billers for references
    const catBillers = billers.filter(
      b => b.category === catName || b.category.startsWith(`${catName} -`)
    );

    if (catBillers.length === 0) {
      // No conflicts — simple confirm
      setConfirmModal({
        show: true,
        title: 'Delete Category',
        message: `Are you sure you want to permanently delete the category "${catName}"?`,
        onConfirm: () => {
          setCategories(prev => prev.filter(c => c.id !== catId));
          setConfirmModal(p => ({ ...p, show: false }));
        },
      });
      return;
    }

    // Build conflict list
    const conflicts: DeleteConflict[] = catBillers.map(b => {
      // Installments linked to Loans category billers are non-reassignable
      const hasInstallment = installments.some(i => i.billerId === b.id);
      const isLoans = catName === 'Loans' || b.category.startsWith('Loans -');
      const reassignable = !isLoans && !hasInstallment;
      return {
        type: 'biller',
        id: b.id,
        name: b.name,
        currentCategory: b.category,
        reassignable,
        newCategoryId: null,
        biller: b,
      };
    });

    // Add orphan installments (no biller match)
    for (const inst of installments) {
      if (!inst.billerId) continue;
      const linkedBiller = billers.find(b => b.id === inst.billerId);
      if (!linkedBiller) continue;
      if (linkedBiller.category !== catName && !linkedBiller.category.startsWith(`${catName} -`)) continue;
      if (conflicts.some(c => c.type === 'installment' && c.id === inst.id)) continue;
      conflicts.push({
        type: 'installment',
        id: inst.id,
        name: inst.name,
        currentCategory: catName,
        reassignable: false,
        newCategoryId: null,
      });
    }

    setDeleteModal({ catId, catName, conflicts });
  };

  const handleDeleteReassignChange = (conflictId: string, newCatId: string) => {
    setDeleteModal(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        conflicts: prev.conflicts.map(c =>
          c.id === conflictId ? { ...c, newCategoryId: newCatId } : c
        ),
      };
    });
  };

  const handleReassignAndDelete = async () => {
    if (!deleteModal || !onUpdateBiller) return;
    setDeleteSaving(true);
    setDeleteError(null);

    try {
      for (const conflict of deleteModal.conflicts) {
        if (!conflict.reassignable || !conflict.newCategoryId || !conflict.biller) continue;
        const targetCat = categories.find(c => c.id === conflict.newCategoryId);
        if (!targetCat) continue;
        const updated: Biller = { ...conflict.biller, category: targetCat.name };
        await onUpdateBiller(updated);
      }
      setCategories(prev => prev.filter(c => c.id !== deleteModal.catId));
      setDeleteModal(null);
    } catch {
      setDeleteError('Some items could not be reassigned. Please try again.');
    } finally {
      setDeleteSaving(false);
    }
  };



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
            <div key={cat.id} className={`p-4 rounded-[2rem] border ${cat.active === false ? 'bg-amber-50/40 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
              {/* Category header: name + badges + three-dot menu */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black text-gray-900 uppercase tracking-widest">{cat.name}</span>
                  {cat.deactivatedAt && (
                    <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Legacy</span>
                  )}
                  {cat.flexiMode === false && (
                    <span className="text-[9px] font-black text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Data Only</span>
                  )}
                </div>
                <button
                  onClick={() => openCatSettings(cat)}
                  className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
                  title="Category settings"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              {/* Compact meta row */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => openCatSettings(cat)}
                  className="text-[10px] font-bold text-gray-400 hover:text-indigo-500 transition-colors"
                >
                  {cat.subcategories.length} subcategor{cat.subcategories.length === 1 ? 'y' : 'ies'}
                </button>
                <span className="text-gray-200">·</span>
                <span className="text-[10px] font-bold text-gray-400">
                  Flexi: {cat.flexiMode === false ? 'Off' : 'On'}
                </span>
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

          {/* Category Settings Modal */}
          {catSettingsModal && (() => {
            const cat = categories.find(c => c.id === catSettingsModal.catId);
            if (!cat) return null;
            const isDeactivated = !!cat.deactivatedAt;
            const hasReactivation = !!cat.reactivatedFrom;
            const currentYear = new Date().getFullYear();
            const years = Array.from({ length: 8 }, (_, i) => currentYear - 1 + i);

            // Compute which reactivation months/years are allowed (strictly after deactivation)
            const deactDate = catSettingsDraftMonth !== null && catSettingsDraftYear !== null
              ? new Date(catSettingsDraftYear, catSettingsDraftMonth - 1, 1)
              : null;
            const reactDate = reactDraftMonth !== null && reactDraftYear !== null
              ? new Date(reactDraftYear, reactDraftMonth - 1, 1)
              : null;
            const reactIsValid = deactDate !== null && reactDate !== null && reactDate > deactDate;

            return (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4" onClick={closeCatSettings}>
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  {/* Modal header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Category Settings</p>
                      <h3 className="text-base font-black text-gray-900 uppercase tracking-widest mt-0.5">{catSettingsModal.catName}</h3>
                    </div>
                    <button onClick={closeCatSettings} className="text-gray-300 hover:text-gray-600 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Subcategories section (collapsible) */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowSubcatSection(p => !p)}
                      className="flex items-center justify-between w-full"
                    >
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategories</p>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showSubcatSection ? 'rotate-180' : ''}`} />
                    </button>

                    {showSubcatSection && (
                      <div className="space-y-2">
                        {/* Existing subcategory chips */}
                        {localSubcats.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {localSubcats.map(sub => (
                              <div key={sub} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full">
                                <span className="text-[10px] font-bold text-gray-600">{sub}</span>
                                <button
                                  type="button"
                                  onClick={() => setLocalSubcats(prev => prev.filter(s => s !== sub))}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {localSubcats.length === 0 && (
                          <p className="text-[10px] text-gray-400 italic">No subcategories yet.</p>
                        )}

                        {/* Add new subcategory */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="New subcategory…"
                            value={newSubcatInput}
                            onChange={e => setNewSubcatInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = newSubcatInput.trim();
                                if (trimmed && !localSubcats.includes(trimmed)) {
                                  setLocalSubcats(prev => [...prev, trimmed]);
                                  setNewSubcatInput('');
                                }
                              }
                            }}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = newSubcatInput.trim();
                              if (trimmed && !localSubcats.includes(trimmed)) {
                                setLocalSubcats(prev => [...prev, trimmed]);
                                setNewSubcatInput('');
                              }
                            }}
                            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Deactivation date picker */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {isDeactivated ? 'Deactivated From' : 'Deactivate From'}
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={catSettingsDraftMonth ?? ''}
                        onChange={e => setCatSettingsDraftMonth(e.target.value === '' ? null : Number(e.target.value))}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="">— Month —</option>
                        {SETTING_MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={catSettingsDraftYear ?? ''}
                        onChange={e => setCatSettingsDraftYear(e.target.value === '' ? null : Number(e.target.value))}
                        className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="">— Year —</option>
                        {years.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[9px] text-gray-400">From this month onwards the category will no longer appear in new budgets.</p>
                    {catSettingsDraftMonth !== null && catSettingsDraftYear !== null && (
                      <button
                        type="button"
                        onClick={() => { setCatSettingsDraftMonth(null); setCatSettingsDraftYear(null); }}
                        className="text-[9px] text-red-400 hover:text-red-600 font-bold uppercase tracking-widest transition-colors"
                      >
                        Remove deactivation
                      </button>
                    )}
                  </div>

                  {/* Reactivation toggle + picker */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowReactivationPicker(p => !p)}
                      className="flex items-center justify-between w-full bg-gray-50 rounded-2xl px-4 py-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Reactivation</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          {hasReactivation && cat.reactivatedFrom
                            ? `Scheduled: ${SETTING_MONTHS[parseInt(cat.reactivatedFrom.split('-')[1], 10) - 1]} ${cat.reactivatedFrom.split('-')[0]}`
                            : showReactivationPicker
                              ? 'Set reactivation date below'
                              : 'Tap to schedule reactivation'}
                        </p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showReactivationPicker ? 'rotate-180' : ''}`} />
                    </button>

                    {showReactivationPicker && (
                      <div className="pl-2 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={reactDraftMonth ?? ''}
                            onChange={e => setReactDraftMonth(e.target.value === '' ? null : Number(e.target.value))}
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-green-400"
                          >
                            <option value="">— Month —</option>
                            {SETTING_MONTHS.map((m, i) => {
                              const candidate = new Date(reactDraftYear ?? new Date().getFullYear(), i, 1);
                              const disabled = deactDate !== null && candidate <= deactDate;
                              return (
                                <option key={m} value={i + 1} disabled={disabled}>{m}{disabled ? ' ✕' : ''}</option>
                              );
                            })}
                          </select>
                          <select
                            value={reactDraftYear ?? ''}
                            onChange={e => setReactDraftYear(e.target.value === '' ? null : Number(e.target.value))}
                            className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-green-400"
                          >
                            <option value="">— Year —</option>
                            {years.map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                        {!reactIsValid && (
                          <p className="text-[9px] text-red-500 font-bold">Reactivation must be after the deactivation month.</p>
                        )}
                        {reactIsValid && (
                          <p className="text-[9px] text-green-600 font-bold">
                            Category will reappear from {SETTING_MONTHS[reactDraftMonth - 1]} {reactDraftYear}.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowReactivationPicker(false); setReactDraftMonth(null); setReactDraftYear(null); }}
                          className="text-[9px] text-gray-400 hover:text-red-500 font-bold uppercase tracking-widest"
                        >
                          Remove reactivation date
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Flexi Mode toggle */}
                  <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                    <div>
                      <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Flexi Mode</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">{catSettingsDraftFlexi ? 'ON — manual items can be added' : 'OFF — data-only, no Add Item'}</p>
                    </div>
                    <button
                      onClick={() => setCatSettingsDraftFlexi(f => !f)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${catSettingsDraftFlexi ? 'bg-indigo-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${catSettingsDraftFlexi ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Save */}
                  <button
                    onClick={handleCatSettingsSave}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                  >
                    Save Settings
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => { closeCatSettings(); handleDeleteCategory(catSettingsModal.catId, catSettingsModal.catName); }}
                    className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Category
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Deactivation Conflicts Modal */}
          {deactConflictModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Deactivation Conflict</p>
                    <h3 className="text-base font-black text-gray-900 mt-0.5">
                      Deactivate "{deactConflictModal.catName}"
                    </h3>
                  </div>
                  <button onClick={() => setDeactConflictModal(null)} className="text-gray-300 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">
                    The following items are still active at or after the proposed deactivation date.
                    To proceed, either cancel and adjust them manually, or use "Align &amp; Deactivate"
                    to automatically set their end date to <strong>{deactConflictModal.lastActiveLabel}</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  {deactConflictModal.conflicts.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-gray-800">{c.name}</p>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider">{c.type}</p>
                      </div>
                      <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full">{c.lastActiveLabel}</span>
                    </div>
                  ))}
                </div>

                {deactConflictError && (
                  <p className="text-xs text-red-600 font-bold">{deactConflictError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setDeactConflictModal(null)}
                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                    disabled={deactConflictSaving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAlignAndDeactivate}
                    disabled={deactConflictSaving || !onUpdateBiller}
                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {deactConflictSaving ? 'Aligning...' : 'Align & Deactivate'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Reassignment Modal */}
          {deleteModal && (() => {
            const reassignableConflicts = deleteModal.conflicts.filter(c => c.reassignable);
            const lockedConflicts = deleteModal.conflicts.filter(c => !c.reassignable);
            const allReassigned = reassignableConflicts.every(c => c.newCategoryId !== null);
            const canDelete = allReassigned && lockedConflicts.length === 0;
            const otherCategories = categories.filter(c => c.id !== deleteModal.catId && c.active !== false);
            return (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Delete Category</p>
                      <h3 className="text-base font-black text-gray-900 mt-0.5">"{deleteModal.catName}"</h3>
                    </div>
                    <button onClick={() => setDeleteModal(null)} className="text-gray-300 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 font-medium">
                      This category still has items assigned to it.
                      Reassignable billers must be moved to another category before deletion.
                      Loans/Installments are locked and must be handled in their own screens.
                    </p>
                  </div>

                  {reassignableConflicts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reassign Billers</p>
                      {reassignableConflicts.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-gray-800 truncate">{c.name}</p>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wider">{c.currentCategory}</p>
                          </div>
                          <select
                            value={c.newCategoryId ?? ''}
                            onChange={e => handleDeleteReassignChange(c.id, e.target.value)}
                            className="bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-red-300 max-w-[140px]"
                          >
                            <option value="">Select…</option>
                            {otherCategories.map(oc => (
                              <option key={oc.id} value={oc.id}>{oc.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {lockedConflicts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Locked Items</p>
                      {lockedConflicts.map(c => (
                        <div key={c.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-2xl px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-gray-800">{c.name}</p>
                            <p className="text-[9px] text-orange-500 uppercase tracking-wider">{c.type} — Locked</p>
                          </div>
                          <span className="text-[9px] font-bold text-orange-500 bg-orange-100 px-2 py-1 rounded-full">Must handle separately</span>
                        </div>
                      ))}
                      <p className="text-[9px] text-orange-500 font-bold">
                        You have {lockedConflicts.length} locked item{lockedConflicts.length > 1 ? 's' : ''}.
                        Close or move them in their own screens before deleting this category.
                      </p>
                    </div>
                  )}

                  {deleteError && (
                    <p className="text-xs text-red-600 font-bold">{deleteError}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteModal(null)}
                      className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                      disabled={deleteSaving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReassignAndDelete}
                      disabled={!canDelete || deleteSaving || !onUpdateBiller}
                      className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
                      title={!canDelete ? (lockedConflicts.length > 0 ? 'Resolve locked items first' : 'Assign all billers to a new category') : undefined}
                    >
                      {deleteSaving ? 'Deleting...' : 'Reassign & Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

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