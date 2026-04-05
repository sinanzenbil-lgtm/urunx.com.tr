'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Package, TrendingUp } from 'lucide-react';
import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type SalesRow = {
    id: string;
    name: string;
    brand?: string;
    stockCode?: string;
    barcode: string;
    image?: string;
    qty: number;
    revenue: number;
    stock: number;
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);

export default function TopSellingProductsPage() {
    const items = useStockStore((state) => state.items);
    const searchParams = useSearchParams();

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    const [dates, setDates] = useState({
        start: searchParams.get('start') || yearStart,
        end: searchParams.get('end') || today,
    });

    const rows = useMemo<SalesRow[]>(() => {
        const start = new Date(dates.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dates.end);
        end.setHours(23, 59, 59, 999);

        return items
            .map((item) => {
                let qty = 0;
                let revenue = 0;

                item.transactions.forEach((t) => {
                    const tDate = new Date(t.date);
                    if (t.type !== 'OUT' || tDate < start || tDate > end) return;
                    const transactionQty = Number(t.quantity) || 0;
                    const unit = Number(t.unitPrice) || (Number(item.sellPrice) || 0);
                    const total = Number(t.totalPrice) || (unit * transactionQty);
                    qty += transactionQty;
                    revenue += total;
                });

                return {
                    id: item.id,
                    name: item.name,
                    brand: item.brand,
                    stockCode: item.stockCode,
                    barcode: item.barcode,
                    image: item.image,
                    qty,
                    revenue,
                    stock: Number(item.quantity) || 0,
                };
            })
            .filter((row) => row.qty > 0)
            .sort((a, b) => (b.qty - a.qty) || (b.revenue - a.revenue));
    }, [items, dates]);

    return (
        <div className="space-y-6 animate-enter pb-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">En Çok Satan Ürünler</h1>
                    <p className="text-zinc-500">Seçilen tarihte satış adedine göre tüm liste</p>
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
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            Tüm En Çok Satan Ürünler
                        </CardTitle>
                        <span className="text-sm font-bold text-emerald-400">{rows.length} ürün</span>
                    </div>
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
                </CardHeader>
                <CardContent>
                    {rows.length === 0 ? (
                        <p className="text-sm text-zinc-500 py-10 text-center">Bu aralıkta satış verisi bulunmuyor.</p>
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
                                            <th className="px-3 py-2 text-right">Satış Adedi</th>
                                            <th className="px-3 py-2 text-right">Ciro</th>
                                            <th className="px-3 py-2 text-right">Kalan Stok</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/70">
                                        {rows.map((row, index) => (
                                            <tr key={row.id} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2 min-w-[220px]">
                                                        <div className="w-8 h-8 bg-zinc-900 rounded border border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                                                            {row.image ? (
                                                                <img src={row.image} className="w-full h-full object-contain p-1" alt={row.name} />
                                                            ) : (
                                                                <Package className="w-4 h-4 text-zinc-600" />
                                                            )}
                                                        </div>
                                                        <span className="font-semibold text-zinc-100 truncate">{row.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-zinc-300">{row.brand || '-'}</td>
                                                <td className="px-3 py-2 text-zinc-300">{row.stockCode || '-'}</td>
                                                <td className="px-3 py-2 text-zinc-300">{row.barcode || '-'}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-emerald-400">{row.qty}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-sky-300">{formatCurrency(row.revenue)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-zinc-200">{row.stock}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
