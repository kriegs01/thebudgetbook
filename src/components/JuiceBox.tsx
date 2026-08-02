import React, { useState, useRef } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { squeezeMariBank } from '../utils/parsers/maribank';
import { createTransaction } from '../services/transactionsService'; // Your service!

interface JuiceBoxProps {
  selectedAccountId: string; // The account these statement transactions belong to
  onImportComplete?: () => void;
}

export const JuiceBox: React.FC<JuiceBoxProps> = ({ selectedAccountId, onImportComplete }) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAccountId) {
      alert("Please select an account first before juicing statements!");
      return;
    }

    setStatus('processing');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let extractedText = '';
      
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join('\n');
        extractedText += pageText + '\n';
      }

      // 1. Squeeze the text using our MariBank parser[span_0](start_span)[span_0](end_span)
      const rawTransactions = squeezeMariBank(extractedText);

      // 2. Loop and save each transaction using your service
      for (const tx of rawTransactions) {
        await createTransaction({
          ...tx,
          payment_method_id: selectedAccountId, // Ties it to the active account
        });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      
      setStatus('success');
      if (onImportComplete) onImportComplete();
      setTimeout(() => setStatus('idle'), 3000);

    } catch (error) {
      console.error('Error reading document:', error);
      setStatus('idle');
    }
  };

  return (
    <div className="relative group inline-block">
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={status === 'processing'}
        className={`
          flex items-center justify-center gap-2 px-5 py-3 
          bg-yellow-400 text-black 
          border-4 border-black rounded-xl 
          font-black uppercase tracking-widest text-sm
          shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] 
          transition-all transform -rotate-2
          hover:rotate-0 hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
          active:translate-y-[4px] active:translate-x-[4px] active:shadow-none
          disabled:opacity-70 disabled:pointer-events-none
        `}
      >
        {status === 'idle' && (
          <>
            <span className="text-xl">🧃</span>
            <span>Juice PDF</span>
          </>
        )}
        
        {status === 'processing' && (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-black" />
            <span>Squeezing...</span>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-5 h-5 text-black" />
            <span>Juiced!</span>
          </>
        )}
      </button>

      <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 p-3 bg-white text-black border-4 border-black font-bold text-xs text-center rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rotate-1 z-10">
        Let’s give your statements a squeeze! (Processed locally)
      </div>
    </div>
  );
};
