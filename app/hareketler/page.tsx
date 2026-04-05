'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, ArrowDownCircle, ArrowUpCircle, Trash2, Package, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

const currency = (value: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

export default function MovementsPage() {
    const items = useStockStore((state) => state.items);
    const removeStoreTransactions = useStockStore((state) => state.removeTransactions);
    const setItems = useStockStore((state) => state.setItems);

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [dateRange, setDateRange] = useState({ start: yearStart, end: today });
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

    // Flatten all transactions from all items
    const allTransactions = useMemo<FlatTransaction[]>(
        () =>
            items
                .flatMap((item) =>
                    item.transactions.map((t) => ({
                        ...t,
                        productName: item.name,
                        barcode: item.barcode,
                        image: item.image,
                        brand: item.brand,
                        itemId: item.id,
                        itemSellPrice: Number(item.sellPrice) || 0,
                        itemCreatedAt: item.createdAt,
                    }))
                )
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [items]
    );

    const [transactionsItem, setTransactionsItem] = useState<StockItem | null>(null);

    const filteredTransactions = useMemo(() => allTransactions.filter(t => {
        const matchesSearch =
            t.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.barcode.includes(searchQuery) ||
            t.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.channel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.customerCode || '').toLowerCase().includes(searchQuery.toLowerCase());

        const matchesType = typeFilter === 'ALL' ? true : t.type === typeFilter;

        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);
        const tDate = new Date(t.date);
        const matchesDate = tDate >= start && tDate <= end;

        return matchesSearch && matchesType && matchesDate;
    }), [allTransactions, dateRange.end, dateRange.start, searchQuery, typeFilter]);

    useEffect(() => {
        // Keep selection consistent with filters
        setSelectedIds((prev) => prev.filter((id) => filteredTransactions.some((t) => t.id === id)));
    }, [filteredTransactions]);

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredTransactions.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredTransactions.map(t => t.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        toast.promise(dbActions.removeTransactions(selectedIds), {
            loading: 'İşlemler siliniyor ve stoklar güncelleniyor...',
            success: (data) => {
                const res = data as Awaited<ReturnType<typeof dbActions.removeTransactions>>;
                if (res.success) {
                    removeStoreTransactions(selectedIds);
                    setSelectedIds([]);
                    setIsDeleteOpen(false);
                    return 'İşlemler silindi ve stoklar eski haline getirildi.';
                }
                throw new Error('Silme başarısız');
            },
            error: 'Bir hata oluştu.'
        });
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

            const nextItems = await dbActions.getItems();
            setItems(nextItems || []);

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
                    removeStoreTransactions([id]);
                    setSelectedIds((prev) => prev.filter((x) => x !== id));
                    return 'Hareket silindi.';
                }
                throw new Error('Silme başarısız');
            },
            error: 'Bir hata oluştu.'
        });
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Hareketleri</h1>
                        <p className="text-zinc-500">Tüm stok giriş ve çıkış geçmişi ({allTransactions.length})</p>
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
                            placeholder="Ürün adı, barkod, marka veya kanal ara..."
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
                                            checked={selectedIds.length > 0 && selectedIds.length === filteredTransactions.length}
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
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="px-6 py-12 text-center text-zinc-500">
                                            {allTransactions.length === 0 ? "Henüz işlem kaydı yok." : "Aranan kriterlere uygun kayıt bulunamadı."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map((t) => (
                                        <tr
                                            key={t.id}
                                            onClick={() => {
                                                const item = items.find(i => i.id === t.itemId);
                                                if (item) setTransactionsItem(item);
                                            }}
                                            className={cn(
                                                "hover:bg-zinc-900/50 transition-colors group cursor-pointer",
                                                selectedIds.includes(t.id) && "bg-primary/5"
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
                </CardContent>
            </Card>

            <Dialog open={!!transactionsItem} onOpenChange={(open) => !open && setTransactionsItem(null)}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
                    {transactionsItem && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Stok Hareketleri</DialogTitle>
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
                                                    "text-xs font-bold px-2 py-1 rounded-full",
                                                    t.type === 'IN' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                                )}>
                                                    {t.type === 'IN' ? '+' : '-'}{t.quantity}
                                                </span>
                                            </div>
                                        ))
                                )}
                            </div>
                        </>
                    )}
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
