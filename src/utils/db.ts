import Dexie, { type Table } from 'dexie';

// Define the shape of a single price entry
export interface PriceEntry {
  price: number;
  date: string; // ISO string timestamp
}

// 🟢 1. Updated: This represents your personal price tags (formerly LocalProduct)
export interface UserPrice {
  barcode: string; // Primary Key
  user_id: string; // To ensure users only sync their own items
  name: string;
  current_price: number;
  price_history: PriceEntry[]; // Array to track the last X prices
  sync_status: 'synced' | 'pending_insert' | 'pending_update'; // The Sync Engine trigger
  last_updated: number; // For conflict resolution
}

// 🟢 2. New: This represents the shared global dictionary
export interface GlobalProduct {
  barcode: string;
  name: string;
  sync_status?: 'synced' | 'pending_insert';
}

export class PriceTagDB extends Dexie {
  // 🟢 3. Updated: Define the two distinct tables
  user_prices!: Table<UserPrice, string>;
  global_products!: Table<GlobalProduct, string>;

  constructor() {
    super('PriceTagDB');
    
    // 🟢 4. Updated: Bump version to 3 and register both tables
    this.version(3).stores({
      // Primary key is barcode, indexed by user_id, sync_status, and last_updated
      user_prices: 'barcode, user_id, sync_status, last_updated',
      
      // Primary key is barcode, indexed by sync_status
      global_products: 'barcode, sync_status'
    });
  }
}

export const localDb = new PriceTagDB();
