'use server';

import { sql } from './db';
import { Customer, PaymentMethod, StockItem, Transaction } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getItems() {
    try {
        const items = await sql`
            SELECT 
                id, 
                barcode, 
                stock_code as "stockCode", 
                name, 
                image, 
                description, 
                brand, 
                vat_rate as "vatRate", 
                buy_price as "buyPrice", 
                sell_price as "sellPrice", 
                quantity, 
                created_at as "createdAt", 
                updated_at as "updatedAt",
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
            ORDER BY i.updated_at DESC
        `;

        // Ensure numeric fields are numbers (sometimes DECIMAL comes as string)
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

        const formattedItems = (items as unknown as DbItemRow[]).map((item) => {
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
    } catch (error) {
        console.error('Error fetching items:', error);
        // DB-only mode expects fresh data from DB; don't silently fall back to empty.
        // Let the caller decide how to handle (e.g. show "DB connection error").
        throw error;
    }
}

async function ensureItemsSchema() {
    await sql`ALTER TABLE items DROP CONSTRAINT IF EXISTS items_barcode_key;`;
    await sql`DROP INDEX IF EXISTS items_barcode_key;`;
    await sql`ALTER TABLE items ALTER COLUMN barcode DROP NOT NULL;`;
}

export async function addItem(item: StockItem) {
    try {
        await ensureItemsSchema();
        const barcodeValue = (item.barcode ?? '').trim();
        const stockCodeValue = (item.stockCode ?? '').trim();
        const dbBarcode = barcodeValue.length > 0 ? barcodeValue : null;
        const dbStockCode = stockCodeValue.length > 0 ? stockCodeValue : null;

        await sql`
      INSERT INTO items (
        id, barcode, stock_code, name, image, description, brand, 
        vat_rate, buy_price, sell_price, quantity, created_at, updated_at
      ) VALUES (
        ${item.id}, ${dbBarcode}, ${dbStockCode}, ${item.name}, ${item.image}, 
        ${item.description}, ${item.brand}, ${item.vatRate}, ${item.buyPrice}, 
        ${item.sellPrice}, ${item.quantity}, ${item.createdAt}, ${item.updatedAt}
      )
    `;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error adding item:', error);
        return { success: false, error };
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
        return { success: false, error };
    }
}

export async function removeItem(id: string) {
    try {
        await sql`DELETE FROM items WHERE id = ${id}`;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error removing item:', error);
        return { success: false, error };
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

        // 1. Add transaction
        await sql`
      INSERT INTO transactions (id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price)
      VALUES (${transaction.id}, ${itemId}, ${customerId}, ${transaction.date}, ${transaction.type}, ${kind}, ${transaction.quantity}, ${transaction.channel}, ${unitPrice}, ${totalPrice})
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
        return { success: false, error };
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
                const barcodeValue = (item.barcode ?? '').trim();
                const stockCodeValue = (item.stockCode ?? '').trim();
                const dbBarcode = barcodeValue.length > 0 ? barcodeValue : null;
                const dbStockCode = stockCodeValue.length > 0 ? stockCodeValue : null;

                await sql`
                    INSERT INTO items (
                        id, barcode, stock_code, name, image, description, brand, 
                        vat_rate, buy_price, sell_price, quantity, created_at, updated_at
                    ) VALUES (
                        ${item.id}, ${dbBarcode}, ${dbStockCode}, ${item.name}, ${item.image}, 
                        ${item.description}, ${item.brand}, ${item.vatRate}, ${item.buyPrice}, 
                        ${item.sellPrice}, ${item.quantity}, ${item.createdAt}, ${item.updatedAt}
                    )
                `;
            }

            // Batch insert transactions
            for (const item of batch) {
                if (item.transactions && item.transactions.length > 0) {
                    for (const t of item.transactions) {
                        try {
                            const unitPrice = Number(t.unitPrice) || 0;
                            const totalPrice =
                                Number(t.totalPrice) ||
                                (unitPrice > 0 ? unitPrice * (Number(t.quantity) || 0) : 0);
                            const customerId = String(t.customerId || '').trim() || null;
                            const kind = String(t.kind || 'NORMAL');
                            await sql`
                                INSERT INTO transactions (id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price)
                                VALUES (${t.id ?? crypto.randomUUID()}, ${item.id}, ${customerId}, ${t.date}, ${t.type}, ${kind}, ${t.quantity}, ${t.channel}, ${unitPrice}, ${totalPrice})
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
        return { success: false, error };
    }
}

export async function bulkRemoveItems(ids: string[]) {
    try {
        await sql`DELETE FROM items WHERE id = ANY(${ids})`;
        revalidatePath('/urunler');
        return { success: true };
    } catch (error) {
        console.error('Error bulk removing items:', error);
        return { success: false, error };
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

export async function updateCustomer(customerId: string, payload: { customerCode?: string; name?: string }) {
    try {
        const id = (customerId || '').trim();
        if (!id) return { success: false, error: 'customerId is required' };

        const name = (payload.name ?? '').trim();
        if (!name) return { success: false, error: 'name is required' };

        const codeRaw = (payload.customerCode ?? '').trim();
        const code = codeRaw.length > 0 ? codeRaw : null;

        await sql`
            UPDATE customers
            SET customer_code = ${code},
                name = ${name}
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
        const customers = await sql`
            WITH sales AS (
                SELECT
                    customer_id,
                    SUM(
                        CASE
                            WHEN type = 'OUT' THEN COALESCE(NULLIF(total_price, 0), NULLIF(unit_price, 0) * quantity, 0)
                            WHEN type = 'IN' AND kind = 'RETURN' THEN -COALESCE(NULLIF(total_price, 0), NULLIF(unit_price, 0) * quantity, 0)
                            ELSE 0
                        END
                    ) AS sales_total
                FROM transactions
                WHERE customer_id IS NOT NULL
                GROUP BY customer_id
            ),
            payments AS (
                SELECT customer_id, SUM(amount) AS payment_total
                FROM customer_payments
                GROUP BY customer_id
            )
            SELECT
                c.id,
                c.customer_code as "customerCode",
                c.name,
                c.created_at as "createdAt",
                COALESCE(s.sales_total, 0) as "salesTotal",
                COALESCE(p.payment_total, 0) as "paymentTotal",
                (COALESCE(s.sales_total, 0) - COALESCE(p.payment_total, 0)) as "balance"
            FROM customers c
            LEFT JOIN sales s ON s.customer_id = c.id
            LEFT JOIN payments p ON p.customer_id = c.id
            ORDER BY COALESCE(NULLIF(c.customer_code, ''), c.name) ASC;
        `;

        const rows = customers as unknown as Array<{ salesTotal: unknown; paymentTotal: unknown; balance: unknown } & Customer>;
        return rows.map((c) => ({
            ...c,
            salesTotal: Number(c.salesTotal) || 0,
            paymentTotal: Number(c.paymentTotal) || 0,
            balance: Number(c.balance) || 0,
        })) as unknown as Customer[];
    } catch (error) {
        console.error('Error fetching customers:', error);
        return [];
    }
}

export async function addCustomer(payload: { customerCode?: string; name: string }) {
    try {
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

        const id = crypto.randomUUID();
        await sql`
            INSERT INTO customers (id, customer_code, name)
            VALUES (${id}, ${code}, ${name});
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
    method: PaymentMethod;
    description?: string;
}) {
    try {
        const customerId = (payload.customerId || '').trim();
        const amount = Number(payload.amount) || 0;
        const method = payload.method;
        const date = payload.date || new Date().toISOString();
        const description = (payload.description || '').trim() || null;

        if (!customerId) return { success: false, error: 'customerId is required' };
        if (amount <= 0) return { success: false, error: 'amount must be > 0' };
        if (!method) return { success: false, error: 'method is required' };

        const id = crypto.randomUUID();
        await sql`
            INSERT INTO customer_payments (id, customer_id, date, amount, method, description)
            VALUES (${id}, ${customerId}, ${date}, ${amount}, ${method}, ${description});
        `;
        revalidatePath('/cari');
        revalidatePath(`/cari/${customerId}`);
        return { success: true, id };
    } catch (error) {
        console.error('Error adding customer payment:', error);
        return { success: false, error };
    }
}
