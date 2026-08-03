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
  const [isImporting, setIsImporting] = useState(false); // FIXED: Added missing state
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
  
    // FIXED: Changed 'transactions' to 'pendingTransactions' and 'tx.selected' to '!tx.excluded'
    const itemsToProcess = pendingTransactions.filter(tx => !tx.excluded);
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
          notes: (tx as any).notes,
          is_reconciled: true // ✨ Automatically verified!
        }));
  
        // Note: Ensure `supabase` is imported at the top of your file if you use this directly here.
        // const { error: insertError } = await supabase.from('transactions').insert(payload);
        // if (insertError) throw insertError;
      }
  
      // 🟢 PHASE 3: Retroactively stamp the duplicates as verified
      if (duplicateTransactions.length > 0) {
        const duplicateIds = duplicateTransactions
          .map(tx => (tx as any).existingId) 
          .filter(Boolean); 
  
        if (duplicateIds.length > 0) {
          // const { error: updateError } = await supabase.from('transactions').update({ is_reconciled: true }).in('id', duplicateIds);
          // if (updateError) throw updateError;
        }
      }
  
      onImportComplete?.();
      setShowReviewModal(false); // FIXED: Was setShowModal(false)
  
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
              {pendingTransactions.map((tx, idx) => {
                // 🟢 FIXED: Unlock dropdowns for ALL non-duplicate transactions!
                const isMatchable = !tx.isDuplicate; 

                const formattedDate = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();

                const txDateMs = new Date(tx.date).getTime();
                const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                const minDateMs = txDateMs - threeDaysMs;
                const maxDateMs = txDateMs + threeDaysMs;
                const txAbsAmount = Math.abs(tx.amount);

                // 🟢 NEW: Enhanced Sorting Logic based on Type vs Description
                const suggestedLedger = (existingTransactions || [])
                  .filter(ledgerTx => {
                    const ledgerDateMs = new Date(ledgerTx.date).getTime();
                    return ledgerDateMs >= minDateMs && ledgerDateMs <= maxDateMs;
                  })
                  .sort((a, b) => {
                    // 1. Cross-reference type vs description (e.g. ledger 'payment' vs statement 'Card Payment')
                    const txDesc = `${tx.name} ${tx.raw_text}`.toLowerCase();
                    const aType = String(a.transaction_type || '').toLowerCase();
                    const bType = String(b.transaction_type || '').toLowerCase();

                    const aTypeMatch = aType && txDesc.includes(aType) ? 1 : 0;
                    const bTypeMatch = bType && txDesc.includes(bType) ? 1 : 0;

                    // If one matches the description and the other doesn't, prioritize it
                    if (aTypeMatch !== bTypeMatch) {
                      return bTypeMatch - aTypeMatch; 
                    }

                    // 2. Fallback: Sort by amount closeness
                    return Math.abs(Math.abs(a.amount) - txAbsAmount) - Math.abs(Math.abs(b.amount) - txAbsAmount);
                  });

                const suggestedInstallments = (installments || [])
                  .filter(inst => !inst.isArchived)
                  .filter(inst => {
                    const instDateMs = new Date(inst.dueDate).getTime();
                    return instDateMs >= minDateMs && instDateMs <= maxDateMs;
                  })
                  .sort((a, b) => Math.abs(Math.abs(a.totalAmount) - txAbsAmount) - Math.abs(Math.abs(b.totalAmount) - txAbsAmount));

                // AUTO-CALCULATE TOTAL OF SELECTED LINKS
                const currentLinks = matchedLinks[idx] || [];
                let linkedTotal = 0;
                
                currentLinks.forEach(linkId => {
                  if (linkId.startsWith('tx_')) {
                    const id = linkId.replace('tx_', '');
                    const found = (existingTransactions || []).find(t => String(t.id) === id);
                    if (found) linkedTotal += Math.abs(found.amount);
                  } else if (linkId.startsWith('inst_')) {
                    const id = linkId.replace('inst_', '');
                    const found = (installments || []).find(i => String(i.id) === id);
                    if (found) linkedTotal += Number(found.totalAmount || 0);
                  }
                });

                const isFullyMatched = Math.abs(linkedTotal - txAbsAmount) < 0.01;

                return (
                  <div 
                    key={idx} 
                    className={`flex flex-col border-2 border-black p-3 rounded-xl transition-all ${
                      tx.excluded ? 'bg-gray-200 dark:bg-gray-800/40 opacity-60' : 'bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input 
                          type="checkbox"
                          checked={!tx.excluded}
                          onChange={() => toggleRowExclusion(idx)}
                          className="w-4 h-4 rounded border-2 border-black accent-black cursor-pointer min-w-[16px]"
                          title="Toggle inclusion"
                        />
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black tracking-wider bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded border border-gray-400">
                              {formattedDate}
                            </span>
                            
                            <span className="text-sm font-black truncate">
                              {tx.name === 'Funds Transfer' 
                                ? (tx.amount < 0 ? 'Funds Sent' : 'Funds Received') 
                                : tx.name}
                            </span>
                            
                            {tx.raw_text && tx.raw_text !== tx.name && (
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
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end ml-2">
                        <div className={`font-black text-sm whitespace-nowrap ${tx.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {tx.amount < 0 ? '-' : '+'}₱{txAbsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        
                        {currentLinks.length > 0 && (
                          <div className={`text-[9px] font-black mt-1 px-1.5 py-0.5 rounded border whitespace-nowrap ${
                            isFullyMatched 
                              ? 'bg-green-100 text-green-700 border-green-400' 
                              : 'bg-orange-100 text-orange-700 border-orange-400'
                          }`}>
                            Selected: ₱{linkedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>

                    {isMatchable && (
                      <div className="relative mt-2 pl-7">
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] font-black uppercase text-gray-400">Match & Link:</div>
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {(matchedLinks[idx] || []).length === 0 ? (
                              <span className="text-[10px] italic text-gray-500 bg-white border border-gray-300 rounded px-2 py-1">
                                No items linked (Import as new)
                              </span>
                            ) : (
                              (matchedLinks[idx] || []).map(linkId => (
                                <span key={linkId} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-indigo-300">
                                  Linked ({linkId.slice(0, 6)}...)
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      setMatchedLinks(prev => ({
                                        ...prev,
                                        [idx]: (prev[idx] || []).filter(id => id !== linkId)
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

                        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border-2 border-black bg-white p-2 shadow-sm space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 border-b pb-1">
                            Suggested matches (±3 Days):
                          </p>
                          
                          {suggestedLedger.length === 0 && suggestedInstallments.length === 0 && (
                            <p className="text-[10px] italic text-gray-500 p-1">No recent transactions found.</p>
                          )}

                          {suggestedLedger.map(ledgerTx => {
                            const isChecked = (matchedLinks[idx] || []).includes(`tx_${ledgerTx.id}`);
                            return (
                              <label key={`opt_tx_${ledgerTx.id}`} className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const idVal = `tx_${ledgerTx.id}`;
                                    setMatchedLinks(prev => {
                                      const current = prev[idx] || [];
                                      const next = e.target.checked ? [...current, idVal] : current.filter(id => id !== idVal);
                                      return { ...prev, [idx]: next };
                                    });
                                  }}
                                  className="rounded"
                                />
                                <span className="truncate">{ledgerTx.name} (₱{Math.abs(ledgerTx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                              </label>
                            );
                          })}

                          {suggestedInstallments.map(inst => {
                            const isChecked = (matchedLinks[idx] || []).includes(`inst_${inst.id}`);
                            return (
                              <label key={`opt_inst_${inst.id}`} className="flex items-center gap-2 text-[10px] font-bold text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const idVal = `inst_${inst.id}`;
                                    setMatchedLinks(prev => {
                                      const current = prev[idx] || [];
                                      const next = e.target.checked ? [...current, idVal] : current.filter(id => id !== idVal);
                                      return { ...prev, [idx]: next };
                                    });
                                  }}
                                  className="rounded"
                                />
                                <span className="truncate">[Budee] {inst.name} (₱{Number(inst.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                              </label>
                            );
                          })}
                        </div>
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
