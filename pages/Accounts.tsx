import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Account, ViewMode, AccountClassification } from '../types';
import {
  Plus,
  Landmark,
  CreditCard,
  MoreVertical,
  TrendingUp,
  Trash2,
  AlertTriangle,
  Power,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface AccountsProps {
  accounts: Account[];
  onAdd: (a: Account) => void;
  onDelete?: (id: string) => void;
  onEdit?: (a: Account) => void;
  onDeactivate?: (id: string, when: { month: number; year: number } | 'now') => void;
}

const monthNames = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

const Accounts: React.FC<AccountsProps> = ({ accounts, onAdd, onDelete, onEdit, onDeactivate }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const [formData, setFormData] = useState({
    bank: '',
    classification: 'Checking' as AccountClassification,
    balance: '',
    type: 'Debit' as 'Debit' | 'Credit',
    creditLimit: '',
    billingDate: '',
    dueDate: ''
  });

  // menu open state per-account (id or null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  
  // collapsible sections state
  const [isDebitOpen, setIsDebitOpen] = useState(true);
  const [isCreditOpen, setIsCreditOpen] = useState(true);

  // deactivate dialog state
  const [deactivateState, setDeactivateState] = useState<{
    show: boolean;
    accountId?: string | null;
    month: number;
    year: number;
  }>({
    show: false,
    accountId: null,
    month: 0,
    year: 0
  });

  useEffect(() => {
    const now = new Date();
    const nextMonthIndex = (now.getMonth() + 1) % 12; // 0-11
    const defaultYear = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0);
    setDeactivateState(s => ({ ...s, month: nextMonthIndex, year: defaultYear }));
  }, []);

  // Keep a minimal accounts list (id + bank) in localStorage so the transactions page can build payment method options.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const minimal = accounts.map(a => ({ id: a.id, bank: a.bank }));
      localStorage.setItem('accounts_list', JSON.stringify(minimal));
      // Also write per-account meta for convenience
      minimal.forEach(m => localStorage.setItem(`account_meta_${m.id}`, JSON.stringify({ bank: m.bank })));
    } catch (_) {}
  }, [accounts]);

  const formatCurrency = (val: number | undefined) => {
    const n = val ?? 0;
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  };

  const resetForm = () => {
    setFormData({ bank: '', classification: 'Checking', balance: '', type: 'Debit', creditLimit: '', billingDate: '', dueDate: '' });
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const created: Account = {
      id: editingId ?? '', // Will be replaced by Supabase UUID
      bank: formData.bank,
      classification: formData.classification,
      balance: parseFloat(formData.balance || '0'),
      type: formData.type,
      creditLimit: formData.type === 'Credit' ? (formData.creditLimit ? parseFloat(formData.creditLimit) : 0) : undefined,
      billingDate: formData.type === 'Credit' ? (formData.billingDate || undefined) : undefined,
      dueDate: formData.type === 'Credit' ? (formData.dueDate || undefined) : undefined
    };

    if (editingId) {
      onEdit?.(created);
    } else {
      onAdd(created);
    }

    resetForm();
    setShowModal(false);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingId(acc.id);
    setFormData({
      bank: acc.bank,
      classification: acc.classification,
      balance: String(acc.balance ?? 0),
      type: acc.type,
      creditLimit: acc.creditLimit ? String(acc.creditLimit) : '',
      billingDate: acc.billingDate ?? '',
      dueDate: acc.dueDate ?? ''
    });
    setShowModal(true);
  };

  const handleDeleteTrigger = (id: string, bank: string) => {
    setConfirmModal({
      show: true,
      title: 'Remove Account',
      message: `Are you sure you want to permanently remove the account: "${bank}"? This might affect your recorded balances.`,
      onConfirm: () => {
        onDelete?.(id);
        setConfirmModal(p => ({ ...p, show: false }));
      }
    });
  };

  const openDeactivateDialog = (id: string) => {
    setDeactivateState(s => ({
      ...s,
      show: true,
      accountId: id
    }));
  };

  const confirmDeactivateNow = () => {
    if (!deactivateState.accountId) return;
    onDeactivate?.(deactivateState.accountId, 'now');
    setDeactivateState({ show: false, accountId: null, month: 0, year: 0 });
  };

  const confirmDeactivateScheduled = () => {
    if (!deactivateState.accountId) return;
    onDeactivate?.(deactivateState.accountId, { month: deactivateState.month, year: deactivateState.year });
    setDeactivateState({ show: false, accountId: null, month: 0, year: 0 });
  };

  const renderAccount = (acc: Account) => {
    const isCredit = acc.type === 'Credit';
    const creditLimit = acc.creditLimit ?? 0;
    // If credit limit is 0 or undefined, treat progress as 0 to avoid division by zero
    const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((acc.balance / creditLimit) * 100)) : 0;
    const usedPercentSafe = usedPercent < 0 ? 0 : usedPercent;

    return (
      <div key={acc.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all relative group overflow-hidden">
        <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 ${isCredit ? 'bg-purple-500' : 'bg-green-500'}`}></div>
        
        <div className="flex justify-between items-start mb-6">
          <div className={`p-3 rounded-xl ${isCredit ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'}`}>
            {isCredit ? <CreditCard className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
          </div>

          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === acc.id ? null : acc.id); }}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-xl transition-all"
              aria-label="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {openMenuId === acc.id && (
              <div 
                className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openEditModal(acc); }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 text-sm"
                >
                  <span>Edit</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openDeactivateDialog(acc.id); }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 text-sm"
                >
                  <span>Deactivate</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDeleteTrigger(acc.id, acc.bank); }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 text-sm text-red-600"
                >
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">{acc.bank}</h3>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{acc.classification}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-green-100 text-green-700 flex items-center gap-1">
              <Power className="w-3 h-3" />Active
            </span>
          </div>
        </div>

        {/* Credit-specific UI: credit limit + progress bar shown above current balance */}
        {isCredit && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium">Credit Limit</p>
              <p className="text-sm font-semibold text-gray-800">{formatCurrency(creditLimit)}</p>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full ${usedPercentSafe >= 90 ? 'bg-red-500' : 'bg-purple-600'}`}
                style={{ width: `${usedPercentSafe}%`, transition: 'width 300ms ease' }}
                aria-valuenow={usedPercentSafe}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
              />
            </div>

            <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
              <span>Used</span>
              <span className="font-medium">{usedPercentSafe}%</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 font-medium">Balance</p>
            <p className={`text-2xl font-bold text-gray-900`}>{formatCurrency(acc.balance)}</p>
          </div>
        </div>

        {/* Bottom controls: View button placed in lower-right corner */}
        <div className="mt-6 flex items-center justify-between">
          <div />{/* spacer */}
          <div className="flex items-center space-x-2">
            {isCredit && (
              <Link
                to={`/accounts/statement?account=${acc.id}`}
                onClick={(e) => e.stopPropagation()}
                className="bg-purple-100 text-purple-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-purple-200 transition"
                aria-label={`View ${acc.bank} statement`}
              >
                View Statement
              </Link>
            )}
            <Link
              to={`/accounts/view?account=${acc.id}`}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
              aria-label={`View ${acc.bank} transactions`}
            >
              View
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const debitAccounts = accounts.filter(a => a.type === 'Debit');
  const creditAccounts = accounts.filter(a => a.type === 'Credit');

  return (
    <div className="space-y-12 animate-in fade-in duration-500" onClick={() => setOpenMenuId(null)}>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-gray-900 uppercase">ACCOUNTS</h2>
        <div className="flex items-center space-x-4">
          <Link to="/transactions" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200">Transactions</Link>
          <button onClick={openAddModal} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      <section>
        <button 
          onClick={() => setIsDebitOpen(!isDebitOpen)}
          className="flex items-center space-x-2 mb-6 text-gray-700 hover:text-gray-900 font-bold text-lg"
        >
          {isDebitOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          <TrendingUp className="w-5 h-5 text-green-500" />
          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-widest text-sm">Debit & Assets ({debitAccounts.length})</h3>
        </button>
        {isDebitOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {debitAccounts.map(renderAccount)}
          </div>
        )}
      </section>

      <section>
        <button 
          onClick={() => setIsCreditOpen(!isCreditOpen)}
          className="flex items-center space-x-2 mb-6 text-gray-700 hover:text-gray-900 font-bold text-lg"
        >
          {isCreditOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          <CreditCard className="w-5 h-5 text-purple-500" />
          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-widest text-sm">Credit & Liabilities ({creditAccounts.length})</h3>
        </button>
        {isCreditOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {creditAccounts.map(renderAccount)}
          </div>
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
            <div className="bg-gray-900 md:w-1/3 p-8 text-white flex flex-col justify-between">
              <div>
                <Landmark className="w-12 h-12 mb-6 text-indigo-400" />
                <h2 className="text-2xl font-black mb-2 uppercase">{editingId ? 'Edit Account' : 'Connect Account'}</h2>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-8 flex-1 bg-white space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Bank Name</label>
                  <input required type="text" value={formData.bank} onChange={(e) => setFormData({...formData, bank: e.target.value})} className="w-full border border-gray-100 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Type</label>
                  <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as 'Debit' | 'Credit'})} className="w-full border border-gray-100 rounded-lg px-3 py-2">
                    <option value="Debit">Debit</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Classification</label>
                  <select value={formData.classification} onChange={(e) => setFormData({...formData, classification: e.target.value as AccountClassification})} className="w-full border border-gray-100 rounded-lg px-3 py-2">
                    <option>Checking</option>
                    <option>Savings</option>
                    <option>Investment</option>
                    <option>Loan</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Balance</label>
                  <input required type="number" value={formData.balance} onChange={(e) => setFormData({...formData, balance: e.target.value})} className="w-full border border-gray-100 rounded-lg px-3 py-2" />
                </div>
              </div>

              {formData.type === 'Credit' && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Credit Limit</label>
                      <input type="number" value={formData.creditLimit} onChange={(e) => setFormData({...formData, creditLimit: e.target.value})} className="w-full border border-gray-100 rounded-lg px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Billing Date</label>
                      <input type="date" value={formData.billingDate} onChange={(e) => setFormData({...formData, billingDate: e.target.value})} className="w-full border border-gray-100 rounded-lg px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Due Date</label>
                      <input type="date" value={formData.dueDate} onChange={(e) => setFormData({...formData, dueDate: e.target.value})} className="w-full border border-gray-100 rounded-lg px-3 py-2" />
                    </div>
                  </div>
                </>
              )}

              <div className="flex space-x-4 pt-4">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 bg-gray-100 py-4 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700">{editingId ? 'Save Changes' : 'Add Account'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateState.show && (
        <DeactivateDialog
          month={deactivateState.month}
          year={deactivateState.year}
          onChangeMonth={(m) => setDeactivateState(s => ({ ...s, month: m }))}
          onChangeYear={(y) => setDeactivateState(s => ({ ...s, year: y }))}
          onClose={() => setDeactivateState({ show: false, accountId: null, month: 0, year: 0 })}
          onNow={() => confirmDeactivateNow()}
          onSchedule={() => confirmDeactivateScheduled()}
        />
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const DeactivateDialog: React.FC<{
  month: number;
  year: number;
  onChangeMonth: (m: number) => void;
  onChangeYear: (y: number) => void;
  onClose: () => void;
  onNow: () => void;
  onSchedule: () => void;
}> = ({ month, year, onChangeMonth, onChangeYear, onClose, onNow, onSchedule }) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear + i);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95">
        <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">Deactivate Account</h3>
        <p className="text-sm text-gray-500 mb-6 font-medium leading-relaxed">Choose whether to deactivate the account now or schedule deactivation for a later month and year.</p>

        <div className="space-y-4">
          <button onClick={onNow} className="w-full bg-red-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all">
            Deactivate Now
          </button>

          <div className="p-4 border border-gray-100 rounded-xl">
            <p className="text-sm text-gray-600 mb-2 font-medium">Deactivate on</p>
            <div className="flex space-x-2">
              <select value={month} onChange={(e) => onChangeMonth(parseInt(e.target.value, 10))} className="flex-1 border border-gray-100 rounded-lg px-3 py-2">
                {monthNames.map((mName, idx) => <option key={idx} value={idx}>{mName}</option>)}
              </select>
              <select value={year} onChange={(e) => onChangeYear(parseInt(e.target.value, 10))} className="w-28 border border-gray-100 rounded-lg px-3 py-2">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="mt-4">
              <button onClick={onSchedule} className="w-full bg-indigo-600 text-white py-2 rounded-xl font-bold hover:bg-indigo-700">Schedule Deactivation</button>
            </div>
          </div>

          <button onClick={onClose} className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200 transition-all">
            Cancel
          </button>
        </div>
      </div>
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

export default Accounts;
