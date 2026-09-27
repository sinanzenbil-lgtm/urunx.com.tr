'use server';

import { revalidatePath } from 'next/cache';
import { sql } from './db';
import { v4 as uuidv4 } from 'uuid';
import type { Quote, QuoteItem, QuoteSettings, QuoteStatus } from '@/types';
import { DEFAULT_QUOTE_SETTINGS, QUOTE_STATUS_OPTIONS } from '@/types';

/** Server Action yanıtı JSON olmalı; Postgres Error nesnesi dönmek 500 üretebilir */
function safeActionError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

const VALID_STATUSES = new Set<QuoteStatus>(QUOTE_STATUS_OPTIONS.map((o) => o.key));

function round2(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function toIso(v: unknown): string {
    if (!v) return new Date().toISOString();
    if (v instanceof Date) return v.toISOString();
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function toIsoOrNull(v: unknown): string | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function ensureQuotesSchema() {
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
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_address TEXT;`;
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_phone TEXT;`;
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
}

type QuoteRow = {
    id: string;
    quoteNo: string;
    customerId: string | null;
    customerName: string | null;
    customerCode: string | null;
    customerAddress: string | null;
    customerPhone: string | null;
    date: unknown;
    validUntil: unknown;
    note: string | null;
    status: string | null;
    subtotal: unknown;
    vatTotal: unknown;
    grandTotal: unknown;
    itemCount?: unknown;
    createdAt: unknown;
    updatedAt: unknown;
};

type QuoteItemRow = {
    id: string;
    quoteId: string;
    itemId: string | null;
    name: string;
    stockCode: string | null;
    barcode: string | null;
    brand: string | null;
    image: string | null;
    buyPrice: unknown;
    unitPrice: unknown;
    quantity: unknown;
    vatRate: unknown;
    lineSubtotal: unknown;
    lineVat: unknown;
    lineTotal: unknown;
    sortOrder: unknown;
};

function mapQuoteRow(row: QuoteRow): Quote {
    const status = (row.status || 'HAZIRLANDI') as QuoteStatus;
    return {
        id: row.id,
        quoteNo: row.quoteNo,
        customerId: row.customerId,
        customerName: row.customerName || '',
        customerCode: row.customerCode,
        customerAddress: row.customerAddress,
        customerPhone: row.customerPhone,
        date: toIso(row.date),
        validUntil: toIsoOrNull(row.validUntil),
        note: row.note,
        status: VALID_STATUSES.has(status) ? status : 'HAZIRLANDI',
        subtotal: Number(row.subtotal) || 0,
        vatTotal: Number(row.vatTotal) || 0,
        grandTotal: Number(row.grandTotal) || 0,
        itemCount: row.itemCount != null ? Number(row.itemCount) || 0 : undefined,
        createdAt: toIsoOrNull(row.createdAt) || undefined,
        updatedAt: toIsoOrNull(row.updatedAt) || undefined,
    };
}

function mapQuoteItemRow(row: QuoteItemRow): QuoteItem {
    return {
        id: row.id,
        quoteId: row.quoteId,
        itemId: row.itemId,
        name: row.name,
        stockCode: row.stockCode,
        barcode: row.barcode,
        brand: row.brand,
        image: row.image,
        buyPrice: Number(row.buyPrice) || 0,
        unitPrice: Number(row.unitPrice) || 0,
        quantity: Number(row.quantity) || 0,
        vatRate: Number(row.vatRate) || 0,
        lineSubtotal: Number(row.lineSubtotal) || 0,
        lineVat: Number(row.lineVat) || 0,
        lineTotal: Number(row.lineTotal) || 0,
        sortOrder: Number(row.sortOrder) || 0,
    };
}

const QUOTE_SELECT = sql`
    SELECT
        q.id,
        q.quote_no AS "quoteNo",
        q.customer_id AS "customerId",
        q.customer_name AS "customerName",
        q.customer_code AS "customerCode",
        q.customer_address AS "customerAddress",
        q.customer_phone AS "customerPhone",
        q.date,
        q.valid_until AS "validUntil",
        q.note,
        q.status,
        q.subtotal,
        q.vat_total AS "vatTotal",
        q.grand_total AS "grandTotal",
        q.created_at AS "createdAt",
        q.updated_at AS "updatedAt",
        (SELECT COUNT(*)::int FROM quote_items qi WHERE qi.quote_id = q.id) AS "itemCount"
    FROM quotes q
`;

/** Teklif listesi (en yeni önce) */
export async function getQuotes(): Promise<Quote[]> {
    try {
        await ensureQuotesSchema();
        const rows = await sql`
            ${QUOTE_SELECT}
            ORDER BY q.date DESC, q.created_at DESC
        `;
        return (rows as QuoteRow[]).map(mapQuoteRow);
    } catch (error) {
        console.error('Error fetching quotes:', error);
        return [];
    }
}

/** Tek teklif + satırları (görsel ürün tablosundan güncel okunur) */
export async function getQuoteById(quoteId: string): Promise<{ success: boolean; quote: Quote | null; error?: string }> {
    try {
        const id = String(quoteId || '').trim();
        if (!id) return { success: false, quote: null, error: 'quoteId is required' };
        await ensureQuotesSchema();

        const rows = await sql`
            ${QUOTE_SELECT}
            WHERE q.id = ${id}
            LIMIT 1
        `;
        const head = (rows as QuoteRow[])[0];
        if (!head) return { success: false, quote: null, error: 'quote not found' };

        const itemRows = await sql`
            SELECT
                qi.id,
                qi.quote_id AS "quoteId",
                qi.item_id AS "itemId",
                qi.name,
                qi.stock_code AS "stockCode",
                qi.barcode,
                qi.brand,
                i.image,
                qi.buy_price AS "buyPrice",
                qi.unit_price AS "unitPrice",
                qi.quantity,
                qi.vat_rate AS "vatRate",
                qi.line_subtotal AS "lineSubtotal",
                qi.line_vat AS "lineVat",
                qi.line_total AS "lineTotal",
                qi.sort_order AS "sortOrder"
            FROM quote_items qi
            LEFT JOIN items i ON i.id = qi.item_id
            WHERE qi.quote_id = ${id}
            ORDER BY qi.sort_order ASC, qi.id ASC
        `;

        const quote = mapQuoteRow(head);
        quote.items = (itemRows as QuoteItemRow[]).map(mapQuoteItemRow);
        return { success: true, quote };
    } catch (error) {
        console.error('Error fetching quote:', error);
        return { success: false, quote: null, error: safeActionError(error) };
    }
}

/** Yıl bazlı sıralı teklif numarası: TKL-2026-0001 */
async function nextQuoteNo(year: number): Promise<string> {
    const prefix = `TKL-${year}-`;
    const rows = await sql`
        SELECT quote_no AS "quoteNo"
        FROM quotes
        WHERE quote_no LIKE ${prefix + '%'}
        ORDER BY quote_no DESC
        LIMIT 1
    `;
    const last = (rows as { quoteNo: string }[])[0]?.quoteNo || '';
    const lastSeq = Number(last.slice(prefix.length)) || 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
}

export type CreateQuoteLineInput = {
    itemId?: string | null;
    name: string;
    stockCode?: string | null;
    barcode?: string | null;
    brand?: string | null;
    buyPrice: number;
    unitPrice: number;
    quantity: number;
    vatRate: number;
};

export type CreateQuoteInput = {
    customerId?: string | null;
    customerName: string;
    customerCode?: string | null;
    customerAddress?: string | null;
    customerPhone?: string | null;
    date: string; // ISO veya YYYY-MM-DD
    validUntil?: string | null;
    note?: string | null;
    lines: CreateQuoteLineInput[];
};

export async function createQuote(payload: CreateQuoteInput): Promise<{ success: boolean; quoteId?: string; quoteNo?: string; error?: string }> {
    try {
        await ensureQuotesSchema();

        const customerName = String(payload.customerName || '').trim();
        if (!customerName) return { success: false, error: 'Cari seçilmeli' };

        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        if (lines.length === 0) return { success: false, error: 'En az bir ürün satırı ekleyin' };

        const dateObj = new Date(payload.date || Date.now());
        const date = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
        const validUntil = toIsoOrNull(payload.validUntil);
        const note = String(payload.note || '').trim() || null;
        const customerId = String(payload.customerId || '').trim() || null;
        const customerCode = String(payload.customerCode || '').trim() || null;
        const customerAddress = String(payload.customerAddress || '').trim() || null;
        const customerPhone = String(payload.customerPhone || '').trim() || null;

        const normalized = lines.map((l, index) => {
            const quantity = Math.max(1, Math.floor(Number(l.quantity) || 0));
            const unitPrice = round2(Math.max(0, Number(l.unitPrice) || 0));
            const vatRate = Math.max(0, Number(l.vatRate) || 0);
            const buyPrice = round2(Math.max(0, Number(l.buyPrice) || 0));
            const lineSubtotal = round2(unitPrice * quantity);
            const lineVat = round2((lineSubtotal * vatRate) / 100);
            const lineTotal = round2(lineSubtotal + lineVat);
            return {
                id: uuidv4(),
                itemId: String(l.itemId || '').trim() || null,
                name: String(l.name || '').trim() || 'İsimsiz',
                stockCode: String(l.stockCode || '').trim() || null,
                barcode: String(l.barcode || '').trim() || null,
                brand: String(l.brand || '').trim() || null,
                buyPrice,
                unitPrice,
                quantity,
                vatRate,
                lineSubtotal,
                lineVat,
                lineTotal,
                sortOrder: index,
            };
        });

        if (normalized.some((l) => l.unitPrice <= 0)) {
            return { success: false, error: 'Her satır için teklif fiyatı girilmeli' };
        }

        const subtotal = round2(normalized.reduce((acc, l) => acc + l.lineSubtotal, 0));
        const vatTotal = round2(normalized.reduce((acc, l) => acc + l.lineVat, 0));
        const grandTotal = round2(subtotal + vatTotal);

        const id = uuidv4();
        const now = new Date().toISOString();

        // Numara çakışmasına karşı birkaç deneme (unique index korur)
        let quoteNo = '';
        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
            quoteNo = await nextQuoteNo(date.getFullYear());
            try {
                await sql`
                    INSERT INTO quotes (
                        id, quote_no, customer_id, customer_name, customer_code, customer_address, customer_phone, date, valid_until, note, status,
                        subtotal, vat_total, grand_total, created_at, updated_at
                    ) VALUES (
                        ${id}, ${quoteNo}, ${customerId}, ${customerName}, ${customerCode}, ${customerAddress}, ${customerPhone}, ${date.toISOString()}, ${validUntil}, ${note}, 'HAZIRLANDI',
                        ${subtotal}, ${vatTotal}, ${grandTotal}, ${now}, ${now}
                    )
                `;
                inserted = true;
            } catch (err) {
                const msg = safeActionError(err);
                if (!/duplicate key|unique/i.test(msg) || attempt === 4) throw err;
            }
        }

        try {
            for (const l of normalized) {
                await sql`
                INSERT INTO quote_items (
                    id, quote_id, item_id, name, stock_code, barcode, brand,
                    buy_price, unit_price, quantity, vat_rate, line_subtotal, line_vat, line_total, sort_order
                ) VALUES (
                    ${l.id}, ${id}, ${l.itemId}, ${l.name}, ${l.stockCode}, ${l.barcode}, ${l.brand},
                    ${l.buyPrice}, ${l.unitPrice}, ${l.quantity}, ${l.vatRate}, ${l.lineSubtotal}, ${l.lineVat}, ${l.lineTotal}, ${l.sortOrder}
                )
            `;
            }
        } catch (err) {
            // Satırlar yazılamazsa yarım teklif bırakma
            await sql`DELETE FROM quote_items WHERE quote_id = ${id}`;
            await sql`DELETE FROM quotes WHERE id = ${id}`;
            throw err;
        }

        revalidatePath('/teklif');
        return { success: true, quoteId: id, quoteNo };
    } catch (error) {
        console.error('Error creating quote:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<{ success: boolean; error?: string }> {
    try {
        const id = String(quoteId || '').trim();
        if (!id) return { success: false, error: 'quoteId is required' };
        if (!VALID_STATUSES.has(status)) return { success: false, error: 'Geçersiz durum' };
        await ensureQuotesSchema();
        await sql`
            UPDATE quotes
            SET status = ${status}, updated_at = ${new Date().toISOString()}
            WHERE id = ${id}
        `;
        revalidatePath('/teklif');
        return { success: true };
    } catch (error) {
        console.error('Error updating quote status:', error);
        return { success: false, error: safeActionError(error) };
    }
}

export async function removeQuote(quoteId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const id = String(quoteId || '').trim();
        if (!id) return { success: false, error: 'quoteId is required' };
        await ensureQuotesSchema();
        await sql`DELETE FROM quote_items WHERE quote_id = ${id}`;
        await sql`DELETE FROM quotes WHERE id = ${id}`;
        revalidatePath('/teklif');
        return { success: true };
    } catch (error) {
        console.error('Error removing quote:', error);
        return { success: false, error: safeActionError(error) };
    }
}

/* ---------------- Teklif formu ayarları ---------------- */

async function ensureQuoteSettingsSchema() {
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
}

export async function getQuoteSettings(): Promise<{ success: boolean; settings: QuoteSettings; error?: string }> {
    try {
        await ensureQuoteSettingsSchema();
        const rows = await sql`
            SELECT subtitle, title, validity_days AS "validityDays", default_note AS "defaultNote", terms, updated_at AS "updatedAt"
            FROM quote_settings WHERE id = 'default' LIMIT 1
        `;
        const row = (rows as Partial<QuoteSettings>[])[0];
        if (!row) return { success: true, settings: { ...DEFAULT_QUOTE_SETTINGS } };
        return {
            success: true,
            settings: {
                subtitle: String(row.subtitle ?? ''),
                title: String(row.title ?? ''),
                validityDays: Math.max(0, Number(row.validityDays) || 0),
                defaultNote: String(row.defaultNote ?? ''),
                terms: String(row.terms ?? ''),
                updatedAt: toIsoOrNull(row.updatedAt) || undefined,
            },
        };
    } catch (error) {
        console.error('Error fetching quote settings:', error);
        return { success: false, settings: { ...DEFAULT_QUOTE_SETTINGS }, error: safeActionError(error) };
    }
}

export async function upsertQuoteSettings(payload: QuoteSettings): Promise<{ success: boolean; error?: string }> {
    try {
        await ensureQuoteSettingsSchema();
        const subtitle = String(payload.subtitle ?? '').trim();
        const title = String(payload.title ?? '').trim();
        const validityDays = Math.max(0, Math.floor(Number(payload.validityDays) || 0));
        const defaultNote = String(payload.defaultNote ?? '').trim();
        const terms = String(payload.terms ?? '').trim();
        const now = new Date().toISOString();
        await sql`
            INSERT INTO quote_settings (id, subtitle, title, validity_days, default_note, terms, updated_at)
            VALUES ('default', ${subtitle}, ${title}, ${validityDays}, ${defaultNote}, ${terms}, ${now})
            ON CONFLICT (id) DO UPDATE SET
                subtitle = EXCLUDED.subtitle,
                title = EXCLUDED.title,
                validity_days = EXCLUDED.validity_days,
                default_note = EXCLUDED.default_note,
                terms = EXCLUDED.terms,
                updated_at = EXCLUDED.updated_at;
        `;
        revalidatePath('/teklif');
        return { success: true };
    } catch (error) {
        console.error('Error saving quote settings:', error);
        return { success: false, error: safeActionError(error) };
    }
}
