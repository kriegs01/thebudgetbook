import React, { useState, useEffect } from 'react';
import { Package, Truck, Clock, X, MapPin, Pencil } from 'lucide-react';
import { supabase } from '../src/utils/supabaseClient';
// If you have a shared PageHeader component, import it here:
// import { PageHeader } from '../components/PageHeader';

// Calculates days left in a standard 15-day Shopee Mall return window
const calculateDaysLeft = (completedDateStr: string | null) => {
  if (!completedDateStr) return 0;
  
  const completedDate = new Date(completedDateStr);
  const now = new Date();
  
  // Calculate difference in days
  const diffTime = now.getTime() - completedDate.getTime();
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, 15 - daysElapsed);
};



export default function Orders() {
  const [activeTab, setActiveTab] = useState<'InTransit' | 'ReturnWindow'>('InTransit');
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [trackingData, setTrackingData] = useState({ trackingNumber: '', courier: 'SPX' });

  useEffect(() => {
    fetchOrders();
  }, []);

    const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .in('order_status', ['pending_delivery', 'completed'])
        .order('date', { ascending: false }); // ✅ Fixed! Sorting by transaction date instead

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const inTransitOrders = orders.filter(o => o.order_status === 'pending_delivery');
  const returnWindowOrders = orders.filter(o => o.order_status === 'completed');

    const openTrackingModal = (tx: any) => {
    setSelectedTx(tx);
    // 🟢 Pre-fill existing data if it's already saved
    setTrackingData({ 
      trackingNumber: tx.tracking_number || '', 
      courier: tx.courier || 'SPX' 
    });
    setTrackingModalOpen(true);
  };


  const handleSaveTracking = async () => {
    if (!selectedTx) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          tracking_number: trackingData.trackingNumber,
          courier: trackingData.courier
        })
        .eq('id', selectedTx.id);

      if (error) throw error;

      // Refresh the list and close modal
      fetchOrders();
      setTrackingModalOpen(false);
    } catch (error) {
      console.error('Error saving tracking:', error);
      alert('Failed to save tracking info.');
    }
  };


  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER SECTION (Replace with <PageHeader /> if you prefer) */}
      <div className="flex items-center gap-4 mb-2">
        <div className="w-14 h-14 bg-orange-400 rounded-2xl flex items-center justify-center text-black border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3">
          <Package className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-gray-900 dark:text-white leading-none">Logistics</h1>
          <p className="text-xs sm:text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">Track & Return Parcels</p>
        </div>
      </div>

      {/* UNIFIED SEGMENTED TAB BAR */}
      <div className="flex w-full border-[3px] border-black rounded-xl overflow-hidden mb-4 bg-white dark:bg-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-[10px] sm:text-xs font-black uppercase tracking-wider transition-colors">
        <button 
          onClick={() => setActiveTab('InTransit')}
          className={`flex-1 py-3 sm:py-4 flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'InTransit' 
              ? 'bg-orange-200 dark:bg-orange-600 text-orange-900 dark:text-white' 
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Truck className="w-4 h-4 hidden sm:block" />
          In Transit <span className="opacity-60">({inTransitOrders.length})</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('ReturnWindow')}
          className={`flex-1 py-3 sm:py-4 border-l-[3px] border-black flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'ReturnWindow' 
              ? 'bg-blue-200 dark:bg-blue-600 text-blue-900 dark:text-white' 
              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Clock className="w-4 h-4 hidden sm:block" />
          Return Window <span className="opacity-60">({returnWindowOrders.length})</span>
        </button>
      </div>

      {/* LIST CONTENT */}
      {isLoading ? (
        <p className="text-center text-gray-500 font-bold mt-10">Loading parcels...</p>
      ) : activeTab === 'InTransit' ? (
        <div className="space-y-4">
          {inTransitOrders.length === 0 ? (
            <p className="text-center text-gray-400 font-bold italic py-8">No parcels currently in transit.</p>
          ) : (
            inTransitOrders.map(tx => (
              <div key={tx.id} className="bg-[#fffdf7] dark:bg-gray-800 border-[3px] border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-gray-900 dark:text-white text-lg uppercase tracking-tight">{tx.name || 'Unknown Item'}</h3>
                    <p className="text-xs font-bold text-gray-500">₱{Number(tx.amount).toFixed(2)}</p>
                  </div>
                  <span className="bg-yellow-300 text-yellow-900 border-2 border-yellow-500 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md">
                    Shipped
                  </span>
                </div>
                
                {tx.tracking_number || tx.courier ? (
                  <div className="bg-gray-100 dark:bg-gray-900 border-2 border-black rounded-xl p-3 flex justify-between items-center shadow-[inset_2px_2px_0px_rgba(0,0,0,0.05)]">
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">{tx.courier || 'Courier'}</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white font-mono tracking-wider">{tx.tracking_number || 'No Tracking #'}</p>
                    </div>
                                        <button 
                      onClick={() => openTrackingModal(tx)}
                      className="p-2 bg-white dark:bg-gray-800 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-gray-700 dark:text-gray-300"
                      title="Edit Tracking"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                  </div>
                ) : (
                  <button 
                    onClick={() => openTrackingModal(tx)}
                    className="w-full bg-white dark:bg-gray-900 border-2 border-dashed border-black/40 text-black dark:text-white font-bold text-[10px] uppercase tracking-widest py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex justify-center items-center gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Add Tracking Info
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
  {returnWindowOrders.length === 0 ? (
    <p className="text-center text-gray-400 font-bold italic py-8">No recently completed parcels.</p>
  ) : (
    returnWindowOrders.map(tx => {
      const daysLeft = calculateDaysLeft(tx.completed_date);
      const isExpired = daysLeft === 0;
      
      // Math for the SVG circle (Circumference = 2 * pi * r)
      const radius = 20;
      const circumference = 2 * Math.PI * radius;
      const dashoffset = circumference - ((daysLeft / 15) * circumference);

      return (
        <div key={tx.id} className={`bg-[#fffdf7] dark:bg-gray-800 border-[3px] border-black rounded-2xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between gap-4 transition-opacity ${isExpired ? 'opacity-50' : ''}`}>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-gray-900 dark:text-white text-lg uppercase tracking-tight truncate">
              {tx.description || 'Unknown Item'}
            </h3>
            <p className="text-xs font-bold text-gray-500">₱{Number(tx.amount).toFixed(2)}</p>
            
            {!isExpired ? (
              <span className="inline-block mt-2 bg-blue-100 text-blue-900 border-2 border-blue-400 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md">
                Eligible for Return
              </span>
            ) : (
              <span className="inline-block mt-2 bg-gray-200 text-gray-600 border-2 border-gray-400 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md">
                Window Closed
              </span>
            )}
          </div>
          
          {/* THE COUNTDOWN RING */}
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            {/* Background Ring */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle 
                cx="24" cy="24" r={radius} 
                className="fill-none stroke-gray-200 dark:stroke-gray-700" 
                strokeWidth="6" 
              />
              {/* Progress Ring */}
              <circle 
                cx="24" cy="24" r={radius} 
                className={`fill-none ${isExpired ? 'stroke-gray-400' : daysLeft <= 3 ? 'stroke-red-500' : 'stroke-blue-500'}`} 
                strokeWidth="6"
                strokeLinecap="round"
                style={{ 
                  strokeDasharray: circumference, 
                  strokeDashoffset: isExpired ? circumference : dashoffset,
                  transition: 'stroke-dashoffset 1s ease-in-out'
                }} 
              />
            </svg>
            
            {/* Center Text */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-lg font-black leading-none ${isExpired ? 'text-gray-400' : daysLeft <= 3 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                {daysLeft}
              </span>
              <span className="text-[7px] font-black uppercase tracking-widest text-gray-500">
                {daysLeft === 1 ? 'Day' : 'Days'}
              </span>
            </div>
          </div>
          
        </div>
      );
    })
  )}
</div>

      )}

      {/* TRACKING ENTRY MODAL */}
      {trackingModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#fff7e8] dark:bg-gray-900 rounded-[2rem] border-[4px] border-black w-full max-w-sm p-6 sm:p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative">
            <button 
              onClick={() => setTrackingModalOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-full border-2 border-black hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1 uppercase tracking-tight">Log Tracking</h3>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6">For: {selectedTx?.name}</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Courier</label>
                <select 
                  value={trackingData.courier}
                  onChange={(e) => setTrackingData({...trackingData, courier: e.target.value})}
                  className="w-full rounded-xl border-[3px] border-black bg-white dark:bg-gray-800 px-4 py-3 text-sm font-black text-gray-900 dark:text-white outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <option value="SPX">Shopee Xpress (SPX)</option>
                  <option value="J&T">J&T Express</option>
                  <option value="Flash">Flash Express</option>
                  <option value="NinjaVan">Ninja Van</option>
                  <option value="LBC">LBC</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Tracking Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. SPX0123456789"
                  value={trackingData.trackingNumber}
                  onChange={(e) => setTrackingData({...trackingData, trackingNumber: e.target.value})}
                  className="w-full rounded-xl border-[3px] border-black bg-white dark:bg-gray-800 px-4 py-3 text-sm font-black text-gray-900 dark:text-white outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] placeholder-gray-300"
                />
              </div>
            </div>

                        <button 
              onClick={handleSaveTracking}

              className="w-full bg-orange-500 text-white border-[3px] border-black rounded-xl py-3 font-black uppercase tracking-widest text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            >
              Save Details
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
