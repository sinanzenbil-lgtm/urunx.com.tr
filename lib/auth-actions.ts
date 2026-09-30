'use server';

import { clearSession, getSession } from './session';

/** İstemcinin oturum çerezinin hâlâ geçerli olup olmadığını öğrenmesi için (herkese açık) */
export async function getSessionStatus(): Promise<{ authenticated: boolean; userId?: string }> {
    const s = await getSession();
    return s ? { authenticated: true, userId: s.userId } : { authenticated: false };
}

export async function logoutSession(): Promise<{ success: true }> {
    await clearSession();
    return { success: true };
}
