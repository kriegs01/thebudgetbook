import Dexie, { type Table } from 'dexie';

// Define the shape of a single price entry
export interface PriceEntry {
  price: number;
  date: string; // ISO string timestamp
}

// Define the upgraded offline product
export interface LocalProduct {
  barcode: string; // Primary Key
  user_id: string; // To ensure users only sync their own items
  name: string;
  current_price: number;
  price_history: PriceEntry[]; // Array to track the last X prices
  sync_status: 'synced' | 'pending_insert' | 'pending_update'; // The Sync Engine trigger
  last_updated: number; // For conflict resolution
}

export class PriceTagDB extends Dexie {
  products!: Table<LocalProduct>;

  constructor() {
    super('PriceTagDB');
    
    // Schema definition
    // barcode is the primary key. We also index sync_status to quickly find offline edits.
    this.version(2).stores({
      products: 'barcode, user_id, sync_status, last_updated'
    });
  }
}

export const localDb = new PriceTagDB();
