import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useZxing } from 'react-zxing';
import { Camera, Barcode, X, Save, ShoppingCart, Plus, Minus, History } from 'lucide-react';
import { localDb, type LocalProduct } from '../utils/db';
import { useAuth } from '../contexts/AuthContext';
import { useProductSync } from '../hooks/useProductSync';
import { createTransaction } from '../services/transactionsService';
// 🟢 FIXED IMPORT NAME
import { getAllBudgetSetupsFrontend, updateBudgetSetupFrontend } from '../services/budgetSetupsService';

import { combineDateWithCurrentTime, getTodayIso } from '../utils/dateUtils';
import { supabase } from '../utils/supabaseClient';

import { getAllAccountsFrontend } from '../services/accountsService'; // 🟢 NEW IMPORT


// Extend our product to include a quantity for the cart
interface CartItem extends LocalProduct {
  quantity: number;
}

export default function BarcodeScanner() {
  const { user } = useAuth();
  
  // 🟢 INIT BACKGROUND SYNC: This silently runs the two-way sync engine
  useProductSync();

  
  // Cart & Budget State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [budgetLimit, setBudgetLimit] = useState<number>(100); 
  // 🟢 NEW: States for editing the budget inline
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(budgetLimit.toString());

  // 🟢 NEW: Function to save the new budget
  const handleBudgetSave = () => {
    const newLimit = parseFloat(tempBudget);
    if (!isNaN(newLimit) && newLimit > 0) {
      setBudgetLimit(newLimit);
    } else {
      // Revert if they typed nonsense
      setTempBudget(budgetLimit.toString());
    }
    setIsEditingBudget(false);
  };
 
    // 🟢 NEW: Startup Budget Modal States
    const [showStartupModal, setShowStartupModal] = useState(true);
    const [startupBudgetInput, setStartupBudgetInput] = useState("");
  
    const handleStartupSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = parseFloat(startupBudgetInput);
      
      // If they typed a valid number, update the limit. Otherwise, stick to the default 100.
      if (!isNaN(parsed) && parsed > 0) {
        setBudgetLimit(parsed);
      }
      setShowStartupModal(false);
    };
  
  
  const [scannedCode, setScannedCode] = useState<string>("Waiting for barcode...");
  const [highlightedBarcode, setHighlightedBarcode] = useState<string | null>(null); 
  // 🟢 NEW: Scanner feedback states
  const [scanFeedback, setScanFeedback] = useState<{ name: string, isUpdate: boolean } | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// 🟢 NEW: Fetch ALL user accounts for checkout (including Credit Cards)
const [accounts, setAccounts] = useState<any[]>([]);

useEffect(() => {
  const fetchAccounts = async () => {
    const { data } = await getAllAccountsFrontend();
    if (data) {
      // We removed the filter so you can pay with Cash, Debit, OR Credit!
      setAccounts(data);
    }
  };
  fetchAccounts();
}, []);



  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  // 🟢 NEW: Track if we are searching by barcode or by name
  const [searchMode, setSearchMode] = useState<'barcode' | 'name'>('barcode');
 
  // 🟢 NEW: Store live search results
 const [searchResults, setSearchResults] = useState<LocalProduct[]>([]); 

    // 🟢 FIXED: Live search effect with Console Logs
 useEffect(() => {
  if (searchMode === 'name' && manualBarcode.trim().length > 1) {
    
    const debounceTimer = setTimeout(async () => {
      const searchTerm = manualBarcode.toLowerCase();
      console.log(`\n[Search: Name] 🔍 Live search triggered for: "${searchTerm}"`);

      try {
        // 1. Instantly search local databases
        console.log("[Search: Name] 1️⃣ Querying local Dexie databases...");
        const userResults = await localDb.user_prices
          .filter(p => p.name.toLowerCase().includes(searchTerm))
          .toArray();
          
        const localGlobalResults = await localDb.global_products
          .filter(p => p.name.toLowerCase().includes(searchTerm))
          .toArray();

        console.log(`[Search: Name] 📊 Local Stats: Found ${userResults.length} in user_prices, ${localGlobalResults.length} in global_products.`);

        // Combine local results, prioritizing user prices
        let combined = [...userResults];
        const userBarcodes = new Set(userResults.map(r => r.barcode));
        
        localGlobalResults.forEach(g => {
          if (!userBarcodes.has(g.barcode)) {
            combined.push({ ...g, current_price: 0 } as any); 
          }
        });

        // Update UI immediately with local results
        setSearchResults(combined as any);

        // 2. If online, fetch missing global items in the background
        if (navigator.onLine) {
          console.log("[Search: Name] 2️⃣ Online mode active: Querying Supabase global_products in background...");
          const { data: cloudGlobalItems } = await supabase
            .from('global_products')
            .select('*')
            .ilike('name', `%${searchTerm}%`)
            .limit(10);

          if (cloudGlobalItems && cloudGlobalItems.length > 0) {
             const newGlobals = [];
             
             cloudGlobalItems.forEach(cloudItem => {
               if (!combined.some(existing => existing.barcode === cloudItem.barcode)) {
                 newGlobals.push({ ...cloudItem, current_price: 0 });
                 
                 // Sync it to local DB quietly
                 localDb.global_products.put({
                   ...cloudItem, 
                   sync_status: 'synced'
                 });
               }
             });

             if (newGlobals.length > 0) {
               console.log(`[Search: Name] ✅ Background Sync: Pulled ${newGlobals.length} NEW items from cloud and saved to localDb!`);
               setSearchResults(prev => [...prev, ...newGlobals] as any);
             } else {
               console.log("[Search: Name] ℹ️ Background check finished: Cloud results were already cached locally.");
             }
          } else {
             console.log("[Search: Name] ℹ️ Cloud global_products returned 0 additional matches.");
          }
        } else {
           console.log("[Search: Name] ❌ Offline mode active. Skipping cloud background check.");
        }
      } catch (error) {
        console.error("[Search: Name] 🚨 Live search error:", error);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  } else {
    setSearchResults([]);
  }
}, [manualBarcode, searchMode]);


  

const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
const [tripName, setTripName] = useState("");
// 🟢 NEW: Cloud integration states
const [selectedCategory, setSelectedCategory] = useState("Groceries");
const [selectedAccountId, setSelectedAccountId] = useState("");

  

// 🟢 FIXED: Handler for clicking a search result
const handleSelectSearchResult = (product: any) => {
  setIsManualInputOpen(false);
  setManualBarcode("");
  setSearchResults([]);
  setScannedCode(product.barcode);

  // Check if it's a global-only item (no user price assigned yet)
  if (product.current_price === 0 || !product.price_history) {
    // 🟢 Route to Modal: It's a known item, but they need to set THEIR price
    setProductName(product.name);
    setProductPrice(""); // Clear any old leftover price state
    setIsModalOpen(true);
  } else {
    // 🟢 Route to Cart: It's a personal item with a price
    addToCart(product);
    setTimeout(() => setScannedCode("Waiting for barcode..."), 2000);
  }
};


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
    // Trigger visual beat for desktop
    setHighlightedBarcode(product.barcode);
    setTimeout(() => setHighlightedBarcode(null), 500);

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.barcode === product.barcode);
      
      // 🟢 TRIGGER MOBILE FEEDBACK BANNER
      setScanFeedback({ name: product.name, isUpdate: !!existingItem });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setScanFeedback(null), 2500);

      if (existingItem) {
        // Remove old item, add updated item to the VERY TOP (index 0)
        const otherItems = prevCart.filter(item => item.barcode !== product.barcode);
        return [{ ...existingItem, quantity: existingItem.quantity + 1 }, ...otherItems];
      }
      // Brand new item goes to the TOP
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

  const handleExactQuantity = (barcode: string, exactQty: number) => {
    if (exactQty < 1) exactQty = 1; // Prevent negative/zero from typing
    setCart(prevCart => prevCart.map(item => 
      item.barcode === barcode ? { ...item, quantity: exactQty } : item
    ));
  };


    // --- SCANNER LOGIC ---
    const { ref } = useZxing({
      timeBetweenDecodingAttempts: 300,
      
      // 🟢 Force the high-res back camera for crystal clear auto-focus!
      constraints: {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      
      onError(error) {
        // Intentionally kept silent to prevent console spam when no barcode is in frame
      },
  
      // 🟢 FIXED: Upgraded to True Local-First async logic
      async onDecodeResult(result) {
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
        
        console.log(`\n[Scanner: Camera] 🔍 Detected barcode: ${barcodeString}`);
  
        try {
          // 🟢 1. ALWAYS check personal local database first
          console.log("[Scanner: Camera] 1️⃣ Checking localDb.user_prices...");
          const userProduct = await localDb.user_prices.get(barcodeString);
          
          if (userProduct) {
            console.log("[Scanner: Camera] ✅ FOUND in localDb.user_prices!");
            addToCart(userProduct as any);
            setTimeout(() => setScannedCode("Waiting for barcode..."), 2000); 
            return;
          }
  
          // 🟢 2. Check local global cache (Offline dictionary)
          console.log("[Scanner: Camera] 2️⃣ Checking localDb.global_products (offline cache)...");
          const localGlobal = await localDb.global_products.get(barcodeString);
          if (localGlobal) {
            console.log("[Scanner: Camera] ✅ FOUND in localDb.global_products!");
            setProductName(localGlobal.name);
            setIsModalOpen(true);
            return;
          }
  
          // 🟢 3. If online, ask the cloud global dictionary & sync it down
          if (navigator.onLine) {
            console.log("[Scanner: Camera] 3️⃣ Online mode active: Querying Supabase global_products...");
            const { data: cloudGlobalProduct } = await supabase
              .from('global_products')
              .select('name, barcode')
              .eq('barcode', barcodeString)
              .single();
  
            if (cloudGlobalProduct) {
              console.log("[Scanner: Camera] ✅ FOUND in Supabase global_products! Syncing down...");
              // Sync to local cache so it works offline next time
              await localDb.global_products.put({
                ...cloudGlobalProduct,
                sync_status: 'synced'
              });
              setProductName(cloudGlobalProduct.name);
            } else {
              console.log("[Scanner: Camera] ❌ Not found anywhere. Brand new item.");
              setProductName(""); // Brand new item
            }
          } else {
            console.log("[Scanner: Camera] ❌ Offline mode active. Cannot check Supabase fallback.");
            setProductName(""); // Offline and not found locally
          }
          
          setIsModalOpen(true);
          
        } catch (error) {
          console.error("[Scanner: Camera] 🚨 Lookup error:", error);
          setProductName("");
          setIsModalOpen(true);
        }
      },
    });
  

  const handleFinalizeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || cart.length === 0 || !selectedAccountId) {
      alert("Please enter a name and select a payment account.");
      return;
    }

    try {
      const todayIso = getTodayIso();
      const currentMonth = new Date().toLocaleString('default', { month: 'long' });
      const currentYear = new Date().getFullYear();
      const tripTitle = tripName || "Grocery Trip";
      const cartSummary = cart.map(item => `${item.quantity}x ${item.name}`).join(", ");

      // 1. 🟢 FETCH ACTIVE BUDGET FIRST to power the Smart Checkout
      const { data: setups } = await getAllBudgetSetupsFrontend();
      const activeSetup = setups?.find((s: any) => s.month === currentMonth && s.data?._year === currentYear);
      
      let finalTransactionName = tripTitle;
      let budgetNeedsUpdate = false;
      let updatedBudgetData = null;

      if (activeSetup && activeSetup.data) {
        budgetNeedsUpdate = true;
        updatedBudgetData = JSON.parse(JSON.stringify(activeSetup.data));
        
        if (!updatedBudgetData[selectedCategory]) {
          updatedBudgetData[selectedCategory] = [];
        }

        // 🟢 SMART SCAN: Look for existing matching item (e.g. "Groceries" or exact trip name)
        const existingItem = updatedBudgetData[selectedCategory].find((item: any) => 
          item.name.toLowerCase() === tripTitle.toLowerCase() || 
          item.name.toLowerCase() === selectedCategory.toLowerCase()
        );

        if (existingItem) {
          // LINK: Sync transaction name to the budget item so Budget.tsx auto-tags it as paid
          finalTransactionName = existingItem.name;
          
          // Adjust budget goal if they overspent beyond their original allocation
          const currentGoal = parseFloat(existingItem.amountsByPeriod?.[1] || existingItem.amount || '0');
          if (cartTotal > currentGoal) {
            const difference = cartTotal - currentGoal;
            existingItem.amountsByPeriod = existingItem.amountsByPeriod || {};
            existingItem.amountsByPeriod[1] = cartTotal.toString();
            existingItem.amount = cartTotal.toString(); // Legacy fallback

            if (updatedBudgetData._periodTotals && typeof updatedBudgetData._periodTotals[1] === 'number') {
              updatedBudgetData._periodTotals[1] += difference;
            }
            activeSetup.totalAmount = (activeSetup.totalAmount || 0) + difference;
          }
        } else {
          // ADD NEW: Create brand new item in the category
          const newBudgetItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: tripTitle,
            amount: cartTotal.toString(),
            included: true,
            timing: '1/2',
            amountsByPeriod: { 1: cartTotal.toString() }
          };
          updatedBudgetData[selectedCategory].push(newBudgetItem);
          
          if (updatedBudgetData._periodTotals && typeof updatedBudgetData._periodTotals[1] === 'number') {
            updatedBudgetData._periodTotals[1] += cartTotal;
          }
          activeSetup.totalAmount = (activeSetup.totalAmount || 0) + cartTotal;
        }
      }

      // 2. 🟢 CREATE THE SUPABASE TRANSACTION (Using the Smart Name)
      const transactionPayload = {
        name: finalTransactionName,
        amount: cartTotal, 
        date: combineDateWithCurrentTime(todayIso),
        payment_method_id: selectedAccountId,
        transaction_type: 'cash_out',
        notes: `Budget Timing: 1/2\nItems: ${cartSummary}`
      };
      
      const { error: txError } = await createTransaction(transactionPayload as any);
      if (txError) throw txError;

      // 3. 🟢 SYNC BUDGET IF NEEDED
      if (budgetNeedsUpdate && updatedBudgetData) {
        await updateBudgetSetupFrontend({
          ...activeSetup,
          data: updatedBudgetData
        });
      }
      
      // 4. Clear the session
      setCart([]);
      setTripName("");
      setIsCheckoutOpen(false);
      alert("Checkout complete and synced to your Budget!");
      
    } catch (error) {
      console.error("Cloud sync error during checkout:", error);
      alert("Failed to sync checkout to the cloud.");
    }
  };




  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !productPrice || !user) return;

    const finalBarcode = stateRef.current.scannedCode;
    const numericPrice = parseFloat(productPrice);

    // 🟢 1. Build the Personal Price Tag (Always happens)
    const newUserPrice = {
      barcode: finalBarcode,
      user_id: user.id,
      name: productName,
      current_price: numericPrice,
      price_history: [{ price: numericPrice, date: new Date().toISOString() }],
      sync_status: 'pending_insert' as const,
      last_updated: Date.now()
    };

    try {
      // 🟢 2. ALWAYS save to the user's personal inventory
      await localDb.user_prices.put(newUserPrice);

      // 🟢 3. GUARDRAIL: Only push to the Global Master Dictionary if it is a REAL barcode
      if (!finalBarcode.startsWith('custom-')) {
        const newGlobalProduct = {
          barcode: finalBarcode,
          name: productName,
          sync_status: 'pending_insert' as const
        };
        await localDb.global_products.put(newGlobalProduct);
      }

      // Add to cart and close modal
      addToCart(newUserPrice as any); 
      setIsModalOpen(false);
      setProductName("");
      setProductPrice("");
      setScannedCode("Waiting for barcode...");
    } catch (error) {
      console.error("Failed to save item locally:", error);
      alert("Could not save the item.");
    }
  };



  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = manualBarcode.trim();
    if (!cleanInput) return;
    
    // If in name mode, hitting "Enter" grabs the top result
    if (searchMode === 'name') {
      if (searchResults.length > 0) {
        handleSelectSearchResult(searchResults[0]);
      }
      return;
    }
    
    // Barcode Mode Logic
    setIsManualInputOpen(false);
    setManualBarcode("");
    setScannedCode(cleanInput);
    
    try {
      console.log(`\n[Search: Barcode] 🔍 Starting lookup for barcode: ${cleanInput}`);

      // 🟢 1. ALWAYS check personal local database first
      console.log("[Search: Barcode] 1️⃣ Checking localDb.user_prices...");
      const userProduct = await localDb.user_prices.get(cleanInput);
      
      if (userProduct) {
        console.log("[Search: Barcode] ✅ FOUND in localDb.user_prices!");
        addToCart(userProduct as any);
        setTimeout(() => setScannedCode("Waiting for barcode..."), 2000); 
        return;
      }

      // 🟢 2. Check local global cache (Offline dictionary)
      console.log("[Search: Barcode] 2️⃣ Not in user prices. Checking localDb.global_products (offline cache)...");
      const localGlobal = await localDb.global_products.get(cleanInput);
      if (localGlobal) {
        console.log("[Search: Barcode] ✅ FOUND in localDb.global_products!");
        setProductName(localGlobal.name);
        setIsModalOpen(true);
        return;
      }

      // 🟢 3. If online, ask the cloud global dictionary & sync it down
      if (navigator.onLine) {
        console.log("[Search: Barcode] 3️⃣ Not found locally. Online mode active: Querying Supabase global_products...");
        const { data: cloudGlobalProduct } = await supabase
          .from('global_products')
          .select('name, barcode')
          .eq('barcode', cleanInput)
          .single();

        if (cloudGlobalProduct) {
          console.log("[Search: Barcode] ✅ FOUND in Supabase global_products! Syncing down to localDb...");
          // Sync to local cache so it works offline next time
          await localDb.global_products.put({
            ...cloudGlobalProduct,
            sync_status: 'synced'
          });
          setProductName(cloudGlobalProduct.name);
        } else {
          console.log("[Search: Barcode] ❌ Not found anywhere (Local or Cloud). This is a brand new item.");
          setProductName(""); // Brand new item
        }
      } else {
        console.log("[Search: Barcode] ❌ Offline mode active. Cannot check Supabase fallback.");
        setProductName(""); // Offline and not found locally
      }
      
      setIsModalOpen(true);
      
    } catch (error) {
      console.error("[Search: Barcode] 🚨 Lookup error:", error);
      setProductName("");
      setIsModalOpen(true);
    }
  };

  // --- EDIT PRICE ON THE FLY ---
  const handlePriceChange = (barcode: string, newPriceStr: string) => {
    const newPrice = parseFloat(newPriceStr);
    
    // Update the cart state instantly for a snappy UI
    setCart(prevCart => prevCart.map(item => 
      item.barcode === barcode ? { ...item, current_price: isNaN(newPrice) ? 0 : newPrice } : item
    ));
  };

  const commitPriceToDB = async (item: CartItem) => {
    try {
      const existingProduct = await localDb.user_prices.get(item.barcode);
      
      // Only update the database if the price actually changed
      if (existingProduct && existingProduct.current_price !== item.current_price) {
        const newEntry = { price: item.current_price, date: new Date().toISOString() };
        
        // 🟢 CAPPING HISTORY: Append the new price, but only keep the latest 3 entries
        const newHistory = [...existingProduct.price_history, newEntry].slice(-3);
        
        await localDb.user_prices.update(item.barcode, {
          current_price: item.current_price,
          price_history: newHistory,
          // Flag it so the background engine knows to upload this edit
          sync_status: existingProduct.sync_status === 'pending_insert' ? 'pending_insert' : 'pending_update',
          last_updated: Date.now()
        });
      }
    } catch (error) {
      console.error("Failed to commit price to DB:", error);
    }
  };



  return (
        
    <div className="flex flex-col md:flex-row gap-6 p-4 pt-24 min-h-full max-w-6xl mx-auto pb-24 items-start">

      
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

                        {/* 🟢 FIXED: Switched to aspect-[4/3] on mobile for extra height, added min-h safeguard */}
        <div className="relative w-full aspect-[4/3] md:aspect-video min-h-[240px] max-h-72 bg-black rounded-2xl overflow-hidden border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-4 flex items-center justify-center">
          <video ref={ref} className="w-full h-full object-cover opacity-80" playsInline muted autoPlay />
          
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">

                         {/* 🟢 NEW: SUCCESS FEEDBACK BANNER */}
            {scanFeedback && (
              <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-center animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="bg-amber-400 text-black px-4 py-2.5 rounded-xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 max-w-full">
                  <ShoppingCart className="w-5 h-5 shrink-0" />
                  
                  {/* 🟢 MOVED TO FRONT: +1 Badge is now safely protected from truncation */}
                  {scanFeedback.isUpdate && (
                    <span className="text-white bg-black px-1.5 py-0.5 rounded-md shrink-0 text-xs font-black shadow-[1px_1px_0px_0px_rgba(255,255,255,0.5)]">
                      +1
                    </span>
                  )}
                  
                  <span className="font-black text-xs sm:text-sm uppercase tracking-wide truncate">
                    {scanFeedback.name}
                  </span>
                </div>
              </div>
            )}

            
            {/* 🟢 FIXED: Reduced bottom margin to mb-3 so banner hugs tighter */}
            <div className="w-[85%] max-w-[280px] aspect-[21/9] border-2 border-white/30 rounded-xl relative flex items-center justify-center mb-3">
              <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
              <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
              <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
              <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl"></div>
              
              <div className="w-11/12 h-[2px] bg-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.8)] animate-pulse"></div>
            </div>
            
            <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-center">
              {/* 🟢 FIXED: Added leading-tight and a mobile break <br/> to wrap text neatly */}
              <p className="text-white text-[10px] font-black uppercase tracking-widest shadow-black drop-shadow-md leading-tight">
                Ensure entire barcode<br className="sm:hidden" /> fits in frame
              </p>
            </div>
            
          </div>
        </div>


        {/* 🟢 FIXED: Added gap-2, removed mr-4, and added shrink-0/min-w-0 for perfect flex sizing */}
        <div className="flex flex-row justify-between items-center mt-2 gap-2 w-full">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl border-[3px] border-black flex-1 flex items-center gap-2 min-w-0">
            <Barcode className="w-5 h-5 text-gray-500 shrink-0" />
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{scannedCode}</p>
          </div>
          <button 
            onClick={() => setIsManualInputOpen(true)}
            className="p-3 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all font-black uppercase text-[10px] tracking-widest whitespace-nowrap shrink-0"
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
              ₱{cartTotal.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
            <span>Budget Utilized</span>
            
            {/* 🟢 EDITABLE BUDGET LIMIT */}
            {isEditingBudget ? (
              <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] px-2 py-0.5 animate-in zoom-in-95 duration-200">
                <span className="text-gray-900 dark:text-white font-bold">₱</span>
                <input
                  type="number"
                  autoFocus
                  className="w-20 bg-transparent text-gray-900 dark:text-white font-bold outline-none text-right hide-arrows m-0 p-0 text-base sm:text-xs"
                  value={tempBudget}
                  onChange={(e) => setTempBudget(e.target.value)}
                  onBlur={handleBudgetSave}
                  onKeyDown={(e) => e.key === 'Enter' && handleBudgetSave()}
                />

              </div>
            ) : (
              <button 
                onClick={() => {
                  setTempBudget(budgetLimit.toString());
                  setIsEditingBudget(true);
                }}
                className="border-b-2 border-dashed border-gray-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1"
                title="Edit Budget Limit"
              >
                Limit: ₱{budgetLimit.toFixed(2)}
              </button>
            )}
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
            cart.map(item => {
              const isHighlighted = highlightedBarcode === item.barcode;
              return (
                <div 
                  key={item.barcode} 
                  className={`p-4 rounded-2xl border-[3px] border-black flex flex-col gap-2 transition-all duration-300 ${
                    isHighlighted 
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 scale-[1.02] shadow-[4px_4px_0px_0px_rgba(79,70,229,0.5)]' 
                      : 'bg-gray-50 dark:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  
                  <div className="flex items-start justify-between">
                  <div>
                      <p className="font-bold text-gray-900 dark:text-white leading-tight">{item.name}</p>
                      
                      {/* 🟢 EDITABLE PRICE FIELD */}
                      <div className="flex items-center gap-1 text-sm font-medium text-gray-500 mt-0.5">
                        <span className="font-bold text-gray-400">₱</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.current_price === 0 ? '' : item.current_price}
                          onChange={(e) => handlePriceChange(item.barcode, e.target.value)}
                          onBlur={() => commitPriceToDB(item)}
                          className="w-16 bg-transparent border-b-2 border-dashed border-gray-300 dark:border-gray-600 focus:border-indigo-500 dark:focus:border-indigo-400 outline-none text-gray-900 dark:text-white font-bold hide-arrows p-0 text-center transition-colors"
                          placeholder="0.00"
                        />
                        <span className="text-xs">each</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <p className="font-black text-gray-900 dark:text-white">
                        {/* 🟢 CHANGED TO ₱ */}
                        ₱{((item.current_price ?? (item as any).price ?? 0) * item.quantity).toFixed(2)}
                      </p>
                      {item.price_history && item.price_history.length > 1 && (
                         <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 mt-1 uppercase tracking-widest">
                           <History className="w-3 h-3" /> 
                           {/* 🟢 CHANGED TO ₱ */}
                           Prev: ₱{item.price_history[item.price_history.length - 2].price.toFixed(2)}
                         </span>
                      )}
                    </div>
                  </div>

                  
                  <div className="flex justify-end mt-1">
                    <div className="flex items-center bg-white dark:bg-gray-700 rounded-xl border-2 border-black overflow-hidden">
                      <button onClick={() => updateQuantity(item.barcode, -1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      
                      {/* 🟢 DIRECT QUANTITY INPUT */}
                      <input 
                        type="number" 
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleExactQuantity(item.barcode, parseInt(e.target.value) || 1)}
                        className="w-12 text-center font-black text-base sm:text-sm bg-transparent outline-none m-0 p-0 hide-arrows"
                        style={{ MozAppearance: 'textfield' }} // Firefox fallback to hide arrows
                      />

                      
                      <button onClick={() => updateQuantity(item.barcode, 1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
                
              );
            })
          )}
        </div>
        {/* 🟢 NEW: CHECKOUT BUTTON */}
        {cart.length > 0 && (
          <div className="mt-4 pt-4 border-t-[3px] border-black border-dashed shrink-0">
            <button 
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-green-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              <ShoppingCart className="w-5 h-5" /> Checkout
            </button>
          </div>
        )}
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
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">₱</span>
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
              
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <button
                  type="button"
                  onClick={() => setSearchMode('barcode')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-colors ${
                    searchMode === 'barcode' 
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Barcode
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('name')}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-colors ${
                    searchMode === 'name' 
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Item Name
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                  {searchMode === 'barcode' ? 'Barcode Number' : 'Product Name'}
                </label>
                <input 
                  type={searchMode === 'barcode' ? "number" : "text"} 
                  autoFocus 
                  value={manualBarcode} 
                  onChange={(e) => setManualBarcode(e.target.value)} 
                  className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500 hide-arrows" 
                  placeholder={searchMode === 'barcode' ? "e.g. 4809011249486" : "e.g. Milk or Bread"} 
                />
              </div>

                            {/* 🟢 LIVE SEARCH RESULTS DROPDOWN */}
                            {searchMode === 'name' && searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border-[3px] border-black rounded-2xl bg-white dark:bg-gray-800 flex flex-col divide-y-[1px] divide-gray-200 dark:divide-gray-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  {searchResults.map(product => {
                    // Check if it's a global-only item
                    const isGlobalOnly = product.current_price === 0 || !product.price_history;

                    return (
                      <button
                        key={product.barcode}
                        type="button"
                        onClick={() => handleSelectSearchResult(product)}
                        className="p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex justify-between items-center group"
                      >
                        <span className="font-bold text-sm text-gray-900 dark:text-white truncate pr-2">{product.name}</span>
                        
                        {isGlobalOnly ? (
                          // 🟢 GLOBAL ITEM UI: Prompts them to set a price
                          <span className="flex items-center gap-1 text-[10px] font-black text-gray-400 group-hover:text-indigo-500 uppercase tracking-widest whitespace-nowrap transition-colors">
                            <ShoppingCart className="w-3 h-3" /> Set Price
                          </span>
                        ) : (
                          // 🟢 PERSONAL ITEM UI: Shows their saved price
                          <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                            ₱{(product.current_price ?? (product as any).price ?? 0).toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* 🟢 UPGRADED NO RESULTS MESSAGE: Generate Custom Item */}
              {searchMode === 'name' && manualBarcode.trim().length > 1 && searchResults.length === 0 && (
                 <div className="text-center p-6 border-[3px] border-black rounded-2xl bg-gray-50 dark:bg-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-3 mt-4 animate-in fade-in slide-in-from-top-2">
                   <span className="text-xs font-bold text-gray-500">No matching products found.</span>
                   
                   <button
                     type="button"
                     onClick={() => {
                        setIsManualInputOpen(false);
                        setSearchResults([]);
                        // 🟢 Create a dummy barcode so loose items can be added!
                        setScannedCode(`custom-${Date.now()}`); 
                        setProductName(manualBarcode); // Pre-fill their exact search term
                        setIsModalOpen(true);
                        setManualBarcode("");
                     }}
                     className="w-full flex items-center justify-center gap-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 py-3 rounded-xl font-black uppercase tracking-widest border-2 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors text-[10px]"
                   >
                     <Plus className="w-4 h-4" /> Create "{manualBarcode}"
                   </button>
                 </div>
              )}

            </form>


          </div>
        </div>
      )}

      {/* 🟢 CHECKOUT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border-[3px] border-black animate-in zoom-in-95">
            <button 
              onClick={() => setIsCheckoutOpen(false)} 
              className="absolute right-6 top-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tight">Checkout</h3>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border-2 border-black mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-gray-500">Total Items</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-widest text-gray-500">Trip Total</span>
                <span className="text-2xl font-black text-gray-900 dark:text-white">₱{cartTotal.toFixed(2)}</span>
              </div>
            </div>
            
            <form onSubmit={handleFinalizeCheckout} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Trip Name</label>
                <input 
                  type="text" 
                  autoFocus 
                  required 
                  value={tripName} 
                  onChange={(e) => setTripName(e.target.value)} 
                  className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500" 
                  placeholder="e.g. SM Supermarket Groceries" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 🟢 BUDGET CATEGORY DROPDOWN */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Category</label>
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500 appearance-none text-xs"
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Household">Household</option>
                    <option value="Flexi">Flexi</option>
                  </select>
                </div>

                                            {/* 🟢 PAYMENT ACCOUNT DROPDOWN */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Paid With</label>
                  <select 
                    required
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500 appearance-none text-xs"
                  >
                    <option value="" disabled>Select Account...</option>
                    
                    {/* 🟢 GROUP 1: Bank & Cash (Debit) */}
                    <optgroup label="Bank & Cash">
                      {accounts
                        .filter(acc => acc.type !== 'Credit' && acc.classification !== 'Credit Card')
                        .map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bank}
                          </option>
                      ))}
                    </optgroup>

                    {/* 🟢 GROUP 2: Credit Cards */}
                    {accounts.some(acc => acc.type === 'Credit' || acc.classification === 'Credit Card') && (
                      <optgroup label="Credit Cards">
                        {accounts
                          .filter(acc => acc.type === 'Credit' || acc.classification === 'Credit Card')
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.bank}
                            </option>
                        ))}
                      </optgroup>
                    )}
                    
                  </select>
                </div>
              </div>

              <button type="submit" className="w-full flex items-center justify-center gap-2 mt-4 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                Finalize & Sync
              </button>
            </form>

          </div>
        </div>
      )}

      {/* 🟢 STARTUP BUDGET MODAL */}
      {showStartupModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-sm p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative border-4 border-black text-center flex flex-col items-center">
            
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-full border-2 border-black flex items-center justify-center mb-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <ShoppingCart className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>

            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 uppercase tracking-tight leading-tight">
              Out for a grocery run I see?
            </h3>
            <p className="text-sm font-bold text-gray-500 mb-6">
              How much is your budget?
            </p>
            
            <form onSubmit={handleStartupSubmit} className="w-full space-y-6">
              <div className="relative flex justify-center">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-gray-400 text-xl">₱</span>
                <input 
                  type="number" 
                  autoFocus 
                  value={startupBudgetInput} 
                  onChange={(e) => setStartupBudgetInput(e.target.value)} 
                  className="w-full py-4 pl-12 pr-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-[3px] border-black text-gray-900 dark:text-white text-2xl font-black outline-none focus:border-indigo-500 text-center hide-arrows shadow-inner" 
                  placeholder="0.00" 
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowStartupModal(false)} 
                  className="flex-1 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] py-4 rounded-xl font-black uppercase tracking-widest text-[10px] bg-indigo-600 text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  Let's Go!
                </button>
              </div>
            </form>

          </div>
        </div>
      )}


    </div>
  );
}

      
    