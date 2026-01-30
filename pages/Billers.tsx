import React, { useState } from 'react';
import { Biller, Account, PaymentSchedule, BudgetCategory } from '../types';
import { Plus, Calendar, Bell, ChevronDown, ChevronRight, Upload, CheckCircle2, X, ArrowLeft, Power, PowerOff, MoreVertical, Edit2, Eye, Trash2, AlertTriangle } from 'lucide-react';

interface BillersProps {
  billers: Biller[];
  onAdd: (b: Biller) => void;
  accounts: Account[];
  categories: BudgetCategory[];
  onUpdate: (b: Biller) => void;
  onDelete?: (id: string) => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Utility function to calculate timing based on day of month
const calculateTiming = (dayString: string): '1/2' | '2/2' => {
  const day = parseInt(dayString);
  if (isNaN(day) || day < 1 || day > 31) return '1/2';
  return (day >= 1 && day <= 21) ? '1/2' : '2/2';
};

// Utility function to calculate status based on deactivationDate
const calculateStatus = (deactivationDate?: { month: string; year: string }): 'active' | 'inactive' => {
  return deactivationDate ? 'inactive' : 'active';
};

const Billers: React.FC<BillersProps> = ({ billers, onAdd, accounts, categories, onUpdate, onDelete }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Biller | null>(null);
  const [showPayModal, setShowPayModal] = useState<{ biller: Biller, schedule: PaymentSchedule } | null>(null);
  const [detailedBillerId, setDetailedBillerId] = useState<string | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isInactiveOpen, setIsInactiveOpen] = useState(false);
  const [isActiveOpen, setIsActiveOpen] = useState(true);
  const [timingFeedback, setTimingFeedback] = useState<string>('');

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
  
  const [addFormData, setAddFormData] = useState({
    name: '',
    category: categories[0]?.name || '',
    dueDate: '',
    expectedAmount: '',
    actMonth: MONTHS[(new Date().getMonth() + 1) % 12],
    actDay: '',
    actYear: new Date().getFullYear().toString(),
    deactMonth: '',
    deactYear: ''
  });

  const [editFormData, setEditFormData] = useState({
    name: '',
    category: '',
    dueDate: '',
    expectedAmount: '',
    actMonth: '',
    actDay: '',
    actYear: '',
    deactMonth: '',
    deactYear: ''
  });

  const [payFormData, setPayFormData] = useState({
    amount: '',
    receipt: '',
    datePaid: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || ''
  });

  // Helper to show timing feedback when dates change
  const showTimingInfo = (dayString: string) => {
    if (!dayString) {
      setTimingFeedback('');
      return;
    }
    const timing = calculateTiming(dayString);
    const day = parseInt(dayString);
    if (!isNaN(day)) {
      setTimingFeedback(`Timing automatically set to ${timing} (day ${day} is in ${timing === '1/2' ? 'first' : 'second'} half of month)`);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = parseFloat(addFormData.expectedAmount) || 0;
    
    // Calculate timing automatically from dueDate or actDay
    const dayForTiming = addFormData.dueDate || addFormData.actDay;
    const timing = calculateTiming(dayForTiming);
    
    // Build activationDate with optional day
    const activationDate: { month: string; day?: string; year: string } = {
      month: addFormData.actMonth,
      year: addFormData.actYear
    };
    if (addFormData.actDay) {
      activationDate.day = addFormData.actDay;
    }
    
    // Build deactivationDate if provided
    const deactivationDate = (addFormData.deactMonth && addFormData.deactYear) 
      ? { month: addFormData.deactMonth, year: addFormData.deactYear }
      : undefined;
    
    // Calculate status automatically
    const status = calculateStatus(deactivationDate);
    
    const newBiller: Biller = {
      id: Math.random().toString(36).substr(2, 9),
      name: addFormData.name,
      category: addFormData.category,
      dueDate: addFormData.dueDate,
      expectedAmount: expected,
      timing: timing,
      activationDate: activationDate,
      deactivationDate: deactivationDate,
      status: status,
      schedules: MONTHS.map(month => ({ month, year: '2026', expectedAmount: expected }))
    };
    onAdd(newBiller);
    setShowAddModal(false);
    setAddFormData({ 
      name: '', 
      category: categories[0]?.name || '', 
      dueDate: '', 
      expectedAmount: '', 
      actMonth: MONTHS[(new Date().getMonth() + 1) % 12], 
      actDay: '',
      actYear: new Date().getFullYear().toString(),
      deactMonth: '',
      deactYear: ''
    });
    setTimingFeedback('');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    
    // Calculate timing automatically from dueDate or actDay
    const dayForTiming = editFormData.dueDate || editFormData.actDay;
    const timing = calculateTiming(dayForTiming);
    
    // Build activationDate with optional day
    const activationDate: { month: string; day?: string; year: string } = {
      month: editFormData.actMonth,
      year: editFormData.actYear
    };
    if (editFormData.actDay) {
      activationDate.day = editFormData.actDay;
    }
    
    // Build deactivationDate if provided
    const deactivationDate = (editFormData.deactMonth && editFormData.deactYear) 
      ? { month: editFormData.deactMonth, year: editFormData.deactYear }
      : undefined;
    
    // Calculate status automatically
    const status = calculateStatus(deactivationDate);
    
    onUpdate({ 
      ...showEditModal, 
      name: editFormData.name, 
      category: editFormData.category, 
      dueDate: editFormData.dueDate, 
      expectedAmount: parseFloat(editFormData.expectedAmount) || 0, 
      timing: timing,
      activationDate: activationDate,
      deactivationDate: deactivationDate,
      status: status
    });
    setShowEditModal(null);
    setTimingFeedback('');
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal) return;
    const { biller, schedule } = showPayModal;
    const updatedSchedules = biller.schedules.map(s => {
      if (s.month === schedule.month && s.year === schedule.year) {
        return { ...s, amountPaid: parseFloat(payFormData.amount), receipt: payFormData.receipt || `${biller.name}_${schedule.month}`, datePaid: payFormData.datePaid, accountId: payFormData.accountId };
      }
      return s;
    });
    onUpdate({ ...biller, schedules: updatedSchedules });
    setShowPayModal(null);
  };

  const handleDeleteTrigger = (id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Delete Biller',
      message: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      onConfirm: () => {
        onDelete?.(id);
        setDetailedBillerId(null);
        setConfirmModal(prev => ({ ...prev, show: false }));
        setActiveDropdownId(null);
      }
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const activeBillers = billers.filter(b => b.status === 'active');
  const inactiveBillers = billers.filter(b => b.status === 'inactive');
  const detailedBiller = billers.find(b => b.id === detailedBillerId);

  const openEditModal = (biller: Biller) => {
    setEditFormData({ 
      name: biller.name, 
      category: biller.category, 
      dueDate: biller.dueDate, 
      expectedAmount: biller.expectedAmount.toString(),
      actMonth: biller.activationDate.month,
      actDay: biller.activationDate.day || '',
      actYear: biller.activationDate.year,
      deactMonth: biller.deactivationDate?.month || '',
      deactYear: biller.deactivationDate?.year || ''
    });
    setShowEditModal(biller);
    setActiveDropdownId(null);
    setTimingFeedback('');
  };

  const renderCategoryOptions = () => (
    <>
      {categories.map(c => (
        <React.Fragment key={c.id}>
          <option value={c.name} className="font-bold">{c.name}</option>
          {c.subcategories.map(sub => (
            <option key={`${c.id}-${sub}`} value={`${c.name} - ${sub}`}>&nbsp;&nbsp;&nbsp;{sub}</option>
          ))}
        </React.Fragment>
      ))}
    </>
  );

  const renderBillerCard = (biller: Biller) => (
    <div key={biller.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col h-full group relative">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-2xl ${biller.status === 'active' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{biller.name}</h3>
            <div className="flex items-center space-x-2">
               <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 rounded text-gray-500 uppercase">{biller.category}</span>
               <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 rounded text-blue-500">{biller.timing}</span>
               <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${biller.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                 {biller.status === 'active' ? <div className="flex items-center gap-1"><Power className="w-3 h-3" />Active</div> : <div className="flex items-center gap-1"><PowerOff className="w-3 h-3" />Inactive</div>}
               </span>
            </div>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setActiveDropdownId(activeDropdownId === biller.id ? null : biller.id)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <MoreVertical className="w-5 h-5" />
          </button>
          {activeDropdownId === biller.id && (
            <>
              <div className="fixed inset-0 z-[10]" onClick={() => setActiveDropdownId(null)}></div>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-[20] animate-in zoom-in-95">
                <button onClick={() => { setDetailedBillerId(biller.id); setActiveDropdownId(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"><Eye className="w-4 h-4" /><span>View Details</span></button>
                <button onClick={() => openEditModal(biller)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"><Edit2 className="w-4 h-4" /><span>Edit Biller</span></button>
                <div className="border-t border-gray-100 my-1"></div>
                <button onClick={() => handleDeleteTrigger(biller.id, biller.name)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center space-x-2"><Trash2 className="w-4 h-4" /><span>Delete</span></button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2 mb-6 text-xs text-gray-500">
        <div className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-2" />Due every {biller.dueDate}</div>
      </div>
      <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex flex-col"><span className="text-[10px] font-bold text-gray-400 uppercase">Expected</span><span className="text-lg font-black text-gray-900">{formatCurrency(biller.expectedAmount)}</span></div>
        <button onClick={() => setDetailedBillerId(biller.id)} className="bg-gray-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors">Details</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {detailedBiller ? (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
          <div className="flex items-center justify-between">
            <button onClick={() => setDetailedBillerId(null)} className="flex items-center space-x-2 text-gray-500 hover:text-gray-900 group"><ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /><span className="font-medium">Back to Billers</span></button>
            <div className="flex items-center space-x-3">
              <button onClick={() => openEditModal(detailedBiller)} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200"><Edit2 className="w-4 h-4" /><span>Edit</span></button>
              <button onClick={() => handleDeleteTrigger(detailedBiller.id, detailedBiller.name)} className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100"><Trash2 className="w-4 h-4" /><span>Delete</span></button>
            </div>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center space-x-6">
                <div className="p-5 bg-indigo-50 text-indigo-600 rounded-3xl"><Bell className="w-10 h-10" /></div>
                <div><h2 className="text-3xl font-black text-gray-900">{detailedBiller.name}</h2><div className="flex items-center space-x-3 mt-2"><span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-500 uppercase">{detailedBiller.category}</span><span className="text-sm text-gray-400 font-medium">Due every {detailedBiller.dueDate}</span></div></div>
              </div>
              <div className="text-right"><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Expected Amount</p><p className="text-3xl font-black text-indigo-600">{formatCurrency(detailedBiller.expectedAmount)}</p></div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="p-4 text-xs font-bold text-gray-400 uppercase">Month</th><th className="p-4 text-xs font-bold text-gray-400 uppercase">Amount</th><th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">Action</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">{detailedBiller.schedules.map((sched, idx) => (
                      <tr key={idx} className={`${sched.amountPaid ? 'bg-green-50' : 'hover:bg-gray-50/50'} transition-colors`}>
                        <td className="p-4 font-bold text-gray-900">{sched.month} {sched.year}</td>
                        <td className="p-4 font-medium text-gray-600">{formatCurrency(sched.expectedAmount)}</td>
                        <td className="p-4 text-center">{!sched.amountPaid ? <button onClick={() => { setShowPayModal({ biller: detailedBiller, schedule: sched }); setPayFormData({ ...payFormData, amount: sched.expectedAmount.toString(), receipt: '' }); }} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 text-xs transition-all">Pay</button> : <div className="flex items-center justify-center text-green-600"><CheckCircle2 className="w-5 h-5" /></div>}</td>
                      </tr>
                    ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1"><h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">BILLERS</h2><p className="text-gray-500 text-sm">Manage recurring bills and payment schedules</p></div>
            <button onClick={() => { setShowAddModal(true); setTimingFeedback(''); }} className="flex items-center justify-center space-x-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg"><Plus className="w-5 h-5" /><span>Add Billers</span></button>
          </div>

          {/* Active Billers Section */}
          {activeBillers.length > 0 && (
            <div className="mb-8">
              <button 
                onClick={() => setIsActiveOpen(!isActiveOpen)}
                className="flex items-center space-x-2 mb-4 text-gray-700 hover:text-gray-900 font-bold text-lg"
              >
                {isActiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <span>Active Billers ({activeBillers.length})</span>
              </button>
              {isActiveOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeBillers.map(renderBillerCard)}
                </div>
              )}
            </div>
          )}

          {/* Inactive Billers Section */}
          {inactiveBillers.length > 0 && (
            <div>
              <button 
                onClick={() => setIsInactiveOpen(!isInactiveOpen)}
                className="flex items-center space-x-2 mb-4 text-gray-700 hover:text-gray-900 font-bold text-lg"
              >
                {isInactiveOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <span>Inactive Billers ({inactiveBillers.length})</span>
              </button>
              {isInactiveOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {inactiveBillers.map(renderBillerCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-8 uppercase tracking-tight">New Biller</h2>
            <form onSubmit={handleAddSubmit} className="space-y-6">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select value={addFormData.category} onChange={(e) => setAddFormData({ ...addFormData, category: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{renderCategoryOptions()}</select>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Biller Name</label><input required type="text" value={addFormData.name} onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold focus:ring-2 focus:ring-indigo-500" /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Expected Amount {addFormData.category.startsWith('Loans') && <span className="text-gray-400 font-normal">(Optional for Loans)</span>}
                   </label>
                   <input required={!addFormData.category.startsWith('Loans')} type="number" min="0" step="0.01" value={addFormData.expectedAmount} onChange={(e) => setAddFormData({ ...addFormData, expectedAmount: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                 </div>
                 <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Due Date (day)</label><input required type="number" min="1" max="31" placeholder="e.g. 15" value={addFormData.dueDate} onChange={(e) => { setAddFormData({ ...addFormData, dueDate: e.target.value }); showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
              </div>
              
              <div className="border-t border-gray-200 pt-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Activation Date</label>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                    <select value={addFormData.actMonth} onChange={(e) => setAddFormData({ ...addFormData, actMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Day (optional)</label><input type="number" min="1" max="31" placeholder="e.g. 15" value={addFormData.actDay} onChange={(e) => { setAddFormData({ ...addFormData, actDay: e.target.value }); if (!addFormData.dueDate) showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input required type="number" min="2000" max="2100" value={addFormData.actYear} onChange={(e) => setAddFormData({ ...addFormData, actYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Deactivation Date (optional)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                    <select value={addFormData.deactMonth} onChange={(e) => setAddFormData({ ...addFormData, deactMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"><option value="">None</option>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input type="number" min="2000" max="2100" placeholder="e.g. 2026" value={addFormData.deactYear} onChange={(e) => setAddFormData({ ...addFormData, deactYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                </div>
              </div>

              {/* Computed fields display */}
              <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Timing:</span>
                  <span className="text-sm font-black text-indigo-600">{calculateTiming(addFormData.dueDate || addFormData.actDay)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Status:</span>
                  <span className={`text-sm font-black ${(addFormData.deactMonth && addFormData.deactYear) ? 'text-gray-600' : 'text-green-600'}`}>{calculateStatus((addFormData.deactMonth && addFormData.deactYear) ? { month: addFormData.deactMonth, year: addFormData.deactYear } : undefined)}</span>
                </div>
              </div>

              {timingFeedback && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <p className="text-xs font-medium text-blue-700">{timingFeedback}</p>
                </div>
              )}

              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => { setShowAddModal(false); setTimingFeedback(''); }} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-xl">Add Biller</button></div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-8 uppercase tracking-tight">Edit Biller</h2>
            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select value={editFormData.category} onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{renderCategoryOptions()}</select>
              </div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Biller Name</label><input required type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                     Expected Amount {editFormData.category.startsWith('Loans') && <span className="text-gray-400 font-normal">(Optional for Loans)</span>}
                   </label>
                   <input required={!editFormData.category.startsWith('Loans')} type="number" min="0" step="0.01" value={editFormData.expectedAmount} onChange={(e) => setEditFormData({ ...editFormData, expectedAmount: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" />
                 </div>
                 <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Due Date (day)</label><input required type="number" min="1" max="31" placeholder="e.g. 15" value={editFormData.dueDate} onChange={(e) => { setEditFormData({ ...editFormData, dueDate: e.target.value }); showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
              </div>
              
              <div className="border-t border-gray-200 pt-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Activation Date</label>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                    <select value={editFormData.actMonth} onChange={(e) => setEditFormData({ ...editFormData, actMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Day (optional)</label><input type="number" min="1" max="31" placeholder="e.g. 15" value={editFormData.actDay} onChange={(e) => { setEditFormData({ ...editFormData, actDay: e.target.value }); if (!editFormData.dueDate) showTimingInfo(e.target.value); }} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input required type="number" min="2000" max="2100" value={editFormData.actYear} onChange={(e) => setEditFormData({ ...editFormData, actYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Deactivation Date (optional)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Month</label>
                    <select value={editFormData.deactMonth} onChange={(e) => setEditFormData({ ...editFormData, deactMonth: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none"><option value="">None</option>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                  <div><label className="block text-[10px] font-bold text-gray-400 mb-2">Year</label><input type="number" min="2000" max="2100" placeholder="e.g. 2026" value={editFormData.deactYear} onChange={(e) => setEditFormData({ ...editFormData, deactYear: e.target.value })} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold" /></div>
                </div>
              </div>

              {/* Computed fields display */}
              <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Timing:</span>
                  <span className="text-sm font-black text-indigo-600">{calculateTiming(editFormData.dueDate || editFormData.actDay)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auto-Computed Status:</span>
                  <span className={`text-sm font-black ${(editFormData.deactMonth && editFormData.deactYear) ? 'text-gray-600' : 'text-green-600'}`}>{calculateStatus((editFormData.deactMonth && editFormData.deactYear) ? { month: editFormData.deactMonth, year: editFormData.deactYear } : undefined)}</span>
                </div>
              </div>

              {timingFeedback && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <p className="text-xs font-medium text-blue-700">{timingFeedback}</p>
                </div>
              )}

              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => { setShowEditModal(null); setTimingFeedback(''); }} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-xl">Update Biller</button></div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setShowPayModal(null)} className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Pay {showPayModal.biller.name}</h2>
            <form onSubmit={handlePaySubmit} className="space-y-6 pt-4">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Amount Paid</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span><input required type="number" value={payFormData.amount} onChange={(e) => setPayFormData({...payFormData, amount: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 pl-8 outline-none text-xl font-black focus:ring-2 focus:ring-indigo-500" /></div></div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receipt Upload</label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setPayFormData({...payFormData, receipt: e.target.files?.[0]?.name || ''})} />
                  <div className="w-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-indigo-400" />
                    <span className="font-bold">{payFormData.receipt || 'Click or drag to upload receipt'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Date Paid</label><input required type="date" value={payFormData.datePaid} onChange={(e) => setPayFormData({...payFormData, datePaid: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm" /></div>
                <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Account</label><select value={payFormData.accountId} onChange={(e) => setPayFormData({...payFormData, accountId: e.target.value})} className="w-full bg-gray-50 border-transparent rounded-2xl p-4 outline-none font-bold text-sm appearance-none">{accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.bank} ({acc.classification})</option>)}</select></div>
              </div>
              <div className="flex space-x-4 pt-4"><button type="button" onClick={() => setShowPayModal(null)} className="flex-1 bg-gray-100 py-4 rounded-2xl font-bold text-gray-500">Cancel</button><button type="submit" className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 shadow-xl">Submit Payment</button></div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6"><AlertTriangle className="w-8 h-8" /></div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3"><button onClick={onConfirm} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700">Proceed</button><button onClick={onClose} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200">Cancel</button></div>
    </div>
  </div>
);

export default Billers;