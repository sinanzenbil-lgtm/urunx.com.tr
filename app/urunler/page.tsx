'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import ExcelImportModal from '@/components/excel-import-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { StockItem } from '@/types';
import { Package, Search, Edit, X, PlusCircle, MinusCircle, Trash2, Download, ArrowUp, ArrowDown, Copy, Files, ChevronRight } from 'lucide-react';
import * as dbActions from '@/lib/actions';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const formatPriceNoSymbol = (value: number) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const LIST_PAGE_SIZE = 20;

export default function ProductsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlBrand = (searchParams.get('marka') || '').trim();
    const editIdParam = (searchParams.get('duzenle') || '').trim();
    const updateItem = useStockStore((state) => state.updateItem);
    const removeItem = useStockStore((state) => state.removeItem);
    const addTransaction = useStockStore((state) => state.addTransaction);

    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [copyDialogOpen, setCopyDialogOpen] = useState(false);
    const [copyCountInput, setCopyCountInput] = useState('1');
    const [transactionModal, setTransactionModal] = useState<{ item: StockItem, type: 'IN' | 'OUT' } | null>(null);
    const [transactionsItem, setTransactionsItem] = useState<StockItem | null>(null);
    const [imageUrlInput, setImageUrlInput] = useState('');
    const [selectedBrandOverride, setSelectedBrandOverride] = useState<string | null>(null);
    const [dismissedEditParam, setDismissedEditParam] = useState('');
    const selectedBrand = selectedBrandOverride ?? urlBrand;
    type SortKey = 'name' | 'brand' | 'stockCode' | 'quantity' | 'buyPrice' | 'sellPrice';
    // Default: sort by product name (A-Z)
    const [sortBy, setSortBy] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [listExpanded, setListExpanded] = useState(false);
    const [listItems, setListItems] = useState<StockItem[]>([]);
    const [listTotal, setListTotal] = useState(0);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [allItemsCount, setAllItemsCount] = useState(0);
    const [brandAggregates, setBrandAggregates] = useState<{ brand: string; itemCount: number; totalQty: number }[]>([]);
    const listTotalRef = useRef(0);

    // Debounce arama: yazmayı bırakınca filtre çalışsın (performans)
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput), 220);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
        setListExpanded(false);
        setSelectedIds([]);
    }, [searchQuery, selectedBrand]);

    const refreshMeta = useCallback(async () => {
        try {
            const [count, brands] = await Promise.all([
                dbActions.getItemsTotalCount(),
                dbActions.getItemBrandAggregates(),
            ]);
            setAllItemsCount(count);
            setBrandAggregates(brands);
        } catch {
            /* özet isteğe bağlı */
        }
    }, []);

    const fetchList = useCallback(async () => {
        setListLoading(true);
        setListError(null);
        try {
            const limit = listExpanded
                ? Math.max(listTotalRef.current, LIST_PAGE_SIZE)
                : LIST_PAGE_SIZE;
            const { items: fetchedItems, total } = await dbActions.getItemsPaginated({
                limit,
                offset: 0,
                search: searchQuery.trim() || undefined,
                brand: selectedBrand || undefined,
                sortBy,
                sortDir,
            });
            listTotalRef.current = total;
            setListTotal(total);
            setListItems(fetchedItems);
            setSelectedIds((prev) => prev.filter((id) => fetchedItems.some((i) => i.id === id)));
        } catch {
            setListError('Liste yüklenemedi');
            toast.error('Ürün listesi alınamadı');
            setListItems([]);
            setListTotal(0);
            listTotalRef.current = 0;
        } finally {
            setListLoading(false);
        }
    }, [searchQuery, selectedBrand, sortBy, sortDir, listExpanded]);

    useEffect(() => {
        void refreshMeta();
    }, [refreshMeta]);

    useEffect(() => {
        void fetchList();
    }, [fetchList]);

    const editItemFromParam = useMemo(() => {
        if (!editIdParam || dismissedEditParam === editIdParam) return null;
        return listItems.find((item) => item.id === editIdParam) || null;
    }, [editIdParam, dismissedEditParam, listItems]);

    const activeEditingItem = editingItem ?? editItemFromParam;

    useEffect(() => {
        if (!editIdParam || dismissedEditParam === editIdParam) return;
        if (listItems.some((i) => i.id === editIdParam)) return;
        let cancelled = false;
        (async () => {
            try {
                const item = await dbActions.getItemById(editIdParam);
                if (!cancelled && item) setEditingItem(item);
            } catch {
                if (!cancelled) toast.error('Ürün bulunamadı');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editIdParam, dismissedEditParam, listItems]);

    const handleSort = (key: SortKey, dir: 'asc' | 'desc') => {
        setSortBy(key);
        setSortDir(dir);
    };

    const handleExportExcel = () => {
        if (listTotal === 0) {
            toast.error('İndirilecek ürün bulunamadı');
            return;
        }

        const toastId = toast.loading('İndiriliyor...');

        const runExport = async () => {
            try {
                const { items: rows } = await dbActions.getItemsPaginated({
                    limit: Math.max(listTotal, 1),
                    offset: 0,
                    search: searchQuery.trim() || undefined,
                    brand: selectedBrand || undefined,
                    sortBy,
                    sortDir,
                });
                if (rows.length === 0) {
                    toast.error('İndirilecek ürün bulunamadı', { id: toastId });
                    return;
                }
                const headers = ['UrunAdi', 'Barkod', 'StokKodu', 'Marka', 'AlisFiyati', 'SatisFiyati', 'StokAdedi', 'KDV'];
                const dataRows = rows.map((item) => [
                    String(item.name ?? ''),
                    String(item.barcode ?? ''),
                    String(item.stockCode ?? ''),
                    String(item.brand ?? ''),
                    Number(item.buyPrice) || 0,
                    Number(item.sellPrice) || 0,
                    Number(item.quantity) || 0,
                    Number(item.vatRate) || 0,
                ]);

                const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Urunler');

                let done = false;
                try {
                    XLSX.writeFile(workbook, 'Urunx_Urun_Listesi.xlsx');
                    done = true;
                } catch (_) {
                    try {
                        const wbOut = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                        const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'Urunx_Urun_Listesi.xlsx';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        done = true;
                    } catch (_2) {
                        // both methods failed
                    }
                }
                if (done) toast.success(`Excel indirildi (${rows.length} ürün)`, { id: toastId });
                else toast.error('Excel indirilirken bir hata oluştu', { id: toastId });
            } catch (err) {
                console.error(err);
                toast.error('Excel indirilirken bir hata oluştu', { id: toastId });
            }
        };

        void runExport();
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === listItems.length && listItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(listItems.map(item => item.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        const result = await dbActions.bulkRemoveItems(selectedIds);
        if (result.success) {
            selectedIds.forEach(id => removeItem(id));
            toast.success('Seçili ürünler silindi');
            setSelectedIds([]);
            setIsBulkDeleteOpen(false);
            await refreshMeta();
            await fetchList();
        } else {
            toast.error('Silme işlemi başarısız');
        }
    };

    const updateEditingDraft = (patch: Partial<StockItem>) => {
        if (!activeEditingItem) return;
        setEditingItem({ ...activeEditingItem, ...patch });
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeEditingItem) return;

        const result = await dbActions.updateItem(activeEditingItem.id, activeEditingItem);
        if (result.success) {
            updateItem(activeEditingItem.id, activeEditingItem);
            toast.success('Ürün güncellendi');
            await refreshMeta();
            await fetchList();
        } else {
            toast.error('Giriş yapılamadı / Kayıt hatası');
        }
        setEditingItem(null);
        if (editIdParam) setDismissedEditParam(editIdParam);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!activeEditingItem) return;
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                updateEditingDraft({ image: reader.result as string });
                toast.success('Resim yüklendi');
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePasteFromClipboard = async () => {
        if (!activeEditingItem) return;
        try {
            const clipboard = navigator.clipboard as Clipboard & {
                read?: () => Promise<ClipboardItem[]>;
            };
            if (!clipboard.read) {
                toast.error('Tarayıcı panodan resim okumayı desteklemiyor');
                return;
            }
            const clipboardItems = await clipboard.read();
            for (const item of clipboardItems) {
                const types = item.types;
                if (types.includes('image/png') || types.includes('image/jpeg') || types.includes('image/webp')) {
                    const blob = await item.getType(types[0]);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        updateEditingDraft({ image: reader.result as string });
                        toast.success('Panodan resim yapıştırıldı');
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
            toast.error('Panoda resim bulunamadı');
        } catch (error) {
            toast.error('Panoya erişilemedi');
        }
    };

    const handleLoadFromUrl = async () => {
        if (!activeEditingItem) return;
        if (!imageUrlInput) {
            toast.error('Lütfen bir URL girin');
            return;
        }
        try {
            const res = await fetch(imageUrlInput);
            const blob = await res.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                updateEditingDraft({ image: reader.result as string });
                toast.success('URL üzerinden resim yüklendi');
                setImageUrlInput('');
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            toast.error('URL üzerinden resim alınamadı');
        }
    };

    const handleTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transactionModal) return;

        const form = e.target as HTMLFormElement;
        const quantity = parseInt((form.elements.namedItem('quantity') as HTMLInputElement).value);

        if (quantity <= 0) {
            toast.error('Geçerli bir adet giriniz');
            return;
        }

        if (transactionModal.type === 'OUT' && transactionModal.item.quantity < quantity) {
            toast.error('Yetersiz stok!');
            return;
        }

        const newTransaction = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            type: transactionModal.type,
            quantity: quantity
        };

        const result = await dbActions.addTransaction(transactionModal.item.id, newTransaction);
        if (result.success) {
            addTransaction(transactionModal.item.id, newTransaction);
            toast.success(transactionModal.type === 'IN' ? 'Stok Eklendi' : 'Satış Yapıldı / Stoktan Düştü');
            await fetchList();
        } else {
            toast.error('Kayıt yapılırken bir hata oluştu');
        }

        setTransactionModal(null);
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Listesi</h1>
                        <p className="text-zinc-500">
                            Veritabanında {allItemsCount} ürün
                            {(searchQuery.trim() || selectedBrand) && (
                                <span className="text-zinc-600"> · Filtre: {listTotal} eşleşme</span>
                            )}
                            {listTotal > LIST_PAGE_SIZE && !listExpanded && (
                                <span className="text-zinc-600"> · Sunucudan ilk {LIST_PAGE_SIZE} yüklendi</span>
                            )}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.length === 1 && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setCopyCountInput('1');
                                    setCopyDialogOpen(true);
                                }}
                                className="gap-2 animate-in fade-in slide-in-from-right-2 border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
                            >
                                <Files className="w-4 h-4" />
                                Kopyala
                            </Button>
                        )}
                        {selectedIds.length > 0 && (
                            <Button
                                variant="destructive"
                                onClick={() => setIsBulkDeleteOpen(true)}
                                className="gap-2 animate-in fade-in slide-in-from-right-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Seçilenleri Sil ({selectedIds.length})
                            </Button>
                        )}
                        <ExcelImportModal
                            onAfterImport={() => {
                                void refreshMeta();
                                void fetchList();
                            }}
                        />
                        <Button
                            variant="outline"
                            onClick={handleExportExcel}
                            className="gap-2 border-zinc-700 text-zinc-200 hover:bg-zinc-900"
                        >
                            <Download className="w-4 h-4" />
                            Excel İndir
                        </Button>
                        <Link href="/urunler/yeni">
                            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_-3px_rgba(22,163,74,0.5)]">
                                <PlusCircle className="w-5 h-5" />
                                Yeni Ürün Ekle
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="relative w-full">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                    <Input
                        placeholder="Ürün adı, barkod veya stok kodu ara..."
                        className="pl-10 h-11 text-base bg-zinc-900/50 border-zinc-800 focus:border-primary/50"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </div>

                {/* Brand Filter */}
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-zinc-400 whitespace-nowrap">Marka Filtresi:</label>
                    <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrandOverride(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-md bg-zinc-900/50 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                    >
                        <option value="">Tüm Markalar ({allItemsCount})</option>
                        {brandAggregates.map(({ brand, itemCount }) => (
                            <option key={brand} value={brand}>
                                {brand} ({itemCount})
                            </option>
                        ))}
                    </select>
                    {selectedBrand && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedBrandOverride('')}
                            className="text-zinc-400 hover:text-white"
                        >
                            <X className="w-4 h-4 mr-1" />
                            Temizle
                        </Button>
                    )}
                </div>
            </div>

                       <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        {listLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/50 text-sm text-zinc-400">
                                Yükleniyor…
                            </div>
                        )}
                        <table className="w-full text-xs text-left">
                            <thead className="bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-400">
                                <tr>
                                    <th className="px-3 py-2 w-8">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.length > 0 && selectedIds.length === listItems.length && listItems.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 accent-primary rounded"
                                        />
                                    </th>
                                    <th className="px-4 py-2 w-[78px]">Görsel</th>
                                    <th className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            Marka
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('brand', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="A-Z"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('brand', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Z-A"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            Ürün Bilgisi
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('name', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="A-Z"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('name', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Z-A"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2">
                                        <div className="flex items-center gap-1">
                                            Stok Kodu
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('stockCode', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="A-Z"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('stockCode', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Z-A"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2">Barkod</th>
                                    <th className="px-4 py-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            Stok
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('quantity', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Azdan çoğa"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('quantity', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Çoktan aza"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2 text-right">KDV</th>
                                    <th className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            Alış Fiyatı
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('buyPrice', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Düşükten yükseğe"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('buyPrice', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Yüksekten düşüğe"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            Toptan Satış
                                            <span className="inline-flex flex-col">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('sellPrice', 'asc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Düşükten yükseğe"><ArrowUp className="w-3 h-3" /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSort('sellPrice', 'desc'); }} className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white" title="Yüksekten düşüğe"><ArrowDown className="w-3 h-3" /></button>
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-2 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {listTotal === 0 && !listLoading ? (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-10 text-center text-zinc-500">
                                            {listError
                                                ? listError
                                                : allItemsCount === 0
                                                    ? 'Henüz ürün eklenmemiş.'
                                                    : 'Aranan kriterlere uygun ürün bulunamadı.'}
                                        </td>
                                    </tr>
                                ) : (
                                    listItems.map((item) => (
                                        <tr key={item.id} className={cn(
                                            "hover:bg-zinc-900/50 transition-colors group",
                                            selectedIds.includes(item.id) && "bg-primary/5"
                                        )}>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={() => toggleSelect(item.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 accent-primary rounded"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingItem(item);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setEditingItem(item);
                                                        }
                                                    }}
                                                    className="w-14 h-14 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                    title="Ürünü düzenle"
                                                    aria-label={`${item.name} ürününü düzenle`}
                                                >
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="w-full h-full object-contain p-0.5 group-hover:scale-105 transition-transform duration-500" />
                                                    ) : (
                                                        <Package className="w-7 h-7 text-zinc-700" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="text-zinc-300 font-medium">{item.brand || '-'}</div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setTransactionsItem(item)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setTransactionsItem(item);
                                                        }
                                                    }}
                                                    className="font-medium text-[13px] text-white hover:underline underline-offset-4 cursor-pointer w-fit leading-tight"
                                                    title="Ürün hareketlerini görüntüle"
                                                >
                                                    {item.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-400 font-mono truncate max-w-[180px]">{item.stockCode || '-'}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                                        disabled={!item.stockCode}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!item.stockCode) return;
                                                            try {
                                                                await navigator.clipboard.writeText(item.stockCode);
                                                                toast.success('Stok kodu kopyalandı');
                                                            } catch {
                                                                toast.error('Kopyalama başarısız');
                                                            }
                                                        }}
                                                        title="Stok kodunu kopyala"
                                                        aria-label="Stok kodunu kopyala"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 font-mono text-zinc-500">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate max-w-[180px]">{item.barcode || '-'}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                                        disabled={!item.barcode}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!item.barcode) return;
                                                            try {
                                                                await navigator.clipboard.writeText(item.barcode);
                                                                toast.success('Barkod kopyalandı');
                                                            } catch {
                                                                toast.error('Kopyalama başarısız');
                                                            }
                                                        }}
                                                        title="Barkodu kopyala"
                                                        aria-label="Barkodu kopyala"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${item.quantity > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {item.quantity}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-right text-zinc-400">
                                                %{item.vatRate || 0}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-white text-sm tabular-nums">
                                                {formatPriceNoSymbol(Number(item.buyPrice) || 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-light text-zinc-400 text-sm tabular-nums">
                                                {formatPriceNoSymbol(Number(item.sellPrice) || 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTransactionModal({ item, type: 'IN' });
                                                        }}
                                                        title="Stok Giriş / Alış"
                                                    >
                                                        <PlusCircle className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTransactionModal({ item, type: 'OUT' });
                                                        }}
                                                        title="Stok Çıkış / Satış"
                                                    >
                                                        <MinusCircle className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingItem(item);
                                                        }}
                                                        title="Düzenle"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeletingId(item.id);
                                                        }}
                                                        title="Sil"
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
                    {listTotal > LIST_PAGE_SIZE && (
                        <div className="flex justify-center py-4 px-4 border-t border-zinc-800 bg-zinc-950/40">
                            {!listExpanded ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-zinc-700 text-zinc-200 hover:bg-zinc-900"
                                    disabled={listLoading}
                                    onClick={() => setListExpanded(true)}
                                >
                                    Tümünü göster ({listTotal} ürün)
                                </Button>
                            ) : (
                                                               <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-zinc-400 hover:text-white"
                                    disabled={listLoading}
                                    onClick={() => setListExpanded(false)}
                                >
                                    İlk {LIST_PAGE_SIZE} ürünü göster
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!transactionModal} onOpenChange={(open) => !open && setTransactionModal(null)}>
                <DialogContent className="sm:max-w-sm bg-zinc-950 border-zinc-800 p-6">
                    {transactionModal && (
                        <>
                            <DialogHeader>
                                <DialogTitle className={transactionModal.type === 'IN' ? 'text-green-500' : 'text-red-500'}>
                                    {transactionModal.type === 'IN' ? 'Stok Giriş / Alış' : 'Stok Çıkış / Satış'}
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    Seçili ürün için stok hareketi ekleme penceresi.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <p className="font-medium text-white">{transactionModal.item.name}</p>
                                <p className="text-sm text-zinc-500">Mevcut Stok: {transactionModal.item.quantity}</p>
                            </div>
                            <form onSubmit={handleTransaction} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Adet</label>
                                    <Input
                                        name="quantity"
                                        type="number"
                                        min="1"
                                        defaultValue="1"
                                        autoFocus
                                        className="text-center text-2xl font-bold h-14"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setTransactionModal(null)}>İptal</Button>
                                    <Button
                                        type="submit"
                                        variant={transactionModal.type === 'IN' ? 'default' : 'destructive'}
                                        className={transactionModal.type === 'IN' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    >
                                        Onayla
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!transactionsItem} onOpenChange={(open) => !open && setTransactionsItem(null)}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
                    {transactionsItem && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Ürün Hareketleri</DialogTitle>
                                <DialogDescription>
                                    {transactionsItem.name} için son hareketler
                                </DialogDescription>
                            </DialogHeader>
                            <div className="mt-2 space-y-3 max-h-[60vh] overflow-auto">
                                {transactionsItem.transactions.length === 0 ? (
                                    <p className="text-sm text-zinc-500">Bu ürün için hareket bulunamadı.</p>
                                ) : (
                                    transactionsItem.transactions
                                        .slice()
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => {
                                                    setTransactionsItem(null);
                                                    router.push(`/hareketler/${encodeURIComponent(t.id)}`);
                                                }}
                                                title="Bu hareketin detayına git"
                                                className="w-full flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 text-left rounded-lg px-2 -mx-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer group"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-white">
                                                        {t.type === 'IN' ? 'Giriş' : 'Çıkış'} • {t.quantity} adet
                                                    </p>
                                                    <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                                                    {t.channel && (
                                                        <p className="text-xs text-zinc-500">{t.channel}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-xs font-bold px-2 py-1 rounded-full",
                                                        t.type === 'IN' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {t.type === 'IN' ? '+' : '-'}{t.quantity}
                                                    </span>
                                                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                                                </div>
                                            </button>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!activeEditingItem}
                onOpenChange={(open) => {
                    if (open) return;
                    setEditingItem(null);
                    if (editIdParam) setDismissedEditParam(editIdParam);
                }}
            >
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-0 overflow-hidden">
                    {activeEditingItem && (
                        <div className="p-6">
                            <DialogHeader className="mb-4">
                                <DialogTitle className="text-xl font-bold">Ürün Düzenle</DialogTitle>
                                <DialogDescription className="sr-only">
                                    Ürün bilgilerini düzenleme formu.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
                                {/* Large image preview at the top */}
                                <div className="mx-auto w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                                    <div className="w-full h-44 sm:h-52 flex items-center justify-center">
                                        {activeEditingItem.image ? (
                                            <img
                                                src={activeEditingItem.image}
                                                alt={`${activeEditingItem.name} görseli`}
                                                className="w-full h-full object-contain p-3"
                                            />
                                        ) : (
                                            <div className="text-sm text-zinc-500">Görsel yok</div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Resim Yükle (Opsiyonel)</label>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="cursor-pointer file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                                    />
                                    <div className="space-y-2 mt-2">
                                        <Button type="button" variant="secondary" onClick={handlePasteFromClipboard} className="w-full">
                                            Panodan Yapıştır
                                        </Button>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Resim URL girin"
                                                value={imageUrlInput}
                                                onChange={(e) => setImageUrlInput(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Button type="button" variant="secondary" onClick={handleLoadFromUrl} className="whitespace-nowrap">
                                                Yükle
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Ürün Adı</label>
                                    <Input
                                        value={activeEditingItem.name}
                                        onChange={(e) => updateEditingDraft({ name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Barkod</label>
                                        <Input
                                            value={activeEditingItem.barcode}
                                            onChange={(e) => updateEditingDraft({ barcode: e.target.value })}
                                            placeholder="Barkod"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Stok Kodu</label>
                                        <Input
                                            value={activeEditingItem.stockCode || ''}
                                            onChange={(e) => updateEditingDraft({ stockCode: e.target.value })}
                                            placeholder="Stok kodu"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Marka</label>
                                        <Input
                                            value={activeEditingItem.brand || ''}
                                            onChange={(e) => updateEditingDraft({ brand: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Alış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={activeEditingItem.buyPrice}
                                            onChange={(e) => updateEditingDraft({ buyPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Toptan Satış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={activeEditingItem.sellPrice}
                                            onChange={(e) => updateEditingDraft({ sellPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Stok Adedi</label>
                                        <Input
                                            type="number"
                                            value={activeEditingItem.quantity}
                                            onChange={(e) => updateEditingDraft({ quantity: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">KDV</label>
                                        <select
                                            value={activeEditingItem.vatRate}
                                            onChange={(e) => updateEditingDraft({ vatRate: parseFloat(e.target.value) })}
                                            className="w-full h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-primary/50 focus:outline-none"
                                        >
                                            <option value={1}>%1</option>
                                            <option value={10}>%10</option>
                                            <option value={20}>%20</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="pt-4 flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setEditingItem(null);
                                            if (editIdParam) setDismissedEditParam(editIdParam);
                                        }}
                                    >
                                        İptal
                                    </Button>
                                    <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">Kaydet</Button>
                                </div>
                            </form>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Ürünü Sil?
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Seçili ürünü silme onayı.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-zinc-300">Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setDeletingId(null)}>Vazgeç</Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                if (!deletingId) return;
                                const result = await dbActions.removeItem(deletingId);
                                if (result.success) {
                                    removeItem(deletingId);
                                    toast.success('Ürün silindi');
                                    await refreshMeta();
                                    await fetchList();
                                } else {
                                    toast.error('Silme işlemi başarısız');
                                }
                                setDeletingId(null);
                            }}
                        >
                            Evet, Sil
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Bulk Delete Confirmation Dialog */}
            <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Toplu Silme Onayı
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Seçili ürünleri toplu silme onayı.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-zinc-300">
                            <strong>{selectedIds.length}</strong> adet ürünü kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                        </p>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsBulkDeleteOpen(false)}>Vazgeç</Button>
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                        >
                            Evet, Tümünü Sil
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <Files className="w-5 h-5" />
                            Ürün kopyala
                        </DialogTitle>
                        <DialogDescription>
                            Seçili ürün için kaç adet yeni kayıt oluşturulacak? (Varsayılan: 1)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Kopya adedi</label>
                            <Input
                                type="number"
                                min={1}
                                max={100}
                                value={copyCountInput}
                                onChange={(e) => setCopyCountInput(e.target.value)}
                                className="text-center text-lg font-semibold h-12 bg-zinc-900 border-zinc-800"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setCopyDialogOpen(false)}>İptal</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                                const n = Math.min(100, Math.max(1, parseInt(copyCountInput, 10) || 1));
                                const id = selectedIds[0];
                                if (!id) return;
                                setCopyDialogOpen(false);
                                router.push(`/urunler/kopyala?kaynak=${encodeURIComponent(id)}&adet=${n}`);
                            }}
                        >
                            Kopyalama oluştur
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
