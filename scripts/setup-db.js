const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function setup() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL is missing');
        return;
    }

    const sql = neon(databaseUrl);

    try {
        console.log('Creating tables...');

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

        console.log('Tables created successfully!');
    } catch (error) {
        console.error('Error:', error);
    }
}

setup();
