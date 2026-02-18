'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { getItems } from '@/lib/actions';

export default function DbSyncProvider({ children }: { children: React.ReactNode }) {
    const setItems = useStockStore((state) => state.setItems);
    const setDbSyncStatus = useStockStore((state) => state.setDbSyncStatus);
    const pathname = usePathname();

    useEffect(() => {
        // Auth pages don't need stock data; avoid unnecessary DB calls.
        if (pathname === '/login' || pathname === '/register') return;

        let cancelled = false;

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        const sync = async () => {
            // DB-only: always trust DB and never push/persist local items.
            setDbSyncStatus('syncing');

            // Production can have occasional transient failures (cold starts, network hiccups,
            // pooler saturation). Retry a few times before showing an error.
            const MAX_ATTEMPTS = 3;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    const dbItems = await getItems();
                    if (cancelled) return;
                    setItems(dbItems ?? []);
                    setDbSyncStatus('synced');
                    return;
                } catch (e) {
                    if (cancelled) return;
                    console.error(`DB sync error (attempt ${attempt}/${MAX_ATTEMPTS}):`, e);
                    if (attempt < MAX_ATTEMPTS) {
                        const baseDelay = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms
                        const jitter = Math.floor(Math.random() * 250);
                        await sleep(baseDelay + jitter);
                        continue;
                    }
                    setDbSyncStatus('error');
                }
            }
        };

        sync();
        return () => {
            cancelled = true;
        };
    }, [setItems, setDbSyncStatus, pathname]); // run on route changes (skip auth pages)

    return <>{children}</>;
}
