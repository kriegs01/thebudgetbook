# Plan: Receipt OCR Integration (Tesseract.js)

## Overview
This document outlines the plan to integrate **Tesseract.js** into the Budget Book application to automatically extract amounts and dates from uploaded digital receipts.

This enhancement applies to the newly standardized Payment and Transaction forms (`Budget.tsx`, `Installments.tsx`, `transactions.tsx`).

## Architecture Strategy
- **Client-side only:** Tesseract.js runs entirely in the browser using WebAssembly and Web Workers. No backend server is required.
- **Import Map Integration:** Following the existing Vercel deployment architecture, the library will be loaded via the `esm.sh` CDN to keep the local bundle size small.
- **Worker Thread:** Image processing will be offloaded to a background Web Worker to prevent freezing the React UI.

---

## Implementation Steps

### 1. Add Dependency to Import Map
Update `/index.html` to include the Tesseract.js CDN link:
```json
"tesseract.js": "https://esm.sh/tesseract.js@5.0.5"
```
*Note: Also add it to `vite.config.ts` under the external dependencies list if necessary to prevent Vite from trying to bundle it.*

### 2. Create the OCR Utility Service
Create a new file at `src/utils/ocrService.ts` to handle the worker initialization, image processing, and text parsing.

```typescript
import { createWorker } from 'tesseract.js';

export const extractTextFromReceipt = async (imageFile: File, onProgress?: (m: any) => void) => {
  // 1. Initialize worker with English language data
  const worker = await createWorker('eng', 1, {
    logger: m => onProgress && onProgress(m) // Hook for UI progress bar
  });
  
  try {
    // 2. Perform OCR on the compressed image
    const { data: { text } } = await worker.recognize(imageFile);
    
    // 3. Regex matching for Amounts and Dates
    const amountMatch = text.match(/(?:php|p|₱|total|amount)[\s:]*([\d,]+\.\d{2})/i);
    const dateMatch = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/);
    
    return {
      rawText: text,
      suggestedAmount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null,
      suggestedDate: dateMatch ? dateMatch[0] : null
    };
  } finally {
    await worker.terminate(); // Prevent memory leaks
  }
};
```

### 3. Build UI/UX in Payment Forms
In the Payment forms (e.g., Budget Pay Modal):
1. Detect when a user drops a file into the `<ReceiptUpload />` zone.
2. Compress the image (e.g., using an HTML5 Canvas utility to shrink it to ~1000px max width) to speed up OCR.
3. Set the UI to a loading state: `"🪄 Analyzing receipt (45%)..."`
4. Call `extractTextFromReceipt(compressedFile, updateProgressBar)`.
5. Automatically update the `payFormData.amount` and `payFormData.datePaid` states if values are found.
6. Allow the user to review and correct the fields before hitting "Submit".

---

## Performance & UX Considerations

### 1. The Initial Load Penalty
Tesseract.js must download a WebAssembly core file (~5MB) and an English trained data file (`eng.traineddata`, ~20MB) on its very first run. 
- **Mitigation:** The browser heavily caches these files after the first load. 
- **UX:** Display a distinct loading state (e.g., *"Downloading OCR Engine..."*) so the user doesn't think the app is frozen.

### 2. Processing Speed
Once initialized, a typical receipt takes 1-5 seconds to process depending on device speed and image complexity.
- **Mitigation:** Implement image downscaling *before* passing the file to Tesseract. Feeding it an 8MB iPhone photo will be very slow; a 500KB downscaled image will process in 1-2 seconds.

### 3. Regex Tuning
Receipts are highly variable. The Regular Expressions used to find "Total Amount" and "Date" will need to be tweaked over time based on the specific vendors (e.g., Meralco, Globe, Shopee) used most frequently in the app.

---

## Future Enhancements
- Pre-initialize the Web Worker in the background when the user opens the "Pay" modal so it's ready instantly when they drop a receipt.
- Add a "crop/crop hint" UI to let users select exactly where the total is if the auto-detection fails.