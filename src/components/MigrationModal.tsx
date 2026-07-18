import React, { useState } from 'react';

const MigrationModal = ({ installments, onClose, onUpdate }) => {
  // Store all due dates in an object: { [id]: '15th' }
  const [dueDates, setDueDates] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDateChange = (id, value) => {
    setDueDates(prev => ({ ...prev, [id]: value }));
  };

  // Inside MigrationModal.tsx

const handleSubmit = async () => {
  setIsSubmitting(true);
  const entries = Object.entries(dueDates);

  for (const [id, date] of entries) {
    if (date.trim() !== '') {
      // FIX: Send an object with the correct field names
      await onUpdate(id, { 
        due_date: date, 
        is_migrated: true 
      }); 
    }
  }

  setIsSubmitting(false);
  localStorage.setItem('hasCompletedMigration', 'true');
  onClose();
}; 
  
  const handleDismiss = () => {
    localStorage.setItem('hasDismissedMigration', 'true');
    onClose();
  };

  if (!installments || installments.length === 0) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md z-[200] animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-md p-6 relative transition-colors flex flex-col max-h-[85vh]">
        
        <div className="mb-4 shrink-0">
          <span className="inline-block -rotate-2 rounded-full border-[3px] border-black bg-yellow-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] mb-3">
            Action Required
          </span>
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight leading-none">
            Update Due Dates
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-medium mt-2">
            We are making improvements with due date tracking! Assign due dates to your active installments below to keep your tracking accurate.
          </p>
        </div>
        
        {/* Scrollable list of installments */}
        <div className="overflow-y-auto pr-2 mb-6 space-y-3">
          {installments.map((inst) => (
            <div key={inst.id} className="bg-gray-50 dark:bg-gray-800 border-[3px] border-black rounded-xl p-3 flex flex-col gap-2">
              <span className="text-sm font-black text-gray-900 dark:text-gray-100">
                {inst.name}
              </span>
              <input
                type="text"
                value={dueDates[inst.id] || ''}
                onChange={(e) => handleDateChange(inst.id, e.target.value)}
                placeholder="e.g., 15th, End of Month"
                className="w-full bg-white dark:bg-gray-900 border-2 border-black rounded-lg p-2.5 outline-none text-xs font-black focus:ring-2 focus:ring-indigo-500 transition-all dark:text-gray-100 placeholder:text-gray-400 placeholder:font-bold"
              />
            </div>
          ))}
        </div>

        <div className="flex space-x-3 pt-2 mt-auto shrink-0 border-t-2 border-dashed border-gray-200 dark:border-gray-700 pt-4">
          <button 
            onClick={handleDismiss} 
            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-[3px] border-black py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            Later
          </button>
          <button 
            disabled={isSubmitting || Object.keys(dueDates).length === 0}
            onClick={handleSubmit}
            className={`flex-1 border-[3px] border-black py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              Object.keys(dueDates).length > 0 && !isSubmitting
                ? 'bg-indigo-600 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]' 
                : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-70'
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Save Dates'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default MigrationModal;
