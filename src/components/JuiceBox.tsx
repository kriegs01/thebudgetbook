import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle2, X, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import { squeezeMariBank, StandardTransaction } from '../utils/parsers/maribank';
import { createTransaction } from '../services/transactionsService';
import type { Transaction } from '../types';
import { extractTransactions } from '../utils/parserEngine'; // Adjust path as needed


// Define the shape of our Bank data
interface BankConfig {
  id: string;
  name: string;
  category: string;
  is_visible: boolean;
}


interface PendingRow extends StandardTransaction {
  isDuplicate: boolean;
  excluded: boolean;
}

interface JuiceBoxProps {
  selectedAccountId: string;
  existingTransactions?: Transaction[];
  installments?: any[]; // 🟢 Pass your app's installments in here
  onImportComplete?: () => void;
}

// 🟢 THE (N+3) MATCHING ENGINE
const findMatchingInstallment = (tx: any, installments: any[]) => {
  if (tx.name !== 'Funds Transfer' || !installments || installments.length === 0) return null;

  const txDate = new Date(tx.date).getTime();
  const txAmount = Math.abs(tx.amount);
  const rawName = (tx.raw_text || '').toLowerCase();

  // Find the first valid match based on the logic tree
  return installments.find(inst => {
    if (inst.isArchived) return false;

    // 1. Name Match (Checking the hidden raw_text)
    const instName = (inst.name || '').toLowerCase();
    const isNameMatch = rawName.includes(instName) || instName.includes(rawName);

    // 2. Date Match (The N+3 Rule)
    const dueDate = new Date(inst.dueDate).getTime();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const isWithinGracePeriod = txDate >= dueDate && txDate <= (dueDate + threeDays);

    // 3. Amount Match
    const isFullMatch = txAmount === inst.totalAmount;
    const isPartialMatch = txAmount < inst.totalAmount;

    // Decision Tree
    if (isNameMatch) {
      if (isFullMatch) return inst.id;
      if (isPartialMatch && isWithinGracePeriod) return inst.id;
    }

    return null;
  });
};


export const JuiceBox: React.FC<JuiceBoxProps> = ({ selectedAccountId, existingTransactions, installments, onImportComplete }) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [pendingTransactions, setPendingTransactions] = useState<PendingRow[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false); // FIXED: Added missing state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inside JuiceBox.tsx state definitions:
  const [matchedLinks, setMatchedLinks] = useState<Record<string, string[]>>({});

    // 🟢 JuiceBox Parser State
    const [selectedBank, setSelectedBank] = useState('');
    const [file, setFile] = useState<File | null>(null);
  

      // 🟢 Dynamic Banks State
  const [availableBanks, setAvailableBanks] = useState<BankConfig[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);

  // Fetch visible banks from Supabase
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const { data, error } = await supabase
          .from('supported_banks')
          .select('*')
          .eq('is_visible', true); // Only fetch active banks

        if (error) throw error;
        
        if (data) {
          setAvailableBanks(data);
        }
      } catch (error) {
        console.error("Error fetching supported banks from Supabase:", error);
      } finally {
        setIsLoadingBanks(false);
      }
    };

    fetchBanks();
  }, []);

    // 🟢 NEW: Master Signature List State
    const [knownSignatures, setKnownSignatures] = useState<string[]>([]);

    // 🟢 Fetch all signatures from BOTH tables so JuiceBox is fully self-aware
    useEffect(() => {
      const fetchSignatures = async () => {
        try {
          // 1. Get signatures stamped on Schedules
          const { data: schData } = await supabase
            .from('monthly_payment_schedules')
            .select('statement_ref')
            .not('statement_ref', 'is', null);
            
          // 2. Get signatures stamped on actual Transactions
          const { data: txData } = await supabase
            .from('transactions')
            .select('statement_ref')
            .not('statement_ref', 'is', null);
  
          // Combine them all into one flat array of strings
          const combined = [
            ...(schData || []).map(d => d.statement_ref),
            ...(txData || []).map(d => d.statement_ref)
          ].filter(Boolean); // Drops any undefined/nulls safely
  
          setKnownSignatures(combined);
        } catch (error) {
          console.error("Error fetching signatures for JuiceBox:", error);
        }
      };
  
      fetchSignatures();
    }, []);
  


  // Group the fetched banks by category for the dropdown
  const groupedBanks = availableBanks.reduce((acc, bank) => {
    if (!acc[bank.category]) acc[bank.category] = [];
    acc[bank.category].push(bank);
    return acc;
  }, {} as Record<string, BankConfig[]>);


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAccountId) {
      alert("Please select an account first!");
      return;
    }

    setStatus('processing');

    try {
      console.log("Loading PDF file into buffer...");
      const arrayBuffer = await file.arrayBuffer();
      
      console.log("Initializing PDF document loader...");
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      console.log(`PDF loaded successfully. Total pages: ${pdfDoc.numPages}`);

      let extractedText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        // 🟢 NEW: Tag amounts with their physical X-axis position!
        const pageText = textContent.items.map((item: any) => {
          const str = item.str.trim();
          if (/^[\d,]+\.\d{2}$/.test(str) && item.transform) {
            return `${str} [X:${Math.round(item.transform[4])}]`;
          }
          return str;
        }).join('\n');
        
        extractedText += pageText + '\n';
      }


      console.log(`Parsing text through squeeze engine for: ${selectedBank}`);
const rawTransactions = extractTransactions(selectedBank, extractedText);
console.log(`Successfully parsed ${rawTransactions.length} transactions.`);


      if (rawTransactions.length === 0) {
        alert("No transactions found or unrecognized statement format.");
        setStatus('idle');
        return;
      }

                  // 🟢 NEW: Create a temporary object to hold our smart matches
      const autoMatchedLinks: Record<string, string[]> = {};

      // 👇 Make sure to add `idx` to the map parameters here!
            // 👇 Make sure to add `idx` to the map parameters here!
            const processedRows: PendingRow[] = rawTransactions.map((tx, idx) => {
              const txDateStr = new Date(tx.date).toISOString().slice(0, 10);
              
              // 🟢 THE FIX: Give every parsed row a permanent, unique fake ID
              const uniqueRowId = tx.id || `pdf_row_${idx}_${Date.now()}`;
      
                      // 🟢 Generate the fingerprint we are looking for
        const signature = `[JB_Ref: ${tx.name}_${Math.abs(tx.amount)}]`;

        // 1. Check for strict duplicates (Original logic)
        const matchedExistingTx = (existingTransactions || []).find(existing => {
          const existingDateStr = new Date(existing.date).toISOString().slice(0, 10);
          return existing.paymentMethodId === selectedAccountId &&
                 Math.abs(existing.amount) === Math.abs(tx.amount) &&
                 existingDateStr === txDateStr;
        });
        
        // 2. 🟢 Check if this signature exists ANYWHERE in our master list!
        const isMatchedByRef = knownSignatures.some(ref => ref.includes(signature));

        // If it matches either check, flag it as a duplicate!
        const isMatch = !!matchedExistingTx || isMatchedByRef; 

        // 2. THE IOU SMART MATCHER
        if (tx.name === 'Funds Transfer' && !isMatch) {
           // ... (leave your IOU logic exactly as it is here)

                const txAmount = Math.abs(tx.amount);
                const isIncomingTransfer = tx.amount > 0;
      
                const smartMatch = (existingTransactions || []).find(ledgerTx => {
                  if ((ledgerTx as any).iou_status !== 'pending') return false;
                  
                  const ledgerAmount = Math.abs(ledgerTx.amount);
                  
                  if (isIncomingTransfer) {
                    return (ledgerTx as any).beneficiary_id && ledgerAmount === txAmount;
                  } else {
                    return (ledgerTx as any).payer_id && ledgerAmount === txAmount;
                  }
                });
      
                if (smartMatch) {
                  autoMatchedLinks[uniqueRowId] = [`tx_${smartMatch.id}`];
                }
              }
      
              return {
                ...tx,
                id: uniqueRowId, 
                isDuplicate: isMatch, // 👈 Now this will be true if it finds the fingerprint!
                excluded: isMatch,    // 👈 And it will auto-exclude it!
                existingId: matchedExistingTx?.id 
              };
            });
      

      setMatchedLinks(autoMatchedLinks);
      // 👇 RESTORE THIS MISSING BLOCK 👇
      setPendingTransactions(processedRows);
      setShowReviewModal(true);
      setStatus('idle');
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; 
      }

    } catch (error: any) {
      console.error('FULL PDF ERROR OBJECT:', error);
      alert(`Failed to read PDF: ${error?.message || 'Unknown error'}`);
      setStatus('idle');
    }
  };
  // 👆 END OF MISSING BLOCK 👆
      

  // 🟢 NEW: Instantly select or deselect all extracted transactions
  const toggleAllExtracted = () => {
    setPendingTransactions(prev => {
      // Check if literally every transaction is currently excluded
      const areAllExcluded = prev.every(tx => tx.excluded);
      
      // If all are excluded, turn them ALL on. Otherwise, turn them ALL off.
      return prev.map(tx => ({
        ...tx,
        excluded: !areAllExcluded 
      }));
    });
  };


  const handleConfirmImport = async () => {
    setIsImporting(true);
  
    try {
      // 1. Grab the user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Error: Could not verify your user ID. Try refreshing the page.");
        return;
      }

      // 2. Filter out anything the user manually excluded
      const itemsToProcess = pendingTransactions.filter(tx => !tx.excluded);
      const trulyNewTransactions: PendingRow[] = [];
      
      // 🟢 PHASE 1: Sort New vs. Linked Transactions
      itemsToProcess.forEach((tx, idx) => {
        const stateKey = tx.id || idx;
        let links = matchedLinks[stateKey] || [];
        if (!Array.isArray(links)) links = [links];
        
        const existingIds = Array.isArray((tx as any).existingId) ? (tx as any).existingId : ((tx as any).existingId ? [(tx as any).existingId] : []);
        const matchedObjIds = Array.isArray((tx as any).matchedIds) ? (tx as any).matchedIds : [];
        const allAssociatedIds = [...links, ...existingIds, ...matchedObjIds];
        
        const hasLedgerLink = allAssociatedIds.some(link => typeof link === 'string' && link.length > 10);
        
        // Only insert if it has NO links and isn't a duplicate
        if (!hasLedgerLink && !tx.isDuplicate) {
          trulyNewTransactions.push(tx);
        }
      });

      // 🟢 PHASE 2: Insert the truly new transactions
      if (trulyNewTransactions.length > 0) {
        const payload = trulyNewTransactions.map(tx => ({
          payment_method_id: selectedAccountId,
          user_id: user.id, 
          name: tx.name,
          amount: -(tx.amount), // Flipped sign so expenses register properly
          date: tx.date,
          transaction_type: tx.transaction_type,
          notes: (tx as any).notes,
          is_reconciled: true 
        }));
        
        const { error: insertError } = await supabase.from('transactions').insert(payload);
        if (insertError) throw insertError;
      }

      // 🟢 PHASE 3: Reconcile Matches & Inject Statement Signatures
      const manualUpdates: { id: string, signature: string }[] = [];

      itemsToProcess.forEach((tx, idx) => {
        const stateKey = tx.id || idx;
        let links = matchedLinks[stateKey] || [];
        if (!Array.isArray(links)) links = [links];

        const existingIds = Array.isArray((tx as any).existingId) ? (tx as any).existingId : ((tx as any).existingId ? [(tx as any).existingId] : []);
        const matchedObjIds = Array.isArray((tx as any).matchedIds) ? (tx as any).matchedIds : [];
        const allAssociatedIds = [...links, ...existingIds, ...matchedObjIds];

        const hasLedgerLink = allAssociatedIds.some(link => typeof link === 'string' && link.length > 10);

        if (hasLedgerLink) {
          const signature = `[JB_Ref: ${tx.name}_${Math.abs(tx.amount)}]`;
          
          allAssociatedIds.forEach(link => {
            if (typeof link === 'string' && link.length > 10) {
              // 🔥 THE FIX: Strip BOTH prefixes so Supabase gets the pure UUID
              const cleanId = link.replace('tx_', '').replace('inst_', '');
              manualUpdates.push({ id: cleanId, signature });
            }
          });
        }
      });

      if (manualUpdates.length > 0) {
        const updatePromises = manualUpdates.map(async (updateObj) => {
          // 1. Try to stamp the Transactions table first
          const { data: txData, error: txError } = await supabase
            .from('transactions')
            .update({ 
                is_reconciled: true, 
                iou_status: 'settled',
                statement_ref: updateObj.signature 
            })
            .eq('id', updateObj.id)
            .select();

          // 2. If no rows were updated in Transactions, it must be a Schedule!
          if (!txError && (!txData || txData.length === 0)) {
            const { data: schData, error: schError } = await supabase
              .from('monthly_payment_schedules')
              .update({ 
                  statement_ref: updateObj.signature // Safely omitting is_reconciled here
              })
              .eq('id', updateObj.id)
              .select();

            if (schError) {
              console.error(`Failed to stamp schedule ${updateObj.id}:`, schError);
            } else {
              console.log(`Successfully stamped Schedule ${updateObj.id}:`, schData);
            }
          } else if (txError) {
             console.error(`Failed to stamp transaction ${updateObj.id}:`, txError);
          } else {
             console.log(`Successfully stamped Transaction ${updateObj.id}:`, txData);
          }
        });

        await Promise.all(updatePromises);
      }

      // Success cleanup
      onImportComplete?.();
      setShowReviewModal(false); 

    } catch (error) {
      console.error("Failed to import/reconcile:", error);
      alert("Something went wrong during import.");
    } finally {
      setIsImporting(false);
    }
  };


  const toggleRowExclusion = (index: number) => {
    setPendingTransactions(prev => prev.map((item, i) => i === index ? { ...item, excluded: !item.excluded } : item));
  };

  return (
    <>
      
        {/* 🟢 Step 1: The Bank Selector (Traffic Controller) */}
        <div className="mb-6">
          <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
            1. Select Institution
          </label>
          <div className="relative">
            <select 
              value={selectedBank} 
              onChange={(e) => setSelectedBank(e.target.value)}
              disabled={isLoadingBanks}
              className="w-full appearance-none rounded-2xl border-[3px] sm:border-[4px] border-black bg-white dark:bg-gray-800 px-4 py-3 sm:py-4 text-sm sm:text-lg font-black text-gray-900 dark:text-white outline-none cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50"
            >
              <option value="" disabled>
                {isLoadingBanks ? 'Loading available banks...' : 'Choose where this file is from...'}
              </option>
              
              {Object.entries(groupedBanks).map(([category, banks]) => (
                <optgroup key={category} label={category}>
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {isLoadingBanks ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-xl font-black">↓</span>
              )}
            </div>
          </div>
        </div>

        {/* 🟢 Step 2: The Upload Button (Disabled until a bank is selected) */}
        <div className={`relative group inline-block transition-opacity duration-300 ${selectedBank ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <label className="block text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
            2. Upload Statement
          </label>
          
          <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'processing'}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-yellow-400 text-black border-4 border-black font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all disabled:opacity-50 rounded-xl"
          >
            {status === 'idle' && <><span>🧃</span><span>Juice PDF</span></>}
            {status === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-black" />}
            {status === 'success' && <CheckCircle2 className="w-5 h-5 text-black" />}
          </button>
        </div>

      {showReviewModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col max-h-[85vh]">
            
          {/* 🟢 NEW: Select/Deselect All Button */}
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={toggleAllExtracted}
              className="flex items-center gap-2 rounded-xl border-[3px] border-black bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-300"
            >
               <span>☑️</span> Toggle All Selections
            </button>
          </div>


            <div className="flex justify-between items-center border-b-4 border-black pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black uppercase">JuiceBox Review ({pendingTransactions.length} items)</h2>
                <p className="text-xs text-gray-500 font-bold">Duplicates matching your existing ledger are auto-excluded.</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="p-2 border-2 border-black rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {pendingTransactions.map((tx, idx) => {
                // 🟢 FIXED: Unlock dropdowns for ALL non-duplicate transactions!
                const isMatchable = !tx.isDuplicate; 

                const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();

                const txDateMs = new Date(tx.date).getTime();
                const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                const minDateMs = txDateMs - threeDaysMs;
                const maxDateMs = txDateMs + threeDaysMs;
                const txAbsAmount = Math.abs(tx.amount);

                                  // 🟢 NEW: Figure out which items have been claimed by OTHER rows
                                  const selectedElsewhere = new Set();
                                  Object.entries(matchedLinks).forEach(([key, links]) => {
                                    if (key !== String(tx.id || idx)) { 
                                      links.forEach(link => selectedElsewhere.add(link));
                                    }
                                  });
                 
                                  // 🟢 ENHANCED: Suggested Sorting & Filtering Logic
                                  const suggestedLedger = (existingTransactions || [])
                                  .filter(ledgerTx => {
                                    // 1. STRICT ACCOUNT FILTER
                                    const isSameAccount = ledgerTx.paymentMethodId === selectedAccountId || (ledgerTx as any).payment_method_id === selectedAccountId;
                                    if (!isSameAccount) return false;
                 
                                    // 2. DATE FILTER
                                    const ledgerDateMs = new Date(ledgerTx.date).getTime();
                                    if (ledgerDateMs < minDateMs || ledgerDateMs > maxDateMs) return false;
                 
                                    // 3. 🟢 CLAIM FILTER: Hide it if another row already selected it!
                                    const idVal = `tx_${ledgerTx.id}`;
                                    if (selectedElsewhere.has(idVal)) return false;
                 
                                    return true;
                                  })
                                  .sort((a, b) => {
                                     const txDesc = `${tx.name} ${tx.raw_text}`.toLowerCase();
                                     const aType = String(a.transaction_type || '').toLowerCase();
                                     const bType = String(b.transaction_type || '').toLowerCase();
                 
                                     const aTypeMatch = aType && txDesc.includes(aType) ? 1 : 0;
                                     const bTypeMatch = bType && txDesc.includes(bType) ? 1 : 0;
                 
                                     if (aTypeMatch !== bTypeMatch) {
                                       return bTypeMatch - aTypeMatch; 
                                     }
                 
                                     return Math.abs(Math.abs(a.amount) - txAbsAmount) - Math.abs(Math.abs(b.amount) - txAbsAmount);
                                   });
                 

                const suggestedInstallments = (installments || [])
                  .filter(inst => !inst.isArchived)
                  .filter(inst => {
                    const instDateMs = new Date(inst.dueDate).getTime();
                    return instDateMs >= minDateMs && instDateMs <= maxDateMs;
                  })
                  .sort((a, b) => Math.abs(Math.abs(a.totalAmount) - txAbsAmount) - Math.abs(Math.abs(b.totalAmount) - txAbsAmount));

                    // 1. Establish shared state key for THIS row
    const stateKey = tx.id || idx;
    
    // 2. Pre-calculate the top-level calculator totals
    const activeLinks = matchedLinks[stateKey] || [];
    const hasSelection = activeLinks.length > 0;
    
    let totalSelected = 0;
    activeLinks.forEach(linkId => {
      if (typeof linkId === 'string' && linkId.startsWith('tx_')) {
        const found = existingTransactions?.find(t => String(t.id) === linkId.replace('tx_', ''));
        if (found?.amount) totalSelected += Math.abs(found.amount);
      }
      if (typeof linkId === 'string' && linkId.startsWith('inst_')) {
        const found = installments?.find(i => String(i.id) === linkId.replace('inst_', ''));
        if (found?.totalAmount) totalSelected += Math.abs(found.totalAmount);
      }
    });
    
    const targetAmount = Math.abs(Number(tx.amount) || 0);
    const diff = targetAmount - totalSelected;
    const isIncoming = tx.amount > 0;

    return (
      <div 
        key={`row_${stateKey}`} 
        className={`rounded-lg border p-3 flex flex-col gap-3 transition-colors ${
          tx.excluded ? 'opacity-50 border-gray-800 bg-gray-900/50' : 'border-gray-700 bg-gray-800/80'
        }`}
      >
        {/* 🟢 TOP ROW: Statement Details & Calculator */}
        <div className="flex justify-between items-start">
          
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              checked={!tx.excluded}
              onChange={() => toggleRowExclusion(idx)}
              className="rounded bg-gray-900 border-gray-600"
            />
            <span className="bg-white text-gray-900 text-[10px] font-black px-2 py-0.5 rounded tracking-wide uppercase">
              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
            </span>
            <span className="text-sm font-bold text-gray-100">{tx.name}</span>
            {tx.isDuplicate && (
              <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded">
                Duplicate
              </span>
            )}
          </div>

          <div className="flex flex-col items-end">
            <span className={`text-sm font-bold ${isIncoming ? 'text-green-500' : 'text-red-500'}`}>
              {isIncoming ? '+' : '-'}₱{targetAmount.toFixed(2)}
            </span>
            
            {/* THE TOP-LEVEL CALCULATOR */}
            {hasSelection && (
              <div className="flex flex-col items-end text-[9px] font-bold uppercase tracking-wider mt-1">
                <span className="text-gray-400">Selected: ₱{totalSelected.toFixed(2)}</span>
                {Math.abs(diff) < 0.01 ? (
                  <span className="text-green-500">✓ Exact Match</span>
                ) : diff > 0 ? (
                  <span className="text-amber-500">₱{diff.toFixed(2)} left</span>
                ) : (
                  <span className="text-red-500">Over by ₱{Math.abs(diff).toFixed(2)}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 🟢 BOTTOM ROW: Match & Link Dropdown */}
        {!tx.isDuplicate && (
          <div className="bg-gray-950/50 rounded-md p-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">Match & Link:</div>
            
            {hasSelection ? (
               <div className="bg-gray-800 text-gray-300 text-[10px] font-bold px-2 py-1.5 rounded border border-gray-700">
                 {activeLinks.length} Item(s) Linked
               </div>
            ) : (
               <div className="bg-white text-gray-900 text-[10px] font-bold px-2 py-1.5 rounded italic">
                 No items linked (Import as new)
               </div>
            )}

            {/* SUGGESTED LEDGER LIST */}
            {suggestedLedger.length > 0 && (
              <div className="mt-3 bg-white rounded p-2">
                <div className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mb-2">
                  Suggested Matches (±3 Days):
                </div>
                <div className="flex flex-col gap-1">
                  {suggestedLedger.map(ledgerTx => {
                    const idVal = `tx_${ledgerTx.id}`;
                    const isChecked = activeLinks.includes(idVal);
                    const isPendingIOU = (ledgerTx as any).iou_status === 'pending';
                    
                    let dateStr = '--/--/----';
                    try {
                      if (ledgerTx.date) {
                        const d = new Date(ledgerTx.date);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
                        }
                      }
                    } catch (e) {}

                    const badgeText = isPendingIOU ? 'Pending IOU' : (ledgerTx.transaction_type || 'Ledger');
                    const badgeColor = isPendingIOU 
                      ? 'bg-amber-200 text-amber-900 border-amber-400' 
                      : 'bg-gray-800 text-gray-200 border-gray-700';

                    return (
                      <div 
                        key={`opt_${stateKey}_${ledgerTx.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMatchedLinks(prev => {
                            const current = prev[stateKey] || [];
                            const next = current.includes(idVal)
                              ? current.filter(id => id !== idVal)
                              : [...current, idVal];
                            return { ...prev, [stateKey]: next };
                          });
                        }}
                        className={`flex items-center gap-2 text-[10px] font-bold cursor-pointer p-1.5 rounded transition-colors ${
                          isPendingIOU 
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200' 
                            : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className={`rounded pointer-events-none ${isPendingIOU ? 'accent-amber-600' : ''}`}
                        />
                        
                        <span className="truncate flex-1 min-w-[100px]">{ledgerTx.name}</span>
                        
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest border ${badgeColor}`}>
                          {badgeText}
                        </span>
                        
                        <span className="shrink-0 w-16 text-right text-gray-400 font-medium">{dateStr}</span>
                        
                        <span className="shrink-0 w-16 text-right">₱{Math.abs(ledgerTx.amount).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );


                          
                
              })}
            </div>



            <div className="border-t-4 border-black pt-4 mt-4 flex gap-3">
              <button 
                type="button"
                onClick={() => setShowReviewModal(false)} 
                className="flex-1 bg-gray-200 py-3 rounded-xl font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmImport} 
                disabled={isImporting}
                className="flex-1 bg-green-400 text-black py-3 rounded-xl font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : `Import Selected (${pendingTransactions.filter(t => !t.excluded).length})`}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
