'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Calendar,
    Package,
    ArrowRight,
    Search,
    Layers,
    DollarSign,
    Target,
    AlertCircle
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const items = useStockStore((state) => state.items);

    // Current Year Start
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    // Individual Date States
    const [salesDates, setSalesDates] = useState({ start: yearStart, end: today });
    const [incomeDates, setIncomeDates] = useState({ start: yearStart, end: today });
    const [topProductsDates, setTopProductsDates] = useState({ start: yearStart, end: today });
    const [turnoverDates, setTurnoverDates] = useState({ start: yearStart, end: today });
    const [inventoryDate, setInventoryDate] = useState(today);

    // Helper: Curreny Formatter
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);
    };

    // Calculation: Period Sales
    const salesReport = useMemo(() => {
        const start = new Date(salesDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(salesDates.end);
        end.setHours(23, 59, 59, 999);

        let revenue = 0;
        let qty = 0;

        items.forEach(item => {
            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (t.type === 'OUT' && tDate >= start && tDate <= end) {
                    revenue += t.quantity * (Number(item.sellPrice) || 0);
                    qty += t.quantity;
                }
            });
        });
        return { revenue, qty };
    }, [items, salesDates]);

    // Calculation: Period Income (Stock Purchase)
    const incomeReport = useMemo(() => {
        const start = new Date(incomeDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(incomeDates.end);
        end.setHours(23, 59, 59, 999);

        let cost = 0;
        let qty = 0;

        items.forEach(item => {
            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (t.type === 'IN' && tDate >= start && tDate <= end) {
                    cost += t.quantity * (Number(item.buyPrice) || 0);
                    qty += t.quantity;
                }
            });
        });
        return { cost, qty };
    }, [items, incomeDates]);

    // Calculation: Inventory Status at Specific Date
    const inventoryAtDateReport = useMemo(() => {
        const targetDate = new Date(inventoryDate);
        targetDate.setHours(23, 59, 59, 999);

        let totalValue = 0;
        let totalQty = 0;
        let productCount = 0;

        items.forEach(item => {
            // Start with current quantity
            let qtyAtDate = Number(item.quantity) || 0;

            // Reverse all transactions that happened AFTER the target date
            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (tDate > targetDate) {
                    if (t.type === 'IN') {
                        qtyAtDate -= t.quantity;
                    } else {
                        qtyAtDate += t.quantity;
                    }
                }
            });

            if (qtyAtDate > 0) {
                totalValue += qtyAtDate * (Number(item.buyPrice) || 0);
                totalQty += qtyAtDate;
                productCount++;
            }
        });

        return { totalValue, totalQty, productCount };
    }, [items, inventoryDate]);

    // Calculation: Top Products
    const topProductsReport = useMemo(() => {
        const start = new Date(topProductsDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(topProductsDates.end);
        end.setHours(23, 59, 59, 999);

        const stats: Record<string, { name: string, qty: number, revenue: number, image?: string }> = {};

        items.forEach(item => {
            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (t.type === 'OUT' && tDate >= start && tDate <= end) {
                    if (!stats[item.id]) {
                        stats[item.id] = { name: item.name, qty: 0, revenue: 0, image: item.image };
                    }
                    stats[item.id].qty += t.quantity;
                    stats[item.id].revenue += t.quantity * (Number(item.sellPrice) || 0);
                }
            });
        });

        return Object.values(stats)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 8);
    }, [items, topProductsDates]);

    // Calculation: Stock Turnover Score
    const stockTurnoverReport = useMemo(() => {
        const start = new Date(turnoverDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(turnoverDates.end);
        end.setHours(23, 59, 59, 999);

        const stats = items.map(item => {
            let inQty = 0;
            let outQty = 0;

            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (tDate >= start && tDate <= end) {
                    if (t.type === 'IN') inQty += t.quantity;
                    if (t.type === 'OUT') outQty += t.quantity;
                }
            });

            // Start quantity = current - IN + OUT (within period)
            const currentQty = Number(item.quantity) || 0;
            const startQty = currentQty - inQty + outQty;
            const avgStock = Math.max(1, (startQty + currentQty) / 2);
            const turnoverRate = outQty / avgStock;
            const revenue = outQty * (Number(item.sellPrice) || 0);

            return {
                id: item.id,
                name: item.name,
                brand: item.brand,
                image: item.image,
                outQty,
                turnoverRate,
                revenue
            };
        }).filter(item => item.outQty > 0);

        if (stats.length === 0) return [];

        const maxOut = Math.max(...stats.map(s => s.outQty));
        const maxTurnover = Math.max(...stats.map(s => s.turnoverRate));
        const maxRaw = Math.max(...stats.map(s => (s.turnoverRate / (maxTurnover || 1)) * 0.7 + (s.outQty / (maxOut || 1)) * 0.3));

        return stats.map(s => {
            const turnoverScore = (s.turnoverRate / (maxTurnover || 1)) * 0.7 + (s.outQty / (maxOut || 1)) * 0.3;
            const score = Math.round((turnoverScore / (maxRaw || 1)) * 100);
            return {
                ...s,
                score
            };
        }).sort((a, b) => b.score - a.score).slice(0, 10);
    }, [items, turnoverDates]);

    const noSalesReport = useMemo(() => {
        const start = new Date(turnoverDates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(turnoverDates.end);
        end.setHours(23, 59, 59, 999);

        return items.filter(item => {
            const hasSales = item.transactions.some(t => {
                const tDate = new Date(t.date);
                return t.type === 'OUT' && tDate >= start && tDate <= end;
            });
            return !hasSales;
        }).slice(0, 6);
    }, [items, turnoverDates]);

    return (
        <div className="space-y-8 animate-enter pb-20">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Akıllı Raporlar</h1>
                <p className="text-zinc-500">İşletmenizin detaylı performans ve stok analizleri</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* 1. SALES REVENUE */}
                <Card className="bg-zinc-900/40 border-white/5 overflow-hidden">
                    <CardHeader className="pb-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Toplam Satış Cirosu</CardTitle>
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <TrendingUp className="w-4 h-4 text-green-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5">
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={salesDates.start}
                                onChange={(e) => setSalesDates(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-700" />
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={salesDates.end}
                                onChange={(e) => setSalesDates(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-white mb-1">{formatCurrency(salesReport.revenue)}</div>
                        <p className="text-xs text-zinc-500">Seçili dönemde toplam {salesReport.qty} adet çıkış yapıldı.</p>
                    </CardContent>
                </Card>

                {/* 2. STOCK PURCHASES */}
                <Card className="bg-zinc-900/40 border-white/5 overflow-hidden">
                    <CardHeader className="pb-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Stok Alımı (Maliyet)</CardTitle>
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Package className="w-4 h-4 text-blue-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5">
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={incomeDates.start}
                                onChange={(e) => setIncomeDates(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-700" />
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={incomeDates.end}
                                onChange={(e) => setIncomeDates(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-blue-400 mb-1">{formatCurrency(incomeReport.cost)}</div>
                        <p className="text-xs text-zinc-500">Seçili dönemde {incomeReport.qty} adet stok sisteme girildi.</p>
                    </CardContent>
                </Card>

                {/* 3. INVENTORY VALUE AT DATE */}
                <Card className="bg-zinc-900/40 border-white/5 overflow-hidden lg:col-span-1 md:col-span-2">
                    <CardHeader className="pb-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Tarihli Toplam Mal Mevcudu</CardTitle>
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <DollarSign className="w-4 h-4 text-amber-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-white/5">
                            <span className="text-[10px] text-zinc-500 pl-2">Durum Tarihi:</span>
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] flex-1 p-1 focus-visible:ring-0"
                                value={inventoryDate}
                                onChange={(e) => setInventoryDate(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-amber-500 mb-1">{formatCurrency(inventoryAtDateReport.totalValue)}</div>
                        <div className="flex items-center gap-4 mt-2">
                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase">Toplam Adet</p>
                                <p className="text-sm font-bold text-zinc-300">{inventoryAtDateReport.totalQty}</p>
                            </div>
                            <div className="w-px h-8 bg-white/5" />
                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase">Ürün Çeşidi</p>
                                <p className="text-sm font-bold text-zinc-300">{inventoryAtDateReport.productCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* TOP PRODUCTS SECTION */}
                <Card className="lg:col-span-2 border-white/5 bg-zinc-900/20">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-purple-500" />
                            <CardTitle className="text-lg">En Çok Satan Ürünler</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 self-start">
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={topProductsDates.start}
                                onChange={(e) => setTopProductsDates(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-700" />
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={topProductsDates.end}
                                onChange={(e) => setTopProductsDates(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {topProductsReport.length === 0 ? (
                                <p className="col-span-2 text-center py-10 text-zinc-600">Bu dönemde satış bulunmuyor.</p>
                            ) : (
                                topProductsReport.map((p, i) => (
                                    <div key={i} className="flex items-center gap-4 bg-zinc-950/50 p-3 rounded-xl border border-white/5 group hover:border-purple-500/30 transition-colors">
                                        <div className="text-2xl font-black text-white/10 group-hover:text-purple-500/20 transition-colors w-6">
                                            {i + 1}
                                        </div>
                                        <div className="w-12 h-12 bg-zinc-900 rounded-lg overflow-hidden border border-white/5 flex-shrink-0">
                                            {p.image ? (
                                                <img src={p.image} className="w-full h-full object-contain p-1" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                                    <Package className="w-5 h-5 text-zinc-600" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{p.name}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono">{formatCurrency(p.revenue)} Gelir</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-purple-500">{p.qty}</p>
                                            <p className="text-[8px] text-zinc-600 uppercase font-bold">Adet</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* BRAND DISTRIBUTION OR ADDITIONAL ANALYTICS */}
                <Card className="border-white/5 bg-zinc-900/20">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-blue-500" />
                            <CardTitle className="text-lg">Kategori Özeti</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-zinc-500">Kritik Stok Uyarıları</span>
                                <span className="text-red-500 font-bold">{items.filter(i => i.quantity <= 5 && i.quantity > 0).length} Ürün</span>
                            </div>
                            <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-zinc-500">Stoksuz Ürünler</span>
                                <span className="text-zinc-300 font-bold">{items.filter(i => i.quantity <= 0).length} Ürün</span>
                            </div>
                            <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-zinc-500">Aktif Satıştaki Ürünler</span>
                                <span className="text-green-500 font-bold">{items.filter(i => i.quantity > 0).length} Ürün</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Hızlı İstatistikler</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-zinc-950 rounded-lg border border-white/5">
                                    <p className="text-[10px] text-zinc-500 uppercase mb-1">En Pahalı Ürün</p>
                                    <p className="text-xs font-bold text-white truncate">
                                        {formatCurrency(Math.max(...items.map(i => i.sellPrice || 0), 0))}
                                    </p>
                                </div>
                                <div className="p-3 bg-zinc-950 rounded-lg border border-white/5">
                                    <p className="text-[10px] text-zinc-500 uppercase mb-1">Ortalama Alış</p>
                                    <p className="text-xs font-bold text-white truncate">
                                        {formatCurrency(items.reduce((acc, i) => acc + (i.buyPrice || 0), 0) / (items.length || 1))}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* STOCK TURNOVER SCORE */}
                <Card className="lg:col-span-2 border-white/5 bg-zinc-900/20">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-emerald-400" />
                            <CardTitle className="text-lg">Stok Devir Hızı Skoru</CardTitle>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/5 self-start">
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={turnoverDates.start}
                                onChange={(e) => setTurnoverDates(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <ArrowRight className="w-3 h-3 text-zinc-700" />
                            <Input
                                type="date"
                                className="bg-transparent border-0 h-7 text-[10px] w-28 p-1 focus-visible:ring-0"
                                value={turnoverDates.end}
                                onChange={(e) => setTurnoverDates(prev => ({ ...prev, end: e.target.value }))}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {stockTurnoverReport.length === 0 ? (
                            <p className="text-center py-10 text-zinc-600">Bu dönemde satış bulunmuyor.</p>
                        ) : (
                            <div className="space-y-3">
                                {stockTurnoverReport.map((item, i) => (
                                    <div key={item.id} className="flex items-center gap-4 bg-zinc-950/50 p-3 rounded-xl border border-white/5">
                                        <div className="text-2xl font-black text-white/10 w-6">{i + 1}</div>
                                        <div className="w-10 h-10 bg-zinc-900 rounded-lg overflow-hidden border border-white/5 flex-shrink-0">
                                            {item.image ? (
                                                <img src={item.image} className="w-full h-full object-contain p-1" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                                    <Package className="w-4 h-4 text-zinc-600" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{item.name}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono">
                                                Devir: {item.turnoverRate.toFixed(2)} | Çıkış: {item.outQty} | Ciro: {formatCurrency(item.revenue)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn(
                                                "text-lg font-black px-2 py-1 rounded-md",
                                                item.score >= 80 ? "text-emerald-400 bg-emerald-500/10" :
                                                    item.score >= 60 ? "text-amber-400 bg-amber-500/10" :
                                                        "text-zinc-400 bg-zinc-800"
                                            )}>
                                                {item.score}
                                            </div>
                                            <p className="text-[8px] text-zinc-600 uppercase font-bold mt-1">Puan</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* NO SALES ITEMS */}
                <Card className="border-white/5 bg-zinc-900/20">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <CardTitle className="text-lg">Satışsız Ürünler</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {noSalesReport.length === 0 ? (
                            <p className="text-zinc-500 text-sm">Bu dönemde satışsız ürün yok.</p>
                        ) : (
                            noSalesReport.map(item => (
                                <div key={item.id} className="flex items-center justify-between text-sm bg-zinc-950/50 p-2 rounded-md border border-white/5">
                                    <span className="truncate">{item.name}</span>
                                    <span className="text-zinc-500 font-mono">{item.quantity} adet</span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
