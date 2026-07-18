import React, { useState } from 'react';

// Added 'onUpdate' prop to handle the save action from the parent
const MigrationModal = ({ installments, onClose, onUpdate }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dueDate, setDueDate] = useState('');

  // Get only the item we are currently editing
  const currentItem = installments[currentIndex];

  const handleSubmit = async () => {
    if (!dueDate) return;

    // Call the save function passed from Budget.tsx
    await onUpdate(currentItem.id, dueDate);

    // If there are more items, move to the next one
    if (currentIndex < installments.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setDueDate(''); // Reset input for the next item
    } else {
      onClose(); // No more items, close the modal
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('hasDismissedMigration', 'true');
    onClose();
  };

  if (!currentItem) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl w-96">
        <h2 className="text-lg font-bold mb-4">
          Setup Installment ({currentIndex + 1} / {installments.length})
        </h2>
        <p className="mb-4">
          When is <strong>{currentItem.name}</strong> due?
        </p>
        
        <input
          type="text"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          placeholder="e.g., 15th"
          className="w-full p-2 border rounded mb-6 dark:bg-gray-800"
        />

        <div className="flex justify-end gap-4">
          <button onClick={handleDismiss} className="text-gray-500">Later</button>
          <button 
            disabled={!dueDate}
            onClick={handleSubmit}
            className={`px-4 py-2 rounded ${
              dueDate ? 'bg-indigo-600 text-white' : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default MigrationModal;
