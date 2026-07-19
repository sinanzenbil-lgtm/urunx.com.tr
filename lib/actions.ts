'use server';

import { sql } from './db';
import { hashPassword, verifyPassword } from './password';
import {
    ALL_MENU_KEYS,
    CompanySettings,
    Customer,
    type MemberPublic,
    type MenuRouteKey,
    PaymentMethod,
    StockItem,
    Transaction,
    type User,
} from '@/types';
import { revalidatePath } from 'next/cache';

/** Server Action yanıtı JSON olmalı; Postgres Error nesnesi dönmek 500 üretebilir */
function safeActionError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

const OPENING_BALANCE_DEFAULT_DATE = '2000-01-01T00:00:00.000Z';
const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    companyName: '',
    tradeName: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    stockInterestMonthlyRate: 0,
};

export type ItemsListSortKey = 'name' | 'brand' | 'stockCode' | 'quantity' | 'buyPrice' | 'sellPrice';

type DbItemRow = {
    id: string;
    barcode: string | null;
    stockCode: string | null;
    name: string;
    image: string | null;
    description: string | null;
    brand: string | null;
    vatRate: unknown;
    buyPrice: unknown;
    sellPrice: unknown;
    quantity: unknown;
    createdAt: string;
    updatedAt: string;
    transactions: unknown;
};

function mapDbRowsToStockItems(rows: unknown): StockItem[] {
    const formattedItems = (rows as unknown as DbItemRow[]).map((item) => {
        const txs = Array.isArray(item.transactions) ? (item.transactions as unknown[]) : [];
        const transactions: Transaction[] = txs.map((t) => {
            const tx = (t ?? {}) as Record<string, unknown>;
            const quantity = Number(tx['quantity']) || 0;
            const unitPriceRaw = tx['unitPrice'];
            const totalPriceRaw = tx['totalPrice'];
            return {
                ...(tx as unknown as Transaction),
                quantity,
                unitPrice: unitPriceRaw === undefined || unitPriceRaw === null ? undefined : (Number(unitPriceRaw) || 0),
                totalPrice: totalPriceRaw === undefined || totalPriceRaw === null ? undefined : (Number(totalPriceRaw) || 0),
            };
        });

        return {
            ...(item as unknown as StockItem),
            barcode: item.barcode ?? '',
            stockCode: item.stockCode ?? '',
            buyPrice: Number(item.buyPrice) || 0,
            sellPrice: Number(item.sellPrice) || 0,
            vatRate: Number(item.vatRate) || 0,
            quantity: Number(item.quantity) || 0,
            transactions,
        };
    });

    return formattedItems as unknown as StockItem[];
}

/** items tablosu + işlemler — liste sorgularında ortak SELECT gövdesi */
const ITEMS_SELECT_FROM = sql`
    SELECT 
        i.id, 
        i.barcode, 
        i.stock_code as "stockCode", 
        i.name, 
        i.image, 
        i.description, 
        i.brand, 
        i.vat_rate as "vatRate", 
        i.buy_price as "buyPrice", 
        i.sell_price as "sellPrice", 
        i.quantity, 
        i.created_at as "createdAt", 
        i.updated_at as "updatedAt",
        COALESCE(
            (SELECT json_agg(json_build_object(
                'id', t.id,
                'date', t.date,
                'type', t.type,
                'kind', t.kind,
                'quantity', t.quantity,
                'channel', t.channel,
                'unitPrice', t.unit_price,
                'totalPrice', t.total_price,
                'customerId', t.customer_id,
                'customerName', c.name,
                'customerCode', c.customer_code
            ) ORDER BY t.date DESC)
            FROM transactions t
            LEFT JOIN customers c ON c.id = t.customer_id
            WHERE t.item_id = i.id),
            '[]'
        ) as transactions
    FROM items i
`;

const ITEMS_ORDER_WHITELIST: Record<string, string> = {
    'name-asc': 'i.name ASC',
    'name-desc': 'i.name DESC',
    'brand-asc': 'i.brand ASC NULLS LAST',
    'brand-desc': 'i.brand DESC NULLS LAST',
    'stockCode-asc': 'i.stock_code ASC NULLS LAST',
    'stockCode-desc': 'i.stock_code DESC NULLS LAST',
    'quantity-asc': 'i.quantity ASC',
    'quantity-desc': 'i.quantity DESC',
    'buyPrice-asc': 'i.buy_price ASC',
    'buyPrice-desc': 'i.buy_price DESC',
    'sellPrice-asc': 'i.sell_price ASC',
    'sellPrice-desc': 'i.sell_price DESC',
};

function itemsListWhereClause(brand: string | undefined, searchRaw: string | undefined) {
    const q = (searchRaw ?? '').trim();
    const b = (brand ?? '').trim();
    if (b && q) {
        const p = `%${q}%`;
        return sql`WHERE i.brand = ${b} AND (
            i.name ILIKE ${p} OR i.barcode ILIKE ${p} OR COALESCE(i.stock_code, '') ILIKE ${p} OR COALESCE(i.brand, '') ILIKE ${p}
        )`;
    }
    if (b) {
        return sql`WHERE i.brand = ${b}`;
    }
    if (q) {
        const p = `%${q}%`;
        return sql`WHERE (
            i.name ILIKE ${p} OR i.barcode ILIKE ${p} OR COALESCE(i.stock_code, '') ILIKE ${p} OR COALESCE(i.brand, '') ILIKE ${p}
        )`;
    }
    return sql``;
}

/**
 * transactions tablosu için gerekli index'ler. Var olan (production) veritabanları
 * setupDatabase()'i yeniden çalıştırmadığından, index'leri ilk çağrıda tembel (lazy)
 * olarak oluştururuz. Modül seviyesinde bir promise ile süreç başına yalnızca bir kez
 * çalışır; sonraki çağrılar anında (DB'ye gitmeden) çözülür.
 */
let txIndexesReady: Promise<void> | null = null;
async function ensureTransactionIndexes(): Promise<void> {
    if (!txIndexesReady) {
        txIndexesReady = (async () => {
            await sql`CREATE INDEX IF NOT EXISTS transactions_item_id_idx ON transactions(item_id)`;
            await sql`CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC)`;
            await sql`CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions(customer_id)`;
        })().catch((e) => {
            // Başarısız olursa tekrar denenebilsin (ör. geçici bağlantı hatası)
            txIndexesReady = null;
            throw e;
        });
    }
    return txIndexesReady;
}

export async function getItems() {
    try {
        // Index'ler yoksa json_agg alt sorgusu her ürün için transactions tablosunu
        // baştan sona tarar (çok yavaş). Index oluşumu başarısız olsa bile sorguyu çalıştır.
        await ensureTransactionIndexes().catch(() => {});
        const items = await sql`
            ${ITEMS_SELECT_FROM}
            ORDER BY i.updated_at DESC
        `;
        return mapDbRowsToStockItems(items);
    } catch (error) {
        console.error('Error fetching items:', error);
        throw error;
    }
}

/** Hareketler listesi için düz (flat) satır — ürün bilgisiyle birlikte tek hareket */
export type MovementRow = {
    id: string;
    date: string;
    type: 'IN' | 'OUT';
    kind: string | null;
    quantity: number;
    channel: string | null;
    unitPrice: number | null;
    totalPrice: number | null;
    customerId: string | null;
    customerName: string | null;
    customerCode: string | null;
    itemId: string;
    productName: string;
    barcode: string;
    image: string | null;
    brand: string | null;
    itemSellPrice: number;
    itemCreatedAt: string;
};

/** timestamptz sütunu neon'dan Date ya da string gelebilir; her durumda ISO string'e çevir */
function toIsoString(v: unknown): string {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v);
}

function mapMovementRows(rows: unknown): MovementRow[] {
    return (rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        date: toIsoString(r.date),
        type: (r.type === 'OUT' ? 'OUT' : 'IN') as 'IN' | 'OUT',
        kind: r.kind == null ? null : String(r.kind),
        quantity: Number(r.quantity) || 0,
        channel: r.channel == null ? null : String(r.channel),
        unitPrice: r.unitPrice == null ? null : Number(r.unitPrice) || 0,
        totalPrice: r.totalPrice == null ? null : Number(r.totalPrice) || 0,
        customerId: r.customerId == null ? null : String(r.customerId),
        customerName: r.customerName == null ? null : String(r.customerName),
        customerCode: r.customerCode == null ? null : String(r.customerCode),
        itemId: String(r.itemId),
        productName: r.productName == null ? '' : String(r.productName),
        barcode: r.barcode == null ? '' : String(r.barcode),
        image: r.image == null ? null : String(r.image),
        brand: r.brand == null ? null : String(r.brand),
        itemSellPrice: Number(r.itemSellPrice) || 0,
        itemCreatedAt: toIsoString(r.itemCreatedAt),
    }));
}

/**
 * Hareketleri doğrudan transactions tablosundan, tarihe göre azalan sırada ve
 * sayfalı olarak getirir. getItems()'in aksine tüm stoğu belleğe yüklemez;
 * "son 50 hareket" gibi bir ilk görünüm için çok hızlıdır (date index'i sayesinde).
 */
export async function getTransactionsPaginated(params: {
    limit?: number;
    offset?: number;
    search?: string;
    type?: 'ALL' | 'IN' | 'OUT';
    itemId?: string; // yalnizca bu urunun hareketleri
    startDate?: string; // ISO
    endDate?: string; // ISO
}): Promise<{ rows: MovementRow[]; total: number }> {
    try {
        await ensureTransactionIndexes().catch(() => {});

        const limit = Math.min(Math.max(1, Math.floor(Number(params.limit) || 50)), 1000);
        const offset = Math.min(Math.max(0, Math.floor(Number(params.offset) || 0)), 1_000_000);
        const typeParam = params.type === 'IN' || params.type === 'OUT' ? params.type : 'ALL';
        const itemId = (params.itemId ?? '').trim();
        const startIso = (params.startDate ?? '').trim() || null;
        const endIso = (params.endDate ?? '').trim() || null;
        const q = (params.search ?? '').trim();
        const p = `%${q}%`;

        const countRows = await sql`
            SELECT COUNT(*)::int AS c
            FROM transactions t
            JOIN items i ON i.id = t.item_id
            LEFT JOIN customers c ON c.id = t.customer_id
            WHERE (${typeParam} = 'ALL' OR t.type = ${typeParam})
              AND (${itemId} = '' OR t.item_id = ${itemId})
              AND (${startIso}::timestamptz IS NULL OR t.date >= ${startIso}::timestamptz)
              AND (${endIso}::timestamptz IS NULL OR t.date <= ${endIso}::timestamptz)
              AND (${q} = '' OR (
                  i.name ILIKE ${p} OR COALESCE(i.barcode, '') ILIKE ${p}
                  OR COALESCE(i.brand, '') ILIKE ${p} OR COALESCE(t.channel, '') ILIKE ${p}
                  OR COALESCE(c.name, '') ILIKE ${p} OR COALESCE(c.customer_code, '') ILIKE ${p}
              ))
        `;
        const total = Number((countRows as { c: number }[])[0]?.c) || 0;

        const rows = await sql`
            SELECT
                t.id,
                t.date,
                t.type,
                t.kind,
                t.quantity,
                t.channel,
                t.unit_price AS "unitPrice",
                t.total_price AS "totalPrice",
                t.customer_id AS "customerId",
                c.name AS "customerName",
                c.customer_code AS "customerCode",
                i.id AS "itemId",
                i.name AS "productName",
                i.barcode,
                i.image,
                i.brand,
                i.sell_price AS "itemSellPrice",
                i.created_at AS "itemCreatedAt"
            FROM transactions t
            JOIN items i ON i.id = t.item_id
            LEFT JOIN customers c ON c.id = t.customer_id
            WHERE (${typeParam} = 'ALL' OR t.type = ${typeParam})
              AND (${itemId} = '' OR t.item_id = ${itemId})
              AND (${startIso}::timestamptz IS NULL OR t.date >= ${startIso}::timestamptz)
              AND (${endIso}::timestamptz IS NULL OR t.date <= ${endIso}::timestamptz)
              AND (${q} = '' OR (
                  i.name ILIKE ${p} OR COALESCE(i.barcode, '') ILIKE ${p}
                  OR COALESCE(i.brand, '') ILIKE ${p} OR COALESCE(t.channel, '') ILIKE ${p}
                  OR COALESCE(c.name, '') ILIKE ${p} OR COALESCE(c.customer_code, '') ILIKE ${p}
              ))
            ORDER BY t.date DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        return { rows: mapMovementRows(rows), total };
    } catch (error) {
        console.error('Error fetching transactions (paginated):', error);
        throw error;
    }
}

/** Tek bir hareketi ürün + cari bilgisiyle getirir (hareket detay sayfası için). */
export async function getTransactionById(id: string): Promise<MovementRow | null> {
    try {
        const trimmed = String(id || '').trim();
        if (!trimmed) return null;
        await ensureTransactionIndexes().catch(() => {});
        const rows = await sql`
            SELECT
                t.id,
                t.date,
                t.type,
                t.kind,
                t.quantity,
                t.channel,
                t.unit_price AS "unitPrice",
                t.total_price AS "totalPrice",
                t.customer_id AS "customerId",
                c.name AS "customerName",
                c.customer_code AS "customerCode",
                i.id AS "itemId",
                i.name AS "productName",
                i.barcode,
                i.image,
                i.brand,
                i.sell_price AS "itemSellPrice",
                i.created_at AS "itemCreatedAt"
            FROM transactions t
            JOIN items i ON i.id = t.item_id
            LEFT JOIN customers c ON c.id = t.customer_id
            WHERE t.id = ${trimmed}
            LIMIT 1
        `;
        const mapped = mapMovementRows(rows);
        return mapped[0] ?? null;
    } catch (error) {
        console.error('Error fetching transaction by id:', error);
        throw error;
    }
}

export async function getItemsTotalCount(): Promise<number> {
    try {
        const rows = await sql`SELECT COUNT(*)::int AS c FROM items`;
        const n = (rows as { c: number }[])[0]?.c;
        return Number(n) || 0;
    } catch (error) {
        console.error('Error counting items:', error);
        throw error;
    }
}

export async function getItemBrandAggregates(): Promise<{ brand: string; itemCount: number; totalQty: number }[]> {
    try {
        const rows = await sql`
            SELECT
                brand,
                COUNT(*)::int AS "itemCount",
                COALESCE(SUM(quantity), 0)::int AS "totalQty"
            FROM items
            WHERE brand IS NOT NULL AND BTRIM(brand) <> ''
            GROUP BY brand
            ORDER BY "totalQty" DESC, brand ASC
        `;
        return (rows as { brand: string; itemCount: number; totalQty: number }[]).map((r) => ({
            brand: r.brand,
            itemCount: Number(r.itemCount) || 0,
            totalQty: Number(r.totalQty) || 0,
        }));
    } catch (error) {
        console.error('Error fetching brand aggregates:', error);
        throw error;
    }
}

export async function getItemById(id: string): Promise<StockItem | null> {
    try {
        const trimmed = String(id || '').trim();
        if (!trimmed) return null;
        const rows = await sql`
            ${ITEMS_SELECT_FROM}
            WHERE i.id = ${trimmed}
            LIMIT 1
        `;
        const mapped = mapDbRowsToStockItems(rows);
        return mapped[0] ?? null;
    } catch (error) {
        console.error('Error fetching item:', error);
        throw error;
    }
}

export async function getItemsPaginated(params: {
    limit: number;
    offset?: number;
    search?: string;
    brand?: string;
    sortBy: ItemsListSortKey;
    sortDir: 'asc' | 'desc';
}): Promise<{ items: StockItem[]; total: number }> {
    try {
        const limit = Math.min(Math.max(1, Math.floor(Number(params.limit) || 20)), 100_000);
        const offset = Math.min(Math.max(0, Math.floor(Number(params.offset) || 0)), 100_000);
        const brand = (params.brand ?? '').trim() || undefined;
        const search = (params.search ?? '').trim() || undefined;
        const sortBy = params.sortBy;
        const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';
        const orderKey = `${sortBy}-${sortDir}`;
        const orderSql = ITEMS_ORDER_WHITELIST[orderKey] ?? 'i.name ASC';
        const whereClause = itemsListWhereClause(brand, search);

        const countRows = await sql`
            SELECT COUNT(*)::int AS c FROM items i ${whereClause}
        `;
        const total = Number((countRows as { c: number }[])[0]?.c) || 0;

        const sqlTagged = sql as typeof sql & { unsafe: (fragment: string) => unknown };
        const items = await sql`
            ${ITEMS_SELECT_FROM}
            ${whereClause}
            ORDER BY ${sqlTagged.unsafe(orderSql)}
            LIMIT ${limit} OFFSET ${offset}
        `;

        return { items: mapDbRowsToStockItems(items), total };
    } catch (error) {
        console.error('Error fetching items (paginated):', error);
        throw error;
    }
}

async function ensureItemsSchema() {
    await sql`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_barcode_key;`;
    await sql`DROP INDEX IF EXISTS items_barcode_key;`;
    await sql`ALTER TABLE items ALTER COLUMN barcode DROP NOT NULL;`;
    await sql`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_stock_code_key;`;
    await sql`DROP INDEX IF EXISTS items_stock_code_key;`;
    await sql`DROP INDEX IF EXISTS items_stock_code_unique;`;
}

/** INSERT için undefined geçmemeli (Neon/serileştirme) */
function normalizeItemForDb(item: StockItem) {
    const name = String(item.name ?? '').trim() || 'İsimsiz';
    const barcodeValue = (item.barcode ?? '').trim();
    const stockCodeValue = (item.stockCode ?? '').trim();
    const dbBarcode = barcodeValue.length > 0 ? barcodeValue : null;
    const dbStockCode = stockCodeValue.length > 0 ? stockCodeValue : null;
    const brand = (item.brand ?? '').trim() || null;
    const description = (item.description ?? '').trim() || null;
    const image =
        item.image != null && String(item.image).length > 0 ? String(item.image) : null;
    const buyPrice = Number.isFinite(Number(item.buyPrice)) ? Number(item.buyPrice) : 0;
    const sellPrice = Number.isFinite(Number(item.sellPrice)) ? Number(item.sellPrice) : 0;
    const vatRate = Number.isFinite(Number(item.vatRate)) ? Number(item.vatRate) : 0;
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    return {
        id: item.id,
        name,
        dbBarcode,
        dbStockCode,
        brand,
        description,
        image,
        buyPrice,
        sellPrice,
        vatRate,
        quantity,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        transactions: Array.isArray(item.transactions) ? item.transactions : [],
    };
}

async function ensureCustomerPaymentsSchema() {
    // Backward compatible: older DBs might not have direction column.
    await sql`ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'IN';`;
}

async function ensureCustomersSchema() {
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL NOT NULL DEFAULT 0;`;
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '2000-01-01T00:00:00.000Z';`;
}

async function ensureCompanySettingsSchema() {
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
}

export async function addItem(item: StockItem) {
    try {
        await ensureItemsSchema();
        const row = normalizeItemForDb(item);

        await sql`
      INSERT INTO items (
        id, barcode, stock_code, name, image, description, brand, 
        vat_rate, buy_price, sell_price, quantity, created_at, updated_at
      ) VALUES (
        ${row.id}, ${row.dbBarcode}, ${row.dbStockCode}, ${row.name}, ${row.image}, 
        ${row.description}, ${row.brand}, ${row.vatRate}, ${row.buyPrice}, 
        ${row.sellPrice}, ${row.quantity}, ${row.createdAt}, ${row.updatedAt}
      )
    `;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error adding item:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function updateItem(id: string, updates: Partial<StockItem>) {
    try {
        const updatedAt = new Date().toISOString();

        // Convert keys to snake_case for Postgres if necessary, but here we can just map manually
        await sql`
      UPDATE items 
      SET 
        name = COALESCE(${updates.name}, name),
        brand = COALESCE(${updates.brand}, brand),
        stock_code = COALESCE(${updates.stockCode}, stock_code),
        barcode = COALESCE(${updates.barcode}, barcode),
        buy_price = COALESCE(${updates.buyPrice}, buy_price),
        sell_price = COALESCE(${updates.sellPrice}, sell_price),
        quantity = COALESCE(${updates.quantity}, quantity),
        vat_rate = COALESCE(${updates.vatRate}, vat_rate),
        image = COALESCE(${updates.image}, image),
        updated_at = ${updatedAt}
      WHERE id = ${id}
    `;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error updating item:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function removeItem(id: string) {
    try {
        await sql`DELETE FROM items WHERE id = ${id}`;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error removing item:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function addTransaction(itemId: string, transaction: Transaction) {
    try {
        const unitPrice = Number(transaction.unitPrice) || 0;
        const totalPrice =
            Number(transaction.totalPrice) ||
            (unitPrice > 0 ? unitPrice * (Number(transaction.quantity) || 0) : 0);
        const customerId = (transaction.customerId || '').trim() || null;
        const kind = String(transaction.kind || 'NORMAL');
        const channel = transaction.channel != null ? String(transaction.channel) : null;

        // 1. Add transaction
        await sql`
      INSERT INTO transactions (id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price)
      VALUES (${transaction.id}, ${itemId}, ${customerId}, ${transaction.date}, ${transaction.type}, ${kind}, ${transaction.quantity}, ${channel}, ${unitPrice}, ${totalPrice})
    `;

        // 2. Update item quantity
        const item = await sql`SELECT quantity FROM items WHERE id = ${itemId}`;
        if (item.length > 0) {
            const currentQty = item[0].quantity;
            const newQty = transaction.type === 'IN'
                ? currentQty + transaction.quantity
                : currentQty - transaction.quantity;

            await sql`
        UPDATE items 
        SET quantity = ${newQty}, updated_at = ${new Date().toISOString()}
        WHERE id = ${itemId}
      `;
        }

        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error adding transaction:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function bulkAddItems(items: StockItem[]) {
    try {
        await ensureItemsSchema();
        // Process in batches of 50 to avoid timeout
        const BATCH_SIZE = 50;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);

            // Batch insert items using individual queries (Neon limitation)
            for (const item of batch) {
                const row = normalizeItemForDb(item);

                await sql`
                    INSERT INTO items (
                        id, barcode, stock_code, name, image, description, brand, 
                        vat_rate, buy_price, sell_price, quantity, created_at, updated_at
                    ) VALUES (
                        ${row.id}, ${row.dbBarcode}, ${row.dbStockCode}, ${row.name}, ${row.image}, 
                        ${row.description}, ${row.brand}, ${row.vatRate}, ${row.buyPrice}, 
                        ${row.sellPrice}, ${row.quantity}, ${row.createdAt}, ${row.updatedAt}
                    )
                `;
            }

            // Batch insert transactions
            for (const item of batch) {
                const row = normalizeItemForDb(item);
                if (row.transactions.length > 0) {
                    for (const t of row.transactions) {
                        try {
                            const unitPrice = Number(t.unitPrice) || 0;
                            const totalPrice =
                                Number(t.totalPrice) ||
                                (unitPrice > 0 ? unitPrice * (Number(t.quantity) || 0) : 0);
                            const customerId = String(t.customerId || '').trim() || null;
                            const kind = String(t.kind || 'NORMAL');
                            const channel = t.channel != null ? String(t.channel) : null;
                            await sql`
                                INSERT INTO transactions (id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price)
                                VALUES (${t.id ?? crypto.randomUUID()}, ${row.id}, ${customerId}, ${t.date}, ${t.type}, ${kind}, ${t.quantity}, ${channel}, ${unitPrice}, ${totalPrice})
                            `;
                        } catch {
                            // Skip if transaction already exists
                            console.log('Transaction already exists, skipping:', t.id);
                        }
                    }
                }
            }
        }

        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error bulk adding items:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function bulkRemoveItems(ids: string[]) {
    try {
        await sql`DELETE FROM items WHERE id = ANY(${ids})`;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error bulk removing items:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function removeTransactions(transactionIds: string[]) {
    try {
        const transactions = await sql`
            SELECT id, item_id, customer_id, type, quantity 
            FROM transactions 
            WHERE id = ANY(${transactionIds})
        `;

        if (transactions.length === 0) return { success: true };

        const adjustments: Record<string, number> = {};
        for (const t of transactions) {
            const itemId = t.item_id as string;
            const qty = Number(t.quantity);
            const change = t.type === 'IN' ? -qty : qty;
            adjustments[itemId] = (adjustments[itemId] || 0) + change;
        }

        type TxRow = { customer_id: string | null };
        const txRows = transactions as unknown as TxRow[];
        const customerIds = Array.from(
            new Set(txRows.map((t) => t.customer_id).filter((v): v is string => typeof v === 'string' && v.length > 0))
        );

        for (const [itemId, change] of Object.entries(adjustments)) {
            await sql`
                UPDATE items 
                SET quantity = quantity + ${change}, 
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${itemId}
            `;
        }
        await sql`DELETE FROM transactions WHERE id = ANY(${transactionIds})`;

        revalidatePath('/urunler');
        revalidatePath('/hareketler');
        revalidatePath('/cari');
        for (const cid of customerIds) revalidatePath(`/cari/${cid}`);
        return { success: true };
    } catch (error) {
        console.error('Error removing transactions:', error);
        return { success: false, error };
    }
}

export async function updateCustomer(customerId: string, payload: { customerCode?: string; name?: string; openingBalance?: number }) {
    try {
        await ensureCustomersSchema();
        const id = (customerId || '').trim();
        if (!id) return { success: false, error: 'customerId is required' };

        const name = (payload.name ?? '').trim();
        if (!name) return { success: false, error: 'name is required' };

        const codeRaw = (payload.customerCode ?? '').trim();
        const code = codeRaw.length > 0 ? codeRaw : null;
        const openingBalanceInput = payload.openingBalance;
        const openingBalance = openingBalanceInput === undefined ? null : Number(openingBalanceInput);
        if (openingBalance !== null && !Number.isFinite(openingBalance)) {
            return { success: false, error: 'openingBalance must be numeric' };
        }
        const shouldResetOpeningBalanceDate = openingBalance !== null;

        await sql`
            UPDATE customers
            SET customer_code = ${code},
                name = ${name},
                opening_balance = COALESCE(${openingBalance}, opening_balance),
                opening_balance_date = CASE
                    WHEN ${shouldResetOpeningBalanceDate} THEN '2000-01-01T00:00:00.000Z'::timestamptz
                    ELSE opening_balance_date
                END
            WHERE id = ${id};
        `;

        revalidatePath('/cari');
        revalidatePath(`/cari/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Error updating customer:', error);
        return { success: false, error };
    }
}

export async function removeCustomer(customerId: string) {
    try {
        const id = (customerId || '').trim();
        if (!id) return { success: false, error: 'customerId is required' };

        // Keep stock history: detach transactions from customer, but keep transactions.
        // Payments will be cascaded (customer_payments.customer_id ON DELETE CASCADE).
        await sql`UPDATE transactions SET customer_id = NULL WHERE customer_id = ${id};`;
        await sql`DELETE FROM customers WHERE id = ${id};`;

        revalidatePath('/cari');
        revalidatePath('/hareketler');
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error removing customer:', error);
        return { success: false, error };
    }
}

export async function updateTransaction(
    transactionId: string,
    updates: {
        date?: string;
        quantity?: number;
        channel?: string | null;
        unitPrice?: number | string;
        totalPrice?: number | string;
        customerId?: string | null;
    }
) {
    try {
        const id = (transactionId || '').trim();
        if (!id) return { success: false, error: 'transactionId is required' };

        const rows = await sql`
            SELECT id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price
            FROM transactions
            WHERE id = ${id}
            LIMIT 1;
        `;
        if (!rows?.length) return { success: false, error: 'transaction not found' };

        type TransactionRow = {
            item_id: string;
            customer_id: string | null;
            date: string;
            type: 'IN' | 'OUT';
            kind: string | null;
            quantity: unknown;
            channel: string | null;
            unit_price: unknown;
            total_price: unknown;
        };
        const old = rows[0] as unknown as TransactionRow;
        const itemId = String(old.item_id);
        const type = old.type;
        const oldQty = Number(old.quantity) || 0;
        const oldCustomerId = old.customer_id || null;
        const kind = String(old.kind || 'NORMAL');

        const nextQty = Number(updates.quantity ?? oldQty) || 0;
        if (nextQty <= 0) return { success: false, error: 'quantity must be > 0' };

        const nextDate = (updates.date || old.date) as string;
        const nextChannelRaw = updates.channel === undefined ? (old.channel as string | null) : updates.channel;
        const nextChannel = (nextChannelRaw || '').trim() || null;

        const nextCustomerIdRaw =
            updates.customerId === undefined ? (old.customer_id as string | null) : updates.customerId;
        const nextCustomerId = (String(nextCustomerIdRaw || '').trim() || null) as string | null;

        const unitPriceNum =
            updates.unitPrice === undefined ? Number(old.unit_price) || 0 : Number(updates.unitPrice) || 0;

        const isPriced = type === 'OUT' || (type === 'IN' && kind === 'RETURN');
        const nextTotalPrice =
            updates.totalPrice !== undefined
                ? Number(updates.totalPrice) || 0
                : (isPriced ? unitPriceNum * nextQty : 0);

        // Adjust stock quantity based on delta
        const deltaQty = nextQty - oldQty;
        const stockAdjustment = type === 'IN' ? deltaQty : -deltaQty;

        if (stockAdjustment !== 0) {
            await sql`
                UPDATE items
                SET quantity = quantity + ${stockAdjustment},
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${itemId};
            `;
        }

        await sql`
            UPDATE transactions
            SET customer_id = ${nextCustomerId},
                date = ${nextDate},
                quantity = ${nextQty},
                channel = ${nextChannel},
                unit_price = ${unitPriceNum},
                total_price = ${nextTotalPrice}
            WHERE id = ${id};
        `;

        revalidatePath('/urunler');
        revalidatePath('/hareketler');
        revalidatePath('/cari');
        if (oldCustomerId) revalidatePath(`/cari/${oldCustomerId}`);
        if (nextCustomerId) revalidatePath(`/cari/${nextCustomerId}`);

        return { success: true, kind };
    } catch (error) {
        console.error('Error updating transaction:', error);
        return { success: false, error };
    }
}

export async function updateCustomerPayment(
    paymentId: string,
    updates: {
        date?: string;
        amount?: number;
        method?: PaymentMethod;
        description?: string;
    }
) {
    try {
        await ensureCustomerPaymentsSchema();
        const id = (paymentId || '').trim();
        if (!id) return { success: false, error: 'paymentId is required' };

        const rows = await sql`
            SELECT id, customer_id, date, amount, method, description
            FROM customer_payments
            WHERE id = ${id}
            LIMIT 1;
        `;
        if (!rows?.length) return { success: false, error: 'payment not found' };

        type PaymentRow = {
            customer_id: string;
            date: string;
            amount: unknown;
            method: PaymentMethod;
            description: string | null;
        };
        const old = rows[0] as unknown as PaymentRow;
        const customerId = String(old.customer_id);

        const nextDate = (updates.date || old.date) as string;
        const nextAmount = updates.amount === undefined ? Number(old.amount) || 0 : Number(updates.amount) || 0;
        const nextMethod = (updates.method || old.method) as PaymentMethod;
        const nextDesc = (updates.description ?? old.description ?? '').trim() || null;

        if (nextAmount <= 0) return { success: false, error: 'amount must be > 0' };
        if (!nextMethod) return { success: false, error: 'method is required' };

        await sql`
            UPDATE customer_payments
            SET date = ${nextDate},
                amount = ${nextAmount},
                method = ${nextMethod},
                description = ${nextDesc}
            WHERE id = ${id};
        `;

        revalidatePath('/cari');
        revalidatePath(`/cari/${customerId}`);
        return { success: true, customerId };
    } catch (error) {
        console.error('Error updating customer payment:', error);
        return { success: false, error };
    }
}

export async function removeCustomerPayments(paymentIds: string[]) {
    try {
        await ensureCustomerPaymentsSchema();
        if (!paymentIds?.length) return { success: true };
        const rows = await sql`
            SELECT id, customer_id
            FROM customer_payments
            WHERE id = ANY(${paymentIds});
        `;
        const customerIds = Array.from(
            new Set((rows as unknown as Array<{ customer_id: string }>).map((r) => String(r.customer_id)).filter(Boolean))
        );

        await sql`DELETE FROM customer_payments WHERE id = ANY(${paymentIds});`;

        revalidatePath('/cari');
        for (const cid of customerIds) revalidatePath(`/cari/${cid}`);
        return { success: true };
    } catch (error) {
        console.error('Error removing customer payments:', error);
        return { success: false, error };
    }
}

export async function getCustomers() {
    try {
        await ensureCustomersSchema();
        await ensureCustomerPaymentsSchema();
        const customers = await sql`
            WITH tx AS (
                SELECT
                    customer_id,
                    SUM(
                        CASE
                            -- Satış => Alacak
                            WHEN type = 'OUT' THEN COALESCE(NULLIF(total_price, 0), NULLIF(unit_price, 0) * quantity, 0)
                            -- Satış iadesi (giriş) => Alacağı düşer
                            WHEN type = 'IN' AND kind = 'RETURN' THEN -COALESCE(NULLIF(total_price, 0), NULLIF(unit_price, 0) * quantity, 0)
                            ELSE 0
                        END
                    ) AS credit_total,
                    SUM(
                        CASE
                            -- Alış/Stok giriş => Borç
                            WHEN type = 'IN' AND COALESCE(kind, 'NORMAL') <> 'RETURN'
                                THEN COALESCE(NULLIF(total_price, 0), NULLIF(unit_price, 0) * quantity, 0)
                            ELSE 0
                        END
                    ) AS debt_total
                FROM transactions
                WHERE customer_id IS NOT NULL
                GROUP BY customer_id
            ),
            money AS (
                SELECT
                    customer_id,
                    SUM(CASE WHEN COALESCE(direction, 'IN') = 'IN' THEN amount ELSE 0 END) AS collection_total,
                    SUM(CASE WHEN COALESCE(direction, 'IN') = 'OUT' THEN amount ELSE 0 END) AS payment_total
                FROM customer_payments
                GROUP BY customer_id
            )
            SELECT
                c.id,
                c.customer_code as "customerCode",
                c.name,
                c.created_at as "createdAt",
                COALESCE(c.opening_balance, 0) as "openingBalance",
                c.opening_balance_date as "openingBalanceDate",
                (
                    COALESCE(t.credit_total, 0)
                    + CASE WHEN COALESCE(c.opening_balance, 0) > 0 THEN COALESCE(c.opening_balance, 0) ELSE 0 END
                ) as "creditTotal",
                (
                    COALESCE(t.debt_total, 0)
                    + CASE WHEN COALESCE(c.opening_balance, 0) < 0 THEN ABS(COALESCE(c.opening_balance, 0)) ELSE 0 END
                ) as "debtTotal",
                COALESCE(m.collection_total, 0) as "collectionTotal",
                COALESCE(m.payment_total, 0) as "paymentTotal",
                (
                    COALESCE(t.credit_total, 0)
                    + CASE WHEN COALESCE(c.opening_balance, 0) > 0 THEN COALESCE(c.opening_balance, 0) ELSE 0 END
                    - COALESCE(m.collection_total, 0)
                ) as "creditBalance",
                (
                    COALESCE(t.debt_total, 0)
                    + CASE WHEN COALESCE(c.opening_balance, 0) < 0 THEN ABS(COALESCE(c.opening_balance, 0)) ELSE 0 END
                    - COALESCE(m.payment_total, 0)
                ) as "debtBalance"
            FROM customers c
            LEFT JOIN tx t ON t.customer_id = c.id
            LEFT JOIN money m ON m.customer_id = c.id
            ORDER BY
                CASE
                    WHEN NULLIF(c.customer_code, '') IS NULL THEN 2
                    WHEN c.customer_code ~ '^[0-9]+$' THEN 0
                    ELSE 1
                END ASC,
                CASE
                    WHEN c.customer_code ~ '^[0-9]+$' THEN c.customer_code::numeric
                    ELSE NULL
                END ASC,
                LOWER(COALESCE(c.customer_code, '')) ASC,
                LOWER(c.name) ASC;
        `;

        const rows = customers as unknown as Array<
            Customer & {
                creditTotal: unknown;
                debtTotal: unknown;
                collectionTotal: unknown;
                paymentTotal: unknown;
                creditBalance: unknown;
                debtBalance: unknown;
                openingBalance: unknown;
                openingBalanceDate: string | null;
            }
        >;
        return rows.map((c) => ({
            ...c,
            creditTotal: Number(c.creditTotal) || 0,
            debtTotal: Number(c.debtTotal) || 0,
            collectionTotal: Number(c.collectionTotal) || 0,
            paymentTotal: Number(c.paymentTotal) || 0,
            creditBalance: Number(c.creditBalance) || 0,
            debtBalance: Number(c.debtBalance) || 0,
            openingBalance: Number(c.openingBalance) || 0,
            openingBalanceDate: c.openingBalanceDate || OPENING_BALANCE_DEFAULT_DATE,
        })) as unknown as Customer[];
    } catch (error) {
        console.error('Error fetching customers:', error);
        return [];
    }
}

export async function getCustomerById(customerId: string) {
    try {
        const id = (customerId || '').trim();
        if (!id) return { success: false, error: 'customerId is required', customer: null as Customer | null };
        const customers = await getCustomers();
        const customer = customers.find((c) => c.id === id) || null;
        if (!customer) return { success: false, error: 'customer not found', customer: null as Customer | null };
        return { success: true, customer };
    } catch (error) {
        console.error('Error fetching customer by id:', error);
        return { success: false, error, customer: null as Customer | null };
    }
}

export async function getCompanySettings() {
    try {
        await ensureCompanySettingsSchema();
        const rows = await sql`
            SELECT
                id,
                company_name as "companyName",
                trade_name as "tradeName",
                address,
                phone,
                email,
                logo,
                monthly_interest_rate as "stockInterestMonthlyRate",
                updated_at as "updatedAt"
            FROM company_settings
            WHERE id = 'default'
            LIMIT 1;
        `;
        if (!rows?.length) {
            return { success: true, settings: { ...DEFAULT_COMPANY_SETTINGS } };
        }
        const row = rows[0] as unknown as {
            companyName: string | null;
            tradeName: string | null;
            address: string | null;
            phone: string | null;
            email: string | null;
            logo: string | null;
            stockInterestMonthlyRate: unknown;
            updatedAt: string | null;
        };
        const settings: CompanySettings = {
            companyName: row.companyName || '',
            tradeName: row.tradeName || '',
            address: row.address || '',
            phone: row.phone || '',
            email: row.email || '',
            logo: row.logo || '',
            stockInterestMonthlyRate: Number(row.stockInterestMonthlyRate) || 0,
            updatedAt: row.updatedAt || undefined,
        };
        return { success: true, settings };
    } catch (error) {
        console.error('Error fetching company settings:', error);
        return { success: false, error, settings: { ...DEFAULT_COMPANY_SETTINGS } };
    }
}

export async function upsertCompanySettings(payload: CompanySettings) {
    try {
        await ensureCompanySettingsSchema();
        const companyName = (payload.companyName || '').trim();
        const tradeName = (payload.tradeName || '').trim();
        const address = (payload.address || '').trim();
        const phone = (payload.phone || '').trim();
        const email = (payload.email || '').trim();
        const logo = (payload.logo || '').trim() || null;
        const stockInterestMonthlyRate = Number(payload.stockInterestMonthlyRate) || 0;

        await sql`
            INSERT INTO company_settings (id, company_name, trade_name, address, phone, email, logo, monthly_interest_rate, updated_at)
            VALUES ('default', ${companyName}, ${tradeName}, ${address}, ${phone}, ${email}, ${logo}, ${stockInterestMonthlyRate}, ${new Date().toISOString()})
            ON CONFLICT (id) DO UPDATE SET
                company_name = EXCLUDED.company_name,
                trade_name = EXCLUDED.trade_name,
                address = EXCLUDED.address,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                logo = EXCLUDED.logo,
                monthly_interest_rate = EXCLUDED.monthly_interest_rate,
                updated_at = EXCLUDED.updated_at;
        `;

        revalidatePath('/ayarlar');
        revalidatePath('/cari');
        revalidatePath('/raporlar');
        revalidatePath('/raporlar/stok-maliyeti');
        return { success: true };
    } catch (error) {
        console.error('Error updating company settings:', error);
        return { success: false, error };
    }
}

export async function addCustomer(payload: { customerCode?: string; name: string; openingBalance?: number; openingBalanceDate?: string }) {
    try {
        await ensureCustomersSchema();
        const name = (payload.name || '').trim();
        if (!name) return { success: false, error: 'Name is required' };

        let code = (payload.customerCode || '').trim();
        if (!code) {
            const rows = await sql`
                SELECT MAX(CASE WHEN customer_code ~ '^[0-9]+$' THEN customer_code::int END) as max_code
                FROM customers;
            `;
            const maxCode = Number(rows?.[0]?.max_code) || 0;
            code = String(maxCode + 1);
        }

        const openingBalanceRaw = Number(payload.openingBalance ?? 0);
        const openingBalance = Number.isFinite(openingBalanceRaw) ? openingBalanceRaw : 0;
        const openingBalanceDateRaw = (payload.openingBalanceDate || '').trim();
        const parsedOpeningDate = openingBalanceDateRaw ? new Date(openingBalanceDateRaw) : null;
        const openingBalanceDate =
            parsedOpeningDate && !Number.isNaN(parsedOpeningDate.getTime())
                ? parsedOpeningDate.toISOString()
                : OPENING_BALANCE_DEFAULT_DATE;

        const id = crypto.randomUUID();
        await sql`
            INSERT INTO customers (id, customer_code, name, opening_balance, opening_balance_date)
            VALUES (${id}, ${code}, ${name}, ${openingBalance}, ${openingBalanceDate});
        `;
        revalidatePath('/cari');
        return { success: true, id };
    } catch (error) {
        console.error('Error adding customer:', error);
        return { success: false, error };
    }
}

export async function getCustomerMovements(customerId: string) {
    try {
        await ensureCustomersSchema();
        await ensureCustomerPaymentsSchema();
        const rows = await sql`
            (
                SELECT 
                    'TX' as kind,
                    t.id,
                    t.date,
                    t.type,
                    t.kind as "txKind",
                    t.quantity,
                    t.channel,
                    t.unit_price as "unitPrice",
                    t.total_price as "totalPrice",
                    NULL::text as direction,
                    NULL::text as method,
                    NULL::text as description,
                    i.id as "itemId",
                    i.name as "itemName",
                    i.barcode as "barcode",
                    i.stock_code as "stockCode",
                    i.image as "image",
                    i.brand as "brand"
                FROM transactions t
                JOIN items i ON i.id = t.item_id
                WHERE t.customer_id = ${customerId} AND t.type IN ('OUT', 'IN')
            )
            UNION ALL
            (
                SELECT
                    'PAYMENT' as kind,
                    p.id,
                    p.date,
                    'PAYMENT' as type,
                    NULL::text as "txKind",
                    0 as quantity,
                    NULL::text as channel,
                    0 as "unitPrice",
                    p.amount as "totalPrice",
                    COALESCE(p.direction, 'IN') as direction,
                    p.method as method,
                    p.description as description,
                    NULL::text as "itemId",
                    NULL::text as "itemName",
                    NULL::text as "barcode",
                    NULL::text as "stockCode",
                    NULL::text as "image",
                    NULL::text as "brand"
                FROM customer_payments p
                WHERE p.customer_id = ${customerId}
            )
            UNION ALL
            (
                SELECT
                    'OPENING' as kind,
                    ('opening-' || c.id) as id,
                    COALESCE(c.opening_balance_date, '2000-01-01T00:00:00.000Z'::timestamptz) as date,
                    'OPENING' as type,
                    NULL::text as "txKind",
                    0 as quantity,
                    NULL::text as channel,
                    0 as "unitPrice",
                    ABS(COALESCE(c.opening_balance, 0)) as "totalPrice",
                    CASE WHEN COALESCE(c.opening_balance, 0) >= 0 THEN 'IN' ELSE 'OUT' END as direction,
                    'Açılış Bakiyesi' as method,
                    NULL::text as description,
                    NULL::text as "itemId",
                    NULL::text as "itemName",
                    NULL::text as "barcode",
                    NULL::text as "stockCode",
                    NULL::text as "image",
                    NULL::text as "brand"
                FROM customers c
                WHERE c.id = ${customerId}
                  AND COALESCE(c.opening_balance, 0) <> 0
            )
            ORDER BY date DESC;
        `;
        return { success: true, rows };
    } catch (error) {
        console.error('Error fetching customer movements:', error);
        return { success: false, error, rows: [] as unknown[] };
    }
}

export async function addCustomerPayment(payload: {
    customerId: string;
    date: string;
    amount: number;
    direction?: 'IN' | 'OUT';
    method: PaymentMethod;
    description?: string;
}) {
    try {
        await ensureCustomerPaymentsSchema();
        const customerId = (payload.customerId || '').trim();
        const amount = Number(payload.amount) || 0;
        const direction = (payload.direction || 'IN') as 'IN' | 'OUT';
        const method = payload.method;
        const date = payload.date || new Date().toISOString();
        const description = (payload.description || '').trim() || null;

        if (!customerId) return { success: false, error: 'customerId is required' };
        if (amount <= 0) return { success: false, error: 'amount must be > 0' };
        if (!method) return { success: false, error: 'method is required' };

        const id = crypto.randomUUID();
        await sql`
            INSERT INTO customer_payments (id, customer_id, date, amount, direction, method, description)
            VALUES (${id}, ${customerId}, ${date}, ${amount}, ${direction}, ${method}, ${description});
        `;
        revalidatePath('/cari');
        revalidatePath(`/cari/${customerId}`);
        return { success: true, id };
    } catch (error) {
        console.error('Error adding customer payment:', error);
        return { success: false, error };
    }
}

function parseMenuRoutes(raw: unknown): MenuRouteKey[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
        return raw.filter((x): x is MenuRouteKey => typeof x === 'string' && ALL_MENU_KEYS.includes(x as MenuRouteKey));
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw) as unknown;
            return parseMenuRoutes(p);
        } catch {
            return [];
        }
    }
    return [];
}

async function ensureMembersTable() {
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
}

export async function getNeedsFirstSetup(): Promise<{ needsFirstSetup: boolean }> {
    try {
        await ensureMembersTable();
        const cnt = await sql`SELECT COUNT(*)::int AS c FROM members`;
        const n = Number((cnt[0] as { c: number }).c) || 0;
        return { needsFirstSetup: n === 0 };
    } catch (error) {
        console.error('getNeedsFirstSetup:', error);
        return { needsFirstSetup: false };
    }
}

export async function completeFirstSetup(payload: {
    companyName: string;
    firstName: string;
    lastName: string;
    username: string;
    password: string;
}) {
    try {
        await ensureMembersTable();
        const cnt = await sql`SELECT COUNT(*)::int AS c FROM members`;
        if (Number((cnt[0] as { c: number }).c) > 0) {
            return { success: false as const, error: 'already_setup' as const };
        }
        const companyName = (payload.companyName || '').trim();
        const firstName = (payload.firstName || '').trim();
        const lastName = (payload.lastName || '').trim();
        const username = (payload.username || '').trim();
        const password = payload.password || '';
        if (!companyName || !firstName || !lastName || !username) {
            return { success: false as const, error: 'invalid' as const };
        }
        if (password.length < 4) return { success: false as const, error: 'password' as const };

        const settingsRes = await upsertCompanySettings({
            ...DEFAULT_COMPANY_SETTINGS,
            companyName,
        });
        if (!settingsRes.success) return { success: false as const, error: 'settings' as const };

        const id = crypto.randomUUID();
        const pwHash = hashPassword(password);
        const routesJson = JSON.stringify(ALL_MENU_KEYS);
        await sql`
            INSERT INTO members (id, username, password_hash, first_name, last_name, company_name, menu_routes, sales_perakende, sales_toptan)
            VALUES (
                ${id},
                ${username},
                ${pwHash},
                ${firstName},
                ${lastName},
                ${companyName},
                ${routesJson}::jsonb,
                true,
                true
            );
        `;
        const user: User = {
            id,
            username,
            firstName,
            lastName,
            companyName,
            menuRoutes: [...ALL_MENU_KEYS],
            salesPerakende: true,
            salesToptan: true,
        };
        revalidatePath('/ayarlar');
        revalidatePath('/login');
        return { success: true as const, user };
    } catch (error) {
        console.error('completeFirstSetup:', error);
        return { success: false as const, error: 'server' as const };
    }
}

function rowToUser(
    row: {
        id: string;
        username: string;
        first_name: string | null;
        last_name: string | null;
        menu_routes: unknown;
        sales_perakende: boolean | null;
        sales_toptan: boolean | null;
    },
    companyName: string
): User {
    const parsed = parseMenuRoutes(row.menu_routes);
    const menuRoutes = parsed.length > 0 ? parsed : ALL_MENU_KEYS;
    return {
        id: row.id,
        username: row.username,
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        companyName: companyName || 'Şirket',
        menuRoutes,
        salesPerakende: row.sales_perakende !== false,
        salesToptan: row.sales_toptan !== false,
    };
}

export async function loginWithUsername(username: string, password: string) {
    try {
        await ensureMembersTable();
        const u = (username || '').trim();
        if (!u || !password) return { success: false as const, error: 'missing' };
        const rows = await sql`
            SELECT
                id,
                username,
                password_hash,
                first_name,
                last_name,
                company_name,
                menu_routes,
                sales_perakende,
                sales_toptan
            FROM members
            WHERE lower(username) = lower(${u})
            LIMIT 1
        `;
        if (!rows.length) return { success: false as const, error: 'invalid' };
        const row = rows[0] as {
            id: string;
            username: string;
            password_hash: string;
            first_name: string | null;
            last_name: string | null;
            company_name: string | null;
            menu_routes: unknown;
            sales_perakende: boolean | null;
            sales_toptan: boolean | null;
        };
        if (!verifyPassword(password, row.password_hash)) return { success: false as const, error: 'invalid' };
        const settingsRes = await getCompanySettings();
        const fromSettings =
            settingsRes.success && settingsRes.settings?.companyName
                ? settingsRes.settings.companyName.trim()
                : '';
        const companyName = fromSettings || (row.company_name || '').trim() || 'SPEEDSPOR';
        const user = rowToUser(row, companyName);
        return { success: true as const, user };
    } catch (error) {
        console.error('loginWithUsername:', error);
        return { success: false as const, error: 'server' };
    }
}

export async function listMembers(): Promise<{ success: boolean; members: MemberPublic[]; error?: unknown }> {
    try {
        await ensureMembersTable();
        const rows = await sql`
            SELECT id, username, first_name, last_name, menu_routes, sales_perakende, sales_toptan
            FROM members
            ORDER BY lower(username)
        `;
        const members: MemberPublic[] = (rows as unknown as Array<Record<string, unknown>>).map((r) => {
            const parsed = parseMenuRoutes(r.menu_routes);
            return {
                id: String(r.id),
                username: String(r.username),
                firstName: String(r.first_name ?? ''),
                lastName: String(r.last_name ?? ''),
                menuRoutes: parsed.length > 0 ? parsed : ALL_MENU_KEYS,
                salesPerakende: r.sales_perakende !== false,
                salesToptan: r.sales_toptan !== false,
            };
        });
        return { success: true, members };
    } catch (error) {
        console.error('listMembers:', error);
        return { success: false, members: [], error };
    }
}

export async function createMember(payload: {
    firstName: string;
    lastName: string;
    username: string;
    password: string;
    menuRoutes: MenuRouteKey[];
    salesPerakende: boolean;
    salesToptan: boolean;
}) {
    try {
        await ensureMembersTable();
        const firstName = (payload.firstName || '').trim();
        const lastName = (payload.lastName || '').trim();
        const username = (payload.username || '').trim();
        const password = payload.password || '';
        let salesPerakende = Boolean(payload.salesPerakende);
        let salesToptan = Boolean(payload.salesToptan);
        if (!salesPerakende && !salesToptan) {
            salesPerakende = true;
        }
        const menuRoutes = (payload.menuRoutes || []).filter((k) => ALL_MENU_KEYS.includes(k));
        if (!firstName || !lastName) return { success: false as const, error: 'name' };
        if (!username) return { success: false as const, error: 'username' };
        if (password.length < 4) return { success: false as const, error: 'password' };
        if (menuRoutes.length === 0) return { success: false as const, error: 'menus' };

        const dup = await sql`SELECT 1 FROM members WHERE lower(username) = lower(${username}) LIMIT 1`;
        if (dup.length) return { success: false as const, error: 'duplicate' };

        const settingsRes = await getCompanySettings();
        const companyName =
            settingsRes.success && settingsRes.settings?.companyName
                ? settingsRes.settings.companyName.trim()
                : '';

        const id = crypto.randomUUID();
        const pwHash = hashPassword(password);
        const routesJson = JSON.stringify(menuRoutes);
        await sql`
            INSERT INTO members (id, username, password_hash, first_name, last_name, company_name, menu_routes, sales_perakende, sales_toptan)
            VALUES (
                ${id},
                ${username},
                ${pwHash},
                ${firstName},
                ${lastName},
                ${companyName},
                ${routesJson}::jsonb,
                ${salesPerakende},
                ${salesToptan}
            );
        `;
        revalidatePath('/ayarlar');
        return { success: true as const, id };
    } catch (error) {
        console.error('createMember:', error);
        return { success: false as const, error };
    }
}

export async function deleteMember(memberId: string, currentUserId?: string) {
    try {
        await ensureMembersTable();
        const id = (memberId || '').trim();
        if (!id) return { success: false as const, error: 'id' };
        if (currentUserId && id === currentUserId) return { success: false as const, error: 'self' };
        const cnt = await sql`SELECT COUNT(*)::int AS c FROM members`;
        if (Number((cnt[0] as { c: number }).c) <= 1) return { success: false as const, error: 'last' };
        await sql`DELETE FROM members WHERE id = ${id}`;
        revalidatePath('/ayarlar');
        return { success: true as const };
    } catch (error) {
        console.error('deleteMember:', error);
        return { success: false as const, error };
    }
}

export async function updateMemberPassword(memberId: string, newPassword: string) {
    try {
        await ensureMembersTable();
        const id = (memberId || '').trim();
        const pw = newPassword || '';
        if (!id) return { success: false as const, error: 'id' };
        if (pw.length < 4) return { success: false as const, error: 'weak' };
        const pwHash = hashPassword(pw);
        await sql`UPDATE members SET password_hash = ${pwHash} WHERE id = ${id}`;
        revalidatePath('/ayarlar');
        return { success: true as const };
    } catch (error) {
        console.error('updateMemberPassword:', error);
        return { success: false as const, error };
    }
}
