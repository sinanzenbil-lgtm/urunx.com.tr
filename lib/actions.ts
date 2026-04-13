'use server';

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { CompanySettings, Customer, PaymentMethod, StockItem, Transaction, User } from '@/types';
import { revalidatePath } from 'next/cache';

const OPENING_BALANCE_DEFAULT_DATE = '2000-01-01T00:00:00.000Z';
const AUTH_PASSWORD_MIN_LENGTH = 4;
const AUTH_PASSWORD_KEYLEN = 64;
const DEFAULT_COMPANY_NAME = 'SPEEDSPOR';
const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
    companyName: '',
    tradeName: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    stockInterestMonthlyRate: 0,
};

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

async function ensureAuthUsersSchema() {
    await sql`
        CREATE TABLE IF NOT EXISTS auth_users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            company_name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password_salt TEXT NOT NULL DEFAULT '';`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';`;
    await sql`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_key ON auth_users (LOWER(email));`;
}

function normalizeEmail(email: string) {
    return (email || '').trim().toLocaleLowerCase('tr-TR');
}

function createPasswordDigest(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, AUTH_PASSWORD_KEYLEN).toString('hex');
    return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
    const nextHash = Buffer.from(scryptSync(password, salt, AUTH_PASSWORD_KEYLEN).toString('hex'), 'hex');
    const savedHash = Buffer.from(expectedHash || '', 'hex');
    if (nextHash.length !== savedHash.length) return false;
    return timingSafeEqual(nextHash, savedHash);
}

type AuthUserRow = {
    id: string;
    email: string;
    companyName: string | null;
    passwordHash: string;
    passwordSalt: string;
    role: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

async function getAuthUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    const rows = await sql`
        SELECT
            id,
            email,
            company_name as "companyName",
            password_hash as "passwordHash",
            password_salt as "passwordSalt",
            role,
            created_at as "createdAt",
            updated_at as "updatedAt"
        FROM auth_users
        WHERE LOWER(email) = LOWER(${normalizedEmail})
        LIMIT 1;
    `;

    return ((rows as unknown as AuthUserRow[])?.[0] ?? null);
}

async function getAuthUserCount() {
    const rows = await sql`SELECT COUNT(*)::int as count FROM auth_users;`;
    return Number(rows?.[0]?.count) || 0;
}

async function getDefaultCompanyIdentity() {
    await ensureCompanySettingsSchema();
    const rows = await sql`
        SELECT company_name as "companyName", email
        FROM company_settings
        WHERE id = 'default'
        LIMIT 1;
    `;

    const row = rows?.[0] as { companyName?: string | null; email?: string | null } | undefined;
    return {
        companyName: (row?.companyName || '').trim(),
        email: normalizeEmail(row?.email || ''),
    };
}

async function syncCompanyIdentity(payload: { companyName?: string; email?: string }) {
    await ensureCompanySettingsSchema();
    const companyName = (payload.companyName || '').trim();
    const email = normalizeEmail(payload.email || '');

    if (!companyName && !email) return;

    await sql`
        INSERT INTO company_settings (id, company_name, email, updated_at)
        VALUES ('default', ${companyName}, ${email}, ${new Date().toISOString()})
        ON CONFLICT (id) DO UPDATE SET
            company_name = CASE
                WHEN COALESCE(company_settings.company_name, '') = '' AND ${companyName} <> '' THEN EXCLUDED.company_name
                ELSE company_settings.company_name
            END,
            email = CASE
                WHEN COALESCE(company_settings.email, '') = '' AND ${email} <> '' THEN EXCLUDED.email
                ELSE company_settings.email
            END,
            updated_at = company_settings.updated_at;
    `;
}

function toPublicUser(row: Pick<AuthUserRow, 'email' | 'companyName'>, fallbackCompanyName: string): User {
    return {
        email: normalizeEmail(row.email),
        companyName: (fallbackCompanyName || '').trim() || (row.companyName || '').trim() || DEFAULT_COMPANY_NAME,
    };
}

export async function authenticateUser(payload: { email: string; password: string }) {
    try {
        await ensureAuthUsersSchema();

        const email = normalizeEmail(payload.email);
        const password = String(payload.password || '');

        if (!email || !password) {
            return { success: false, error: 'E-posta ve şifre zorunludur.' };
        }

        let userRow = await getAuthUserByEmail(email);

        if (!userRow) {
            const userCount = await getAuthUserCount();
            if (userCount !== 0) {
                return { success: false, error: 'E-posta veya şifre hatalı.' };
            }

            const companyIdentity = await getDefaultCompanyIdentity();
            const companyName = companyIdentity.companyName || DEFAULT_COMPANY_NAME;
            const passwordDigest = createPasswordDigest(password);

            await sql`
                INSERT INTO auth_users (id, email, company_name, password_hash, password_salt, role, updated_at)
                VALUES (${crypto.randomUUID()}, ${email}, ${companyName}, ${passwordDigest.hash}, ${passwordDigest.salt}, 'admin', ${new Date().toISOString()});
            `;
            await syncCompanyIdentity({ companyName, email });
            userRow = await getAuthUserByEmail(email);
        }

        if (!userRow || !verifyPassword(password, userRow.passwordSalt, userRow.passwordHash)) {
            return { success: false, error: 'E-posta veya şifre hatalı.' };
        }

        const companyIdentity = await getDefaultCompanyIdentity();
        return {
            success: true,
            user: toPublicUser(userRow, companyIdentity.companyName || DEFAULT_COMPANY_NAME),
        };
    } catch (error) {
        console.error('Error authenticating user:', error);
        return { success: false, error: 'Giriş yapılırken bir hata oluştu.' };
    }
}

export async function registerUser(payload: { email: string; password: string; companyName?: string }) {
    try {
        await ensureAuthUsersSchema();

        const email = normalizeEmail(payload.email);
        const password = String(payload.password || '');
        const requestedCompanyName = (payload.companyName || '').trim();

        if (!email || !password || !requestedCompanyName) {
            return { success: false, error: 'Şirket adı, e-posta ve şifre zorunludur.' };
        }

        if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
            return { success: false, error: `Şifre en az ${AUTH_PASSWORD_MIN_LENGTH} karakter olmalı.` };
        }

        const existingUser = await getAuthUserByEmail(email);
        if (existingUser) {
            return { success: false, error: 'Bu e-posta zaten kayıtlı.' };
        }

        const passwordDigest = createPasswordDigest(password);
        await sql`
            INSERT INTO auth_users (id, email, company_name, password_hash, password_salt, role, updated_at)
            VALUES (${crypto.randomUUID()}, ${email}, ${requestedCompanyName}, ${passwordDigest.hash}, ${passwordDigest.salt}, 'admin', ${new Date().toISOString()});
        `;

        await syncCompanyIdentity({ companyName: requestedCompanyName, email });

        revalidatePath('/login');
        revalidatePath('/register');

        return {
            success: true,
            user: {
                email,
                companyName: requestedCompanyName,
            } satisfies User,
        };
    } catch (error) {
        console.error('Error registering user:', error);
        return { success: false, error: 'Kayıt oluşturulurken bir hata oluştu.' };
    }
}

export async function updateUserPassword(payload: { email: string; newPassword: string; companyName?: string }) {
    try {
        await ensureAuthUsersSchema();

        const email = normalizeEmail(payload.email);
        const newPassword = String(payload.newPassword || '');
        const requestedCompanyName = (payload.companyName || '').trim();

        if (!email) {
            return { success: false, error: 'Kullanıcı e-postası bulunamadı.' };
        }

        if (newPassword.length < AUTH_PASSWORD_MIN_LENGTH) {
            return { success: false, error: `Şifre en az ${AUTH_PASSWORD_MIN_LENGTH} karakter olmalı.` };
        }

        const existingUser = await getAuthUserByEmail(email);
        const fallbackIdentity = await getDefaultCompanyIdentity();
        const companyName = requestedCompanyName || existingUser?.companyName || fallbackIdentity.companyName || DEFAULT_COMPANY_NAME;
        const passwordDigest = createPasswordDigest(newPassword);

        if (existingUser) {
            await sql`
                UPDATE auth_users
                SET
                    company_name = ${companyName},
                    password_hash = ${passwordDigest.hash},
                    password_salt = ${passwordDigest.salt},
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${existingUser.id};
            `;
        } else {
            await sql`
                INSERT INTO auth_users (id, email, company_name, password_hash, password_salt, role, updated_at)
                VALUES (${crypto.randomUUID()}, ${email}, ${companyName}, ${passwordDigest.hash}, ${passwordDigest.salt}, 'admin', ${new Date().toISOString()});
            `;
        }

        await syncCompanyIdentity({ companyName, email });
        revalidatePath('/ayarlar');

        return {
            success: true,
            user: {
                email,
                companyName,
            } satisfies User,
        };
    } catch (error) {
        console.error('Error updating user password:', error);
        return { success: false, error: 'Şifre güncellenirken bir hata oluştu.' };
    }
}

export async function updateUserEmail(payload: { currentEmail: string; newEmail: string; companyName?: string }) {
    try {
        await ensureAuthUsersSchema();

        const currentEmail = normalizeEmail(payload.currentEmail);
        const newEmail = normalizeEmail(payload.newEmail);
        const companyName = (payload.companyName || '').trim();

        if (!newEmail) {
            return { success: false, error: 'Geçerli bir e-posta girin.' };
        }

        if (currentEmail === newEmail) {
            return {
                success: true,
                user: {
                    email: newEmail,
                    companyName: companyName || DEFAULT_COMPANY_NAME,
                } satisfies User,
            };
        }

        const duplicateUser = await getAuthUserByEmail(newEmail);
        if (duplicateUser) {
            return { success: false, error: 'Bu e-posta başka bir hesapta kullanılıyor.' };
        }

        const existingUser = await getAuthUserByEmail(currentEmail);
        const fallbackIdentity = await getDefaultCompanyIdentity();
        const nextCompanyName = companyName || existingUser?.companyName || fallbackIdentity.companyName || DEFAULT_COMPANY_NAME;

        if (existingUser) {
            await sql`
                UPDATE auth_users
                SET
                    email = ${newEmail},
                    company_name = ${nextCompanyName},
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${existingUser.id};
            `;
        }

        await syncCompanyIdentity({ companyName: nextCompanyName, email: newEmail });
        revalidatePath('/ayarlar');

        return {
            success: true,
            user: {
                email: newEmail,
                companyName: nextCompanyName,
            } satisfies User,
        };
    } catch (error) {
        console.error('Error updating user email:', error);
        return { success: false, error: 'E-posta güncellenirken bir hata oluştu.' };
    }
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
