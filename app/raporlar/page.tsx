'use client';

import Link from 'next/link';
import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, ArrowRight, Package, DollarSign, Layers, Eye, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProductSalesStat = {
    id: string;
    name: string;
    brand?: string;
    image?: string;
    qty: number;
    revenue: number;
    stock: number;
};

type TurnoverStat = {
    id: string;
    name: string;
    brand?: string;
    outQty: number;
    turnoverRate: number;
    revenue: number;
    score: number;
};

type CategorySummary = {
    name: string;
    productCount: number;
    stockQty: number;
    stockValue: number;
};

type NoSalesStat = {
    id: string;
    name: string;
    brand?: string;
    image?: string;
    stock: number;
};

type FixedRow<T> = {
    key: string;
    value: T | null;
};

const createFixedRows = <T extends { id: string }>(rows: T[], minCount: number, keyPrefix: string): FixedRow<T>[] => {
    const filled = rows
        .slice(0, minCount)
        .map((value, index) => ({ key: value.id || `${keyPrefix}-${index}`, value }));

    if (filled.length >= minCount) return filled;

    const emptyRows = Array.from({ length: minCount - filled.length }, (_, i) => ({
        key: `${keyPrefix}-empty-${i}`,
        value: null,
    }));

    return [...filled, ...emptyRows];
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);

export default function ReportsPage() {
    const items = useStockStore((state) => state.items);

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    const [salesDates, setSalesDates] = useState({ start: yearStart, end: today });
    const [incomeDates, setIncomeDates] = useState({ start: yearStart, end: today });
    const [turnoverDates, setTurnoverDates] = useState({ start: yearStart, end: today });
    const [inventoryDate, setInventoryDate] = useState(today);

    const salesProductStats = useMemo<ProductSalesStat[]>(() => {
        const start = new Date(salesDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(salesDates.end);
        end.setHours(23, 59, 59, 999);

        return items
            .map((item) => {
                let qty = 0;
                let revenue = 0;
                item.transactions.forEach((t) => {
                    const tDate = new Date(t.date);
                    if (t.type === 'OUT' && tDate >= start && tDate <= end) {
                        const unit = Number(t.unitPrice) || Number(item.sellPrice) || 0;
                        const total = Number(t.totalPrice) || (unit * (Number(t.quantity) || 0));
                        qty += Number(t.quantity) || 0;
                        revenue += total;
                    }
                });
                return {
                    id: item.id,
                    name: item.name,
                    brand: item.brand,
                    image: item.image,
                    qty,
                    revenue,
                    stock: Number(item.quantity) || 0,
                };
            })
            .filter((s) => s.qty > 0);
    }, [items, salesDates]);

    const salesReport = useMemo(() => {
        const revenue = salesProductStats.reduce((acc, p) => acc + p.revenue, 0);
        const qty = salesProductStats.reduce((acc, p) => acc + p.qty, 0);
        return { revenue, qty };
    }, [salesProductStats]);

    const topSellingProducts = useMemo(
        () =>
            [...salesProductStats]
                .sort((a, b) => (b.qty - a.qty) || (b.revenue - a.revenue))
                .slice(0, 20),
        [salesProductStats]
    );

    const leastSellingProducts = useMemo(
        () =>
            [...salesProductStats]
                .sort((a, b) => (a.qty - b.qty) || (a.revenue - b.revenue))
                .slice(0, 20),
        [salesProductStats]
    );

    const topSellingRows = useMemo(() => createFixedRows(topSellingProducts, 20, 'top-selling'), [topSellingProducts]);
    const leastSellingRows = useMemo(() => createFixedRows(leastSellingProducts, 20, 'least-selling'), [leastSellingProducts]);

    const noSalesProducts = useMemo<NoSalesStat[]>(() => {
        const start = new Date(salesDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(salesDates.end);
        end.setHours(23, 59, 59, 999);

        return items
            .filter((item) => !item.transactions.some((t) => {
                const tDate = new Date(t.date);
                return t.type === 'OUT' && tDate >= start && tDate <= end;
            }))
            .map((item) => ({
                id: item.id,
                name: item.name,
                brand: item.brand,
                image: item.image,
                stock: Number(item.quantity) || 0,
            }))
            .sort((a, b) => (b.stock - a.stock) || a.name.localeCompare(b.name, 'tr-TR'));
    }, [items, salesDates]);

    const noSalesRows = useMemo(() => createFixedRows(noSalesProducts.slice(0, 20), 20, 'no-sales'), [noSalesProducts]);

    const incomeReport = useMemo(() => {
        const start = new Date(incomeDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(incomeDates.end);
        end.setHours(23, 59, 59, 999);

        let cost = 0;
        let qty = 0;
        items.forEach((item) => {
            item.transactions.forEach((t) => {
                const tDate = new Date(t.date);
                if (t.type === 'IN' && t.kind !== 'RETURN' && tDate >= start && tDate <= end) {
                    const transactionQty = Number(t.quantity) || 0;
                    qty += transactionQty;
                    cost += transactionQty * (Number(item.buyPrice) || 0);
                }
            });
        });
        return { cost, qty };
    }, [items, incomeDates]);

    const inventoryAtDateReport = useMemo(() => {
        const targetDate = new Date(inventoryDate);
        targetDate.setHours(23, 59, 59, 999);

        let totalValue = 0;
        let totalQty = 0;
        let productCount = 0;

        items.forEach((item) => {
            let qtyAtDate = Number(item.quantity) || 0;
            item.transactions.forEach((t) => {
                const tDate = new Date(t.date);
                if (tDate > targetDate) {
                    if (t.type === 'IN') qtyAtDate -= (Number(t.quantity) || 0);
                    else qtyAtDate += (Number(t.quantity) || 0);
                }
            });

            if (qtyAtDate > 0) {
                totalQty += qtyAtDate;
                totalValue += qtyAtDate * (Number(item.buyPrice) || 0);
                productCount += 1;
            }
        });

        return { totalValue, totalQty, productCount };
    }, [items, inventoryDate]);

    const stockTurnoverReport = useMemo<TurnoverStat[]>(() => {
        const start = new Date(turnoverDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(turnoverDates.end);
        end.setHours(23, 59, 59, 999);

        const stats = items.map((item) => {
            let inQty = 0;
            let outQty = 0;
            let revenue = 0;

            item.transactions.forEach((t) => {
                const tDate = new Date(t.date);
                if (tDate < start || tDate > end) return;
                const qty = Number(t.quantity) || 0;
                if (t.type === 'IN') inQty += qty;
                if (t.type === 'OUT') {
                    outQty += qty;
                    const unit = Number(t.unitPrice) || (Number(item.sellPrice) || 0);
                    const total = Number(t.totalPrice) || (unit * qty);
                    revenue += total;
                }
            });

            const currentQty = Number(item.quantity) || 0;
            const startQty = currentQty - inQty + outQty;
            const avgStock = Math.max(1, (startQty + currentQty) / 2);
            const turnoverRate = outQty / avgStock;

            return {
                id: item.id,
                name: item.name,
                brand: item.brand,
                outQty,
                turnoverRate,
                revenue,
                score: 0,
            };
        });

        if (stats.length === 0) return [];
        const maxOut = Math.max(...stats.map((s) => s.outQty), 1);
        const maxTurnover = Math.max(...stats.map((s) => s.turnoverRate), 1);
        const maxRaw = Math.max(
            ...stats.map((s) => ((s.turnoverRate / maxTurnover) * 0.7) + ((s.outQty / maxOut) * 0.3)),
            1
        );

        return stats
            .map((s) => {
                const raw = ((s.turnoverRate / maxTurnover) * 0.7) + ((s.outQty / maxOut) * 0.3);
                return { ...s, score: Math.round((raw / maxRaw) * 100) };
            })
            .sort((a, b) => b.score - a.score);
    }, [items, turnoverDates]);

    const turnoverRows = useMemo(() => stockTurnoverReport.slice(0, 30), [stockTurnoverReport]);
    const turnoverDisplayRows = useMemo(() => createFixedRows(turnoverRows, 30, 'turnover'), [turnoverRows]);

    const categorySummary = useMemo<CategorySummary[]>(() => {
        const map = new Map<string, CategorySummary>();
        items.forEach((item) => {
            const key = (item.brand || 'Markasız').trim() || 'Markasız';
            const existing = map.get(key) || {
                name: key,
                productCount: 0,
                stockQty: 0,
                stockValue: 0,
            };
            const qty = Number(item.quantity) || 0;
            const buyPrice = Number(item.buyPrice) || 0;
            existing.productCount += 1;
            existing.stockQty += qty;
            existing.stockValue += qty * buyPrice;
            map.set(key, existing);
        });

        return [...map.values()].sort((a, b) => b.stockQty - a.stockQty);
    }, [items]);

    const criticalStockCount = useMemo(() => items.filter((i) => i.quantity > 0 && i.quantity <= 5).length, [items]);
    const outOfStockCount = useMemo(() => items.filter((i) => i.quantity <= 0).length, [items]);
    const activeStockCount = useMemo(() => items.filter((i) => i.quantity > 0).length, [items]);

    return (
        <div className="space-y-8 animate-enter pb-16">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Akıllı Raporlar</h1>
                <p className="text-zinc-500">Satış ve stok raporları ayrı kategorilerde</p>
            </div>

            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03]">
                <div className="flex items-center gap-2 border-b border-emerald-500/15 px-5 py-4">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">Satış Raporları</h2>
                </div>
                <div className="space-y-5 p-5">
                    <Card className="border-white/5 bg-zinc-900/40 overflow-hidden">
                        <CardHeader className="pb-2 space-y-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Toplam Satış Cirosu</CardTitle>
                                <div className="p-2 bg-emerald-500/10 rounded-lg">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                </div>
                            </div>
                            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 w-fit">
                                <Input
                                    type="date"
                                    className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                    value={salesDates.start}
                                    onChange={(e) => setSalesDates((prev) => ({ ...prev, start: e.target.value }))}
                                />
                                <ArrowRight className="w-3 h-3 text-zinc-700" />
                                <Input
                                    type="date"
                                    className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                    value={salesDates.end}
                                    onChange={(e) => setSalesDates((prev) => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="text-3xl font-black text-white">{formatCurrency(salesReport.revenue)}</div>
                            <p className="text-xs text-zinc-500 mt-1">Seçili dönemde toplam {salesReport.qty} adet satış yapıldı.</p>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="border-white/5 bg-zinc-900/20">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-base">En Çok Satan Ürünler (İlk 20)</CardTitle>
                                    <Link
                                        href={`/raporlar/en-cok-satan?start=${salesDates.start}&end=${salesDates.end}`}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Tümünü Göster
                                    </Link>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[560px] overflow-y-auto space-y-2 pr-1">
                                    {topSellingRows.map((row, i) => (
                                        <div key={row.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-950/60 border border-white/5">
                                            <div className="w-6 text-xs font-bold text-zinc-500">{i + 1}</div>
                                            <div className="w-9 h-9 bg-zinc-900 rounded border border-white/5 flex items-center justify-center overflow-hidden">
                                                {row.value?.image ? (
                                                    <img src={row.value.image} className="w-full h-full object-contain p-1" alt={row.value.name} />
                                                ) : (
                                                    <Package className="w-4 h-4 text-zinc-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-sm truncate', row.value ? 'font-semibold text-white' : 'text-zinc-600')}>{row.value?.name || '-'}</p>
                                                <p className="text-[11px] text-zinc-500">{row.value?.brand || '-'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn('text-sm font-black', row.value ? 'text-emerald-400' : 'text-zinc-600')}>{row.value?.qty ?? '-'}</p>
                                                <p className="text-[10px] text-zinc-500">{row.value ? formatCurrency(row.value.revenue) : '-'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-white/5 bg-zinc-900/20">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-base">En Az Satan Ürünler (İlk 20)</CardTitle>
                                    <Link
                                        href={`/raporlar/en-az-satan?start=${salesDates.start}&end=${salesDates.end}`}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Tümünü Göster
                                    </Link>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[560px] overflow-y-auto space-y-2 pr-1">
                                    {leastSellingRows.map((row, i) => (
                                        <div key={row.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-950/60 border border-white/5">
                                            <div className="w-6 text-xs font-bold text-zinc-500">{i + 1}</div>
                                            <div className="w-9 h-9 bg-zinc-900 rounded border border-white/5 flex items-center justify-center overflow-hidden">
                                                {row.value?.image ? (
                                                    <img src={row.value.image} className="w-full h-full object-contain p-1" alt={row.value.name} />
                                                ) : (
                                                    <Package className="w-4 h-4 text-zinc-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-sm truncate', row.value ? 'font-semibold text-white' : 'text-zinc-600')}>{row.value?.name || '-'}</p>
                                                <p className="text-[11px] text-zinc-500">{row.value?.brand || '-'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn('text-sm font-black', row.value ? 'text-amber-400' : 'text-zinc-600')}>{row.value?.qty ?? '-'}</p>
                                                <p className="text-[10px] text-zinc-500">{row.value ? formatCurrency(row.value.revenue) : '-'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-white/5 bg-zinc-900/20">
                            <CardHeader className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        Satışsız Ürünler (İlk 20)
                                        <span className="inline-flex items-center rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                                            {noSalesProducts.length}
                                        </span>
                                    </CardTitle>
                                    <Link
                                        href={`/raporlar/satissiz-urunler?start=${salesDates.start}&end=${salesDates.end}`}
                                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white hover:border-white/20 transition-colors"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Tümünü Göster
                                    </Link>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[560px] overflow-y-auto space-y-2 pr-1">
                                    {noSalesRows.map((row, i) => (
                                        <div key={row.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-950/60 border border-white/5">
                                            <div className="w-6 text-xs font-bold text-zinc-500">{i + 1}</div>
                                            <div className="w-9 h-9 bg-zinc-900 rounded border border-white/5 flex items-center justify-center overflow-hidden">
                                                {row.value?.image ? (
                                                    <img src={row.value.image} className="w-full h-full object-contain p-1" alt={row.value.name} />
                                                ) : (
                                                    <Package className="w-4 h-4 text-zinc-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-sm truncate', row.value ? 'font-semibold text-white' : 'text-zinc-600')}>{row.value?.name || '-'}</p>
                                                <p className="text-[11px] text-zinc-500">{row.value?.brand || '-'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn('text-sm font-black', row.value ? 'text-rose-400' : 'text-zinc-600')}>{row.value?.stock ?? '-'}</p>
                                                <p className="text-[10px] text-zinc-500">Stok</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.03]">
                <div className="flex items-center justify-between gap-3 border-b border-sky-500/15 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-sky-400" />
                        <h2 className="text-lg font-bold text-white">Stok Raporları</h2>
                    </div>
                    <Link
                        href="/raporlar/stok-maliyeti"
                        className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/15 hover:border-sky-300/40 transition-colors"
                    >
                        <Calculator className="w-3.5 h-3.5" />
                        Büyük Stok Maliyeti
                    </Link>
                </div>
                <div className="space-y-5 p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="border-white/5 bg-zinc-900/35">
                            <CardHeader className="pb-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Stok Alımı (Maliyet)</CardTitle>
                                    <Package className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 w-fit">
                                    <Input
                                        type="date"
                                        className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                        value={incomeDates.start}
                                        onChange={(e) => setIncomeDates((prev) => ({ ...prev, start: e.target.value }))}
                                    />
                                    <ArrowRight className="w-3 h-3 text-zinc-700" />
                                    <Input
                                        type="date"
                                        className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                        value={incomeDates.end}
                                        onChange={(e) => setIncomeDates((prev) => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-black text-blue-400">{formatCurrency(incomeReport.cost)}</div>
                                <p className="text-xs text-zinc-500 mt-1">Seçili dönemde {incomeReport.qty} adet stok girişi yapıldı.</p>
                            </CardContent>
                        </Card>

                        <Card className="border-white/5 bg-zinc-900/35">
                            <CardHeader className="pb-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Tarihli Toplam Mal Mevcudu</CardTitle>
                                    <DollarSign className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-white/5 w-fit">
                                    <span className="text-[11px] text-zinc-500 pl-2">Tarih</span>
                                    <Input
                                        type="date"
                                        className="bg-transparent border-0 h-8 text-xs w-36 p-1 focus-visible:ring-0"
                                        value={inventoryDate}
                                        onChange={(e) => setInventoryDate(e.target.value)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="text-2xl font-black text-amber-400">{formatCurrency(inventoryAtDateReport.totalValue)}</div>
                                <p className="text-xs text-zinc-500 mt-1">
                                    {inventoryAtDateReport.totalQty} adet • {inventoryAtDateReport.productCount} ürün çeşidi
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2 border-white/5 bg-zinc-900/20">
                            <CardHeader className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                                        Stok Devir Hızı Skoru (İlk 30)
                                    </CardTitle>
                                </div>
                                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 w-fit">
                                    <Input
                                        type="date"
                                        className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                        value={turnoverDates.start}
                                        onChange={(e) => setTurnoverDates((prev) => ({ ...prev, start: e.target.value }))}
                                    />
                                    <ArrowRight className="w-3 h-3 text-zinc-700" />
                                    <Input
                                        type="date"
                                        className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                                        value={turnoverDates.end}
                                        onChange={(e) => setTurnoverDates((prev) => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="relative w-full overflow-auto max-h-[560px] rounded-lg border border-white/5">
                                    <table className="w-full text-xs text-left">
                                        <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
                                            <tr className="text-zinc-400 uppercase tracking-wide">
                                                <th className="px-3 py-2">#</th>
                                                <th className="px-3 py-2">Ürün</th>
                                                <th className="px-3 py-2 text-center">Çıkış</th>
                                                <th className="px-3 py-2 text-center">Devir</th>
                                                <th className="px-3 py-2 text-right">Ciro</th>
                                                <th className="px-3 py-2 text-right">Skor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/70">
                                            {turnoverDisplayRows.map((row, i) => (
                                                <tr key={row.key} className="hover:bg-zinc-900/50 transition-colors">
                                                    <td className="px-3 py-1 text-zinc-500 font-semibold">{i + 1}</td>
                                                    <td className="px-3 py-1">
                                                        <div className="min-w-0">
                                                            <p className={cn('truncate', row.value ? 'font-semibold text-zinc-100' : 'text-zinc-600')}>{row.value?.name || '-'}</p>
                                                            <p className="text-[10px] text-zinc-500 truncate">{row.value?.brand || '-'}</p>
                                                        </div>
                                                    </td>
                                                    <td className={cn('px-3 py-1 text-center', row.value ? 'text-zinc-300' : 'text-zinc-600')}>{row.value?.outQty ?? '-'}</td>
                                                    <td className={cn('px-3 py-1 text-center', row.value ? 'text-zinc-300' : 'text-zinc-600')}>
                                                        {row.value ? row.value.turnoverRate.toFixed(2) : '-'}
                                                    </td>
                                                    <td className={cn('px-3 py-1 text-right', row.value ? 'text-zinc-300' : 'text-zinc-600')}>
                                                        {row.value ? formatCurrency(row.value.revenue) : '-'}
                                                    </td>
                                                    <td className="px-3 py-1 text-right">
                                                        {row.value ? (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 font-bold',
                                                                    row.value.score >= 80
                                                                        ? 'text-emerald-400 bg-emerald-500/10'
                                                                        : row.value.score >= 60
                                                                            ? 'text-amber-400 bg-amber-500/10'
                                                                            : 'text-zinc-400 bg-zinc-800'
                                                                )}
                                                            >
                                                                {row.value.score}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 font-bold text-zinc-600 bg-zinc-900">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-white/5 bg-zinc-900/20">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-blue-400" />
                                    Kategori Özeti
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    <div className="flex items-center justify-between px-2 py-2 rounded bg-zinc-950/60 border border-white/5">
                                        <span className="text-zinc-500">Kritik Stok (1-5)</span>
                                        <span className="font-bold text-amber-400">{criticalStockCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between px-2 py-2 rounded bg-zinc-950/60 border border-white/5">
                                        <span className="text-zinc-500">Stoksuz Ürün</span>
                                        <span className="font-bold text-red-400">{outOfStockCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between px-2 py-2 rounded bg-zinc-950/60 border border-white/5">
                                        <span className="text-zinc-500">Aktif Stoklu Ürün</span>
                                        <span className="font-bold text-emerald-400">{activeStockCount}</span>
                                    </div>
                                </div>

                                <div className="rounded-lg border border-white/5 overflow-hidden">
                                    <table className="w-full text-[11px]">
                                        <thead className="bg-zinc-900 border-b border-zinc-800">
                                            <tr className="text-zinc-400">
                                                <th className="px-2 py-2 text-left">Kategori</th>
                                                <th className="px-2 py-2 text-center">Ürün</th>
                                                <th className="px-2 py-2 text-center">Stok</th>
                                            </tr>
                                        </thead>
                                    </table>
                                    <div className="max-h-[340px] overflow-y-auto">
                                        <table className="w-full text-[11px]">
                                            <tbody className="divide-y divide-zinc-800/70">
                                                {categorySummary.length === 0 ? (
                                                    <tr>
                                                        <td className="px-2 py-4 text-center text-zinc-500" colSpan={3}>
                                                            Kategori verisi yok.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    categorySummary.map((c) => (
                                                        <tr key={c.name}>
                                                            <td className="px-2 py-1.5 text-zinc-200 truncate">{c.name}</td>
                                                            <td className="px-2 py-1.5 text-center text-zinc-300">{c.productCount}</td>
                                                            <td className="px-2 py-1.5 text-center text-zinc-300">{c.stockQty}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>
        </div>
    );
}
