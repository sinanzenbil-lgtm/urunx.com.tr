'use server';

import { sql } from './db';
import { StockItem, Transaction } from '@/types';
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
                        'quantity', t.quantity,
                        'channel', t.channel
                    ) ORDER BY t.date DESC)
                    FROM transactions t
                    WHERE t.item_id = i.id),
                    '[]'
                ) as transactions
            FROM items i
            ORDER BY i.updated_at DESC
        `;

        // Ensure numeric fields are numbers (sometimes DECIMAL comes as string)
        const formattedItems = items.map(item => ({
            ...item,
            buyPrice: Number(item.buyPrice) || 0,
            sellPrice: Number(item.sellPrice) || 0,
            vatRate: Number(item.vatRate) || 0,
            quantity: Number(item.quantity) || 0
        }));

        return formattedItems as unknown as StockItem[];
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
}

export async function addItem(item: StockItem) {
    try {
        await sql`
      INSERT INTO items (
        id, barcode, stock_code, name, image, description, brand, 
        vat_rate, buy_price, sell_price, quantity, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.barcode}, ${item.stockCode}, ${item.name}, ${item.image}, 
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
        // 1. Add transaction
        await sql`
      INSERT INTO transactions (id, item_id, date, type, quantity, channel)
      VALUES (${transaction.id}, ${itemId}, ${transaction.date}, ${transaction.type}, ${transaction.quantity}, ${transaction.channel})
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
        for (const item of items) {
            await sql`
                INSERT INTO items (
                    id, barcode, stock_code, name, image, description, brand, 
                    vat_rate, buy_price, sell_price, quantity, created_at, updated_at
                ) VALUES (
                    ${item.id}, ${item.barcode}, ${item.stockCode}, ${item.name}, ${item.image}, 
                    ${item.description}, ${item.brand}, ${item.vatRate}, ${item.buyPrice}, 
                    ${item.sellPrice}, ${item.quantity}, ${item.createdAt}, ${item.updatedAt}
                ) ON CONFLICT (barcode) DO UPDATE SET
                    name = EXCLUDED.name,
                    brand = EXCLUDED.brand,
                    stock_code = EXCLUDED.stock_code,
                    buy_price = EXCLUDED.buy_price,
                    sell_price = EXCLUDED.sell_price,
                    quantity = EXCLUDED.quantity,
                    updated_at = EXCLUDED.updated_at
            `;
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
            SELECT id, item_id, type, quantity 
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
        return { success: true };
    } catch (error) {
        console.error('Error removing transactions:', error);
        return { success: false, error };
    }
}
