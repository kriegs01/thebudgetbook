import React, { useState, useRef } from 'react';
import { Loader2, CheckCircle2, X, Trash2, AlertCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import { squeezeMariBank, StandardTransaction } from '../utils/parsers/maribank';
import { createTransaction } from '../services/transactionsService';
import type { Transaction } from '../types';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

// Inside JuiceBox.tsx state definitions:
const [matchedLinks, setMatchedLinks] = useState<Record<string, string[]>>({});


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
        console.log(`Extracting text from page ${i} of ${pdfDoc.numPages}...`);
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join('\n');
        extractedText += pageText + '\n';
      }

      console.log("Parsing text through MariBank squeeze engine...");
      const rawTransactions = squeezeMariBank(extractedText);
      console.log(`Successfully parsed ${rawTransactions.length} transactions.`);

      if (rawTransactions.length === 0) {
        alert("No transactions found or unrecognized statement format.");
        setStatus('idle');
        return;
      }

      const processedRows: PendingRow[] = rawTransactions.map(tx => {
        const txDateStr = new Date(tx.date).toISOString().slice(0, 10);
        
        // 🟢 The (existingTransactions || []) prevents the runtime crash!
        const isMatch = (existingTransactions || []).some(existing => {
          const existingDateStr = new Date(existing.date).toISOString().slice(0, 10);
          return existing.paymentMethodId === selectedAccountId &&
                 Math.abs(existing.amount) === Math.abs(tx.amount) &&
                 existingDateStr === txDateStr;
        });

        return {
          ...tx,
          isDuplicate: isMatch,
          excluded: isMatch,
        };
      });



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

  const handleConfirmImport = async () => {
    setIsImporting(true);
  
    // 1. Separate the selected transactions into two buckets
    const itemsToProcess = transactions.filter(tx => tx.selected);
    const newTransactions = itemsToProcess.filter(tx => !tx.isDuplicate);
    const duplicateTransactions = itemsToProcess.filter(tx => tx.isDuplicate);
  
    try {
      // 🟢 PHASE 2: Insert the new transactions with the shield flag
      if (newTransactions.length > 0) {
        const payload = newTransactions.map(tx => ({
          account_id: selectedAccountId,
          name: tx.name,
          amount: tx.amount,
          date: tx.date,
          transaction_type: tx.transaction_type,
          notes: tx.notes,
          is_reconciled: true // ✨ Automatically verified!
        }));
  
        const { error: insertError } = await supabase
          .from('transactions')
          .insert(payload);
  
        if (insertError) throw insertError;
      }
  
      // 🟢 PHASE 3: Retroactively stamp the duplicates as verified
      if (duplicateTransactions.length > 0) {
        // Assuming your duplicate detection stored the ID of the matched transaction 
        // in something like tx.existingId or tx.duplicateId
        const duplicateIds = duplicateTransactions
          .map(tx => tx.existingId) 
          .filter(Boolean); // Filter out any undefined just to be safe
  
        if (duplicateIds.length > 0) {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ is_reconciled: true }) // ✨ Stamp the existing ones!
            .in('id', duplicateIds);
  
          if (updateError) throw updateError;
        }
      }
  
      // Clear the modal and refresh your ledger
      onImportComplete?.();
      setShowModal(false);
  
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
      <div className="relative group inline-block">
        <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={status === 'processing'}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-yellow-400 text-black border-4 border-black rounded-xl font-black uppercase tracking-widest text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-y-[2px]"
        >
          {status === 'idle' && <><span>🧃</span><span>Juice PDF</span></>}
          {status === 'processing' && <Loader2 className="w-5 h-5 animate-spin text-black" />}
          {status === 'success' && <CheckCircle2 className="w-5 h-5 text-black" />}
        </button>
      </div>

      {showReviewModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 flex flex-col max-h-[85vh]">
            
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
              {pendingTransactions.map((tx, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between border-2 border-black p-3 rounded-xl transition-all ${
                    tx.excluded ? 'bg-gray-200 dark:bg-gray-800/40 opacity-60' : 'bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input 
                      type="checkbox"
                      checked={!tx.excluded}
                      onChange={() => toggleRowExclusion(idx)}
                      className="w-4 h-4 rounded border-2 border-black accent-black cursor-pointer"
                      title="Toggle inclusion"
                    />
                      <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black truncate">{tx.name}</span>
                        
                        {/* 🟢 NEW: Show the hidden clue for transfers! */}
                        {tx.name === 'Funds Transfer' && tx.raw_text && tx.raw_text !== 'Funds Transfer' && (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-100 border border-blue-600 px-1.5 py-0.5 rounded uppercase truncate max-w-[120px]">
                            {tx.raw_text}
                          </span>
                        )}

                        {tx.isDuplicate && (
                          <span className="bg-amber-200 text-amber-900 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Already Logged
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black truncate">{tx.name}</span>
                        
                        {tx.name === 'Funds Transfer' && tx.raw_text && tx.raw_text !== 'Funds Transfer' && (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-100 border border-blue-600 px-1.5 py-0.5 rounded uppercase truncate max-w-[120px]">
                            {tx.raw_text}
                          </span>
                        )}

                        {tx.isDuplicate && (
                          <span className="bg-amber-200 text-amber-900 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Already Logged
                          </span>
                        )}
                      </div>

                        {/* 🟢 MULTI-SELECT MATCHING CONTAINER */}
          {tx.name === 'Funds Transfer' && !tx.isDuplicate && (
            <div className="relative mt-2">
              {/* Dropdown Toggle Header */}
              <div className="flex flex-col gap-1">
                <div className="text-[10px] font-black uppercase text-gray-400">Match & Link:</div>
                <div className="flex flex-wrap gap-1 max-w-[240px]">
                  {(matchedLinks[tx.id] || []).length === 0 ? (
                    <span className="text-[10px] italic text-gray-500 bg-white border border-gray-300 rounded px-2 py-1">
                      No items linked (Import as new)
                    </span>
                  ) : (
                    (matchedLinks[tx.id] || []).map(linkId => (
                      <span key={linkId} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-indigo-300">
                        Linked ({linkId.slice(0, 6)}...)
                        <button 
                          type="button"
                          onClick={() => {
                            setMatchedLinks(prev => ({
                              ...prev,
                              [tx.id]: (prev[tx.id] || []).filter(id => id !== linkId)
                            }));
                          }}
                          className="hover:text-red-600 font-bold ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Checkbox List Box */}
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border-2 border-black bg-white p-2 shadow-sm space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 border-b pb-1">Select matching items:</p>
                
                {/* 1. Ledger Options */}
                {existingTransactions && existingTransactions.map(ledgerTx => {
                  const isChecked = (matchedLinks[tx.id] || []).includes(`tx_${ledgerTx.id}`);
                  return (
                    <label key={`opt_tx_${ledgerTx.id}`} className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const idVal = `tx_${ledgerTx.id}`;
                          setMatchedLinks(prev => {
                            const current = prev[tx.id] || [];
                            const next = e.target.checked ? [...current, idVal] : current.filter(id => id !== idVal);
                            return { ...prev, [tx.id]: next };
                          });
                        }}
                        className="rounded"
                      />
                      <span className="truncate">[Ledger] {ledgerTx.name} (₱{Math.abs(ledgerTx.amount)})</span>
                    </label>
                  );
                })}

                {/* 2. Installment Options */}
                {installments && installments.filter(i => !i.isArchived).map(inst => {
                  const isChecked = (matchedLinks[tx.id] || []).includes(`inst_${inst.id}`);
                  return (
                    <label key={`opt_inst_${inst.id}`} className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const idVal = `inst_${inst.id}`;
                          setMatchedLinks(prev => {
                            const current = prev[tx.id] || [];
                            const next = e.target.checked ? [...current, idVal] : current.filter(id => id !== idVal);
                            return { ...prev, [tx.id]: next };
                          });
                        }}
                        className="rounded"
                      />
                      <span className="truncate">[Budee] {inst.name} (₱{inst.totalAmount})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
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
            className="flex-1 bg-green-400 text-black py-3 rounded-xl font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px]"
          >
            Import Selected ({pendingTransactions.filter(t => !t.excluded).length})
          </button>
        </div>

      </div>
    </div>
  )}


            <div className="border-t-4 border-black pt-4 mt-4 flex gap-3">
              <button onClick={() => setShowReviewModal(false)} className="flex-1 bg-gray-200 py-3 rounded-xl font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                Cancel
              </button>
              <button onClick={handleConfirmImport} className="flex-1 bg-green-400 text-black py-3 rounded-xl font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px]">
                Import Selected ({pendingTransactions.filter(t => !t.excluded).length})
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
