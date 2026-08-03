import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { JuiceBox } from '../src/components/JuiceBox'; // 🧃 Import your retro sticker component
import { Link } from 'react-router-dom';
import { PinProtectedAction } from '../src/components/PinProtectedAction';
import { Account, AccountClassification, Installment, Transaction } from '../types';
import { supabase } from '../src/utils/supabaseClient';
import {
  Plus,
  MoreVertical,
  WalletCards,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { getDueDayForDisplay, ordinalSuffix } from '../src/utils/billingCycles';
import { useTheme } from '../src/contexts/ThemeContext';
import { PageHeader } from '../src/components/PageHeader';
import useMediaQuery from '../src/hooks/useMediaQuery';

interface AccountsProps {
  accounts: Account[];
  installments: Installment[];
  transactions: Transaction[]; // 🟢 ADD THIS
  onAdd: (a: Account) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (a: Account) => Promise<void>;
  onDeactivate?: (id: string, when: { month: number; year: number } | 'now') => Promise<void>;
  loading?: boolean;
  error?: string | null;
}


const monthNames = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

const FAKE_DATE_PREFIX = '2000-01-';

{/* TO: */}
const Accounts: React.FC<AccountsProps> = ({ accounts, installments = [], transactions = [], onAdd, onDelete, onEdit, onDeactivate, loading = false, error = null }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'Debit' | 'Credit'>('Debit');

  // Carousel State & Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean; title: string; message: string; onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const [formData, setFormData] = useState({
    bank: '', 
    classification: 'Checking' as AccountClassification, 
    balance: '', 
    type: 'Debit' as 'Debit' | 'Credit', 
    creditLimit: '', 
    billingDate: '', 
    dueDate: '', 
    lastFour: '',
    interestRate: '',
    qrCodeBase64: '' // 🟢 ADD THIS
  });



  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deactivateState, setDeactivateState] = useState<{ show: boolean; accountId?: string | null; month: number; year: number; }>({ show: false, accountId: null, month: 0, year: 0 });
  const [deleteFailedModal, setDeleteFailedModal] = useState<{ show: boolean; accountId: string; }>({ show: false, accountId: '' });
  const [statementInfoAccount, setStatementInfoAccount] = useState<Account | null>(null);

  const debitAccounts = accounts.filter(a => a.type === 'Debit');
  const creditAccounts = accounts.filter(a => a.type === 'Credit');
  const visibleAccounts = activeTab === 'Debit' ? debitAccounts : creditAccounts;

  // 🟢 Carousel Scroll Handlers
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const cardWidth = container.children[0]?.clientWidth || 384; 
    const gap = isMobile ? 16 : 24; 
    const newIndex = Math.round(container.scrollLeft / (cardWidth + gap));
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  const scrollToCard = (index: number) => {
    if (!scrollContainerRef.current) return;
    const cardWidth = scrollContainerRef.current.children[0]?.clientWidth || 384;
    const gap = isMobile ? 16 : 24;
    scrollContainerRef.current.scrollTo({ left: index * (cardWidth + gap), behavior: 'smooth' });
    setActiveIndex(index);
  };

  // Reset carousel when switching tabs
  useEffect(() => {
    setActiveIndex(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0 });
    }
  }, [activeTab]);

  useEffect(() => {
    const now = new Date();
    const nextMonthIndex = (now.getMonth() + 1) % 12; 
    const defaultYear = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0);
    setDeactivateState(s => ({ ...s, month: nextMonthIndex, year: defaultYear }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const minimal = accounts.map(a => ({ id: a.id, bank: a.bank }));
      localStorage.setItem('accounts_list', JSON.stringify(minimal));
      minimal.forEach(m => localStorage.setItem(`account_meta_${m.id}`, JSON.stringify({ bank: m.bank })));
    } catch (_) {}
  }, [accounts]);

  const formatCurrency = (val: number | undefined) => {
    const n = val ?? 0;
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  const resetForm = () => {
    setFormData({ bank: '', classification: 'Checking', balance: '', type: 'Debit', creditLimit: '', billingDate: '', dueDate: '', lastFour: '', interestRate: '', qrCodeBase64: '' }); // 🟢 Added qrCodeBase64
    setEditingId(null);
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created: Account = {
        id: editingId ?? '', 
        bank: formData.bank,
        classification: formData.classification,
        balance: parseFloat(formData.balance || '0'),
        openingBalance: parseFloat(formData.balance || '0'), 
        type: formData.type,
        creditLimit: formData.type === 'Credit' ? (formData.creditLimit ? parseFloat(formData.creditLimit) : 0) : undefined,
        billingDate: formData.type === 'Credit' ? (formData.billingDate ? `${FAKE_DATE_PREFIX}${formData.billingDate.padStart(2, '0')}` : undefined) : undefined,
        dueDate: formData.type === 'Credit' ? (formData.dueDate ? `${FAKE_DATE_PREFIX}${formData.dueDate.padStart(2, '0')}` : undefined) : undefined,
        lastFour: formData.lastFour.trim() || undefined,
        interestRate: formData.type === 'Credit' ? (formData.interestRate ? parseFloat(formData.interestRate) : undefined) : undefined,
        qrCodeBase64: formData.qrCodeBase64 || undefined // 🟢 ADD THIS
      };



      if (editingId) {
        await onEdit?.(created);
      } else {
        await onAdd(created);
      }

      resetForm();
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save account:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddModal = () => { resetForm(); setShowModal(true); };

  const openEditModal = (acc: Account) => {
    setEditingId(acc.id);
    setFormData({
      bank: acc.bank, 
      classification: acc.classification, 
      balance: (acc.openingBalance ?? 0).toFixed(2), 
      type: acc.type,
      creditLimit: acc.creditLimit ? acc.creditLimit.toFixed(2) : '', 
      billingDate: acc.billingDate ? String(new Date(acc.billingDate).getDate()) : '',
      dueDate: acc.dueDate ? String(new Date(acc.dueDate).getDate()) : '', 
      lastFour: acc.lastFour || '',
      interestRate: acc.interestRate ? acc.interestRate.toString() : '',
      qrCodeBase64: acc.qrCodeBase64 || '' // 🟢 ADD THIS
    });
    setShowModal(true);
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result as string;
      
      img.onload = () => {
        // 1. Draw the full screenshot to a hidden canvas to read its pixels
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        // 2. Extract the raw image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 3. Let jsQR scan the pixels for a QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          // 🟢 QR FOUND! Calculate its exact bounding box
          const minX = Math.min(code.location.topLeftCorner.x, code.location.bottomLeftCorner.x);
          const maxX = Math.max(code.location.topRightCorner.x, code.location.bottomRightCorner.x);
          const minY = Math.min(code.location.topLeftCorner.y, code.location.topRightCorner.y);
          const maxY = Math.max(code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y);

          const qrWidth = maxX - minX;
          const qrHeight = maxY - minY;

          // Add a 40px clean white border around it so it scans easily later
          const padding = 40;
          const startX = Math.max(0, minX - padding);
          const startY = Math.max(0, minY - padding);
          const cropWidth = Math.min(img.width - startX, qrWidth + (padding * 2));
          const cropHeight = Math.min(img.height - startY, qrHeight + (padding * 2));

          // 4. Create a new canvas just for the cropped result
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropWidth;
          cropCanvas.height = cropHeight;
          const cropCtx = cropCanvas.getContext('2d');
          
          if (cropCtx) {
              // Fill background with white (QR codes need high contrast)
              cropCtx.fillStyle = '#FFFFFF';
              cropCtx.fillRect(0, 0, cropWidth, cropHeight);
              
              // Draw exactly the QR code coordinates onto the new canvas
              cropCtx.drawImage(
                  img,
                  startX, startY, cropWidth, cropHeight, // Source slice
                  0, 0, cropWidth, cropHeight           // Destination size
              );
              
              // Save the perfect crop!
              const croppedBase64 = cropCanvas.toDataURL('image/png');
              setFormData(prev => ({ ...prev, qrCodeBase64: croppedBase64 }));
          }
        } else {
          // 🔴 FALLBACK: If the QR code is too blurry to detect, just save the whole original screenshot
          alert("Couldn't auto-detect the QR code. Saving the original image instead.");
          setFormData(prev => ({ ...prev, qrCodeBase64: reader.result as string }));
        }
      };
    };

    reader.readAsDataURL(file);
  };

  const handleDeleteTrigger = (id: string, bank: string) => {
    setConfirmModal({
      show: true, title: 'Remove Account', message: `Are you sure you want to permanently remove the account: "${bank}"?`,
      onConfirm: async () => {
          try { await onDelete?.(id); setConfirmModal(p => ({ ...p, show: false })); }
          catch (err) { setConfirmModal(p => ({ ...p, show: false })); setDeleteFailedModal({ show: true, accountId: id }); }
      }
    });
  };

  const openDeactivateDialog = (id: string) => setDeactivateState(s => ({ ...s, show: true, accountId: id }));
  const confirmDeactivateNow = async () => { if (!deactivateState.accountId) return; await onDeactivate?.(deactivateState.accountId, 'now'); setDeactivateState({ show: false, accountId: null, month: 0, year: 0 }); };
  const confirmDeactivateScheduled = async () => { if (!deactivateState.accountId) return; await onDeactivate?.(deactivateState.accountId, { month: deactivateState.month, year: deactivateState.year }); setDeactivateState({ show: false, accountId: null, month: 0, year: 0 }); };

  // Physical Card Design
  {/* TO: Add the installment math */}
  const renderAccount = (acc: Account) => {
    const isCredit = acc.type === 'Credit' || acc.classification === 'Credit Card' || acc.type === 'Loan' || acc.classification === 'Loan';
    const creditLimit = acc.creditLimit ?? 0;
    
    {/* TO: Look at accountId instead of linkedAccountId */}
    // 🟢 NEW: Calculate the remaining balance of all active installments linked to this card
    const installmentBurden = installments
      .filter(i => (i.accountId === acc.id || i.linkedAccountId === acc.id) && !i.isArchived)
      .reduce((sum, i) => sum + (i.totalAmount - i.paidAmount), 0);

      
    // 🟢 NEW: Total Utilized = Actual Statement Balance + Unpaid Installments
    const totalUtilized = acc.balance + installmentBurden;

    const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((totalUtilized / creditLimit) * 100)) : 0;
    const usedPercentSafe = usedPercent < 0 ? 0 : usedPercent;
    const isActive = (acc as any).isActive !== false;

    const deactivationDate = (acc as any).deactivationDate;
    
    const cardSurface = isCredit ? 'bg-purple-50 dark:bg-purple-900/10' : 'bg-[#fffdf7] dark:bg-gray-800';
    const displayDigits = acc.lastFour ? `•••• •••• ${acc.lastFour}` : '•••• •••• ••••';

    return (
      <div
        key={acc.id}
        className={`${cardSurface} relative flex flex-col justify-between w-[85vw] sm:w-[22rem] aspect-[1.58/1] shrink-0 rounded-[1.5rem] border-[4px] border-black p-4 sm:p-5 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-colors duration-200 snap-center`}
      >
        {/* Top Row: Bank Info & Controls */}
        <div className="flex justify-between items-start">
          <div className="max-w-[80%]">
            <h3 className={`text-lg sm:text-xl font-black leading-none uppercase tracking-tight truncate ${isCredit ? 'text-purple-900 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}`}>
              {acc.bank}
            </h3>
            <p className="mt-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{acc.classification}</p>
          </div>
          
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === acc.id ? null : acc.id); }} className="p-1 -mt-1 -mr-1 text-gray-400 hover:text-black dark:hover:text-white transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
            {openMenuId === acc.id && (
              <div className="absolute top-8 right-0 z-50 mt-2 w-48 rounded-xl border-[3px] border-black bg-white p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openEditModal(acc); }} className="w-full rounded-lg px-4 py-2.5 text-left text-sm font-bold text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800">Edit</button>
                {isActive && <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); openDeactivateDialog(acc.id); }} className="w-full rounded-lg px-4 py-2.5 text-left text-sm font-bold text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800">Deactivate</button>}
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDeleteTrigger(acc.id, acc.bank); }} className="w-full rounded-lg px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">Delete</button>
              </div>
            )}
          </div>
        </div>

        {/* Middle Row: Chip and Balance */}
        <div className="mt-2 flex justify-between items-center">
          {/* EMV Chip */}
          <div className="w-8 h-6 sm:w-9 sm:h-7 rounded-[4px] border-[2px] border-black bg-yellow-300 relative overflow-hidden flex items-center justify-center shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] opacity-90 shrink-0">
            <div className="absolute w-full h-[1px] bg-black/30"></div>
            <div className="absolute h-full w-[1px] bg-black/30"></div>
            <div className="absolute w-3 h-2 border border-black/30 rounded-sm"></div>
          </div>

          {/* Balance */}
          <div className="text-right pl-2 truncate">
            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.14em] text-gray-500 mb-0.5">Balance</p>
            <p className={`text-xl sm:text-2xl font-black tracking-tight leading-none truncate ${isCredit ? 'text-purple-950 dark:text-purple-100' : 'text-gray-900 dark:text-gray-100'}`}>
              {formatCurrency(acc.balance)}
            </p>
          </div>
        </div>

        {/* TO: Update the labels to show Available Limit and hide closed dates if unnecessary */}
        {/* Credit Limit Bar (Only for Credit) */}
        {isCredit && (
          <div className="mt-3">
            <div className="flex justify-between items-baseline mb-1">
              <p className="text-[8px] font-bold uppercase text-gray-500">
                Avail: {formatCurrency(Math.max(0, creditLimit - totalUtilized))}
              </p>
              <p className="text-[8px] font-bold uppercase text-gray-400">
                Limit: {formatCurrency(creditLimit)}
              </p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-black/10 overflow-hidden shadow-[inset_1px_1px_2px_rgba(0,0,0,0.2)]">

              <div className={`h-full rounded-full ${usedPercentSafe > 90 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${usedPercentSafe}%` }} />
            </div>
          </div>
        )}
        
        {/* If Debit, still show deactivation date if applicable */}
        {!isCredit && isActive && deactivationDate && (
          <div className="mt-1">
             <p className="text-[8px] font-bold text-orange-600 uppercase">Closes: {monthNames[deactivationDate.month]} {deactivationDate.year}</p>
          </div>
        )}

        {/* Bottom Row: Faux Numbers & Action */}
        <div className="flex justify-between items-end mt-auto pt-2">
          <p className="font-mono text-xs sm:text-sm font-black tracking-widest text-gray-400 dark:text-gray-500 pb-1">
            {displayDigits}
          </p>
          
          <div className="flex gap-2 shrink-0">
             {isCredit && (
               <Link
                 to={`/accounts/statement?account=${acc.id}`}
                 onClick={(e) => e.stopPropagation()}
                 className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-[3px] border-black rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center"
                 title="Statement"
               >
                 <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
               </Link>
             )}
             <Link
               to={`/accounts/view?account=${acc.id}`}
               onClick={(e) => e.stopPropagation()}
               className={`border-[3px] border-black rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1 ${getAccentClasses('bg')} text-white`}
             >
               View <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
             </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    // 🟢 1. Tightened the main flex gap (changed gap-4 sm:gap-8 to gap-2 sm:gap-4)
    <div className="flex flex-col gap-2 sm:gap-4 overflow-x-hidden animate-in fade-in duration-500" onClick={() => setOpenMenuId(null)}>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading accounts...</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error Loading Accounts</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {!loading && (
      <>
        <PageHeader 
          title="Accounts"
          subtitle="Cards and vaults at a glance"
          icon={<div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}><WalletCards className="w-7 h-7" /></div>}
          actions={
            !isMobile ? (
              <button onClick={openAddModal} className={`flex items-center justify-center gap-2 text-white rounded-2xl border-[3px] border-black font-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')} px-5 py-3 text-sm`}>
                <Plus className="w-4 h-4" />
                <span>Add Account</span>
              </button>
            ) : null
          }
        />

 {/* 🧃 GLOBAL JUICEBOX ACTION BAR */}
 <div className="mb-6 flex items-center justify-between bg-white dark:bg-gray-900 border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div>
            <h3 className="font-black uppercase tracking-tight text-sm">Statement Squeezer</h3>
            <p className="text-xs text-gray-500 font-bold">Upload a bank or e-wallet PDF statement to auto-import transactions.</p>
          </div>
          
          {/* Note: If you use a global button here, you might want your JuiceBox component 
              to include an account dropdown selector so the user can choose which account 
              the statement belongs to! */}
          <JuiceBox selectedAccountId={activeTab === 'Debit' ? debitAccounts[0]?.id : creditAccounts[0]?.id} 
          installments={installments}
          existingTransactions={transactions}
          />
        </div>

        {debitAccounts.length === 0 && creditAccounts.length === 0 && (
          <div className="rounded-[2rem] border-[4px] border-dashed border-black bg-yellow-100 px-8 py-12 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className={`mx-auto mb-2 inline-flex h-20 w-20 items-center justify-center rounded-[2rem] border-[4px] border-black ${getAccentClasses('bg')} text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}><WalletCards className="w-10 h-10" /></div>
            <h3 className="mb-2 text-xl font-black text-gray-900">No Accounts Yet</h3>
            <p className="mb-6 text-gray-700">Get started by adding your first account</p>
            <button onClick={openAddModal} className={`inline-flex items-center gap-2 border-[3px] border-black px-6 py-3 rounded-2xl font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')}`}><Plus className="w-5 h-5" /><span>Add Your First Account</span></button>
          </div>
        )}

        {(debitAccounts.length > 0 || creditAccounts.length > 0) && (
          // 🟢 2. Added a negative top margin (-mt-2 sm:-mt-6) to pull the tabs into the header's airspace
          <section className="-mt-2 sm:-mt-6">
            <div className="flex gap-3 mb-2 pb-4 border-b-[4px] border-black overflow-x-auto hide-scrollbar">
              <button 
                onClick={() => setActiveTab('Debit')} 
                className={`flex items-center justify-center gap-2 flex-1 min-w-[150px] py-4 px-4 text-xs sm:text-sm font-black uppercase tracking-widest rounded-2xl border-[4px] border-black transition-all ${
                  activeTab === 'Debit' 
                    ? 'bg-black text-white shadow-none translate-y-1' 
                    : 'bg-white text-gray-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:text-black dark:bg-gray-800'
                }`}
              >
                Debit & Assets <span className="bg-white/20 text-current px-2 py-0.5 rounded-md text-[10px]">{debitAccounts.length}</span>
              </button>
              <button 
                onClick={() => setActiveTab('Credit')} 
                className={`flex items-center justify-center gap-2 flex-1 min-w-[150px] py-4 px-4 text-xs sm:text-sm font-black uppercase tracking-widest rounded-2xl border-[4px] border-black transition-all ${
                  activeTab === 'Credit' 
                    ? 'bg-black text-white shadow-none translate-y-1' 
                    : 'bg-white text-gray-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:text-black dark:bg-gray-800'
                }`}
              >
                Credit & Liabilities <span className="bg-white/20 text-current px-2 py-0.5 rounded-md text-[10px]">{creditAccounts.length}</span>
              </button>
            </div>

            <div className="relative animate-in slide-in-from-bottom-4 duration-300">
              <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory gap-4 sm:gap-6 pb-4 pt-2 -mx-4 px-4 sm:mx-0 sm:px-2 after:content-[''] after:block after:w-2 sm:after:w-0 after:shrink-0"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {visibleAccounts.length > 0 ? (
                  visibleAccounts.map((acc) => renderAccount(acc))
                ) : (
                  <p className="w-full text-center py-10 font-bold text-gray-400 italic">
                    No {activeTab.toLowerCase()} accounts found.
                  </p>
                )}
              </div>

              {visibleAccounts.length > 1 && (
                <div className="flex items-center justify-center gap-4 sm:gap-6 mt-2">
                  <button 
                    onClick={() => scrollToCard(Math.max(0, activeIndex - 1))}
                    disabled={activeIndex === 0}
                    className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center bg-white dark:bg-gray-800 disabled:opacity-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  <div className="flex gap-2.5">
                    {visibleAccounts.map((_, i) => (
                      <button 
                        key={i} 
                        onClick={() => scrollToCard(i)}
                        className={`w-3.5 h-3.5 rounded-full border-2 border-black transition-all ${
                          activeIndex === i ? getAccentClasses('bg') + ' scale-125' : 'bg-transparent dark:bg-gray-700'
                        }`}
                        aria-label={`Go to card ${i + 1}`}
                      />
                    ))}
                  </div>

                  <button 
                    onClick={() => scrollToCard(Math.min(visibleAccounts.length - 1, activeIndex + 1))}
                    disabled={activeIndex === visibleAccounts.length - 1}
                    className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center bg-white dark:bg-gray-800 disabled:opacity-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </>
      )}
      
      {/* (Keep your Modals exactly as they were underneath this) */}

                        {/* 🟢 3. The FAB positioned fixed in the bottom corner (Transactions Style) */}
      {isMobile && !loading && (
        <div className="fixed bottom-[10px] right-6 z-40 animate-in fade-in zoom-in duration-300">
          <div className="relative z-40 flex items-center justify-center">
            <button
              onClick={openAddModal}
              className={`relative z-10 w-14 h-14 text-white rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center transition-all duration-300 ${getAccentClasses('bg')} hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
              aria-label="Add Account"
            >
              <Plus className="w-6 h-6" strokeWidth={3} />
            </button>
          </div>
        </div>
      )}




      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border-[4px] border-black bg-[#fff7e8] shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-colors md:flex-row dark:bg-gray-900 relative">
            <button onClick={() => { setShowModal(false); resetForm(); }} className="absolute right-4 top-4 z-10 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white md:text-gray-900 md:bg-gray-100 md:hover:bg-gray-200 transition-colors"><X className="w-5 h-5"/></button>
            <div className={`${getAccentClasses('bg')} shrink-0 p-6 text-white transition-colors border-b-[4px] border-black md:w-1/3 md:border-b-0 md:border-r-[4px] md:p-8 pt-12`}>
              <div>
                <div className="mb-5 inline-flex rounded-2xl border-[3px] border-black bg-white/20 p-3"><WalletCards className="w-8 h-8" /></div>
                <h2 className="text-2xl font-black mb-2 uppercase text-white">{editingId ? 'Edit Account' : 'Add Account'}</h2>
                <p className="text-sm text-white/85">Keep your banking setup bold, playful, and easy to scan.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="min-w-0 flex-1 overflow-y-auto bg-[#fff7e8] p-5 space-y-5 sm:p-6 md:p-8 dark:bg-gray-900">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Bank Name</label>
                  <input required type="text" value={formData.bank} onChange={(e) => setFormData({...formData, bank: e.target.value})} placeholder="e.g. Chase" className="w-full rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Type</label>
                  <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as 'Debit' | 'Credit'})} className="w-full rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100">
                    <option value="Debit">Debit</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Classification</label>
                  <select value={formData.classification} onChange={(e) => setFormData({...formData, classification: e.target.value as AccountClassification})} className="w-full rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100">
                    <option>Checking</option>
                    <option>Savings</option>
                    <option>Investment</option>
                    <option>Loan</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Opening Balance</label>
                  <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                     <input required type="number" step="0.01" value={formData.balance} onChange={(e) => setFormData({...formData, balance: e.target.value})} className="w-full rounded-2xl border-[3px] border-black bg-white pl-8 py-3 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                  </div>
                </div>
              </div>

              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Last 4 Digits (Optional)</label>
                 <input 
                   type="text" 
                   maxLength={4} 
                   pattern="\d{0,4}" 
                   placeholder="e.g. 1234" 
                   value={formData.lastFour} 
                   onChange={(e) => setFormData({...formData, lastFour: e.target.value.replace(/\D/g, '')})} 
                   className="w-full rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-mono font-bold text-gray-900 tracking-[0.2em] outline-none dark:bg-gray-800 dark:text-gray-100" 
                 />
                 <p className="text-[10px] text-gray-400 font-bold mt-1.5 ml-1">Adds a realistic touch to your digital cards.</p>
              </div>

              {formData.type === 'Credit' && (
                <div className="rounded-[1.4rem] border-[3px] border-black bg-purple-50/50 p-4 dark:bg-purple-900/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Top Row: Limit and Interest */}
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Credit Limit</label>
                      <input type="number" value={formData.creditLimit} onChange={(e) => setFormData({...formData, creditLimit: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Interest Rate (%)</label>
                      <input type="number" step="0.01" min="0" placeholder="e.g. 3.00" value={formData.interestRate} onChange={(e) => setFormData({...formData, interestRate: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    
                    {/* Bottom Row: Dates */}
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Statement Day</label>
                      <input type="number" min="1" max="31" placeholder="e.g. 12" value={formData.billingDate} onChange={(e) => setFormData({...formData, billingDate: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Days to Pay</label>
                      <input type="number" min="1" max="60" placeholder="e.g. 21" value={formData.dueDate} onChange={(e) => setFormData({...formData, dueDate: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white px-3 py-2 font-bold text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                  </div>
                  
                  {formData.billingDate && formData.dueDate && (() => {
                    const statementDay = parseInt(formData.billingDate);
                    const daysToPay = parseInt(formData.dueDate);
                    if (isNaN(statementDay) || isNaN(daysToPay)) return null;
                    return (
                      <p className="mt-3 text-[11px] font-bold text-purple-700 dark:text-purple-400">
                        Statement cuts on the {statementDay}{ordinalSuffix(statementDay)} · Due around {getDueDayForDisplay(statementDay, daysToPay)}
                      </p>
                    );
                  })()}
                </div>
              )}

              
              {/* 🟢 NEW: QR Code Upload Section */}     
            {formData.type === 'Debit' && (
              <div className="rounded-[1.4rem] border-[3px] border-black bg-blue-50/50 p-4 dark:bg-blue-900/10 mt-4">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                      Account QR Code (Optional)
                  </label>
                  <p className="text-[10px] text-gray-500 font-bold mb-3">
                      Upload your bank transfer QR code. It will be stored offline for instant access in your Wallet.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                      {/* Preview Area */}
                      <div className="w-24 h-24 shrink-0 rounded-xl border-[3px] border-dashed border-gray-400 bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                          {formData.qrCodeBase64 ? (
                              <img 
                                  src={formData.qrCodeBase64} 
                                  alt="QR Preview" 
                                  className="w-full h-full object-contain" 
                              />
                          ) : (
                              <span className="text-[10px] font-black text-gray-400 uppercase">No QR</span>
                          )}
                      </div>

                      {/* File Input */}
                      <div className="flex-1 w-full">
                          <input 
                              type="file" 
                              accept="image/*"
                              onChange={handleQrUpload}
                              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-black file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 dark:file:bg-blue-900/30 dark:file:text-blue-300 transition-all cursor-pointer"
                          />
                          {formData.qrCodeBase64 && (
                              <button 
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, qrCodeBase64: '' }))}
                                  className="mt-2 text-[10px] font-black uppercase text-red-500 hover:text-red-700 transition-colors"
                              >
                                  Remove QR
                              </button>
                          )}
                      </div>
                    </div>
                  </div>
                )}
      
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 rounded-2xl border-[3px] border-black bg-white py-3 font-black text-gray-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-100">Cancel</button>
                <button type="submit" disabled={isSubmitting} className={`flex-1 rounded-2xl border-[3px] border-black py-3 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50 ${getAccentClasses('bg')}`}>{isSubmitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Account')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate & Delete Modals remain identical ... */}
      {deactivateState.show && (
        <DeactivateDialog
          accountId={deactivateState.accountId!} accounts={accounts} month={deactivateState.month} year={deactivateState.year}
          onChangeMonth={(m) => setDeactivateState(s => ({ ...s, month: m }))} onChangeYear={(y) => setDeactivateState(s => ({ ...s, year: y }))}
          onClose={() => setDeactivateState({ show: false, accountId: null, month: 0, year: 0 })} onNow={() => confirmDeactivateNow()} onSchedule={() => confirmDeactivateScheduled()}
        />
      )}

      {deleteFailedModal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#fff7e8] dark:bg-gray-900 rounded-[2rem] border-[4px] border-black w-full max-w-sm p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-orange-200 text-orange-700 rounded-3xl border-[3px] border-black flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><AlertTriangle className="w-8 h-8" /></div>
            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight">Cannot Delete</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed">This account cannot be deleted because it has attached transactions. Would you like to deactivate it instead?</p>
            <div className="flex flex-col w-full space-y-3">
              <button onClick={() => { setDeleteFailedModal({ show: false, accountId: '' }); openDeactivateDialog(deleteFailedModal.accountId); }} className={`w-full py-4 rounded-2xl border-[3px] border-black font-black uppercase tracking-widest text-[10px] text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')}`}>Deactivate Instead</button>
              <button onClick={() => setDeleteFailedModal({ show: false, accountId: '' })} className="w-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-4 rounded-2xl border-[3px] border-black font-black uppercase tracking-widest text-[10px] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && <ConfirmDialog {...confirmModal} onClose={() => setConfirmModal(p => ({ ...p, show: false }))} />}
    </div>
  );
};

const DeactivateDialog: React.FC<{
  accountId: string; accounts: Account[]; month: number; year: number;
  onChangeMonth: (m: number) => void; onChangeYear: (y: number) => void;
  onClose: () => void; onNow: () => Promise<void>; onSchedule: () => Promise<void>;
}> = ({ accountId, accounts, month, year, onChangeMonth, onChangeYear, onClose, onNow, onSchedule }) => {
  const now = new Date(); const currentYear = now.getFullYear(); const years = Array.from({ length: 6 }, (_, i) => currentYear + i);
  const [linkedWallets, setLinkedWallets] = useState<any[]>([]);
  const [reassignAccountId, setReassignAccountId] = useState('');
  const [isLoadingWallets, setIsLoadingWallets] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchWallets = async () => {
      setIsLoadingWallets(true);
      try {
        const isTestMode = localStorage.getItem('test_environment_enabled') === 'true';
        const { data, error } = await supabase.from(isTestMode ? 'wallets_test' : 'wallets').select('*').eq('account_id', accountId);
        if (!error && data) setLinkedWallets(data);
      } catch (e) {} finally { setIsLoadingWallets(false); }
    };
    if (accountId) fetchWallets();
  }, [accountId]);

  const handleAction = async (action: 'now' | 'schedule') => {
    if (linkedWallets.length > 0 && !reassignAccountId) return alert('Select a new account for linked wallets.');
    setIsProcessing(true);
    try {
      if (linkedWallets.length > 0 && reassignAccountId) {
        const table = localStorage.getItem('test_environment_enabled') === 'true' ? 'wallets_test' : 'wallets';
        for (const w of linkedWallets) await supabase.from(table).update({ account_id: reassignAccountId }).eq('id', w.id);
      }
      if (action === 'now') await onNow(); else await onSchedule();
    } catch (e) { alert('Failed to process deactivation.'); } finally { setIsProcessing(false); }
  };

  const eligibleAccounts = accounts.filter(a => a.id !== accountId && a.type !== 'Credit');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-[2rem] border-[4px] border-black bg-[#fff7e8] p-6 sm:p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in-95 dark:bg-gray-900">
        <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight">Deactivate Account</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Deactivate now or schedule it for a later date.</p>

        {!isLoadingWallets && linkedWallets.length > 0 && (
          <div className="mb-6 rounded-[1.5rem] border-[3px] border-black bg-orange-100 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center space-x-2 mb-2"><AlertTriangle className="w-4 h-4 text-orange-600" /><p className="text-xs font-bold text-orange-800">Wallets Linked</p></div>
            <p className="text-xs text-orange-700 mb-3">Reassign {linkedWallets.length} linked wallet(s) to a new debit account.</p>
            <select value={reassignAccountId} onChange={(e) => setReassignAccountId(e.target.value)} className="w-full rounded-xl border-[3px] border-black bg-white px-3 py-2.5 text-sm font-bold text-gray-700 outline-none">
              <option value="">-- Select New Account --</option>
              {eligibleAccounts.map(a => <option key={a.id} value={a.id}>{a.bank} ({a.classification})</option>)}
            </select>
          </div>
        )}

        <div className="space-y-4">
          <PinProtectedAction featureId="account_deactivations" onVerified={() => handleAction('now')} actionLabel="Deactivate Account">
            <button onClick={(e) => e.preventDefault()} disabled={isProcessing} className="w-full rounded-2xl border-[3px] border-black bg-red-600 text-white py-3.5 font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">{isProcessing ? 'Processing...' : 'Deactivate Now'}</button>
          </PinProtectedAction>

          <div className="rounded-[1.5rem] border-[3px] border-black bg-white p-4 dark:bg-gray-950">
            <p className="text-[10px] text-gray-600 dark:text-gray-300 mb-2 font-black uppercase tracking-[0.16em]">Deactivate on</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={month} onChange={(e) => onChangeMonth(parseInt(e.target.value, 10))} className="flex-1 rounded-xl border-[3px] border-black bg-[#fff7e8] px-3 py-2.5 outline-none dark:bg-gray-800 dark:text-white">
                {monthNames.map((mName, idx) => <option key={idx} value={idx}>{mName}</option>)}
              </select>
              <select value={year} onChange={(e) => onChangeYear(parseInt(e.target.value, 10))} className="w-full sm:w-28 rounded-xl border-[3px] border-black bg-[#fff7e8] px-3 py-2.5 outline-none dark:bg-gray-800 dark:text-white">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <PinProtectedAction featureId="account_deactivations" onVerified={() => handleAction('schedule')} actionLabel="Schedule Deactivation">
              <button onClick={(e) => e.preventDefault()} disabled={isProcessing} className="mt-4 w-full rounded-xl border-[3px] border-black bg-indigo-600 text-white py-2.5 font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">{isProcessing ? 'Processing...' : 'Schedule'}</button>
            </PinProtectedAction>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="w-full rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-3.5 font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const ConfirmDialog: React.FC<{ show: boolean; title: string; message: string; onConfirm: () => void; onClose: () => void }> = ({ title, message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
    <div className="bg-[#fff7e8] dark:bg-gray-900 rounded-[2rem] border-[4px] border-black w-full max-w-sm p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-200 text-red-700 rounded-3xl border-[3px] border-black flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><AlertTriangle className="w-8 h-8" /></div>
      <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 font-medium leading-relaxed">{message}</p>
      <div className="flex flex-col w-full space-y-3">
        <PinProtectedAction featureId="account_deletions" onVerified={onConfirm} actionLabel="Delete Account">
          <button onClick={(e) => e.preventDefault()} className="w-full rounded-2xl border-[3px] border-black bg-red-600 text-white py-4 font-black uppercase tracking-widest text-[10px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">Proceed</button>
        </PinProtectedAction>
        <button onClick={onClose} className="w-full rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800 text-gray-500 py-4 font-black uppercase tracking-widest text-[10px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">Cancel</button>
      </div>
    </div>
  </div>
);

export default Accounts;
