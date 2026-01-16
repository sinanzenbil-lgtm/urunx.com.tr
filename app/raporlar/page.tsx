'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Calendar,
    Download,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Package
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const items = useStockStore((state) => state.items);

    // Date filter state
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    // Processed Data
    const reportData = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let totalSalesCount = 0;
        let totalSalesRevenue = 0;
        let totalSalesCost = 0;
        let totalSalesProfit = 0;

        let totalIncomeCount = 0;
        let totalIncomeValue = 0;

        const productSales: Record<string, {
            name: string,
            barcode: string,
            qty: number,
            revenue: number,
            profit: number,
            image?: string
        }> = {};

        const dailyStats: Record<string, { sales: number, profit: number }> = {};

        items.forEach(item => {
            item.transactions.forEach(t => {
                const tDate = new Date(t.date);
                if (tDate >= start && tDate <= end) {
                    const dateStr = tDate.toLocaleDateString('tr-TR');
                    if (!dailyStats[dateStr]) dailyStats[dateStr] = { sales: 0, profit: 0 };

                    if (t.type === 'OUT') {
                        const revenue = t.quantity * (Number(item.sellPrice) || 0);
                        const cost = t.quantity * (Number(item.buyPrice) || 0);
                        const profit = revenue - cost;

                        totalSalesCount += t.quantity;
                        totalSalesRevenue += revenue;
                        totalSalesCost += cost;
                        totalSalesProfit += profit;

                        dailyStats[dateStr].sales += revenue;
                        dailyStats[dateStr].profit += profit;

                        if (!productSales[item.id]) {
                            productSales[item.id] = {
                                name: item.name,
                                barcode: item.barcode,
                                qty: 0,
                                revenue: 0,
                                profit: 0,
                                image: item.image
                            };
                        }
                        productSales[item.id].qty += t.quantity;
                        productSales[item.id].revenue += revenue;
                        productSales[item.id].profit += profit;
                    } else {
                        totalIncomeCount += t.quantity;
                        totalIncomeValue += t.quantity * (Number(item.buyPrice) || 0);
                    }
                }
            });
        });

        const topProducts = Object.values(productSales)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10);

        return {
            summary: {
                revenue: totalSalesRevenue,
                cost: totalSalesCost,
                profit: totalSalesProfit,
                qty: totalSalesCount,
                incomeQty: totalIncomeCount,
                incomeValue: totalIncomeValue
            },
            topProducts,
            dailyStats: Object.entries(dailyStats).sort((a, b) =>
                new Date(a[0].split('.').reverse().join('-')).getTime() -
                new Date(b[0].split('.').reverse().join('-')).getTime()
            )
        };
    }, [items, startDate, endDate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Raporlar ve Analiz</h1>
                    <p className="text-zinc-500">Seçili tarih aralığına göre performans verileri</p>
                </div>

                <div className="flex bg-zinc-900/50 p-2 rounded-xl border border-white/5 gap-2 items-center">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-zinc-500" />
                        <Input
                            type="date"
                            className="bg-transparent border-0 h-8 w-36 focus-visible:ring-0 p-1"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <span className="text-zinc-700">|</span>
                    <Input
                        type="date"
                        className="bg-transparent border-0 h-8 w-36 focus-visible:ring-0 p-1"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Toplam Satış Cirosu</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{formatCurrency(reportData.summary.revenue)}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-green-500">
                            <TrendingUp className="w-3 h-3" />
                            <span>{reportData.summary.qty} adet ürün satıldı</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Elde Edilen Kar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{formatCurrency(reportData.summary.profit)}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                            <span>Kar marjı: %{reportData.summary.revenue > 0 ? ((reportData.summary.profit / reportData.summary.revenue) * 100).toFixed(1) : 0}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Stok Alımı (Giriş)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">{formatCurrency(reportData.summary.incomeValue)}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-blue-400">
                            <span>{reportData.summary.incomeQty} adet giriş yapıldı</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Ortalama Sepet</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-500">
                            {formatCurrency(reportData.summary.qty > 0 ? reportData.summary.revenue / reportData.summary.qty : 0)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">Ürün başına ortalama gelir</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Top Selling Products */}
                <Card className="border-white/5">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">En Çok Satan Ürünler</CardTitle>
                        <Package className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {reportData.topProducts.length === 0 ? (
                                <p className="text-center py-8 text-zinc-500">Bu tarih aralığında satış bulunmuyor.</p>
                            ) : (
                                reportData.topProducts.map((p, i) => (
                                    <div key={p.barcode} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center overflow-hidden">
                                                {p.image ? <img src={p.image} className="w-full h-full object-contain" /> : <Package className="w-5 h-5 text-zinc-700" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white line-clamp-1">{p.name}</p>
                                                <p className="text-xs text-zinc-500">{p.barcode}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-white">{p.qty} Adet</p>
                                            <p className="text-xs text-green-500">+{formatCurrency(p.profit)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Daily Trend Chart (Simple CSS Bar Chart) */}
                <Card className="border-white/5">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Günlük Satış Trendi</CardTitle>
                        <TrendingUp className="w-4 h-4 text-zinc-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 flex items-end gap-2 pt-8">
                            {reportData.dailyStats.length === 0 ? (
                                <p className="w-full text-center text-zinc-500 self-center">Veri bulunamadı.</p>
                            ) : (
                                reportData.dailyStats.slice(-15).map(([date, stats], i) => {
                                    const maxVal = Math.max(...reportData.dailyStats.map(s => s[1].sales), 1);
                                    const height = (stats.sales / maxVal) * 100;
                                    return (
                                        <div key={date} className="flex-1 flex flex-col items-center gap-2 group relative">
                                            <div
                                                className="w-full bg-primary/20 hover:bg-primary/40 rounded-t transition-all cursor-help relative"
                                                style={{ height: `${Math.max(height, 5)}%` }}
                                            >
                                                {/* Tooltip */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                                                    <div className="bg-zinc-900 border border-zinc-800 text-[10px] p-2 rounded shadow-xl whitespace-nowrap">
                                                        <div className="font-bold text-white">{date}</div>
                                                        <div className="text-zinc-400">Satış: {formatCurrency(stats.sales)}</div>
                                                        <div className="text-green-500">Kar: {formatCurrency(stats.profit)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-[8px] text-zinc-600 rotate-45 mt-2 origin-left truncate w-8">
                                                {date.split('.')[0] + '.' + date.split('.')[1]}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
