'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStockStore } from '@/lib/store';
import * as dbActions from '@/lib/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calculator, Package, Percent, RefreshCw } from 'lucide-react';

type CostLot = {
    qty: number;
    unitCost: number;
    date: Date;
};

type StockCostRow = {
    id: string;
    name: string;
    brand?: string;
    stockCode?: string;
    stockQty: number;
    purchaseCost: number;
    monthlyStockCost: number;
    stockCost: number;
    totalPurchaseCost: number;
    avgDaysHeld: number;
    oldestDate: string;
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);

const formatDate = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR');
};

const parseDateSafe = (value: string | undefined, fallback: Date) => {
    const d = new Date(value || '');
    return Number.isNaN(d.getTime()) ? fallback : d;
};

const parsePercentInput = (raw: string) => {
    const normalized = (raw || '').trim().replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, parsed);
};

const buildStockCostRows = (items: ReturnType<typeof useStockStore.getState>['items'], monthlyRate: number, now: Date): StockCostRow[] => {
    const rate = Math.max(0, Number(monthlyRate) || 0) / 100;

    const rows = items.map<StockCostRow | null>((item) => {
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
                lots.push({
                    qty: t.quantity,
                    unitCost,
                    date: tDate,
                });
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
        if (currentQty <= 0) return null;

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
        if (activeLots.length === 0) return null;

        let purchaseCost = 0;
        let stockCost = 0;
        let weightedDays = 0;
        let stockQty = 0;
        let oldestDate = activeLots[0].date;

        activeLots.forEach((lot) => {
            const lotQty = Math.max(0, lot.qty);
            const lotCost = lotQty * Math.max(0, lot.unitCost);
            const daysHeld = Math.max(0, (now.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24));
            const monthsHeld = daysHeld / 30;
            const lotInterest = lotCost * rate * monthsHeld;

            stockQty += lotQty;
            purchaseCost += lotCost;
            stockCost += lotInterest;
            weightedDays += daysHeld * lotQty;
            if (lot.date < oldestDate) oldestDate = lot.date;
        });

        const totalPurchaseCost = purchaseCost + stockCost;
        const monthlyStockCost = purchaseCost * rate;
        const avgDaysHeld = stockQty > 0 ? weightedDays / stockQty : 0;

        return {
            id: item.id,
            name: item.name,
            brand: item.brand,
            stockCode: item.stockCode,
            stockQty,
            purchaseCost,
            monthlyStockCost,
            stockCost,
            totalPurchaseCost,
            avgDaysHeld,
            oldestDate: oldestDate.toISOString(),
        };
    });

    return rows
        .filter((row): row is StockCostRow => row !== null)
        .sort((a, b) => b.totalPurchaseCost - a.totalPurchaseCost);
};

export default function StockCostReportPage() {
    const items = useStockStore((state) => state.items);
    const [monthlyRateInput, setMonthlyRateInput] = useState('0');
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [lastCalculatedAt, setLastCalculatedAt] = useState<string | null>(null);
    const [lastCalculatedRate, setLastCalculatedRate] = useState<number | null>(null);
    const [rows, setRows] = useState<StockCostRow[]>([]);
    const monthlyRate = useMemo(() => parsePercentInput(monthlyRateInput), [monthlyRateInput]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setSettingsLoading(true);
            const res = await dbActions.getCompanySettings();
            if (cancelled) return;

            if (res.success) {
                setMonthlyRateInput(String(Number(res.settings?.stockInterestMonthlyRate) || 0));
            }
            setSettingsLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const calculatedPreview = useMemo(() => buildStockCostRows(items, monthlyRate, new Date()), [items, monthlyRate]);
    const totals = useMemo(() => {
        return rows.reduce(
            (acc, row) => {
                acc.monthly += row.monthlyStockCost;
                acc.stockCost += row.stockCost;
                acc.purchase += row.purchaseCost;
                acc.totalPurchase += row.totalPurchaseCost;
                acc.qty += row.stockQty;
                return acc;
            },
            { monthly: 0, stockCost: 0, purchase: 0, totalPurchase: 0, qty: 0 }
        );
    }, [rows]);

    const handleCalculate = () => {
        const nextRows = buildStockCostRows(items, monthlyRate, new Date());
        setRows(nextRows);
        setLastCalculatedRate(monthlyRate);
        setLastCalculatedAt(new Date().toISOString());
    };

    return (
        <div className="space-y-6 animate-enter pb-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Calculator className="w-7 h-7 text-sky-400" />
                        Büyük Stok Maliyeti
                    </h1>
                    <p className="text-zinc-500">Stokta bekleyen ürünlerin alış + finansman maliyet analizi</p>
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
                    <CardTitle className="text-base flex items-center gap-2">
                        <Percent className="w-4 h-4 text-amber-400" />
                        Hesap Parametreleri
                    </CardTitle>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-300 font-medium">Aylık Faiz Maliyeti (%)</label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={monthlyRateInput}
                                onChange={(e) => setMonthlyRateInput(e.target.value)}
                                placeholder="Örn: 4.50"
                            />
                            <p className="text-xs text-zinc-500">
                                Bu oran <Link href="/ayarlar" className="underline hover:text-zinc-300">Ayarlar</Link> ekranından da güncellenebilir.
                            </p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-zinc-950/60 p-3 text-xs text-zinc-400 space-y-1">
                            <p className="font-semibold text-zinc-300">Kullanılan Matematik</p>
                            <p>`Kalan Alış Maliyeti = (Stok Girişleri - Satışlar[FIFO]) x Alış Birim Maliyeti`</p>
                            <p>`Bir Aylık Stok Maliyeti = Kalan Alış Maliyeti x (Aylık Faiz / 100)`</p>
                            <p>`Toplam Stok Maliyeti = Kalan Alış Maliyeti x (Aylık Faiz / 100) x (Bekleme Günü / 30)`</p>
                            <p>`Toplam Maliyet = Alış Maliyeti + Toplam Stok Maliyeti`</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2" onClick={handleCalculate} disabled={settingsLoading}>
                            <RefreshCw className="w-4 h-4" />
                            Stok Maliyeti Hesapla
                        </Button>
                        <span className="text-xs text-zinc-500">
                            {settingsLoading
                                ? 'Ayarlar yükleniyor...'
                                : `${calculatedPreview.length} stoklu ürün analiz için hazır`}
                        </span>
                    </div>
                    {lastCalculatedAt ? (
                        <p className="text-xs text-zinc-500">
                            Son hesaplama: {formatDate(lastCalculatedAt)} • Faiz: %{Number(lastCalculatedRate || 0).toFixed(2)}
                        </p>
                    ) : null}
                </CardHeader>
            </Card>

            <div className="grid gap-4 md:grid-cols-5">
                <Card className="border-white/5 bg-zinc-900/25">
                    <CardContent className="pt-6">
                        <p className="text-xs text-zinc-500">Toplam Aylık Stok Maliyeti</p>
                        <p className="text-xl font-black text-zinc-100 mt-1">{formatCurrency(totals.monthly)}</p>
                    </CardContent>
                </Card>
                <Card className="border-white/5 bg-zinc-900/25">
                    <CardContent className="pt-6">
                        <p className="text-xs text-zinc-500">Toplam Stok Maliyeti</p>
                        <p className="text-xl font-black text-sky-400 mt-1">{formatCurrency(totals.stockCost)}</p>
                    </CardContent>
                </Card>
                <Card className="border-white/5 bg-zinc-900/25">
                    <CardContent className="pt-6">
                        <p className="text-xs text-zinc-500">Toplam Alış Maliyeti</p>
                        <p className="text-xl font-black text-violet-300 mt-1">{formatCurrency(totals.purchase)}</p>
                    </CardContent>
                </Card>
                <Card className="border-white/5 bg-zinc-900/25">
                    <CardContent className="pt-6">
                        <p className="text-xs text-zinc-500">Toplam Maliyet</p>
                        <p className="text-xl font-black text-amber-400 mt-1">{formatCurrency(totals.totalPurchase)}</p>
                    </CardContent>
                </Card>
                <Card className="border-white/5 bg-zinc-900/25">
                    <CardContent className="pt-6">
                        <p className="text-xs text-zinc-500">Toplam Stok Adedi</p>
                        <p className="text-xl font-black text-emerald-400 mt-1">{totals.qty}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-white/5 bg-zinc-900/20">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Package className="w-4 h-4 text-sky-400" />
                        Ürün Bazlı Stok Maliyeti (En Yüksekten Düşüğe)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {rows.length === 0 ? (
                        <p className="text-sm text-zinc-500 py-10 text-center">Sonuç görmek için <strong>Stok Maliyeti Hesapla</strong> butonuna basın.</p>
                    ) : (
                        <div className="rounded-lg border border-white/5 overflow-hidden">
                            <div className="max-h-[70vh] overflow-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
                                        <tr className="text-zinc-400 uppercase tracking-wide">
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Ürün</th>
                                            <th className="px-3 py-2 text-center">Stok</th>
                                            <th className="px-3 py-2 text-right">Bir Aylık Stok Maliyeti</th>
                                            <th className="px-3 py-2 text-right">Alış Maliyeti</th>
                                            <th className="px-3 py-2 text-right">Toplam Stok Maliyeti</th>
                                            <th className="px-3 py-2 text-right">Toplam Maliyet</th>
                                            <th className="px-3 py-2 text-center">Ort. Gün</th>
                                            <th className="px-3 py-2 text-center">En Eski Giriş</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/70">
                                        {rows.map((row, index) => (
                                            <tr key={row.id} className="hover:bg-zinc-900/50 transition-colors">
                                                <td className="px-3 py-1.5 text-zinc-500 font-semibold">{index + 1}</td>
                                                <td className="px-3 py-1.5 min-w-[220px]">
                                                    <p className="font-semibold text-zinc-100 truncate">{row.name}</p>
                                                    <p className="text-[10px] text-zinc-500 truncate">{row.brand || '-'} • {row.stockCode || '-'}</p>
                                                </td>
                                                <td className="px-3 py-1.5 text-center text-zinc-300">{row.stockQty}</td>
                                                <td className="px-3 py-1.5 text-right text-violet-300">{formatCurrency(row.monthlyStockCost)}</td>
                                                <td className="px-3 py-1.5 text-right text-zinc-300">{formatCurrency(row.purchaseCost)}</td>
                                                <td className="px-3 py-1.5 text-right text-sky-300">{formatCurrency(row.stockCost)}</td>
                                                <td className="px-3 py-1.5 text-right font-bold text-amber-300">{formatCurrency(row.totalPurchaseCost)}</td>
                                                <td className="px-3 py-1.5 text-center text-zinc-300">{row.avgDaysHeld.toFixed(0)}</td>
                                                <td className="px-3 py-1.5 text-center text-zinc-300">{formatDate(row.oldestDate)}</td>
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
