const { neon } = require('@neondatabase/serverless');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

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
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        customer_code TEXT,
        name TEXT NOT NULL,
        opening_balance DECIMAL NOT NULL DEFAULT 0,
        opening_balance_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '2000-01-01T00:00:00.000Z',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON customers(customer_code) WHERE customer_code IS NOT NULL;`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL NOT NULL DEFAULT 0;`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '2000-01-01T00:00:00.000Z';`;

        await sql`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY,
        customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        amount DECIMAL NOT NULL DEFAULT 0,
        direction TEXT NOT NULL DEFAULT 'IN',
        method TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await sql`CREATE INDEX IF NOT EXISTS customer_payments_customer_id_idx ON customer_payments(customer_id);`;

        await sql`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        barcode TEXT,
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

        await sql`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_barcode_key;`;
        await sql`DROP INDEX IF EXISTS items_barcode_key;`;
        await sql`ALTER TABLE items ALTER COLUMN barcode DROP NOT NULL;`;

        await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        kind TEXT DEFAULT 'NORMAL',
        quantity INTEGER NOT NULL,
        channel TEXT,
        unit_price DECIMAL DEFAULT 0,
        total_price DECIMAL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        // Backward-compatible schema upgrades
        await sql`ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'IN';`;
        await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_price DECIMAL DEFAULT 0;`;
        await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_price DECIMAL DEFAULT 0;`;
        await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_id TEXT;`;
        await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'NORMAL';`;
        await sql`DO $$ BEGIN
          ALTER TABLE transactions
          ADD CONSTRAINT transactions_customer_id_fkey
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;

        await sql`
            CREATE TABLE IF NOT EXISTS members (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL DEFAULT '',
                last_name TEXT NOT NULL DEFAULT '',
                company_name TEXT NOT NULL DEFAULT '',
                menu_routes JSONB NOT NULL DEFAULT '[]'::jsonb,
                sales_perakende BOOLEAN NOT NULL DEFAULT true,
                sales_toptan BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log('Tables created successfully!');
    } catch (error) {
        console.error('Error:', error);
    }
}

setup();
