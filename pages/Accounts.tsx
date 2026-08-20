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
import { generateCreditBuckets } from '../src/utils/bucketEngine';


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
  
  //new state for the Revolving vs. Loan Bundle submodal
  const [showCreditTypeModal, setShowCreditTypeModal] = useState(false);

    // 🟢 NEW: State to track which account the JuiceBox should use
    const [juiceAccountId, setJuiceAccountId] = useState<string>('');
  
    // 🟢 NEW: State to show/hide the Squeezer settings modal
    const [showJuiceModal, setShowJuiceModal] = useState(false);
  

  // Tab State: Check local storage first, default to Debit if nothing is saved
  const [activeTab, setActiveTab] = useState<'Debit' | 'Credit'>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('budee_accounts_active_tab');
      if (savedTab === 'Credit') return 'Credit';
    }
    return 'Debit';
  });


  // Save to local storage whenever the tab changes
  useEffect(() => {
    localStorage.setItem('budee_accounts_active_tab', activeTab);
  }, [activeTab]);

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
  const [isFlipped, setIsFlipped] = useState(false);


  const debitAccounts = accounts.filter(a => a.type === 'Debit');
  const creditAccounts = accounts.filter(a => a.type === 'Credit');
  
  // 🟢 REVERSED: Now the newest accounts are added to the END (right side)
  const visibleAccounts = (activeTab === 'Debit' ? debitAccounts : creditAccounts).slice().reverse();

    // 🟢 NEWEST IS LAST: Scroll to the end of the list when a new card drops in
    const prevAccountsLength = useRef(visibleAccounts.length);
    const prevTab = useRef(activeTab); // Track tab switches
    
    useEffect(() => {
      // 1. If we just switched tabs, update the refs and DO NOTHING ELSE
      if (activeTab !== prevTab.current) {
        prevTab.current = activeTab;
        prevAccountsLength.current = visibleAccounts.length;
        return; 
      }
  
      // 2. If the tab is the SAME, but the length grew, a new account was added! Scroll to it.
      if (visibleAccounts.length > prevAccountsLength.current) {
        setTimeout(() => {
          const lastIndex = visibleAccounts.length - 1;
          scrollToCard(lastIndex); 
        }, 300);
      }
      
      prevAccountsLength.current = visibleAccounts.length;
    }, [visibleAccounts.length, activeTab]); // Re-run when length or tab changes
  

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
      // 1. Build the Payload
      const created: Account = {
        id: editingId ?? '', 
        bank: formData.bank,
        classification: formData.classification,
        balance: parseFloat(formData.balance || '0'),
        openingBalance: parseFloat(formData.balance || '0'), 
        type: formData.type,
        subtype: formData.subtype, 
        creditLimit: formData.type === 'Credit' ? (formData.creditLimit ? parseFloat(formData.creditLimit) : 0) : undefined,
        // 🟢 FIX: Use the actual user inputs for all Credit accounts
        billingDate: formData.type === 'Credit' ? (formData.billingDate ? `${FAKE_DATE_PREFIX}${formData.billingDate.padStart(2, '0')}` : undefined) : undefined,
        dueDate: formData.type === 'Credit' ? (formData.dueDate ? `${FAKE_DATE_PREFIX}${formData.dueDate.padStart(2, '0')}` : undefined) : undefined,

        lastFour: formData.lastFour.trim() || undefined,
        interestRate: formData.type === 'Credit' ? (formData.interestRate ? parseFloat(formData.interestRate) : undefined) : undefined,
        qrCodeBase64: formData.qrCodeBase64 || undefined 
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

  const openAddModal = () => { 
    resetForm(); 
    if (activeTab === 'Credit') {
      setShowCreditTypeModal(true);
    } else {
      setFormData(prev => ({ ...prev, type: 'Debit' }));
      setShowModal(true); 
    }
  };


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
    
    let displayBalance = acc.balance;
    let totalUtilized = acc.balance;

    if (isCredit) {
      // 1. Fetch exact bucket from our waterfall engine for the running cycle!
      const now = new Date();
      
      // 🟢 Look one month ahead to capture the running cycle
      const targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      const buckets = generateCreditBuckets(
        acc, 
        transactions || [], 
        installments || [], 
        targetDate.getFullYear(), 
        monthNames[targetDate.getMonth()]
      );
      
      if (buckets.length > 0) {
        const currentBucket = buckets[buckets.length - 1];
        
        // 🟢 THE PAST-DUE FIX
        // The bucket engine artificially zeroes out past-due rollovers for "future" months to protect the budget page.
        // We replicate its detection logic here to add the unpaid debt back strictly for the UI card face.
        const currentRealMonth = now.getMonth();
        const currentRealYear = now.getFullYear();
        const targetMonthIdx = monthNames.indexOf(currentBucket.targetMonth);
        
        const isFutureBucket = (currentBucket.targetYear > currentRealYear) || 
                               (currentBucket.targetYear === currentRealYear && targetMonthIdx > currentRealMonth);

        let pastDueRollover = 0;
        if (isFutureBucket && buckets.length > 1) {
            const previousBucket = buckets[buckets.length - 2];
            pastDueRollover = Math.max(0, previousBucket.endingBalance);
        }
        
        // The face of the card shows the running balance + any past due debt that was zeroed out
        displayBalance = currentBucket.endingBalance + pastDueRollover;

        // The Limit Bar calculates absolute total debt (All Swipes + All future unpaid installments)
        const futureInstallmentBurden = installments

          .filter(i => (i.accountId === acc.id || i.linkedAccountId === acc.id) && !i.isArchived)
          .reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);
          
        const totalSwipesUnpaid = (transactions || [])
          .filter(tx => tx.payment_method_id === acc.id && tx.transaction_type !== 'credit_payment')
          .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount)), 0);
          
        const totalPayments = (transactions || [])
          .filter(tx => tx.payment_method_id === acc.id && tx.transaction_type === 'credit_payment')
          .reduce((sum, tx) => sum + Math.max(0, Number(tx.amount)), 0);
          
        totalUtilized = Math.max(0, totalSwipesUnpaid - totalPayments) + futureInstallmentBurden;
      } else {
        // Fallback for brand new, empty accounts
        const installmentBurden = installments
          .filter(i => (i.accountId === acc.id || i.linkedAccountId === acc.id) && !i.isArchived)
          .reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);
        totalUtilized = acc.balance + installmentBurden;
      }
    }

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
            {/* 🟢 NEW: Shows Last 4 here, or defaults to Debit/Credit if empty */}
            <p className="mt-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              {acc.lastFour ? `•••• ${acc.lastFour}` : (isCredit ? 'Credit Account' : 'Debit Account')}
            </p>
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
              {formatCurrency(displayBalance)}
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

         {/* 🧃 COMPACT JUICEBOX BUTTON */}
         <div className="mb-4 flex justify-end">
          <button 
            onClick={() => setShowJuiceModal(true)} 
            className="flex items-center gap-2 bg-yellow-400 text-black px-4 py-2 sm:px-6 sm:py-3 rounded-xl border-[3px] border-black font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all uppercase text-[10px] sm:text-xs"
          >
            <span>🧃</span> Squeeze Statement
          </button>
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

{showCreditTypeModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-3xl bg-[#fff7e8] dark:bg-gray-900 rounded-[2rem] border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-5 sm:p-8 relative flex flex-col max-h-[75vh]">
            
            <button onClick={() => setShowCreditTypeModal(false)} className="absolute right-4 top-4 z-20 p-2 bg-gray-200 dark:bg-gray-800 rounded-full hover:bg-gray-300 transition-colors">
              <X className="w-5 h-5"/>
            </button>
            
            {/* Header Area */}
            <div className="shrink-0 pt-2 sm:pt-0">
              <h2 className="text-xl sm:text-2xl font-black uppercase text-gray-900 dark:text-white mb-1 text-center mr-6 sm:mr-0">Choose Credit Type</h2>
              <p className="text-[11px] sm:text-sm font-bold text-gray-500 dark:text-gray-400 text-center mb-4 sm:mb-8">
                <span className="md:hidden">Swipe to explore options ↔</span>
                <span className="hidden md:inline">How does this credit line operate?</span>
              </p>
            </div>
            
            {/* 🟢 Mobile: Horizontal Snap Scroll | Desktop: Side-by-Side Grid */}
            <div className="flex md:grid md:grid-cols-2 gap-4 sm:gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-4 pt-1 px-1 md:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              
              {/* Revolving Card */}
              <div className="w-[90%] md:w-auto shrink-0 snap-center bg-white dark:bg-gray-800 border-[3px] border-black rounded-2xl p-5 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase text-purple-700 dark:text-purple-400 mb-2">Revolving Credit</h3>
                  <p className="text-[11px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                    Standard credit cards with a monthly limit. You swipe, you get a single monthly bill, and you pay it back to refresh your limit.
                  </p>
                  <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-3 mb-5 border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Examples</p>
                    <p className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-400">BPI Blue, Metrobank Titanium, RCBC Flex, UnionBank Rewards</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setFormData(prev => ({ ...prev, type: 'Credit', subtype: 'Revolving', classification: 'Credit Card' }));
                    setShowCreditTypeModal(false);
                    setIsFlipped(true);
                    setShowModal(true);
                  }}
                  className={`w-full py-3 rounded-xl border-[3px] border-black font-black uppercase tracking-widest text-[10px] sm:text-xs text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${getAccentClasses('bg')}`}
                >
                  Select Revolving
                </button>
              </div>

              {/* Loan Bundle Card */}
              <div className="w-[90%] md:w-auto shrink-0 snap-center bg-white dark:bg-gray-800 border-[3px] border-black rounded-2xl p-5 flex flex-col justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase text-indigo-600 dark:text-indigo-400 mb-2">Loan Bundle</h3>
                  <p className="text-[11px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                    Digital credit lines that automatically chop your specific purchases into fixed monthly installments right at checkout.
                  </p>
                  <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-3 mb-5 border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Examples</p>
                    <p className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-400">SPayLater, GCash GGives, Maya Credit, BillEase, LazPayLater</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setFormData(prev => ({ ...prev, type: 'Credit', subtype: 'Loan_Bundle', classification: 'Loan' }));
                    setShowCreditTypeModal(false);
                    setIsFlipped(true);
                    setShowModal(true);
                  }}
                  className="w-full py-3 rounded-xl border-[3px] border-black bg-indigo-600 font-black uppercase tracking-widest text-[10px] sm:text-xs text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                >
                  Select Bundle
                </button>
              </div>
            </div>

          </div>
        </div>
      )}




{showModal && (
        // 🟢 Boosted z-index to 9999 to cover the top navigation bar
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          
                    {/* 3D Scene Container */}
                    <div className="group perspective-[1200px] w-full max-w-[22rem] sm:max-w-[32rem] mx-auto relative mt-8 sm:mt-12">
            
            {/* X Button (Safely floating above the card) */}
            <div className="absolute -top-12 sm:-top-14 right-0 z-[110]">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full text-white border-2 border-white/20 transition-colors">
                <X className="w-5 h-5 sm:w-6 sm:h-6"/>
              </button>
            </div>

            <form 
              onSubmit={handleSubmit}
              className={`relative w-full aspect-[1.58/1] transition-transform duration-700 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
            >
              
              {/* 💳 FRONT OF CARD (Step 3) */}
              <div className={`absolute inset-0 p-5 sm:p-8 flex flex-col justify-between rounded-[1.5rem] sm:rounded-[2rem] border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] [backface-visibility:hidden] ${formData.type === 'Credit' ? 'bg-purple-100 dark:bg-purple-900/50' : 'bg-[#fff7e8] dark:bg-gray-800'}`}>
                
                {/* Top: Name & Flip Button */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-1 sm:mb-2">Bank / Wallet Name</label>
                    <input required type="text" value={formData.bank} onChange={(e) => setFormData({...formData, bank: e.target.value})} placeholder="e.g. BPI" className="w-full bg-transparent text-2xl sm:text-4xl font-black uppercase border-b-[3px] border-black/10 focus:border-black outline-none placeholder-black/20 text-black dark:text-white transition-colors truncate" />
                  </div>
                  {formData.type === 'Credit' && (
                    <button type="button" onClick={() => setIsFlipped(true)} className="px-3 sm:px-4 py-2 sm:py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-1 sm:gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] shrink-0">
                      Back ↺
                    </button>
                  )}
                </div>

                {/* Middle: Last 4 */}
                <div>
                  <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-1 sm:mb-2">Card Digits</label>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-sm sm:text-2xl font-mono text-black/30 dark:text-white/30 tracking-[0.1em] sm:tracking-[0.2em] whitespace-nowrap">•••• •••• ••••</span>
                    <input type="text" maxLength={4} pattern="\d{0,4}" placeholder="1234" value={formData.lastFour} onChange={(e) => setFormData({...formData, lastFour: e.target.value.replace(/\D/g, '')})} className="w-14 sm:w-24 bg-transparent text-sm sm:text-2xl font-mono font-black tracking-[0.1em] sm:tracking-[0.2em] border-b-[3px] border-black/10 focus:border-black outline-none text-black dark:text-white placeholder-black/20 transition-colors" />
                  </div>
                </div>

                {/* Bottom: QR (Debit) & Balance */}
                <div className="flex justify-between items-end mt-auto">
                  {formData.type === 'Debit' ? (
                    <div className="relative group/qr shrink-0">
                      <input type="file" accept="image/*" onChange={handleQrUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl border-[3px] border-dashed border-black/40 bg-black/5 flex items-center justify-center overflow-hidden transition-colors group-hover/qr:bg-black/10 group-hover/qr:border-black">
                        {formData.qrCodeBase64 ? (
                          <img src={formData.qrCodeBase64} alt="QR" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[8px] sm:text-[10px] font-black uppercase text-black/40 text-center leading-tight p-1">Upload<br/>QR</span>
                        )}
                      </div>
                    </div>
                  ) : <div/>}
                  
                  <div className="text-right flex-1 ml-2 min-w-0">
                    <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-1 sm:mb-2">Opening Balance</label>
                    <div className="flex items-center justify-end font-black text-2xl sm:text-4xl text-black dark:text-white">
                      <span className="text-black/40 dark:text-white/40 mr-1 sm:mr-2">₱</span>
                      <input required type="number" step="0.01" value={formData.balance} onChange={(e) => setFormData({...formData, balance: e.target.value})} className="w-full max-w-[140px] sm:max-w-[200px] bg-transparent border-b-[3px] border-black/10 focus:border-black outline-none text-right transition-colors placeholder-black/20" placeholder="0.00" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 🧲 BACK OF CARD (Step 2 - Credit Only) */}
              <div className={`absolute inset-0 flex flex-col rounded-[1.5rem] sm:rounded-[2rem] border-[4px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gray-200 dark:bg-gray-800`}>
                
                {/* Magnetic Strip */}
                <div className="w-full h-10 sm:h-14 bg-gray-900 mt-6 sm:mt-8 mb-4 sm:mb-6"></div>
                
                <div className="px-5 sm:px-8 flex-1 flex flex-col justify-between pb-5 sm:pb-8">
                  <div className="grid grid-cols-2 gap-x-3 sm:gap-x-5 gap-y-3 sm:gap-y-5">
                    
                    {/* Credit Limit */}
                    <div className="col-span-2">
                       <label className="block text-[10px] sm:text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1 sm:mb-2">{formData.subtype === 'Loan_Bundle' ? 'Bundle Limit' : 'Credit Limit'}</label>
                       <div className="flex items-center rounded-xl sm:rounded-2xl border-[3px] border-black bg-white dark:bg-gray-900 overflow-hidden">
                         <span className="pl-3 sm:pl-4 text-base sm:text-xl font-black text-gray-400">₱</span>
                         <input type="number" value={formData.creditLimit} onChange={(e) => setFormData({...formData, creditLimit: e.target.value})} className="w-full bg-transparent px-2 sm:px-3 py-2 sm:py-3 text-base sm:text-xl font-black text-black dark:text-white outline-none" placeholder="0.00" />
                       </div>
                    </div>

                    {/* Billing Cycle Fields for ALL Credit Types */}
                    <div>
                      <label className="block text-[9px] sm:text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1 sm:mb-2">Statement Day</label>
                      <input type="number" min="1" max="31" placeholder="15" value={formData.billingDate} onChange={(e) => setFormData({...formData, billingDate: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white dark:bg-gray-900 px-3 py-2 text-sm sm:text-lg font-black text-black dark:text-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-[9px] sm:text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1 sm:mb-2">Days to Pay</label>
                      <input type="number" min="1" max="60" placeholder="21" value={formData.dueDate} onChange={(e) => setFormData({...formData, dueDate: e.target.value})} className="w-full rounded-xl border-[3px] border-black bg-white dark:bg-gray-900 px-3 py-2 text-sm sm:text-lg font-black text-black dark:text-white outline-none" />
                    </div>

                  </div>

                                    {/* Next Button (Inside card for desktop, hidden on mobile) */}
                                    <div className="hidden sm:flex justify-end mt-4">
                    <button type="button" onClick={() => setIsFlipped(false)} className={`px-6 py-3 rounded-xl border-[3px] border-black text-white text-[11px] font-black uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all ${getAccentClasses('bg')}`}>
                      Next: Front Details ↺
                    </button>
                  </div>

                </div>
              </div>

            </form>
            
          

            {/* 🟢 Mobile Floating "Next" Button (Visible when Flipped) */}
            <div className={`sm:hidden absolute -bottom-16 left-1/2 -translate-x-1/2 w-max transition-opacity duration-300 delay-150 ${!isFlipped ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <button type="button" onClick={() => setIsFlipped(false)} className={`px-8 py-3 rounded-xl border-[3px] border-black text-[11px] font-black text-white uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${getAccentClasses('bg')}`}>
                Next: Front Details ↺
              </button>
            </div>

            {/* Submit Button Floating Below Card (Visible when NOT Flipped) */}
            <div className={`absolute -bottom-16 sm:-bottom-24 left-1/2 -translate-x-1/2 w-max transition-opacity duration-300 delay-150 ${isFlipped ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <button onClick={handleSubmit} disabled={isSubmitting} className={`px-10 sm:px-14 py-3 sm:py-4 rounded-xl sm:rounded-2xl border-[3px] sm:border-[4px] border-black text-sm sm:text-lg font-black text-white uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}>
                {isSubmitting ? 'Minting...' : (editingId ? 'Save Updates' : 'Add to Wallet')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 🧃 THE SQUEEZER SETTINGS MODAL */}
      {showJuiceModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#fff7e8] dark:bg-gray-900 border-[4px] border-black rounded-[2rem] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 relative">
            
            <button 
              onClick={() => setShowJuiceModal(false)} 
              className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full border-2 border-black hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="mb-6">
              <h2 className="text-xl sm:text-2xl font-black uppercase text-gray-900 dark:text-white mb-1 tracking-tight">Statement Squeezer</h2>
              <p className="text-[11px] sm:text-xs font-bold text-gray-500">Configure your target destination before uploading.</p>
            </div>
            
            {/* Target Account Selector */}
            <div className="mb-6">
               <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                 Target Account
               </label>
               <div className="relative">
                 <select
                  value={juiceAccountId}
                  onChange={(e) => setJuiceAccountId(e.target.value)}
                  className="w-full appearance-none rounded-2xl border-[3px] sm:border-[4px] border-black bg-white dark:bg-gray-800 px-4 py-3 sm:py-4 text-sm sm:text-lg font-black text-gray-900 dark:text-white outline-none cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                >
                  {(activeTab === 'Debit' ? debitAccounts : creditAccounts).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank} {acc.lastFour ? `(••${acc.lastFour})` : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="text-xl font-black">↓</span>
                </div>
              </div>
            </div>

            <div className="border-t-[3px] border-dashed border-gray-300 dark:border-gray-700 my-6"></div>

            {/* The JuiceBox Component */}
            <JuiceBox 
              selectedAccountId={juiceAccountId} 
              installments={installments}
              existingTransactions={transactions}
              onImportComplete={() => setShowJuiceModal(false)} 
            />
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
