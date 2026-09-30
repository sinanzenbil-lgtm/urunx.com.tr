import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Sunucu tarafı oturum: HMAC-SHA256 ile imzalı, HttpOnly çerez.
 * Veritabanına tablo eklemez; imza anahtarı AUTH_SECRET ortam değişkeninden gelir.
 * AUTH_SECRET tanımlı değilse DATABASE_URL'den türetilir (Vercel'de kurulum gerektirmez);
 * yine de üretimde ayrı bir AUTH_SECRET tanımlanması önerilir.
 */

export const SESSION_COOKIE = 'urunx_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 gün

export type SessionPayload = {
    userId: string;
    username: string;
    exp: number; // unix saniye
};

function secretKey(): Buffer {
    const explicit = (process.env.AUTH_SECRET || '').trim();
    if (explicit) return createHash('sha256').update(explicit).digest();
    const derived = (process.env.DATABASE_URL || '').trim();
    if (derived) return createHash('sha256').update(`urunx-session:${derived}`).digest();
    // Geliştirme ortamı (DB yok): sabit ama işaretli anahtar
    return createHash('sha256').update('urunx-dev-only-secret').digest();
}

function sign(data: string): string {
    return createHmac('sha256', secretKey()).update(data).digest('base64url');
}

export function encodeSession(payload: SessionPayload): string {
    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${data}.${sign(data)}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
    if (!token) return null;
    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const data = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const expected = sign(data);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Partial<SessionPayload>;
        if (!payload || typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
        if (payload.exp * 1000 < Date.now()) return null;
        return { userId: payload.userId, username: String(payload.username || ''), exp: payload.exp };
    } catch {
        return null;
    }
}

export async function createSession(user: { id: string; username: string }): Promise<void> {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const token = encodeSession({ userId: user.id, username: user.username, exp });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
    });
}

export async function clearSession(): Promise<void> {
    const store = await cookies();
    store.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
    const store = await cookies();
    return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export class UnauthorizedError extends Error {
    constructor() {
        super('unauthorized');
        this.name = 'UnauthorizedError';
    }
}

/** Oturum yoksa hata fırlatır; her korumalı sunucu aksiyonunun başında çağrılır. */
export async function requireSession(): Promise<SessionPayload> {
    const session = await getSession();
    if (!session) throw new UnauthorizedError();
    return session;
}
