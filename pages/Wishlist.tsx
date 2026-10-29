// pages/Wishlist.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { HeartPlus, Plus, X, Link as LinkIcon, ExternalLink, ChevronLeft, BookImage, FolderHeart, Image as ImageIcon, MoreHorizontal, Edit3, Upload, Trash2, FolderPlus, Tag } from 'lucide-react';
import { PageHeader } from '../src/components/PageHeader';
import { useTheme } from '../src/contexts/ThemeContext';
import useMediaQuery from '../src/hooks/useMediaQuery';
import { createPortal } from 'react-dom';
import { getWishlistItems, addWishlistItem, updateWishlistItem, deleteWishlistItem, uploadWishlistCover, getWishlistAlbums, addWishlistAlbum, updateWishlistAlbum, deleteWishlistAlbum, WishlistItem, WishlistAlbum, WishlistVariant } from '../src/services/wishlistService';
import { PixabayImagePicker } from '../src/components/PixabayImagePicker';

export const Wishlist: React.FC = () => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [albums, setAlbums] = useState<WishlistAlbum[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);

  const [showAddTray, setShowAddTray] = useState(false);
  
  // Menus
  const [activeAlbumMenu, setActiveAlbumMenu] = useState<string | null>(null);
  const [activeItemMenu, setActiveItemMenu] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

//pixabay stuff
const [isPixabayOpen, setIsPixabayOpen] = useState(false);


  // Album Modal
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [albumFormData, setAlbumFormData] = useState({ name: '', coverUrl: '', coverFile: null as File | null });
  const [isSubmittingAlbum, setIsSubmittingAlbum] = useState(false);

  // Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);
  
  // 🟢 NEW: State for the currently typed variant (now supports images)
  const [newVariant, setNewVariant] = useState({ name: '', image_url: '', imageFile: null as File | null });
  const [showVariantImgMenu, setShowVariantImgMenu] = useState(false); // 🟢 NEW: Controls the popover

  const [formData, setFormData] = useState({
    name: '', amount: '', url: '', image_url: '', imageFile: null as File | null,
    priority: 'Medium' as 'High' | 'Medium' | 'Low',
    classification: 'Want' as 'Need' | 'Want' | 'Upgrade',
    album_id: '',
    variants: [] as (WishlistVariant & { imageFile?: File | null })[]
  });

  useEffect(() => {
    loadData();
    const closeMenus = () => { setActiveAlbumMenu(null); setActiveItemMenu(null); };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

    // 🟢 Listens for the mobile global FAB button
    useEffect(() => {
      const handleOpenModal = () => {
        if (activeAlbumId) {
          // If inside an album, bypass the tray and open the item modal directly
          setFormData(prev => ({ 
            ...prev, 
            album_id: activeAlbumId !== 'uncategorized' ? activeAlbumId : '' 
          }));
          setShowItemModal(true);
        } else {
          // If on the global albums page, show the tray
          setShowAddTray(true);
        }
      };
      
      window.addEventListener('open_add_wishlist_modal', handleOpenModal);
      return () => window.removeEventListener('open_add_wishlist_modal', handleOpenModal);
    }, [activeAlbumId]);
  

  
  const loadData = async () => {
    setIsLoading(true);
    const [itemsRes, albumsRes] = await Promise.all([getWishlistItems(), getWishlistAlbums()]);
    if (itemsRes.data) setItems(itemsRes.data as WishlistItem[]);
    if (albumsRes.data) setAlbums(albumsRes.data as WishlistAlbum[]);
    setIsLoading(false);
  };

  const handleAddVariant = () => {
    if (newVariant.name.trim()) {
      setFormData(prev => ({ 
        ...prev, 
        variants: [...prev.variants, { 
          name: newVariant.name.trim(), 
          image_url: newVariant.image_url, 
          imageFile: newVariant.imageFile 
        }] 
      }));
      setNewVariant({ name: '', image_url: '', imageFile: null }); // Reset input
    }
  };

  const handleRemoveVariant = (indexToRemove: number) => {
    setFormData(prev => ({ ...prev, variants: prev.variants.filter((_, i) => i !== indexToRemove) }));
  };

  const handleAlbumSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAlbum(true);
    try {
      let finalCoverUrl = albumFormData.coverUrl;
      if (albumFormData.coverFile) {
        const { url, error } = await uploadWishlistCover(albumFormData.coverFile);
        if (error || !url) { alert("Failed to upload cover."); setIsSubmittingAlbum(false); return; }
        finalCoverUrl = url;
      }

      if (editingAlbumId) {
        const { data, error } = await updateWishlistAlbum(editingAlbumId, { name: albumFormData.name.trim(), cover_url: finalCoverUrl || undefined });
        if (!error && data) {
          setAlbums(prev => prev.map(a => a.id === editingAlbumId ? (data as WishlistAlbum) : a));
          handleCloseAlbumModal();
        }
      } else {
        const { data, error } = await addWishlistAlbum({ name: albumFormData.name.trim(), cover_url: finalCoverUrl || undefined });
        if (!error && data) {
          setAlbums(prev => [data as WishlistAlbum, ...prev]);
          handleCloseAlbumModal();
        }
      }
    } catch (err) { console.error(err); } finally { setIsSubmittingAlbum(false); }
  };

  const handleAlbumDelete = async (id: string) => {
    if (!window.confirm("Delete this album? The items inside will be kept and moved to Uncategorized.")) return;
    const { error } = await deleteWishlistAlbum(id);
    if (!error) {
      setAlbums(prev => prev.filter(a => a.id !== id));
      setItems(prev => prev.map(i => i.album_id === id ? { ...i, album_id: undefined } : i));
      if (activeAlbumId === id) setActiveAlbumId(null);
    }
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingItem(true);
    try {
      // 1. Upload Main Image (if any)
      let finalImageUrl = formData.image_url;
      if (formData.imageFile) {
        const { url, error } = await uploadWishlistCover(formData.imageFile);
        if (error || !url) { alert("Failed to upload item image."); setIsSubmittingItem(false); return; }
        finalImageUrl = url;
      }

      // 2. Upload Variant Images (if any) concurrently!
      const processedVariants = await Promise.all(
        formData.variants.map(async (v) => {
          if (v.imageFile) {
            const { url } = await uploadWishlistCover(v.imageFile);
            return { name: v.name, image_url: url || v.image_url };
          }
          return { name: v.name, image_url: v.image_url };
        })
      );

      const itemPayload = {
        name: formData.name, amount: parseFloat(formData.amount),
        url: formData.url || undefined, image_url: finalImageUrl || undefined,
        priority: formData.priority, classification: formData.classification,
        album_id: formData.album_id || undefined, status: 'Saved' as const,
        variants: processedVariants // 🟢 Processed variant objects
      };

      if (editingItemId) {
        const { data, error } = await updateWishlistItem(editingItemId, itemPayload);
        if (!error && data) {
          setItems(prev => prev.map(item => item.id === editingItemId ? (data as WishlistItem) : item));
          handleCloseItemModal();
        }
      } else {
        const { data, error } = await addWishlistItem(itemPayload);
        if (!error && data) {
          setItems(prev => [data as WishlistItem, ...prev]);
          handleCloseItemModal();
        }
      }
    } catch (err) { console.error(err); } finally { setIsSubmittingItem(false); }
  };

  const handleItemDelete = async (id: string | number) => {
    if (!window.confirm("Delete this item?")) return;
    const { error } = await deleteWishlistItem(String(id));
    if (!error) setItems(prev => prev.filter(item => String(item.id) !== String(id)));
  };

  // 🟢 NEW: Toggle Variant Checkbox
  const handleToggleVariant = async (itemId: string, variantIndex: number, currentStatus: boolean) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.variants) return;

    const updatedVariants = item.variants.map((v, i) => {
      if (i === variantIndex) {
        return typeof v === 'string' ? { name: v, checked: !currentStatus } : { ...v, checked: !currentStatus };
      }
      return v;
    });

    // Instantly update UI (Optimistic update)
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, variants: updatedVariants } : i));

    // Save to database in the background
    await updateWishlistItem(itemId, { variants: updatedVariants });
  };


  const handleCloseAlbumModal = () => {
    setShowAlbumModal(false); setEditingAlbumId(null); setAlbumFormData({ name: '', coverUrl: '', coverFile: null });
  };
  
  const handleCloseItemModal = () => {
    setShowItemModal(false); setEditingItemId(null); setNewVariant({ name: '', image_url: '', imageFile: null });
    // 🟢 PRELOAD: Resets to the currently viewed album instead of blanking it out
    setFormData({ name: '', amount: '', url: '', image_url: '', imageFile: null, priority: 'Medium', classification: 'Want', album_id: activeAlbumId && activeAlbumId !== 'uncategorized' ? activeAlbumId : '', variants: [] });
  };


  const formatCurrency = (val: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

  const activeAlbumData = activeAlbumId === 'uncategorized' 
    ? { name: 'Uncategorized Items' } 
    : albums.find(a => a.id === activeAlbumId);
    
  const activeAlbumItems = items.filter(i => 
    activeAlbumId === 'uncategorized' ? !i.album_id : i.album_id === activeAlbumId
  ).sort((a, b) => {
    const pWeight: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
    return (pWeight[b.priority] || 0) - (pWeight[a.priority] || 0);
  });

  const uncategorizedItems = items.filter(i => !i.album_id);

  return (
    <div className={`space-y-4 animate-in slide-in-from-right-4 duration-500 pb-20 w-full ${isMobile ? 'p-2' : 'p-4 md:p-8'} relative`}>
      <div className="flex flex-col space-y-4 md:space-y-6">
        <PageHeader 
          title={<span className="font-['Inter'] tracking-tight">Wishlist</span>}
          subtitle={activeAlbumId ? `Browsing: ${activeAlbumData?.name}` : "Save it for later, plan it for now"}
          icon={
            <div className={`w-12 h-12 md:w-14 h-14 rounded-2xl flex items-center justify-center text-white border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-3 transition-all hover:rotate-0 hover:scale-110 z-10 relative ${getAccentClasses('bg')}`}>
              {activeAlbumId ? <FolderHeart className="w-6 h-6 md:w-7 h-7" /> : <HeartPlus className="w-6 h-6 md:w-7 h-7" />}
            </div>
          }
          actions={
            !isMobile && (
              <div className="flex gap-3">
                {/* 🟢 RESTORED: Desktop Add Album Button */}
                <button onClick={() => {
                  setAlbumFormData({ name: '', coverUrl: '', coverFile: null });
                  setEditingAlbumId(null);
                  setShowAlbumModal(true);
                }} className={`flex items-center gap-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-5 py-3 rounded-xl font-bold text-sm border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none`}>
                  <FolderPlus className="w-4 h-4 stroke-[3]" />
                  <span className="hidden sm:inline">New Album</span>
                </button>
          
                {/* 🟢 UPGRADED: Desktop Add Item Button */}
                <button onClick={() => {
                  setFormData(prev => ({ ...prev, album_id: activeAlbumId && activeAlbumId !== 'uncategorized' ? activeAlbumId : '' }));
                  setShowItemModal(true);
                }} className={`flex items-center gap-2 text-white px-5 py-3 rounded-xl font-bold text-sm border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none ${getAccentClasses('bg')}`}>
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span className="hidden sm:inline">Add Item</span>
                </button>
              </div>
            )
          }
          
        />
      </div>

      <div className="w-full max-w-7xl mx-auto">
        {isLoading ? (
          <div className="text-center py-20 text-gray-400 font-bold animate-pulse">Loading wishlist...</div>
        ) : !activeAlbumId ? (
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 animate-in zoom-in-95 duration-300">
            {albums.map((album) => {
              const albumItems = items.filter(i => i.album_id === album.id);
              
              const totalCost = albumItems.reduce((sum, item) => {
                const multiplier = item.variants && item.variants.length > 0 ? item.variants.length : 1;
                return sum + (Number(item.amount || 0) * multiplier);
              }, 0);
              
              const collageImages = albumItems.map(i => i.image_url).filter(Boolean).slice(0, 4);

              return (
                <div key={album.id} className="group relative cursor-pointer" onClick={() => setActiveAlbumId(album.id)}>
                {/* 🟢 FIXED: Hidden by default, fans out on hover ONLY if album has items */}
                <div className={`absolute inset-0 rounded-[2rem] border-[3px] border-black opacity-20 transition-transform duration-300 origin-center ${albumItems.length > 0 ? 'group-hover:-rotate-6 group-hover:-translate-x-1' : ''} ${getAccentClasses('bg')}`}></div>
                <div className={`absolute inset-0 rounded-[2rem] border-[3px] border-black opacity-40 transition-transform duration-300 origin-center ${albumItems.length > 0 ? 'group-hover:rotate-3 group-hover:translate-x-1' : ''} ${getAccentClasses('bg')}`}></div>
                
                <div className="relative bg-white dark:bg-gray-900 border-[3px] border-black rounded-[2rem] p-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform duration-300 group-hover:-translate-y-2 group-hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col">

                    
                    <div className="absolute top-4 right-4 z-20">
                      <button onClick={(e) => { e.stopPropagation(); setActiveAlbumMenu(activeAlbumMenu === album.id ? null : album.id); }} className="w-8 h-8 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-2 border-black rounded-full flex items-center justify-center text-gray-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {activeAlbumMenu === album.id && (
                        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden z-30 animate-in zoom-in-95">
                          <button onClick={(e) => { e.stopPropagation(); setEditingAlbumId(album.id); setAlbumFormData({ name: album.name, coverUrl: album.cover_url || '', coverFile: null }); setShowAlbumModal(true); setActiveAlbumMenu(null); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-black text-gray-900 dark:text-gray-100 hover:bg-amber-500/10 text-left">
                            <Edit3 className="w-4 h-4" /> Edit Album
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleAlbumDelete(album.id); setActiveAlbumMenu(null); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left border-t-2 border-gray-100 dark:border-gray-800">
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-2xl border-2 border-black overflow-hidden mb-4 p-1 relative">
                      {album.cover_url ? (
                        <img src={album.cover_url} alt={album.name} className="w-full h-full object-cover rounded-lg border border-black/10" />
                      ) : collageImages.length > 0 ? (
                        <div className={`w-full h-full grid gap-1 ${collageImages.length === 1 ? 'grid-cols-1' : collageImages.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
                          {collageImages.map((img, idx) => <img key={idx} src={img} alt="" className="w-full h-full object-cover rounded-lg border border-black/10" />)}
                          {collageImages.length === 3 && <div className="bg-gray-200 rounded-lg flex items-center justify-center border border-black/10"><ImageIcon className="w-4 h-4 text-gray-400" /></div>}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><FolderHeart className="w-12 h-12 text-gray-300 dark:text-gray-600" /></div>
                      )}
                    </div>

                    <div className="mt-auto px-1">
                      <h3 className="text-sm md:text-base font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight leading-tight line-clamp-2 pr-6">{album.name}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md border border-black/10">{albumItems.length} {albumItems.length === 1 ? 'Item' : 'Items'}</span>
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

              {/* Uncategorized Folder Fallback */}
              {uncategorizedItems.length > 0 && (
              <div className="group relative cursor-pointer" onClick={() => setActiveAlbumId('uncategorized')}>
                  {/* 🟢 FIXED: Hidden by default, fans out on hover */}
                  <div className="absolute inset-0 rounded-[2rem] border-[3px] border-black opacity-20 transition-transform duration-300 origin-center group-hover:-rotate-6 group-hover:-translate-x-1 bg-gray-400"></div>
                  <div className="absolute inset-0 rounded-[2rem] border-[3px] border-black opacity-40 transition-transform duration-300 origin-center group-hover:rotate-3 group-hover:translate-x-1 bg-gray-400"></div>
                  
                  <div className="relative bg-white dark:bg-gray-900 border-[3px] border-black rounded-[2rem] p-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col transition-transform duration-300 group-hover:-translate-y-2 group-hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-2xl border-2 border-black overflow-hidden mb-4 p-1 relative flex items-center justify-center">
                        <FolderHeart className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                    </div>
                    <div className="mt-auto px-1">
                      <h3 className="text-sm md:text-base font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight leading-tight line-clamp-2">Uncategorized</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md border border-black/10">{uncategorizedItems.length} Items</span>
                      </div>
                    </div>
                  </div>
              </div>
            )}
          </div>
        ) : (

          <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
            {/* 🟢 FIXED: Added negative top margin (-mt-4) to pull the button up closer to the header */}
            <div className="flex items-center justify-between -mt-4 md:-mt-6">
              <button onClick={() => setActiveAlbumId(null)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-2 border-black rounded-xl font-black text-xs uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all w-fit">
                <ChevronLeft className="w-4 h-4" /> Back to Albums
              </button>
            </div>

            {activeAlbumItems.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-center border-4 border-dashed border-gray-300 dark:border-gray-700 rounded-3xl w-full">
                  <HeartPlus className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="text-lg font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Album is Empty</h3>
                  <p className="text-sm font-medium text-gray-400 mt-2">Click "Add Item" and assign it to this album.</p>
               </div>
            ) : (
              <div className="flex overflow-x-auto md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 -mt-4 pb-8 md:pb-4 snap-x snap-mandatory md:snap-none w-full px-1" style={{ scrollbarWidth: 'none' }}>

              {activeAlbumItems.map(item => {
                const variantCount = item.variants?.length || 0;
                const costMultiplier = Math.max(1, variantCount);
                const totalItemCost = Number(item.amount || 0) * costMultiplier;

                // 🟢 NEW: Gather Images for the Card Collage
                const variantImages = (item.variants || [])
                  .map(v => typeof v === 'object' ? v.image_url : null)
                  .filter(Boolean) as string[];
                  
                const displayImages = variantImages.length > 1 
                  ? variantImages.slice(0, 4) 
                  : (item.image_url ? [item.image_url] : []);

                return (
                <div key={item.id} className="shrink-0 w-[85vw] md:w-auto snap-center md:snap-none bg-white dark:bg-gray-900 border-4 border-black rounded-2xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden relative">

                  
                  {/* 🟢 NEW: Card Image Collage Slice */}
                  {displayImages.length > 0 && (
                    <div className="absolute top-0 right-0 bottom-0 w-1/3 md:w-1/4 opacity-25 pointer-events-none border-l-2 border-dashed border-black/10 dark:border-white/10 z-0 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-white dark:from-gray-900 to-transparent w-4 z-10" />
                      <div className={`w-full h-full grid gap-0.5 ${displayImages.length === 1 ? 'grid-cols-1' : displayImages.length === 2 ? 'grid-rows-2' : displayImages.length === 3 ? 'grid-rows-3' : 'grid-cols-2 grid-rows-2'}`}>
                        {displayImages.map((img, idx) => (
                          <img key={idx} src={img} alt="" className="w-full h-full object-cover" />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-3 relative z-20">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                      item.priority === 'High' ? 'bg-red-100 text-red-700' : item.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>{item.priority} Priority</span>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-md">{item.classification}</span>
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setActiveItemMenu(activeItemMenu === item.id ? null : item.id); }} className="w-7 h-7 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:border-black transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeItemMenu === item.id && (
                          <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden z-30 animate-in zoom-in-95">
                            <button onClick={(e) => { 
                              e.stopPropagation(); 
                              
                              // Handle backward compatibility for old string variants
                              const parsedVariants = (item.variants || []).map(v => typeof v === 'string' ? { name: v } : v);
                              
                              setFormData({ name: item.name, amount: item.amount.toString(), url: item.url || '', image_url: item.image_url || '', imageFile: null, priority: item.priority, classification: item.classification, album_id: item.album_id || '', variants: parsedVariants }); 
                              setEditingItemId(item.id); setShowItemModal(true); setActiveItemMenu(null); 
                            }} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-black text-gray-900 hover:bg-amber-500/10 text-left">
                              <Edit3 className="w-3 h-3" /> Edit Item
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleItemDelete(item.id); setActiveItemMenu(null); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-black text-red-600 hover:bg-red-50 text-left border-t-2 border-gray-100">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0 mb-4 relative z-10 pr-6">
                    <h4 className="text-lg font-black text-gray-900 dark:text-gray-100 leading-tight truncate">{item.name}</h4>
                    <p className="text-xl font-black text-indigo-600 mt-1">
                      {formatCurrency(totalItemCost)}
                      {variantCount > 0 && <span className="text-[10px] text-gray-400 font-bold ml-2">({variantCount}x {formatCurrency(item.amount)})</span>}
                    </p>
                    
                      {/* 🟢 UPGRADED: Vertical Variant Checklist */}
                      {variantCount > 0 && (
                   
                        <div className="flex flex-col gap-2.5 mt-4 pt-4 border-t-2 border-dashed border-gray-200 dark:border-gray-700 max-h-[160px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'none' }}>

                        {item.variants?.map((v, i) => {
                          const vName = typeof v === 'string' ? v : v.name;
                          const vImg = typeof v === 'object' ? v.image_url : null;
                          const isChecked = typeof v === 'object' ? !!v.checked : false;

                          return (
                            <label 
                              key={i} 
                              onClick={(e) => e.stopPropagation()} 
                              className={`flex items-center gap-3 group transition-all duration-200 cursor-pointer ${isChecked ? 'opacity-50 grayscale' : 'opacity-100'}`}
                            >
                              {/* Custom Checkbox */}
                              <div className="relative flex items-center justify-center shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleVariant(item.id, i, isChecked)}
                                  className="peer w-5 h-5 appearance-none border-2 border-black dark:border-gray-400 rounded-md checked:bg-black dark:checked:bg-white checked:border-black transition-colors cursor-pointer"
                                />
                                <svg className="absolute w-3 h-3 text-white dark:text-black pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="1.5 6 4.5 9 10.5 1" />
                                </svg>
                              </div>

                              {/* Thumbnail (if exists) */}
                              {vImg && (
                                <img src={vImg} className="w-7 h-7 rounded-lg object-cover border border-black/10 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] shrink-0" alt="" />
                              )}
                              
                              {/* Variant Name */}
                              <span className={`text-sm font-bold text-gray-700 dark:text-gray-300 truncate transition-all ${isChecked ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                                {vName}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t-2 border-dashed border-gray-200 dark:border-gray-700 relative z-10">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2.5 bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-xl hover:bg-gray-200 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none text-gray-700" title="View Store Link">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button className={`flex-1 flex justify-center items-center gap-2 text-white border-2 border-black py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all ${getAccentClasses('bg')}`}>
                      Promote to Budget
                    </button>
                  </div>
                </div>
              )})}
            </div>
            )}
          </div>
        )}
      </div>

      {/* ALBUM MODAL */}
      {showAlbumModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={handleCloseAlbumModal}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseAlbumModal} className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-6 uppercase tracking-tight">{editingAlbumId ? 'Edit Album' : 'New Album'}</h2>
            <form onSubmit={handleAlbumSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Album Name</label>
                <input required type="text" value={albumFormData.name} onChange={(e) => setAlbumFormData({...albumFormData, name: e.target.value})} placeholder="e.g. Workspace Upgrade" className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-bold dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex justify-between"><span>Custom Cover Image</span><span className="text-gray-300 dark:text-gray-600">(URL or Upload)</span></label>
                <div className="flex flex-col gap-3">
                  {(albumFormData.coverUrl || albumFormData.coverFile) && (
                    <img src={albumFormData.coverFile ? URL.createObjectURL(albumFormData.coverFile) : albumFormData.coverUrl} alt="Cover Preview" className="w-full h-32 md:h-40 rounded-xl object-cover border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0" />
                  )}
                  <div className="flex gap-2">
                    <input type="url" value={albumFormData.coverUrl} onChange={(e) => setAlbumFormData({...albumFormData, coverUrl: e.target.value, coverFile: null})} placeholder="Paste image URL..." className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-medium dark:text-gray-100" />
                    
                    {/* 🟢 NEW: PIXABAY SEARCH BUTTON */}
                    <button type="button" onClick={() => setIsPixabayOpen(true)} className="shrink-0 flex items-center justify-center border-2 border-black p-2.5 rounded-xl cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200" title="Search Stock Photos">
                      <BookImage className="w-5 h-5" />
                    </button>

                    <label className={`shrink-0 flex items-center justify-center border-2 border-black p-2.5 rounded-xl cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${albumFormData.coverFile ? getAccentClasses('bg') + ' text-white' : 'bg-gray-100 text-gray-700'}`}>
                      <Upload className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setAlbumFormData({...albumFormData, coverFile: e.target.files[0], coverUrl: ''}); }} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button type="button" disabled={isSubmittingAlbum} onClick={handleCloseAlbumModal} className="flex-1 bg-gray-100 border-2 border-black py-3 rounded-xl font-black text-xs text-gray-500 uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmittingAlbum} className={`flex-1 text-white border-2 border-black py-3 rounded-xl font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}>{isSubmittingAlbum ? 'Saving...' : 'Save Album'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ITEM MODAL */}
      {showItemModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={handleCloseItemModal}>
          <div className="bg-white dark:bg-gray-900 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-2xl w-full max-w-md p-6 relative overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={handleCloseItemModal} className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-6 uppercase tracking-tight">{editingItemId ? 'Edit Item' : 'Save to Wishlist'}</h2>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Item Name</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. Herman Miller Chair" className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-bold dark:text-gray-100" />
                </div>
                <div className="col-span-1">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Cost (Each)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">₱</span>
                    <input required type="number" step="0.01" min="0" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 pl-7 outline-none text-sm font-bold dark:text-gray-100" />
                  </div>
                </div>
              </div>

              {/* 🟢 UPGRADED: Variants UI with Image Upload */}
                            {/* 🟢 REDESIGNED: [Image] [Variant Name] [Add] Layout */}
                            <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex justify-between">
                  <span>Variants (Colors, Sizes)</span>
                  <span className="text-gray-400 font-medium">Cost x {Math.max(1, formData.variants.length)}</span>
                </label>
                
                <div className="flex gap-2">
                  {/* Image Box Button */}
                  <div className="relative shrink-0">
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowVariantImgMenu(!showVariantImgMenu); }} 
                      className="w-11 h-11 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none overflow-hidden"
                    >
                      {(newVariant.image_url || newVariant.imageFile) ? (
                        <img src={newVariant.imageFile ? URL.createObjectURL(newVariant.imageFile) : newVariant.image_url} className="w-full h-full object-cover" alt="Variant" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    {/* Popover Menu (Upload vs URL) */}
                    {showVariantImgMenu && (
                      <div className="absolute top-12 left-0 mt-1 w-36 bg-white dark:bg-gray-900 border-[3px] border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden z-50 animate-in zoom-in-95">
                        <label className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-black text-gray-900 dark:text-gray-100 hover:bg-amber-500/10 cursor-pointer text-left border-b-2 border-gray-100 dark:border-gray-800 transition-colors">
                          <Upload className="w-3 h-3" /> Upload
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { 
                            if (e.target.files?.[0]) setNewVariant({...newVariant, imageFile: e.target.files[0], image_url: ''}); 
                            setShowVariantImgMenu(false); 
                          }} />
                        </label>
                        <button type="button" onClick={() => { 
                          const url = window.prompt("Paste Image URL:"); 
                          if (url) setNewVariant({...newVariant, image_url: url, imageFile: null}); 
                          setShowVariantImgMenu(false); 
                        }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-black text-gray-900 dark:text-gray-100 hover:bg-amber-500/10 text-left transition-colors">
                          <LinkIcon className="w-3 h-3" /> Paste URL
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Variant Name Input */}
                  <input 
                    type="text" 
                    value={newVariant.name} 
                    onChange={(e) => setNewVariant({...newVariant, name: e.target.value})}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddVariant(); }}
                    placeholder="e.g. Red, XL" 
                    className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-bold dark:text-gray-100" 
                  />
                  
                  {/* Add Button */}
                  <button type="button" onClick={handleAddVariant} className={`shrink-0 px-4 flex items-center justify-center border-2 border-black rounded-xl font-bold text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-white ${getAccentClasses('bg')}`}>
                    Add
                  </button>
                </div>
                
                {/* Variants Chip Display */}
                {formData.variants.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 p-3 bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                    {formData.variants.map((variant, idx) => {
                       const vImg = variant.imageFile ? URL.createObjectURL(variant.imageFile) : variant.image_url;
                       return (
                        <span key={idx} className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border-2 border-black pl-1.5 pr-2.5 py-1 rounded-lg text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          {vImg && <img src={vImg} className="w-4 h-4 rounded-full object-cover border border-black/10" alt="" />}
                          {variant.name}
                          <button type="button" onClick={() => handleRemoveVariant(idx)} className="text-red-500 hover:text-red-700 ml-1"><X className="w-3 h-3 stroke-[3]" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>


              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex justify-between"><span>Main Item Image</span><span className="text-gray-300 dark:text-gray-600">(Fallback)</span></label>
                <div className="flex flex-col gap-3">
                  {(formData.image_url || formData.imageFile) && (
                    <img src={formData.imageFile ? URL.createObjectURL(formData.imageFile) : formData.image_url} alt="Preview" className="w-full h-32 md:h-40 rounded-xl object-cover border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0" />
                  )}
                  <div className="flex gap-2">
                    <input type="url" value={formData.image_url} onChange={(e) => setFormData({...formData, image_url: e.target.value, imageFile: null})} placeholder="Paste image URL..." className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-medium dark:text-gray-100" />
                    <label className={`shrink-0 flex items-center justify-center border-2 border-black p-2.5 rounded-xl cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${formData.imageFile ? getAccentClasses('bg') + ' text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      <Upload className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFormData({...formData, imageFile: e.target.files[0], image_url: ''}); }} />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Store Link</label>
                <input type="url" value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} placeholder="Paste store link..." className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl p-2.5 outline-none text-sm font-medium dark:text-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Priority</label>
                  <select value={formData.priority} onChange={(e) => setFormData({...formData, priority: e.target.value as any})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2.5 outline-none font-bold text-sm cursor-pointer">
                    <option value="High">High 🔴</option>
                    <option value="Medium">Medium 🟡</option>
                    <option value="Low">Low 🟢</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Classification</label>
                  <select value={formData.classification} onChange={(e) => setFormData({...formData, classification: e.target.value as any})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2.5 outline-none font-bold text-sm cursor-pointer">
                    <option value="Need">Need</option>
                    <option value="Want">Want</option>
                    <option value="Upgrade">Upgrade</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Assign to Album</label>
                <select value={formData.album_id} onChange={(e) => setFormData({...formData, album_id: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-black rounded-xl px-2.5 py-2.5 outline-none font-bold text-sm cursor-pointer">
                  <option value="">-- Uncategorized --</option>
                  {albums.map(album => (
                    <option key={album.id} value={album.id}>{album.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button type="button" disabled={isSubmittingItem} onClick={handleCloseItemModal} className="flex-1 bg-gray-100 border-2 border-black py-3 rounded-xl font-black text-xs text-gray-500 uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmittingItem} className={`flex-1 text-white border-2 border-black py-3 rounded-xl font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 ${getAccentClasses('bg')}`}>{isSubmittingItem ? 'Saving...' : 'Save Item'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

            {/* 🟢 MOBILE ADD TRAY (Global Page Only) */}
            {showAddTray && createPortal(
        <>
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] animate-in fade-in duration-200 block md:hidden"
            onClick={() => setShowAddTray(false)} 
          />
          <div 
            className="fixed bottom-0 left-0 right-0 z-[120] bg-[#FCF6E8] dark:bg-gray-900 border-t-[4px] border-black rounded-t-[2.5rem] flex flex-col pb-10 pt-5 animate-in slide-in-from-bottom-full block md:hidden shadow-[0px_-8px_20px_rgba(0,0,0,0.15)]"
          >
            <div className="w-full flex justify-center pb-6 cursor-pointer" onClick={() => setShowAddTray(false)}>
              <div className="w-14 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
            </div>
            
            <div className="px-6 space-y-4">
              <h3 className="text-xl font-black uppercase tracking-tight text-center text-gray-900 dark:text-white mb-4">
                Add to Wishlist
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setShowAddTray(false);
                    setFormData(prev => ({ ...prev, album_id: '' }));
                    setShowItemModal(true);
                  }}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-amber-900/20 dark:active:bg-amber-900/40 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <Tag className="w-7 h-7 mb-2" />
                  <span className="font-bold text-xs uppercase tracking-widest">Item</span>
                </button>

                <button
                  onClick={() => {
                    setShowAddTray(false);
                    setAlbumFormData({ name: '', coverUrl: '', coverFile: null });
                    setEditingAlbumId(null);
                    setShowAlbumModal(true);
                  }}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border-[3px] border-black bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-50 active:bg-amber-100 dark:hover:bg-amber-900/20 dark:active:bg-amber-900/40 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <FolderPlus className="w-7 h-7 mb-2" />
                  <span className="font-bold text-xs uppercase tracking-widest">Album</span>
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

<PixabayImagePicker 
        isOpen={isPixabayOpen} 
        onClose={() => setIsPixabayOpen(false)} 
        onSelect={(url) => {
          // 🟢 FIXED: Updates the Album Cover state
          setAlbumFormData({ ...albumFormData, coverUrl: url, coverFile: null }); 
          setIsPixabayOpen(false);
        }} 
      />




    </div>
  );
};

export default Wishlist;
