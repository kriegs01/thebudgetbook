import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { X } from 'lucide-react';

interface AddGoalItemModalProps {
  onClose: () => void;
  onAddItem: (item: { name: string; price: number; imageUrl?: string; itemUrl?: string }) => void;
}

const AddGoalItemModal: React.FC<AddGoalItemModalProps> = ({ onClose, onAddItem }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | '' >('');
  const [imageUrl, setImageUrl] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const { getAccentClasses } = useTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && price !== '') {
        onAddItem({ name, price: Number(price), imageUrl, itemUrl });
        onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center animate-in fade-in">
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md m-4 border-2 border-black/10 dark:border-white/10">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Add a New Item</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Item Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
              required
              placeholder='e.g., New running shoes'
            />
          </div>
          <div>
            <label htmlFor="price" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Price</label>
            <input
              type="number"
              id="price"
              value={price}
              onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
              required
              placeholder='e.g., 129.99'
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label htmlFor="itemUrl" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Item URL (Optional)</label>
            <input
              type="url"
              id="itemUrl"
              value={itemUrl}
              onChange={(e) => setItemUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
              placeholder='https://example.com/product'
            />
          </div>
          <div>
            <label htmlFor="imageUrl" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Image URL (Optional)</label>
            <input
              type="url"
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition"
              placeholder='https://example.com/image.png'
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg font-bold text-sm text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all border-2 border-black/0 shadow-sm hover:shadow-md">
                Cancel
            </button>
            <button type="submit" className={`px-5 py-2.5 rounded-lg font-bold text-sm text-white transition-all border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] ${getAccentClasses('bg')}`}>
                Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddGoalItemModal;
