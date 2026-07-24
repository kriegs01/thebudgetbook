import React from 'react';
import { useSandbox } from '../components/useSandbox'; // Your new hook!

interface SandboxViewProps {
  onClose: () => void;
  // We will pass in your live budget data so the sandbox has a baseline to work from
  liveIncomeTxs: any[]; 
  liveSpendTxs: any[];
  activeSetup: any;
}

export const SandboxView: React.FC<SandboxViewProps> = ({ onClose, liveIncomeTxs, liveSpendTxs, activeSetup }) => {
  const {
    safetyNet, setSafetyNet,
    mockPurchases, addMockPurchase, removeMockPurchase
  } = useSandbox();

    // Controls the Apple Music style bottom tray on mobile
    const [isTrayOpen, setIsTrayOpen] = useState(false);


    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500 bg-gray-50 dark:bg-gray-950 min-h-screen pb-32 w-full p-4 md:p-8 relative overflow-hidden">
          
          {/* 🟢 HEADER (Main Background) */}
          <div className="flex justify-between items-center mb-8 border-b-4 border-black pb-4">
            <div>
              <h1 className="text-3xl font-black text-amber-500 uppercase tracking-widest style-text-shadow">
                Sandbox Mode
              </h1>
              <p className="text-gray-500 font-bold">Hypothetical Forecasting</p>
            </div>
            
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-red-100 text-red-700 border-2 border-black rounded-lg font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            >
              Exit Sandbox
            </button>
          </div>
    
          {/* 🟢 RESPONSIVE GRID */}
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            
            {/* 🟡 FORECAST BOARD (Always visible in the background) */}
            {/* Takes full width on mobile, 2/3 width on large screens */}
            <div className="w-full lg:w-2/3 flex flex-col gap-6 order-1 lg:order-2">
              <div className="p-6 bg-amber-50 dark:bg-gray-900 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-2xl font-black mb-6 uppercase">Forecast Results</h2>
                <div className="h-64 border-2 border-dashed border-gray-400 rounded-xl flex items-center justify-center text-gray-400 font-bold">
                  Forecast data will appear here...
                </div>
              </div>
            </div>
    
            {/* 🎶 APPLE MUSIC TRAY (Mobile) / STANDARD COLUMN (Desktop) */}
            {/* On mobile: Fixed at bottom, slides up. On desktop: Normal left column. */}
            <div className={`
              order-2 lg:order-1
              w-full lg:w-1/3 flex flex-col gap-6 
              lg:sticky lg:top-4 lg:translate-y-0
              fixed inset-x-0 bottom-0 z-50 lg:z-auto lg:relative
              bg-white dark:bg-gray-900 lg:bg-transparent lg:dark:bg-transparent
              rounded-t-[2.5rem] lg:rounded-none
              border-t-4 border-l-4 border-r-4 lg:border-none border-black
              shadow-[0px_-8px_20px_rgba(0,0,0,0.15)] lg:shadow-none
              transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
              ${isTrayOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.5rem)] lg:translate-y-0'}
            `}>
              
              {/* 🟢 TRAY HANDLE (Only visible on mobile) */}
              <div 
                className="lg:hidden w-full h-[4.5rem] flex flex-col items-center justify-center cursor-pointer active:bg-gray-100 rounded-t-[2.5rem] transition-colors"
                onClick={() => setIsTrayOpen(!isTrayOpen)}
              >
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mb-2"></div>
                <p className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-widest text-sm">
                  {isTrayOpen ? 'Swipe Down to Close' : 'Tap to Add Purchases'}
                </p>
              </div>
    
              {/* 🟢 TRAY CONTENT (Scrollable when open on mobile) */}
              <div className="px-6 pb-12 pt-2 lg:p-0 max-h-[75vh] lg:max-h-none overflow-y-auto lg:overflow-visible flex flex-col gap-6">
                
                <div className="p-6 bg-white dark:bg-gray-900 lg:border-4 lg:border-black lg:rounded-2xl lg:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h2 className="text-xl font-bold mb-4 uppercase">Safety Net</h2>
                  <p className="text-sm text-gray-500 mb-4">Set a minimum balance you want to maintain.</p>
                </div>
    
                <div className="p-6 bg-white dark:bg-gray-900 lg:border-4 lg:border-black lg:rounded-2xl lg:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <h2 className="text-xl font-bold mb-4 uppercase">Mock Purchases</h2>
                  <p className="text-sm text-gray-500 mb-4">Add hypothetical expenses to test your budget.</p>
                </div>
    
              </div>
            </div>
    
          </div>
    
          {/* 🟢 MOBILE BACKDROP (Darkens the background when tray is open) */}
          {isTrayOpen && (
            <div 
              className="lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-500 animate-in fade-in"
              onClick={() => setIsTrayOpen(false)}
            />
          )}
    
        </div>
      );
    };