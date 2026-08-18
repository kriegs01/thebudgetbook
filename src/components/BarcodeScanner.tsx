import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useZxing } from 'react-zxing';
import { Camera, Barcode, X, Save, ShoppingCart, Plus, Minus, History } from 'lucide-react';
import { localDb, type LocalProduct } from '../utils/db';
import { useAuth } from '../contexts/AuthContext';
import { useProductSync } from '../hooks/useProductSync';

// Extend our product to include a quantity for the cart
interface CartItem extends LocalProduct {
  quantity: number;
}

export default function BarcodeScanner() {
  const { user } = useAuth();
  
  // 🟢 INIT BACKGROUND SYNC: This silently runs the two-way sync engine
  useProductSync();

  const [scannedCode, setScannedCode] = useState<string>("Waiting for barcode...");
  
  // Cart & Budget State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [budgetLimit, setBudgetLimit] = useState<number>(100); 
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  const stateRef = useRef({ scannedCode, isModalOpen });
  useEffect(() => {
    stateRef.current = { scannedCode, isModalOpen };
  }, [scannedCode, isModalOpen]);

    // --- MATH & ACCUMULATOR LOGIC ---
    const cartTotal = useMemo(() => {
      return cart.reduce((total, item) => {
        // 🟢 DEFENSIVE FIX: Fallback to old 'price' or 0 if 'current_price' is missing
        const activePrice = item.current_price ?? (item as any).price ?? 0;
        return total + (activePrice * item.quantity);
      }, 0);
    }, [cart]);
  

  const budgetPercentage = Math.min((cartTotal / budgetLimit) * 100, 100);
  const isOverBudget = cartTotal > budgetLimit;

  // --- CART ACTIONS ---
  const addToCart = (product: LocalProduct) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.barcode === product.barcode);
      if (existingItem) {
        return prevCart.map(item => 
          item.barcode === product.barcode ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [{ ...product, quantity: 1 }, ...prevCart];
    });
  };

  const updateQuantity = (barcode: string, delta: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.barcode === barcode) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // --- SCANNER LOGIC ---
  const { ref } = useZxing({
    timeBetweenDecodingAttempts: 300,
    
    onError(error) {
      console.error("🚨 SCANNER ENGINE ERROR:", error);
    },
    
    onDecodeResult(result) {
      let barcodeString = "";
      if (typeof result === "string") {
        barcodeString = result;
      } else if (result && typeof (result as any).getText === "function") {
        barcodeString = (result as any).getText();
      } else if (result && (result as any).text) {
        barcodeString = (result as any).text;
      } else if (result && (result as any).rawValue) {
        barcodeString = (result as any).rawValue; 
      } else {
        barcodeString = String(result);
      }

      barcodeString = String(barcodeString).trim();

      if (!barcodeString || barcodeString === "[object Object]") return;
      if (stateRef.current.isModalOpen) return;
      if (barcodeString === stateRef.current.scannedCode) return;
      
      setScannedCode(barcodeString);
      
      // 🟢 OFFLINE LOOKUP: Check Dexie (which is kept in sync with the cloud)
      localDb.products.get(barcodeString)
        .then((existingProduct) => {
          if (existingProduct) {
            addToCart(existingProduct);
            setTimeout(() => setScannedCode("Waiting for barcode..."), 2000); 
          } else {
            setIsModalOpen(true);
          }
        })
        .catch((error) => {
          console.error("Database error:", error);
        });
    },
  });

  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !productPrice || !user) return;

    const finalBarcode = stateRef.current.scannedCode;
    const numericPrice = parseFloat(productPrice);

    // 🟢 BUILD OFFLINE ITEM: Include price history and pending sync status
    const newProduct: LocalProduct = {
      barcode: finalBarcode,
      user_id: user.id,
      name: productName,
      current_price: numericPrice,
      price_history: [{ price: numericPrice, date: new Date().toISOString() }], // Initial price entry
      sync_status: 'pending_insert', // Flags it for the background sync engine
      last_updated: Date.now()
    };

    try {
      // Save locally to Dexie (super fast, works offline)
      await localDb.products.put(newProduct);
      
      addToCart(newProduct);
      
      setProductName("");
      setProductPrice("");
      setIsModalOpen(false);
      setTimeout(() => setScannedCode("Waiting for barcode..."), 2000);
    } catch (error) {
      console.error("Failed to save to local DB:", error);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBarcode = manualBarcode.trim();
    if (!cleanBarcode) return;
    
    setIsManualInputOpen(false);
    setManualBarcode("");
    setScannedCode(cleanBarcode);
    
    // Trigger the exact same database lookup as the camera
    localDb.products.get(cleanBarcode)
      .then((existingProduct) => {
        if (existingProduct) {
          addToCart(existingProduct);
          setTimeout(() => setScannedCode("Waiting for barcode..."), 2000); 
        } else {
          setIsModalOpen(true);
        }
      })
      .catch((error) => console.error("Database error:", error));
  };


  return (
    <div className="flex flex-col md:flex-row gap-6 p-4 min-h-full max-w-6xl mx-auto pb-24">
      
      {/* LEFT COLUMN: THE SCANNER */}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full md:w-1/2 p-6 shadow-2xl relative flex flex-col transition-colors border-[3px] border-black h-fit">
        <div className="flex justify-between items-center mb-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] -rotate-3">
            <Camera className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">
            Scanner
          </h2>
        </div>

        <div className="relative w-full aspect-[4/5] sm:aspect-video bg-black rounded-2xl overflow-hidden border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 flex items-center justify-center">
          {/* object-contain ensures the camera feed isn't zoomed/cropped to fill the box */}
          <video ref={ref} className="w-full h-full object-contain opacity-80" playsInline muted autoPlay />
          
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
            
            {/* WIDER RETICLE: Encourages users to pull back for large barcodes */}
            <div className="w-full max-w-[320px] aspect-[21/9] border-2 border-white/30 rounded-xl relative flex items-center justify-center mb-6">
              <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
              <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
              <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
              <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>
              
              <div className="w-11/12 h-[2px] bg-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.8)] animate-pulse"></div>
            </div>
            
            <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <p className="text-white text-[10px] font-black uppercase tracking-widest text-center shadow-black drop-shadow-md">
                Ensure entire barcode fits in frame
              </p>
            </div>
            
          </div>
        </div>


        <div className="flex justify-between items-center mt-2">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl border-[3px] border-black flex-1 flex items-center gap-3 mr-4">
            <Barcode className="w-5 h-5 text-gray-500" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{scannedCode}</p>
          </div>
          <button 
            onClick={() => setIsManualInputOpen(true)}
            className="p-3 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all font-black uppercase text-[10px] tracking-widest whitespace-nowrap"
          >
            Type Code
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: BUDGET & CART */}
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full md:w-1/2 p-6 shadow-2xl flex flex-col transition-colors border-[3px] border-black">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> Cart
          </h3>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Trip Total</p>
            <p className={`text-2xl font-black ${isOverBudget ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
              ${cartTotal.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
            <span>Budget Utilized</span>
            <span>Limit: ${budgetLimit.toFixed(2)}</span>
          </div>
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded-full border-2 border-black overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${isOverBudget ? 'bg-red-500' : budgetPercentage > 85 ? 'bg-yellow-400' : 'bg-green-500'}`}
              style={{ width: `${budgetPercentage}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10">
              <ShoppingCart className="w-12 h-12 mb-2 opacity-50" />
              <p className="font-bold text-sm">Your cart is empty</p>
              <p className="text-xs">Scan an item to begin</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.barcode} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border-2 border-black flex flex-col gap-2">
                
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white leading-tight">{item.name}</p>
                    {/* 🟢 DEFENSIVE FIX */}
                    <p className="text-sm font-medium text-gray-500">
                      ${(item.current_price ?? (item as any).price ?? 0).toFixed(2)} each
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    {/* 🟢 DEFENSIVE FIX */}
                    <p className="font-black text-gray-900 dark:text-white">
                      ${((item.current_price ?? (item as any).price ?? 0) * item.quantity).toFixed(2)}
                    </p>
                    {/* Price History Indicator */}

                    {item.price_history && item.price_history.length > 1 && (
                       <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 mt-1 uppercase tracking-widest">
                         <History className="w-3 h-3" /> 
                         Prev: ${item.price_history[item.price_history.length - 2].price.toFixed(2)}
                       </span>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end mt-1">
                  <div className="flex items-center bg-white dark:bg-gray-700 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <button onClick={() => updateQuantity(item.barcode, -1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-l-lg"><Minus className="w-4 h-4" /></button>
                    <span className="px-2 font-black text-sm w-8 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.barcode, 1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-r-lg"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      </div>

      {/* NEW ITEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border-[3px] border-black animate-in zoom-in-95">
            <button 
              onClick={() => {
                setIsModalOpen(false);
                setTimeout(() => setScannedCode("Waiting for barcode..."), 1000);
              }} 
              className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight">New Product</h3>
            <p className="text-sm font-medium text-gray-500 mb-6 truncate">Barcode: {scannedCode}</p>
            
            <form onSubmit={handleSaveNewItem} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Product Name</label>
                <input type="text" autoFocus required value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500" placeholder="e.g. Milk 1 Gallon" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Current Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">$</span>
                  <input type="number" step="0.01" inputMode="decimal" required value={productPrice} onChange={(e) => setProductPrice(e.target.value)} className="w-full p-4 pl-8 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500" placeholder="0.00" />
                </div>
              </div>
              <button type="submit" className="w-full flex items-center justify-center gap-2 mt-4 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                <Save className="w-5 h-5" /> Save Item
              </button>
            </form>
          </div>
        </div>
      )}

{/* MANUAL ENTRY MODAL */}
{isManualInputOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border-[3px] border-black animate-in zoom-in-95">
            <button 
              onClick={() => setIsManualInputOpen(false)} 
              className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tight">Enter Barcode</h3>
            
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Barcode Number</label>
                <input 
                  type="number" 
                  autoFocus 
                  required 
                  value={manualBarcode} 
                  onChange={(e) => setManualBarcode(e.target.value)} 
                  className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500" 
                  placeholder="e.g. 4809011249486" 
                />
              </div>
              <button type="submit" className="w-full flex items-center justify-center gap-2 mt-4 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                Lookup Item
              </button>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}

      
    