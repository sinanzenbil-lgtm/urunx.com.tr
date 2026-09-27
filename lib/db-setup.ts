'use server';

import { sql } from './db';

export async function setupDatabase() {
    try {
        // Create customers (cariler) table
        await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        customer_code TEXT,
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_key ON customers(customer_code) WHERE customer_code IS NOT NULL;`;

        // Customer payments (tahsilat) table
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

        // Create items table
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

        // Create transactions table
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

        // transactions performans index'leri (hareket listesi ve stok toplulaştırma için kritik)
        await sql`CREATE INDEX IF NOT EXISTS transactions_item_id_idx ON transactions(item_id);`;
        await sql`CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);`;
        await sql`CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions(customer_id);`;

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

        // Company settings table (logo / unvan / iletişim)
        await sql`
      CREATE TABLE IF NOT EXISTS company_settings (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL DEFAULT '',
        trade_name TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        logo TEXT,
        monthly_interest_rate DECIMAL NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS monthly_interest_rate DECIMAL NOT NULL DEFAULT 0;`;

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

        // Teklifler (quotes) ve teklif satırları
        await sql`
            CREATE TABLE IF NOT EXISTS quotes (
                id TEXT PRIMARY KEY,
                quote_no TEXT NOT NULL,
                customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
                customer_name TEXT NOT NULL DEFAULT '',
                customer_code TEXT,
                customer_address TEXT,
                customer_phone TEXT,
                date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                valid_until TIMESTAMP WITH TIME ZONE,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'HAZIRLANDI',
                subtotal DECIMAL NOT NULL DEFAULT 0,
                vat_total DECIMAL NOT NULL DEFAULT 0,
                grand_total DECIMAL NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_no_key ON quotes(quote_no);`;
        await sql`CREATE INDEX IF NOT EXISTS quotes_date_idx ON quotes(date DESC);`;
        await sql`CREATE INDEX IF NOT EXISTS quotes_customer_id_idx ON quotes(customer_id);`;
        await sql`
            CREATE TABLE IF NOT EXISTS quote_items (
                id TEXT PRIMARY KEY,
                quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
                item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                stock_code TEXT,
                barcode TEXT,
                brand TEXT,
                buy_price DECIMAL NOT NULL DEFAULT 0,
                unit_price DECIMAL NOT NULL DEFAULT 0,
                quantity INTEGER NOT NULL DEFAULT 1,
                vat_rate DECIMAL NOT NULL DEFAULT 20,
                line_subtotal DECIMAL NOT NULL DEFAULT 0,
                line_vat DECIMAL NOT NULL DEFAULT 0,
                line_total DECIMAL NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS quote_items_quote_id_idx ON quote_items(quote_id);`;

        await sql`
            CREATE TABLE IF NOT EXISTS quote_settings (
                id TEXT PRIMARY KEY,
                subtitle TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                validity_days INTEGER NOT NULL DEFAULT 15,
                default_note TEXT NOT NULL DEFAULT '',
                terms TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        console.log('Database tables created successfully');
        return { success: true };
    } catch (error) {
        console.error('Error setting up database:', error);
        return { success: false, error };
    }
}
