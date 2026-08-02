import React, { useState, useRef } from 'react';
import { Loader2, CheckCircle2, X, Trash2, AlertCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { squeezeMariBank, StandardTransaction } from '../utils/parsers/maribank';
import { createTransaction } from '../services/transactionsService';
import type { Transaction } from '../types';


interface PendingRow extends StandardTransaction {
  isDuplicate: boolean;
  excluded: boolean;
}

interface JuiceBoxProps {
  selectedAccountId: string;
  existingTransactions: Transaction[]; // 🟢 Pass your app's current transactions here
  onImportComplete?: () => void;
}

export const JuiceBox: React.FC<JuiceBoxProps> = ({ selectedAccountId, existingTransactions, onImportComplete }) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const [pendingTransactions, setPendingTransactions] = useState<PendingRow[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        const isMatch = existingTransactions.some(existing => {
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


      const processedRows: PendingRow[] = rawTransactions.map(tx => {
        const txDateStr = new Date(tx.date).toISOString().slice(0, 10);
        
        const isMatch = existingTransactions.some(existing => {
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
      if (fileInputRef.current) fileInputRef.current.value = ''; 

    } catch (error: any) {
      console.error('Detailed Error reading document:', error?.message || error);
      alert("Failed to read PDF. Make sure it's a valid text-based MariBank statement.");
      setStatus('idle');
    }
  };


  // 3. Only save rows that are NOT manually excluded
  const handleConfirmImport = async () => {
    setStatus('processing');
    try {
      const rowsToSave = pendingTransactions.filter(tx => !tx.excluded);

      for (const tx of rowsToSave) {
        await createTransaction({
          name: tx.name,
          date: tx.date,
          amount: tx.amount,
          payment_method_id: selectedAccountId,
          transaction_type: tx.transaction_type,
          notes: tx.notes,
        });
      }

      setShowReviewModal(false);
      setPendingTransactions([]);
      setStatus('success');
      if (onImportComplete) onImportComplete();
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error("Error saving transactions:", error);
      alert("Failed to save some transactions.");
      setStatus('idle');
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
                        {tx.isDuplicate && (
                          <span className="bg-amber-200 text-amber-900 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Already Logged
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        {new Date(tx.date).toLocaleDateString()} • {tx.excluded ? 'Excluded from import' : 'Will be added'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-black ${tx.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {tx.amount > 0 ? '-' : '+'}₱{Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>

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
