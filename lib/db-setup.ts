'use server';

import { sql } from './db';

export async function setupDatabase() {
    try {
        // Create items table
        await sql`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        barcode TEXT UNIQUE NOT NULL,
        stock_code TEXT,
        name TEXT NOT NULL,
        image TEXT,
        description TEXT,
        brand TEXT,
        vat_rate DECIMAL DEFAULT 20,
        buy_price DECIMAL DEFAULT 0,
        sell_price DECIMAL DEFAULT 0,
        quantity INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        // Create transactions table
        await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        channel TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        console.log('Database tables created successfully');
        return { success: true };
    } catch (error) {
        console.error('Error setting up database:', error);
        return { success: false, error };
    }
}
