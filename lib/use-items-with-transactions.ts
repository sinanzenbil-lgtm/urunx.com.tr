'use client';

import { useEffect, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { getItems } from '@/lib/actions';

/**
 * Hareket verisine ihtiyaç duyan sayfalar (raporlar) için: genel senkronizasyon
 * hareketleri yüklemez; bu hook gerekirse tam listeyi bir kez çeker.
 */
export function useItemsWithTransactions() {
    const items = useStockStore((s) => s.items);
    const ready = useStockStore((s) => s.itemsHaveTransactions);
    const setItems = useStockStore((s) => s.setItems);
    const [loading, setLoading] = useState(!ready);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ready) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const full = await getItems();
                if (cancelled) return;
                setItems(full ?? [], true);
                setError(null);
            } catch (e) {
                if (cancelled) return;
                console.error('Hareketli ürün listesi yüklenemedi:', e);
                setError('Hareket verisi yüklenemedi');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [ready, setItems]);

    return { items, loading, error, ready };
}
