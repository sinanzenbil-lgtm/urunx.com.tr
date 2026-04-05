'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, EyeOff, Package } from 'lucide-react';
import { useStockStore } from '@/lib/store';
import * as dbActions from '@/lib/actions';
import { StockItem } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type NoSalesProduct = {
    id: string;
    name: string;
    brand?: string;
    stockCode?: string;
    barcode: string;
    image?: string;
    stock: number;
    totalBuyCost: number;
    monthlyStockCost: number;
    totalInterestCost: number;
};

type SortMode = 'stock_desc' | 'cost_desc';
type CostLot = { qty: number; unitCost: number; date: Date };

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);

const parseDateSafe = (value: string | undefined, fallback: Date) => {
    const d = new Date(value || '');
    return Number.isNaN(d.getTime()) ? fallback : d;
};

const calculateItemCosts = (item: StockItem, monthlyRate: number, now: Date) => {
    const rate = Math.max(0, Number(monthlyRate) || 0) / 100;
    const txs = [...(item.transactions || [])]
        .map((t) => ({ ...t, quantity: Number(t.quantity) || 0 }))
        .filter((t) => t.quantity > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const lots: CostLot[] = [];
    const fallbackDate = parseDateSafe(item.createdAt, now);

    txs.forEach((t) => {
        const tDate = parseDateSafe(t.date, fallbackDate);

        if (t.type === 'IN') {
            const unitCost = Math.max(0, Number(t.unitPrice) || Number(item.buyPrice) || 0);
            lots.push({ qty: t.quantity, unitCost, date: tDate });
            return;
        }

        if (t.type === 'OUT') {
            let remainingOut = t.quantity;
            while (remainingOut > 0 && lots.length > 0) {
                if (lots[0].qty <= 0) {
                    lots.shift();
                    continue;
                }
                const consumed = Math.min(remainingOut, lots[0].qty);
                lots[0].qty -= consumed;
                remainingOut -= consumed;
                if (lots[0].qty <= 0) lots.shift();
            }
        }
    });

    const currentQty = Math.max(0, Number(item.quantity) || 0);
    if (currentQty <= 0) return { purchaseCost: 0, monthlyStockCost: 0, stockCost: 0 };

    let remainingLotsQty = lots.reduce((acc, lot) => acc + Math.max(0, lot.qty), 0);
    if (remainingLotsQty < currentQty) {
        lots.push({
            qty: currentQty - remainingLotsQty,
            unitCost: Math.max(0, Number(item.buyPrice) || 0),
            date: fallbackDate,
        });
        remainingLotsQty = currentQty;
    }

    if (remainingLotsQty > currentQty) {
        let excess = remainingLotsQty - currentQty;
        for (let i = lots.length - 1; i >= 0 && excess > 0; i -= 1) {
            const removable = Math.min(excess, Math.max(0, lots[i].qty));
            lots[i].qty -= removable;
            excess -= removable;
        }
    }

    const activeLots = lots.filter((lot) => lot.qty > 0);
    if (activeLots.length === 0) return { purchaseCost: 0, monthlyStockCost: 0, stockCost: 0 };

    let purchaseCost = 0;
    let stockCost = 0;

    activeLots.forEach((lot) => {
        const lotQty = Math.max(0, lot.qty);
        const lotCost = lotQty * Math.max(0, lot.unitCost);
        const daysHeld = Math.max(0, (now.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24));
        const monthsHeld = daysHeld / 30;
        const lotInterest = lotCost * rate * monthsHeld;

        purchaseCost += lotCost;
        stockCost += lotInterest;
    });

    const monthlyStockCost = purchaseCost * rate;
    return { purchaseCost, monthlyStockCost, stockCost };
};

export default function NoSalesProductsPage() {
    const items = useStockStore((state) => state.items);
    const searchParams = useSearchParams();

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    const [dates, setDates] = useState({
        start: searchParams.get('start') || yearStart,
        end: searchParams.get('end') || today,
    });
    const [sortMode, setSortMode] = useState<SortMode>('stock_desc');
    const [transactionsItem, setTransactionsItem] = useState<StockItem | null>(null);
    const [monthlyRate, setMonthlyRate] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await dbActions.getCompanySettings();
            if (cancelled || !res.success) return;
            setMonthlyRate(Math.max(0, Number(res.settings?.stockInterestMonthlyRate) || 0));
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const noSalesProducts = useMemo<NoSalesProduct[]>(() => {
        const start = new Date(dates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dates.end);
        end.setHours(23, 59, 59, 999);
        const now = new Date();

        return items
            .filter((item) => !item.transactions.some((t) => {
                const tDate = new Date(t.date);
                return t.type === 'OUT' && tDate >= start && tDate <= end;
            }))
            .map((item) => {
                const stock = Number(item.quantity) || 0;
                const costs = calculateItemCosts(item, monthlyRate, now);

                return {
                    id: item.id,
                    name: item.name,
                    brand: item.brand,
                    stockCode: item.stockCode,
                    barcode: item.barcode,
                    image: item.image,
                    stock,
                    totalBuyCost: costs.purchaseCost,
                    monthlyStockCost: costs.monthlyStockCost,
                    totalInterestCost: costs.stockCost,
                };
            })
            .sort((a, b) => {
                if (sortMode === 'cost_desc') {
                    return (b.totalBuyCost - a.totalBuyCost) || (b.stock - a.stock) || a.name.localeCompare(b.name, 'tr-TR');
                }
                return (b.stock - a.stock) || (b.totalBuyCost - a.totalBuyCost) || a.name.localeCompare(b.name, 'tr-TR');
            });
    }, [items, dates, sortMode, monthlyRate]);

    const totalNoSalesBuyCost = useMemo(
        () => noSalesProducts.reduce((acc, row) => acc + row.totalBuyCost, 0),
        [noSalesProducts]
    );
    const totalNoSalesStockCost = useMemo(
        () => noSalesProducts.reduce((acc, row) => acc + row.totalInterestCost, 0),
        [noSalesProducts]
    );
    const totalNoSalesMonthlyStockCost = useMemo(
        () => noSalesProducts.reduce((acc, row) => acc + row.monthlyStockCost, 0),
        [noSalesProducts]
    );
    const totalNoSalesQty = useMemo(
        () => noSalesProducts.reduce((acc, row) => acc + row.stock, 0),
        [noSalesProducts]
    );

    const openTransactions = (id: string) => {
        const found = items.find((item) => item.id === id);
        if (found) setTransactionsItem(found);
    };

    return (
        <div className="space-y-6 animate-enter pb-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Satışsız Ürünler</h1>
                    <p className="text-zinc-500">Seçilen tarihte hiç satış hareketi olmayan ürünler</p>
                </div>
                <Link
                    href="/raporlar"
                    className="inline-flex items-center rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                >
                    Raporlara Dön
                </Link>
            </div>

            <Card className="border-white/5 bg-zinc-900/35">
                <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <EyeOff className="w-4 h-4 text-rose-400" />
                            Tüm Satışsız Ürünler
                        </CardTitle>
                        <div className="text-sm font-bold text-rose-400">{noSalesProducts.length} ürün</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4">
                            <p className="text-[11px] uppercase tracking-wide text-sky-200/80">Toplam Alış Maliyeti</p>
                            <p className="mt-2 text-2xl font-black text-sky-200 leading-none">{formatCurrency(totalNoSalesBuyCost)}</p>
                        </div>
                        <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-4">
                            <p className="text-[11px] uppercase tracking-wide text-violet-200/80">Bir Aylık Toplam Stok Maliyeti</p>
                            <p className="mt-2 text-2xl font-black text-violet-200 leading-none">{formatCurrency(totalNoSalesMonthlyStockCost)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                            <p className="text-[11px] uppercase tracking-wide text-amber-200/80">Satılmayan Ürünlerin Toplam Stok Maliyeti</p>
                            <p className="mt-2 text-2xl font-black text-amber-200 leading-none">{formatCurrency(totalNoSalesStockCost)}</p>
                        </div>
                        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4">
                            <p className="text-[11px] uppercase tracking-wide text-rose-200/80">Satılmayan Ürünlerin Toplam Adedi</p>
                            <p className="mt-2 text-2xl font-black text-rose-200 leading-none">{totalNoSalesQty}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 w-fit">
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                value={dates.start}
                                onChange={(e) => setDates((prev) => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-700" />
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                value={dates.end}
                                onChange={(e) => setDates((prev) => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5">
                            <span className="text-[11px] text-zinc-500 px-1">Sıralama</span>
                            <button
                                type="button"
                                onClick={() => setSortMode('stock_desc')}
                                className={
                                    sortMode === 'stock_desc'
                                        ? 'h-7 rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 text-xs font-semibold text-sky-200'
                                        : 'h-7 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-700'
                                }
                            >
                                Stok (Çoktan Az)
                            </button>
                            <button
                                type="button"
                                onClick={() => setSortMode('cost_desc')}
                                className={
                                    sortMode === 'cost_desc'
                                        ? 'h-7 rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 text-xs font-semibold text-sky-200'
                                        : 'h-7 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-700'
                                }
                            >
                                Toplam Alış Maliyeti (Çoktan Az)
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {noSalesProducts.length === 0 ? (
                        <p className="text-sm text-zinc-500 py-10 text-center">Bu aralıkta satışsız ürün bulunmuyor.</p>
                    ) : (
                        <div className="rounded-lg border border-white/5 overflow-hidden">
                            <div className="max-h-[70vh] overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10 text-zinc-400">
                                        <tr>
                                            <th className="px-3 py-2 text-left">#</th>
                                            <th className="px-3 py-2 text-left">Ürün</th>
                                            <th className="px-3 py-2 text-left">Marka</th>
                                            <th className="px-3 py-2 text-left">Stok Kodu</th>
                                            <th className="px-3 py-2 text-left">Barkod</th>
                                            <th className="px-3 py-2 text-right">Stok</th>
                                            <th className="px-3 py-2 text-right">Toplam Alış Maliyeti</th>
                                            <th className="px-3 py-2 text-right">Toplam Faiz Maliyeti</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/70">
                                        {noSalesProducts.map((row, index) => (
                                            <tr key={row.id} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2 min-w-[220px]">
                                                        <Link
                                                            href={`/urunler?duzenle=${row.id}`}
                                                            className="w-8 h-8 bg-zinc-900 rounded border border-white/5 flex items-center justify-center overflow-hidden shrink-0 hover:border-primary/40"
                                                            title="Ürünü düzenle"
                                                        >
                                                            {row.image ? (
                                                                <img src={row.image} className="w-full h-full object-contain p-1" alt={row.name} />
                                                            ) : (
                                                                <Package className="w-4 h-4 text-zinc-600" />
                                                            )}
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            onClick={() => openTransactions(row.id)}
                                                            className="font-semibold text-zinc-100 truncate hover:underline underline-offset-4 text-left"
                                                            title="Ürün hareketlerini göster"
                                                        >
                                                            {row.name}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-zinc-300">{row.brand || '-'}</td>
                                                <td className="px-3 py-2 text-zinc-300">{row.stockCode || '-'}</td>
                                                <td className="px-3 py-2 text-zinc-300">{row.barcode || '-'}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-rose-400">{row.stock}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-sky-300">{formatCurrency(row.totalBuyCost)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-amber-300">{formatCurrency(row.totalInterestCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

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
                                            <div key={t.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                                                <div>
                                                    <p className="text-sm font-medium text-white">
                                                        {t.type === 'IN' ? 'Giriş' : 'Çıkış'} • {t.quantity} adet
                                                    </p>
                                                    <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                                                    {t.channel ? <p className="text-xs text-zinc-500">{t.channel}</p> : null}
                                                </div>
                                                <span
                                                    className={cn(
                                                        'text-xs font-bold px-2 py-1 rounded-full',
                                                        t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                                                    )}
                                                >
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
        </div>
    );
}
