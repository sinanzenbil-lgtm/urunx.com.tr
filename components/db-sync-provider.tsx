'use client';

import { useEffect } from 'react';
import { useStockStore } from '@/lib/store';
import { getItems, bulkAddItems } from '@/lib/actions';
import { toast } from 'sonner';

export default function dbSyncProvider({ children }: { children: React.ReactNode }) {
    const setItems = useStockStore((state: any) => state.setItems);

    const localItems = useStockStore((state: any) => state.items);

    useEffect(() => {
        const sync = async () => {
            const dbItems = await getItems();

            if (dbItems && dbItems.length > 0) {
                // Cloud has data, overwrite local with cloud (Priority: Cloud)
                setItems(dbItems);
            } else if (localItems.length > 0) {
                // Cloud is empty but local has data, offer to push
                // For now, let's just push automatically for the first migration
                toast.promise(bulkAddItems(localItems), {
                    loading: 'Yerel veriler buluta yükleniyor...',
                    success: 'Tüm verileriniz başarıyla buluta taşındı ve eşitlendi!',
                    error: 'Bulut eşitleme hatası.'
                });
            }
        };
        sync();
    }, [setItems, localItems.length]); // only run on mount or if local length changes while empty db

    return <>{children}</>;
}
