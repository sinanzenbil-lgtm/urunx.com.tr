'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, ArrowDownCircle, ArrowUpCircle, Trash2, Package, Pencil, Loader2, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as dbActions from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Customer, StockItem, Transaction } from '@/types';

type FlatTransaction = Transaction & {
    productName: string;
    barcode: string;
    image?: string;
    brand?: string;
    itemId: string;
    itemSellPrice: number;
    itemCreatedAt: string;
};

// Sayfa başına yüklenecek hareket sayısı. İlk açılışta "son 50 hareket" hemen gelir,
// devamı "Daha fazla göster" ile sunucudan sayfalı çekilir.
const PAGE_SIZE = 50;

const currency = (value: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

function MovementsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    // Urun listesindeki "Urun Hareketleri" diyalogundan gelinen parametreler:
    // ?item=<urunId> -> yalnizca o urunun hareketleri, ?highlight=<hareketId> -> o kayda kaydir/vurgula
    const itemParam = searchParams.get('item') || '';
    const highlightParam = searchParams.get('highlight') || '';

    const [rows, setRows] = useState<FlatTransaction[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [flashId, setFlashId] = useState<string | null>(null);
    const processedHighlightRef = useRef<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
    const [deleteOneId, setDeleteOneId] = useState<string | null>(null);

    const [editOpen, setEditOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<FlatTransaction | null>(null);
    const [editDate, setEditDate] = useState('');
    const [editQty, setEditQty] = useState('1');
    const [editChannel, setEditChannel] = useState<string>('');
    const [editUnitPrice, setEditUnitPrice] = useState<string>('');
    const [editCustomerId, setEditCustomerId] = useState<string>('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);

    const [transactionsItem, setTransactionsItem] = useState<StockItem | null>(null);
    const [itemDialogOpen, setItemDialogOpen] = useState(false);
    const [loadingItem, setLoadingItem] = useState(false);

    const toLocalInput = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const isOpeningTx = (t: FlatTransaction) => {
        if (t.kind === 'OPENING') return true;
        // Backward compatibility: old Excel imports were saved as normal IN + Pazaryeri
        // at item creation time. Show those as "Devir Bakiye" too.
        const createdAtTs = new Date(t.itemCreatedAt).getTime();
        const txTs = new Date(t.date).getTime();
        const nearCreation = Number.isFinite(createdAtTs) && Number.isFinite(txTs) && Math.abs(createdAtTs - txTs) <= 60_000;
        return t.type === 'IN' && (t.kind === 'NORMAL' || !t.kind) && (t.channel || '') === 'Pazaryeri' && !t.customerId && nearCreation;
    };

    const isOpeningItemTx = (item: StockItem, t: Transaction) => {
        if (t.kind === 'OPENING') return true;
        const createdAtTs = new Date(item.createdAt).getTime();
        const txTs = new Date(t.date).getTime();
        const nearCreation = Number.isFinite(createdAtTs) && Number.isFinite(txTs) && Math.abs(createdAtTs - txTs) <= 60_000;
        return t.type === 'IN' && (t.kind === 'NORMAL' || !t.kind) && (t.channel || '') === 'Pazaryeri' && !t.customerId && nearCreation;
    };

    // Arama girişini biraz geciktir (her tuşta sunucuya gitmemek için)
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => clearTimeout(id);
    }, [searchQuery]);

    // Tek bir ürüne filtreliyken (ürün hareketleri diyalogundan gelince) hedef hareketin
    // yüklü olması için tek seferde daha çok kayıt çekeriz; bir ürünün hareket sayısı
    // neredeyse her zaman bunun altındadır.
    const pageSize = itemParam ? 500 : PAGE_SIZE;

    const buildParams = useCallback(
        (offset: number) => {
            // Yerel gün sınırlarını ISO'ya çevirip sunucuya gönderiyoruz.
            const startIso = dateRange.start ? new Date(`${dateRange.start}T00:00:00`).toISOString() : undefined;
            const endIso = dateRange.end ? new Date(`${dateRange.end}T23:59:59.999`).toISOString() : undefined;
            return {
                limit: pageSize,
                offset,
                search: debouncedSearch || undefined,
                type: typeFilter,
                itemId: itemParam || undefined,
                startDate: startIso,
                endDate: endIso,
            };
        },
        [dateRange.start, dateRange.end, debouncedSearch, typeFilter, itemParam, pageSize]
    );

    // İlk sayfa: mount + filtre değişimlerinde son 50 hareketi (filtreliyse eşleşen ilk 50'yi) çek.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await dbActions.getTransactionsPaginated(buildParams(0));
                if (cancelled) return;
                setRows((res.rows as unknown as FlatTransaction[]) ?? []);
                setTotal(res.total ?? 0);
            } catch (e) {
                if (cancelled) return;
                console.error(e);
                setRows([]);
                setTotal(0);
                toast.error('Hareketler yüklenemedi. Lütfen tekrar deneyin.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [buildParams]);

    // Mutasyon (düzenleme/silme) sonrası mevcut filtreyle ilk sayfayı yeniden yükle.
    const refetch = useCallback(async () => {
        setLoading(true);
        try {
            const res = await dbActions.getTransactionsPaginated(buildParams(0));
            setRows((res.rows as unknown as FlatTransaction[]) ?? []);
            setTotal(res.total ?? 0);
        } catch (e) {
            console.error(e);
            toast.error('Liste yenilenemedi.');
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    const loadMore = useCallback(async () => {
        if (loadingMore || rows.length >= total) return;
        setLoadingMore(true);
        try {
            const res = await dbActions.getTransactionsPaginated(buildParams(rows.length));
            const more = (res.rows as unknown as FlatTransaction[]) ?? [];
            setRows((prev) => {
                // Aynı kaydın iki kez eklenmesini önle (arada değişim olursa)
                const seen = new Set(prev.map((r) => r.id));
                return [...prev, ...more.filter((r) => !seen.has(r.id))];
            });
            setTotal(res.total ?? 0);
        } catch (e) {
            console.error(e);
            toast.error('Daha fazla hareket yüklenemedi.');
        } finally {
            setLoadingMore(false);
        }
    }, [buildParams, loadingMore, rows.length, total]);

    // Seçimi yüklü satırlarla tutarlı tut
    useEffect(() => {
        setSelectedIds((prev) => prev.filter((id) => rows.some((t) => t.id === id)));
    }, [rows]);

    // Ürün hareketleri diyalogundan gelen ?highlight kaydına kaydır ve kısa süre vurgula.
    // Yeni bir highlight geldiğinde (parametre değişince) yeniden işlenebilsin diye ref sıfırlanır.
    useEffect(() => {
        processedHighlightRef.current = null;
        setFlashId(null);
    }, [highlightParam]);

    useEffect(() => {
        if (!highlightParam || loading) return;
        if (processedHighlightRef.current === highlightParam) return;

        const exists = rows.some((r) => r.id === highlightParam);
        if (exists) {
            processedHighlightRef.current = highlightParam;
            if (typeof document !== 'undefined') {
                const el = document.getElementById(`tx-${highlightParam}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setFlashId(highlightParam);
            return;
        }

        // Henüz yüklenmediyse ve bu ürüne filtreliyse devamını otomatik yükle (nadir: >500 hareket)
        if (itemParam && !loadingMore && rows.length < total) {
            void loadMore();
        }
    }, [highlightParam, rows, loading, loadingMore, total, itemParam, loadMore]);

    // Vurgu (flash) belli bir süre sonra kendiliğinden sönsün. Yalnızca flashId'ye bağlı;
    // böylece satırlar arada değişse bile zamanlayıcı erken iptal olmaz.
    useEffect(() => {
        if (!flashId) return;
        const timer = setTimeout(() => setFlashId(null), 2600);
        return () => clearTimeout(timer);
    }, [flashId]);

    const clearItemFilter = () => {
        router.replace('/hareketler');
    };

    const toggleSelectAll = () => {
        if (rows.length > 0 && selectedIds.length === rows.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(rows.map((t) => t.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const ids = selectedIds;

        toast.promise(dbActions.removeTransactions(ids), {
            loading: 'İşlemler siliniyor ve stoklar güncelleniyor...',
            success: (data) => {
                const res = data as Awaited<ReturnType<typeof dbActions.removeTransactions>>;
                if (res.success) {
                    setSelectedIds([]);
                    setIsDeleteOpen(false);
                    void refetch();
                    return 'İşlemler silindi ve stoklar eski haline getirildi.';
                }
                throw new Error('Silme başarısız');
            },
            error: 'Bir hata oluştu.',
        });
    };

    const openItemTransactions = async (itemId: string) => {
        setItemDialogOpen(true);
        setLoadingItem(true);
        setTransactionsItem(null);
        try {
            const item = await dbActions.getItemById(itemId);
            setTransactionsItem(item);
            if (!item) toast.error('Ürün bulunamadı.');
        } catch (e) {
            console.error(e);
            toast.error('Ürün hareketleri yüklenemedi.');
        } finally {
            setLoadingItem(false);
        }
    };

    const openEdit = async (t: FlatTransaction) => {
        setEditingTx(t);
        setEditDate(toLocalInput(t.date));
        setEditQty(String(t.quantity ?? 1));
        setEditChannel(String(t.channel || ''));
        setEditUnitPrice(String(t.unitPrice ?? ''));
        setEditCustomerId(String(t.customerId || ''));
        setEditOpen(true);

        if (customers.length === 0) {
            try {
                const rows = await dbActions.getCustomers();
                setCustomers(rows || []);
            } catch {
                // ignore
            }
        }
    };

    const submitEdit = async () => {
        if (!editingTx) return;
        const qty = Number(editQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.error('Adet geçerli olmalı');
            return;
        }

        const channel = (editChannel || '').trim();
        const customerId = (editCustomerId || '').trim();
        if (channel === 'Toptan' && !customerId) {
            toast.error('Toptan için cari seçmelisiniz');
            return;
        }

        const isPriced = editingTx.type === 'OUT' || (editingTx.type === 'IN' && editingTx.kind === 'RETURN');
        const unitPrice = isPriced ? Number(String(editUnitPrice).replace(',', '.')) : 0;
        if (isPriced && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
            toast.error('Birim fiyat geçerli olmalı');
            return;
        }

        setSavingEdit(true);
        const toastId = toast.loading('Hareket güncelleniyor...');
        try {
            const isoDate = new Date(editDate).toISOString();
            const res = await dbActions.updateTransaction(editingTx.id, {
                date: isoDate,
                quantity: qty,
                channel: channel || null,
                unitPrice,
                customerId: customerId ? customerId : null,
            });
            if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');

            await refetch();

            toast.success('Hareket güncellendi', { id: toastId });
            setEditOpen(false);
            setEditingTx(null);
        } catch (e) {
            console.error(e);
            toast.error('Hareket güncellenemedi', { id: toastId });
        } finally {
            setSavingEdit(false);
        }
    };

    const deleteOne = async () => {
        if (!deleteOneId) return;
        const id = deleteOneId;
        setDeleteOneId(null);
        toast.promise(dbActions.removeTransactions([id]), {
            loading: 'Hareket siliniyor ve stok düzeltiliyor...',
            success: (data) => {
                const res = data as Awaited<ReturnType<typeof dbActions.removeTransactions>>;
                if (res.success) {
                    setSelectedIds((prev) => prev.filter((x) => x !== id));
                    void refetch();
                    return 'Hareket silindi.';
                }
                throw new Error('Silme başarısız');
            },
            error: 'Bir hata oluştu.',
        });
    };

    const hasMore = rows.length < total;

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Hareketleri</h1>
                        {itemParam ? (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-zinc-500">
                                    {(rows[0]?.productName || 'Seçili ürün')} hareketleri ({total})
                                </span>
                                <button
                                    type="button"
                                    onClick={clearItemFilter}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors"
                                    title="Ürün filtresini kaldır, tüm hareketleri göster"
                                >
                                    <X className="w-3 h-3" />
                                    Filtreyi kaldır
                                </button>
                            </div>
                        ) : (
                            <p className="text-zinc-500">
                                Tüm stok giriş ve çıkış geçmişi ({total})
                                {total > 0 && rows.length < total ? ` — ${rows.length} tanesi gösteriliyor` : ''}
                            </p>
                        )}
                    </div>
                    {selectedIds.length > 0 && (
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteOpen(true)}
                            className="gap-2 animate-in fade-in slide-in-from-right-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Seçilenleri Sil ({selectedIds.length})
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                        <Input
                            placeholder="Ürün adı, barkod, marka, kanal veya cari ara..."
                            className="pl-10 h-12 text-lg bg-zinc-900/50 border-zinc-800 focus:border-primary/50"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                        <Input
                            type="date"
                            className="bg-transparent border-0 h-9 text-xs w-full p-1 focus-visible:ring-0"
                            value={dateRange.start}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                        />
                        <span className="text-xs text-zinc-600">→</span>
                        <Input
                            type="date"
                            className="bg-transparent border-0 h-9 text-xs w-full p-1 focus-visible:ring-0"
                            value={dateRange.end}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
                        <span className="text-xs text-zinc-500">İşlem Tipi</span>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'IN' | 'OUT')}
                            className="h-9 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none"
                        >
                            <option value="ALL">Tümü</option>
                            <option value="IN">Alış (Giriş)</option>
                            <option value="OUT">Satış (Çıkış)</option>
                        </select>
                    </div>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                                <tr>
                                    <th className="px-4 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={rows.length > 0 && selectedIds.length === rows.length}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 accent-primary rounded"
                                        />
                                    </th>
                                    <th className="px-6 py-4">Tarih</th>
                                    <th className="px-6 py-4">İşlem Tipi</th>
                                    <th className="px-6 py-4">Ürün</th>
                                    <th className="px-6 py-4">Barkod</th>
                                    <th className="px-6 py-4 text-center">Adet</th>
                                    <th className="px-6 py-4 text-right">Birim Fiyat</th>
                                    <th className="px-6 py-4 text-right">Tutar</th>
                                    <th className="px-6 py-4">Cari</th>
                                    <th className="px-6 py-4">Kanal / Not</th>
                                    <th className="px-6 py-4 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} className="px-6 py-12 text-center text-zinc-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Hareketler yükleniyor...
                                            </div>
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="px-6 py-12 text-center text-zinc-500">
                                            {total === 0 && !debouncedSearch && !dateRange.start && !dateRange.end && typeFilter === 'ALL'
                                                ? 'Henüz işlem kaydı yok.'
                                                : 'Aranan kriterlere uygun kayıt bulunamadı.'}
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((t) => (
                                        <tr
                                            key={t.id}
                                            id={`tx-${t.id}`}
                                            onClick={() => openItemTransactions(t.itemId)}
                                            className={cn(
                                                'hover:bg-zinc-900/50 transition-colors group cursor-pointer',
                                                selectedIds.includes(t.id) && 'bg-primary/5',
                                                flashId === t.id && 'bg-sky-500/15 ring-2 ring-inset ring-sky-500'
                                            )}
                                        >
                                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(t.id)}
                                                    onChange={() => toggleSelect(t.id)}
                                                    className="w-4 h-4 accent-primary rounded"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                                                {new Date(t.date).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {isOpeningTx(t) ? (
                                                    <div className="flex items-center gap-2 font-medium text-cyan-400">
                                                        <ArrowDownCircle className="w-4 h-4" />
                                                        Devir Bakiye
                                                    </div>
                                                ) : t.type === 'IN' && t.kind === 'RETURN' ? (
                                                    <div className="flex items-center gap-2 font-medium text-purple-400">
                                                        <ArrowDownCircle className="w-4 h-4" />
                                                        İade (Giriş)
                                                    </div>
                                                ) : (
                                                    <div className={`flex items-center gap-2 font-medium ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                                                        {t.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                                                        {t.type === 'IN' ? 'Giriş' : 'Çıkış'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {t.image ? <img src={t.image} className="w-full h-full object-contain" alt={t.productName} /> : <Package className="w-4 h-4 text-zinc-700" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-white line-clamp-1">{t.productName}</div>
                                                        <div className="text-xs text-zinc-500">{t.brand}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-zinc-500">
                                                {t.barcode}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {t.quantity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-zinc-300 font-mono text-xs">
                                                {isOpeningTx(t) ? (
                                                    '-'
                                                ) : t.type === 'OUT' ? (
                                                    currency(Number(t.unitPrice) || 0)
                                                ) : (t.type === 'IN' && t.kind === 'RETURN') ? (
                                                    currency(Number(t.unitPrice) || 0)
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-xs">
                                                {!isOpeningTx(t) && (t.type === 'OUT' || (t.type === 'IN' && t.kind === 'RETURN')) ? (
                                                    <span className="font-bold text-blue-300">
                                                        {currency(
                                                            Number(t.totalPrice) ||
                                                            ((Number(t.unitPrice) || t.itemSellPrice || 0) * (Number(t.quantity) || 0))
                                                        )}
                                                    </span>
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {(t.customerName || t.customerCode) ? (
                                                    <div className="text-xs">
                                                        <div className="font-medium text-white line-clamp-1">{t.customerName}</div>
                                                        {t.customerCode && <div className="text-zinc-500 font-mono">{t.customerCode}</div>}
                                                    </div>
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {t.channel ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                        {t.channel}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        className="border-zinc-700 px-2"
                                                        onClick={() => openEdit(t)}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        className="px-2"
                                                        onClick={() => setDeleteOneId(t.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {hasMore && !loading && (
                        <div className="flex items-center justify-center border-t border-zinc-800 p-4">
                            <Button
                                variant="outline"
                                className="border-zinc-700 gap-2"
                                onClick={loadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Yükleniyor...
                                    </>
                                ) : (
                                    `Daha fazla göster (${total - rows.length} kayıt daha)`
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={itemDialogOpen} onOpenChange={(open) => { setItemDialogOpen(open); if (!open) setTransactionsItem(null); }}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle>Stok Hareketleri</DialogTitle>
                        <DialogDescription>
                            {transactionsItem ? `${transactionsItem.name} için son hareketler` : 'Yükleniyor...'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-2 space-y-3 max-h-[60vh] overflow-auto">
                        {loadingItem ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Hareketler yükleniyor...
                            </div>
                        ) : !transactionsItem || transactionsItem.transactions.length === 0 ? (
                            <p className="text-sm text-zinc-500">Bu ürün için hareket bulunamadı.</p>
                        ) : (
                            transactionsItem.transactions
                                .slice()
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map((t) => (
                                    <div key={t.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                {(isOpeningItemTx(transactionsItem, t) ? 'Devir Bakiye' : (t.type === 'IN' ? 'Giriş' : 'Çıkış'))} • {t.quantity} adet
                                            </p>
                                            <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                                            {t.channel && (
                                                <p className="text-xs text-zinc-500">{t.channel}</p>
                                            )}
                                            {t.customerName && (
                                                <p className="text-xs text-zinc-400">
                                                    Cari: {t.customerName}{t.customerCode ? ` (${t.customerCode})` : ''}
                                                </p>
                                            )}
                                        </div>
                                        <span className={cn(
                                            'text-xs font-bold px-2 py-1 rounded-full',
                                            t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                        )}>
                                            {t.type === 'IN' ? '+' : '-'}{t.quantity}
                                        </span>
                                    </div>
                                ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Hareket Kayıtlarını Sil
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Seçili hareket kayıtlarını silme onayı.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-zinc-300">
                            Seçilen <strong>{selectedIds.length}</strong> hareketi silmek istediğinize emin misiniz?
                        </p>
                        <div className="bg-amber-500/10 border border-amber-500/50 p-3 rounded-lg flex gap-3">
                            <ArrowUpCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-200">
                                <strong>Önemli:</strong> Hareketler silindiğinde, ilgili ürünlerin stok miktarları otomatik olarak tersine düzeltilecektir.
                                (Örn: Bir satış hareketini silerseniz, o ürünün stoğu geri artacaktır.)
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Vazgeç</Button>
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                        >
                            Evet, Seçilenleri Sil ve Stokları Düzenle
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteOneId} onOpenChange={(open) => !open && setDeleteOneId(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Hareketi Sil
                        </DialogTitle>
                        <DialogDescription className="sr-only">Tek bir hareket silme onayı.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-zinc-300">Bu hareketi silmek istediğinize emin misiniz?</p>
                        <div className="bg-amber-500/10 border border-amber-500/50 p-3 rounded-lg flex gap-3">
                            <ArrowUpCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-200">
                                <strong>Önemli:</strong> Silince ilgili ürünün stok miktarı otomatik düzeltilecek.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setDeleteOneId(null)}>Vazgeç</Button>
                        <Button variant="destructive" onClick={deleteOne}>Evet, Sil</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={(open) => !savingEdit && setEditOpen(open)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle>Hareket Düzenle</DialogTitle>
                        <DialogDescription>Adet, tarih, kanal, fiyat ve cari bilgisini güncelleyebilirsiniz.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Tarih</label>
                            <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Adet</label>
                            <Input type="number" min={1} value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Kanal</label>
                            <select
                                value={editChannel}
                                onChange={(e) => setEditChannel(e.target.value)}
                                className="h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none w-full"
                            >
                                <option value="">—</option>
                                <option value="Pazaryeri">Pazaryeri</option>
                                <option value="Perakende">Perakende</option>
                                <option value="Toptan">Toptan</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Cari</label>
                            <select
                                value={editCustomerId}
                                onChange={(e) => setEditCustomerId(e.target.value)}
                                className="h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none w-full"
                            >
                                <option value="">—</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {(c.customerCode ? `${c.customerCode} - ` : '') + c.name}
                                    </option>
                                ))}
                            </select>
                            {editChannel === 'Toptan' && !editCustomerId && (
                                <p className="text-xs text-red-400">Toptan için cari zorunlu.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Birim Fiyat</label>
                            <Input
                                inputMode="decimal"
                                value={editUnitPrice}
                                onChange={(e) => setEditUnitPrice(e.target.value)}
                                placeholder="Örn: 200"
                                disabled={!(editingTx?.type === 'OUT' || (editingTx?.type === 'IN' && editingTx?.kind === 'RETURN'))}
                            />
                            {!(editingTx?.type === 'OUT' || (editingTx?.type === 'IN' && editingTx?.kind === 'RETURN')) && (
                                <p className="text-xs text-zinc-500">Sadece satış/iade hareketlerinde fiyat düzenlenir.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" className="border-zinc-700" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                            İptal
                        </Button>
                        <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitEdit} disabled={savingEdit}>
                            Kaydet
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function MovementsPage() {
    // useSearchParams bir Suspense sınırı gerektirir; ilk render için basit bir iskelet gösterilir.
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center gap-2 py-20 text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Hareketler yükleniyor...
                </div>
            }
        >
            <MovementsPageInner />
        </Suspense>
    );
}
