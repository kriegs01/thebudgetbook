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

// 🟢 ADD THESE TWO LINES:
import { encryptPassword, decryptPassword } from '../utils/cryptoUtils';
import { getStatementCredential, saveStatementCredential } from '../services/statementCredentialsService';


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
  vaultAccountId?: string; // 🟢 NEW: Allow JuiceBox to know about the Vault
  existingTransactions?: Transaction[];
  installments?: any[];
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


export const JuiceBox: React.FC<JuiceBoxProps> = ({ selectedAccountId, vaultAccountId, existingTransactions, installments, onImportComplete }) => {
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
  
  // 🟢 ZERO-KNOWLEDGE PDF UNLOCKER STATE
  const [pdfUnlockConfig, setPdfUnlockConfig] = useState<{
    show: boolean;
    mode: 'unlock' | 'save';
    encryptedPassword?: string;
    arrayBuffer?: ArrayBuffer;
  } | null>(null);
  const [unlockForm, setUnlockForm] = useState({ pdfPassword: '', webappPin: '' });
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);


  // Group the fetched banks by category for the dropdown
  const groupedBanks = availableBanks.reduce((acc, bank) => {
    if (!acc[bank.category]) acc[bank.category] = [];
    acc[bank.category].push(bank);
    return acc;
  }, {} as Record<string, BankConfig[]>);


    // 🟢 1. THE EXTRACTION ENGINE (Moved here so both normal and unlocked PDFs can use it)
    const processPdfDoc = async (pdfDoc: any) => {
      let extractedText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
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
  
      if (rawTransactions.length === 0) {
        alert("No transactions found or unrecognized statement format.");
        setStatus('idle');
        return;
      }

      // 🟢 NEW: The flexible dictionary for bank-specific vault keywords
const VAULT_DICTIONARY: Record<string, string[]> = {
  'gotyme': ['go save', 'goalsave'], 
  'tonik': ['stash'],                
  'maya': ['personal goals']         
};

const currentBankName = availableBanks.find(b => b.id === selectedBank)?.name.toLowerCase() || '';

// 🟢 Dynamically load the keywords for the currently selected bank
const activeVaultKeywords = Object.entries(VAULT_DICTIONARY)
  .find(([bankKey]) => currentBankName.includes(bankKey))?.[1] || [];

const expandedTransactions = rawTransactions.flatMap(tx => {
  const rawName = (tx.name || '').toLowerCase();
  
  // 🟢 Trigger the split ONLY if the bank has active keywords AND the transaction matches one
  const isVaultTransfer = activeVaultKeywords.length > 0 && activeVaultKeywords.some(kw => rawName.includes(kw));

    // If it's a stash movement AND this account has a vault configured
    if (isVaultTransfer && vaultAccountId) {
      const mainLeg = {
        ...tx,
        id: `${tx.id}_main`, // 🟢 FIX: Make the ID unique
        transaction_type: 'internal_transfer',
        paymentMethodId: selectedAccountId,
      };
  
      const vaultLeg = {
        ...tx,
        id: `${tx.id}_vault`, // 🟢 FIX: Make the ID unique
        name: `Vault: ${tx.name}`,
        amount: Math.abs(tx.amount), 
        transaction_type: 'internal_transfer',
        paymentMethodId: vaultAccountId, 
      };
  
      return [mainLeg, vaultLeg];
    }
  

  // Otherwise, return standard transaction
  return { ...tx, paymentMethodId: selectedAccountId };
});

  
      const autoMatchedLinks: Record<string, string[]> = {};
      const processedRows: PendingRow[] = rawTransactions.map((tx, idx) => {
        const txDateStr = new Date(tx.date).toISOString().slice(0, 10);
        const uniqueRowId = tx.id || `pdf_row_${idx}_${Date.now()}`;
  
        const signature = `[JB_Ref: ${tx.name}_${Math.abs(tx.amount)}]`;
  
        const matchedExistingTx = (existingTransactions || []).find(existing => {
          const existingDateStr = new Date(existing.date).toISOString().slice(0, 10);
          return existing.paymentMethodId === selectedAccountId &&
                 Math.abs(existing.amount) === Math.abs(tx.amount) &&
                 existingDateStr === txDateStr;
        });
        
        const isMatchedByRef = knownSignatures.some(ref => ref.includes(signature));
        const isMatch = !!matchedExistingTx || isMatchedByRef; 
  
        if (tx.name === 'Funds Transfer' && !isMatch) {
          const txAmount = Math.abs(tx.amount);
          const isIncomingTransfer = tx.amount > 0;
  
          const smartMatch = (existingTransactions || []).find(ledgerTx => {
            if ((ledgerTx as any).iou_status !== 'pending') return false;
            
            const ledgerAmount = Math.abs(ledgerTx.amount);
            if (isIncomingTransfer) return (ledgerTx as any).beneficiary_id && ledgerAmount === txAmount;
            return (ledgerTx as any).payer_id && ledgerAmount === txAmount;
          });
  
          if (smartMatch) autoMatchedLinks[uniqueRowId] = [`tx_${smartMatch.id}`];
        }
  
        return {
          ...tx,
          id: uniqueRowId, 
          isDuplicate: isMatch, 
          excluded: isMatch,    
          existingId: matchedExistingTx?.id 
        };
      });
  
      setMatchedLinks(autoMatchedLinks);
      setPendingTransactions(processedRows);
      setShowReviewModal(true);
      setStatus('idle');
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    };
  
    // 🟢 2. THE NEW INTERCEPTOR
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedAccountId) {
        alert("Please select an account first!");
        return;
      }
  
      setStatus('processing');
  
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        try {
          // Try to open it normally first
// 🟢 AFTER: Slice the buffer so the worker doesn't consume our only copy
const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
          const pdfDoc = await loadingTask.promise;
          await processPdfDoc(pdfDoc);
  
        } catch (pdfError: any) {
          // 🟢 TRAP THE ENCRYPTION ERROR!
          if (pdfError.name === 'PasswordException') {
            console.log("PDF is encrypted. Checking vault for saved credentials...");
            
            // Check our new Supabase vault
            const { data: encryptedPass } = await getStatementCredential(selectedBank);
  
            if (encryptedPass) {
              // We have a saved password! Ask for PIN to unlock it.
              setPdfUnlockConfig({ show: true, mode: 'unlock', encryptedPassword: encryptedPass, arrayBuffer });
            } else {
              // No saved password. Ask for PDF password + PIN to save it.
              setPdfUnlockConfig({ show: true, mode: 'save', arrayBuffer });
            }
            setStatus('idle');
            return;
          } else {
            throw pdfError;
          }
        }
      } catch (error: any) {
        console.error('FULL PDF ERROR:', error);
        alert(`Failed to read PDF: ${error?.message || 'Unknown error'}`);
        setStatus('idle');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  
    // 🟢 3. THE DECRYPTION HANDLER
    const handlePdfUnlockSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pdfUnlockConfig?.arrayBuffer) return;
  
      setIsUnlocking(true);
      setUnlockError('');
  
      try {
        let actualPdfPassword = '';
  
        if (pdfUnlockConfig.mode === 'unlock') {
          // Use their PIN to decrypt the vault string
          const decrypted = decryptPassword(pdfUnlockConfig.encryptedPassword!, unlockForm.webappPin);
          if (!decrypted) throw new Error("Incorrect Webapp PIN. Could not decrypt vault.");
          actualPdfPassword = decrypted;
        } else {
          actualPdfPassword = unlockForm.pdfPassword;
        }
  
        // Test the password against the PDF
        // 🟢 AFTER: Slice the buffer on unlock attempts
const loadingTask = pdfjsLib.getDocument({
  data: pdfUnlockConfig.arrayBuffer.slice(0),
  password: actualPdfPassword
});

        const pdfDoc = await loadingTask.promise;
  
        // If we are in 'save' mode and the password worked, encrypt and save it!
        if (pdfUnlockConfig.mode === 'save') {
          const encrypted = encryptPassword(actualPdfPassword, unlockForm.webappPin);
          await saveStatementCredential(selectedBank, encrypted);
        }
  
        // Cleanup and process!
        setPdfUnlockConfig(null);
        setUnlockForm({ pdfPassword: '', webappPin: '' });
        setStatus('processing');
        
        await processPdfDoc(pdfDoc);
  
      } catch (error: any) {
        console.error("Unlock error:", error);
        if (error.name === 'PasswordException') {
          setUnlockError(pdfUnlockConfig.mode === 'unlock' ? 'Stored password failed. You may need to reset it.' : 'Incorrect PDF password.');
        } else {
          setUnlockError(error.message || 'Failed to unlock PDF.');
        }
      } finally {
        setIsUnlocking(false);
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
    // 🟢 FIX: Check if the tx has a custom ID first (for Vaults), otherwise fallback to the selected account
    payment_method_id: (tx as any).paymentMethodId || selectedAccountId, 
    user_id: user.id, 
    name: tx.name,
    amount: -(tx.amount),
    date: tx.date,
    transaction_type: tx.transaction_type, // 🟢 This will now correctly save 'internal_transfer'
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

    // 🟢 CALIBRATION MATH (Live vs Projected)
  const currentLiveBalance = React.useMemo(() => {
    if (!existingTransactions) return 0;
    return existingTransactions
      .filter(tx => tx.paymentMethodId === selectedAccountId || (tx as any).payment_method_id === selectedAccountId)
      .reduce((sum, tx) => sum + (-tx.amount), 0); 
      // Note: In DB, Income is negative & Expense is positive. -tx.amount converts it to a standard readable balance.
  }, [existingTransactions, selectedAccountId]);

  const netImportChange = React.useMemo(() => {
    let change = 0;
    pendingTransactions.forEach((tx, idx) => {
      if (tx.excluded) return;

      const stateKey = tx.id || idx;
      let links = matchedLinks[stateKey] || [];
      if (!Array.isArray(links)) links = [links];
      
      const existingIds = Array.isArray((tx as any).existingId) ? (tx as any).existingId : ((tx as any).existingId ? [(tx as any).existingId] : []);
      const matchedObjIds = Array.isArray((tx as any).matchedIds) ? (tx as any).matchedIds : [];
      const allAssociatedIds = [...links, ...existingIds, ...matchedObjIds];
      
      const hasLedgerLink = allAssociatedIds.some(link => typeof link === 'string' && link.length > 10);
      
      if (!hasLedgerLink && !tx.isDuplicate) {
          // PDF parser amounts: positive = income, negative = expense
          change += Number(tx.amount) || 0;
      }
    });
    return change;
  }, [pendingTransactions, matchedLinks]);

  const projectedBalance = currentLiveBalance + netImportChange;

  // 🟢 NEW: Calculate the date range of the imported statement
  const statementRange = React.useMemo(() => {
    const dates = pendingTransactions.map(tx => new Date(tx.date).getTime()).filter(t => !isNaN(t));
    if (dates.length === 0) return null;
    
    return {
      start: new Date(Math.min(...dates)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      end: new Date(Math.max(...dates)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
  }, [pendingTransactions]);


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

              {/* 🟢 ZERO-KNOWLEDGE UNLOCK MODAL */}
      {pdfUnlockConfig?.show && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 border-4 border-black rounded-2xl w-full max-w-sm p-6 relative shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <button 
              onClick={() => { setPdfUnlockConfig(null); setUnlockForm({ pdfPassword: '', webappPin: '' }); setUnlockError(''); }} 
              className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            
            <div className="mb-6">
              <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">
                {pdfUnlockConfig.mode === 'unlock' ? 'Unlock Statement' : 'Secure Statement'}
              </h2>
              <p className="text-xs font-bold text-gray-500">
                {pdfUnlockConfig.mode === 'unlock' 
                  ? 'Enter your Webapp PIN to decrypt your saved bank password and open this file.'
                  : 'This PDF is locked. Enter its password and your Webapp PIN to securely save it to your vault.'}
              </p>
            </div>

            <form onSubmit={handlePdfUnlockSubmit} className="space-y-4">
              {pdfUnlockConfig.mode === 'save' && (
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bank PDF Password</label>
                  <input 
                    type="password" 
                    required 
                    value={unlockForm.pdfPassword}
                    onChange={e => setUnlockForm(f => ({ ...f, pdfPassword: e.target.value }))}
                    placeholder="e.g. Birthdate (MMDDYYYY)"
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-3 outline-none text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Webapp PIN</label>
                <input 
                  type="password" 
                  required 
                  maxLength={6}
                  value={unlockForm.webappPin}
                  onChange={e => setUnlockForm(f => ({ ...f, webappPin: e.target.value }))}
                  placeholder="••••"
                  className="w-full bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-400 rounded-xl p-3 outline-none text-center tracking-[0.5em] text-lg font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {unlockError && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-2 text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-bold">{unlockError}</span>
                </div>
              )}

              <button 
                type="submit" 
                disabled={isUnlocking || !unlockForm.webappPin || (pdfUnlockConfig.mode === 'save' && !unlockForm.pdfPassword)}
                className="w-full bg-black text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isUnlocking ? 'Unlocking...' : (pdfUnlockConfig.mode === 'unlock' ? 'Unlock & Parse' : 'Save & Parse')}
              </button>
            </form>
          </div>
        </div>
      )}


            {showReviewModal && (
        // 🟢 Softened background from bg-black/60 to bg-gray-900/40 with a blur
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-md">
          {/* 🟢 Expanded modal width from max-w-2xl to max-w-6xl */}
          <div className="w-full max-w-6xl bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className="flex justify-between items-center border-b-4 border-black p-5 bg-white dark:bg-gray-800 shrink-0">
              <div>
                <h2 className="text-2xl font-black uppercase">JuiceBox Review</h2>
                <p className="text-xs text-gray-500 font-bold tracking-wide mt-1">Review, link, and reconcile {pendingTransactions.length} items.</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="p-2 border-2 border-black rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TWO-COLUMN LAYOUT */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 bg-gray-50 dark:bg-gray-950">
              
              {/* 🟢 LEFT SIDEBAR (Calibration & Summary) */}
              <div className="w-full lg:w-[35%] p-5 flex flex-col gap-5 border-b-4 lg:border-b-0 lg:border-r-4 border-black overflow-y-auto bg-white dark:bg-gray-900 shrink-0">
                
                {/* Statement Date Range */}
                <div className="bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Statement Period</h3>
                  {statementRange ? (
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 flex flex-col gap-1">
                      <span>{statementRange.start}</span>
                      <span className="text-gray-400 text-xs text-center w-8">to</span>
                      <span>{statementRange.end}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Unknown Range</span>
                  )}
                </div>

                {/* Vertical Calibration Dashboard */}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border-2 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">Live Ledger Balance</span>
                    <span className="text-2xl font-black text-gray-900 dark:text-white">
                      ₱{currentLiveBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="border-t-2 border-dashed border-indigo-200 dark:border-indigo-800 pt-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1">Net Import Change</span>
                    <span className={`text-xl font-black ${netImportChange > 0 ? 'text-green-600 dark:text-green-400' : netImportChange < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                      {netImportChange > 0 ? '+' : ''}{netImportChange.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="border-t-2 border-dashed border-indigo-200 dark:border-indigo-800 pt-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 block mb-1">Projected Balance</span>
                    <span className="text-3xl font-black text-gray-900 dark:text-white">
                      ₱{projectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* 🟢 RIGHT COLUMN (Transaction List & Actions) */}
              <div className="w-full lg:w-[65%] flex flex-col min-h-0 bg-transparent">
                
                {/* List Header & Toggle All */}
                <div className="p-4 flex justify-end shrink-0 border-b-2 border-black/10">
                  <button
                    type="button"
                    onClick={toggleAllExtracted}
                    className="flex items-center gap-2 rounded-xl border-[3px] border-black bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:bg-gray-800 dark:text-gray-300"
                  >
                     <span>☑️</span> Toggle All Selections
                  </button>
                </div>

                {/* Scrollable Transaction List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {pendingTransactions.map((tx, idx) => {
                    const isMatchable = !tx.isDuplicate; 
                    const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
                    const txDateMs = new Date(tx.date).getTime();
                    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                    const minDateMs = txDateMs - threeDaysMs;
                    const maxDateMs = txDateMs + threeDaysMs;
                    const txAbsAmount = Math.abs(tx.amount);

                    const selectedElsewhere = new Set();
                    Object.entries(matchedLinks).forEach(([key, links]) => {
                      if (key !== String(tx.id || idx)) { 
                        links.forEach(link => selectedElsewhere.add(link));
                      }
                    });

                    const suggestedLedger = (existingTransactions || [])
                    .filter(ledgerTx => {
                      const isSameAccount = ledgerTx.paymentMethodId === selectedAccountId || (ledgerTx as any).payment_method_id === selectedAccountId;
                      if (!isSameAccount) return false;
                      const ledgerDateMs = new Date(ledgerTx.date).getTime();
                      if (ledgerDateMs < minDateMs || ledgerDateMs > maxDateMs) return false;
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
                       if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch; 
                       return Math.abs(Math.abs(a.amount) - txAbsAmount) - Math.abs(Math.abs(b.amount) - txAbsAmount);
                     });

                    const stateKey = tx.id || idx;
                    const activeLinks = matchedLinks[stateKey] || [];
                    const hasSelection = activeLinks.length > 0;
                    
                    let totalSelected = 0;
                    activeLinks.forEach(linkId => {
                      if (typeof linkId === 'string' && linkId.startsWith('tx_')) {
                        const found = existingTransactions?.find(t => String(t.id) === linkId.replace('tx_', ''));
                        if (found?.amount) totalSelected += Math.abs(found.amount);
                      }
                    });
                    
                    const targetAmount = Math.abs(Number(tx.amount) || 0);
                    const diff = targetAmount - totalSelected;
                    const isIncoming = tx.amount > 0;

                    return (
                      <div 
                        key={`row_${stateKey}`} 
                        className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                          tx.excluded ? 'opacity-50 border-gray-400 bg-gray-100 dark:bg-gray-800' : 'border-black bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={!tx.excluded}
                              onChange={() => toggleRowExclusion(idx)}
                              className="rounded w-4 h-4 bg-white border-2 border-black accent-indigo-600"
                            />
                            <span className="bg-gray-100 border border-gray-300 text-gray-900 text-[10px] font-black px-2 py-0.5 rounded tracking-wide uppercase dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                              {formattedDate}
                            </span>
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{tx.name}</span>
                            {tx.isDuplicate && (
                              <span className="bg-blue-100 text-blue-700 border-2 border-blue-300 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
                                Duplicate
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-black ${isIncoming ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {isIncoming ? '+' : '-'}₱{targetAmount.toFixed(2)}
                            </span>
                            
                            {hasSelection && (
                              <div className="flex flex-col items-end text-[9px] font-bold uppercase tracking-wider mt-1">
                                <span className="text-gray-500">Selected: ₱{totalSelected.toFixed(2)}</span>
                                {Math.abs(diff) < 0.01 ? (
                                  <span className="text-green-600 dark:text-green-400">✓ Exact Match</span>
                                ) : diff > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400">₱{diff.toFixed(2)} left</span>
                                ) : (
                                  <span className="text-red-600 dark:text-red-400">Over by ₱{Math.abs(diff).toFixed(2)}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {!tx.isDuplicate && (
                          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700 mt-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">Match & Link to Ledger:</div>
                            
                            {hasSelection ? (
                               <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-3 py-2 rounded-md border border-indigo-200 dark:border-indigo-800 inline-block">
                                 {activeLinks.length} Item(s) Linked
                               </div>
                            ) : (
                               <div className="bg-white dark:bg-gray-800 text-gray-500 text-[10px] font-bold px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 italic inline-block">
                                 No items linked (Will import as new)
                               </div>
                            )}

                            {suggestedLedger.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mb-2">
                                  Suggested Matches (±3 Days):
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {suggestedLedger.map(ledgerTx => {
                                    const idVal = `tx_${ledgerTx.id}`;
                                    const isChecked = activeLinks.includes(idVal);
                                    const isPendingIOU = (ledgerTx as any).iou_status === 'pending';
                                    
                                    let dateStr = '--/--/----';
                                    try {
                                      if (ledgerTx.date) {
                                        const d = new Date(ledgerTx.date);
                                        if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
                                      }
                                    } catch (e) {}

                                    const badgeText = isPendingIOU ? 'Pending IOU' : (ledgerTx.transaction_type || 'Ledger');
                                    const badgeColor = isPendingIOU 
                                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' 
                                      : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';

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
                                        className={`flex items-center gap-3 text-[10px] font-bold cursor-pointer p-2 rounded-lg transition-all border-2 ${
                                          isChecked 
                                            ? 'bg-indigo-50 border-indigo-500 shadow-[2px_2px_0px_0px_rgba(99,102,241,0.5)] dark:bg-indigo-900/30' 
                                            : 'bg-white border-transparent hover:border-gray-300 shadow-sm dark:bg-gray-800'
                                        }`}
                                      >
                                        <input type="checkbox" checked={isChecked} onChange={() => {}} className="rounded pointer-events-none accent-indigo-600 w-3 h-3" />
                                        <span className="truncate flex-1 min-w-[100px] text-gray-900 dark:text-gray-100">{ledgerTx.name}</span>
                                        <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] uppercase tracking-widest border ${badgeColor}`}>
                                          {badgeText}
                                        </span>
                                        <span className="shrink-0 w-16 text-right text-gray-400">{dateStr}</span>
                                        <span className="shrink-0 w-16 text-right text-gray-900 dark:text-gray-100">₱{Math.abs(ledgerTx.amount).toFixed(2)}</span>
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

                {/* Action Buttons Footer */}
                <div className="border-t-4 border-black p-5 bg-white dark:bg-gray-800 flex gap-4 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setShowReviewModal(false)} 
                    className="flex-1 bg-gray-100 py-4 rounded-xl font-black text-xs uppercase tracking-widest border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all dark:bg-gray-700 dark:text-white"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={handleConfirmImport} 
                    disabled={isImporting}
                    className="flex-[2] bg-green-400 text-black py-4 rounded-xl font-black text-xs uppercase tracking-widest border-[3px] border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : `Import Selected (${pendingTransactions.filter(t => !t.excluded).length})`}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </>
  );
};
