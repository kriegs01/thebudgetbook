import React, { useState } from 'react';
import { Search, X, Loader2, Camera } from 'lucide-react';
import { createPortal } from 'react-dom'

interface PixabayImagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}

export function PixabayImagePicker({ isOpen, onClose, onSelect }: PixabayImagePickerProps) {
  const [query, setQuery] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const searchPixabay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const apiKey = import.meta.env.VITE_PIXABAY_API_KEY;
      const response = await fetch(`https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=15`);
      const data = await response.json();
      setImages(data.hits || []);
    } catch (error) {
      console.error("Failed to fetch Pixabay images", error);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    // 🟢 BUMPED z-index to 150 to stay above Album Modal (z-100) and Mobile Tray (z-120)
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border-2 border-black rounded-[1.25rem] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header & Search */}
        <div className="p-4 border-b-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4" /> Pixabay Stock Search
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <form onSubmit={searchPixabay} className="relative">
            <input
              type="text"
              placeholder="Search for 'Macbook', 'Japan', 'Coffee'..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
            />
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
            <button type="submit" className="hidden" />
          </form>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {images.map((img) => (
                <div 
                  key={img.id}
                  onClick={() => onSelect(img.largeImageURL)}
                  className="group relative aspect-video bg-gray-200 rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400 cursor-pointer transition-all shadow-sm hover:shadow-[2px_2px_0px_0px_rgba(251,191,36,1)]"
                >
                  <img src={img.webformatURL} alt={img.tags} className="w-full h-full object-cover" loading="lazy" />
                  
                  {/* Hover Attribution Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[9px] font-black text-white uppercase tracking-wider truncate">
                      By {img.user}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body // 🟢 ATTACHES PORTAL TO BODY
  );

}
