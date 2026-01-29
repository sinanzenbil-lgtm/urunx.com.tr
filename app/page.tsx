'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export default function Home() {
  const items = useStockStore((state) => state.items);
  const [mounted, setMounted] = useState(false);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().split('T')[0];
  const [salesDates, setSalesDates] = useState({ start: yearStart, end: today });

  // Hydration fix for persistent store
  useEffect(() => {
    setMounted(true);
  }, []);

  const totalItems = items.length;
  const totalQuantity = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const totalValue = items.reduce((acc, item) => acc + ((Number(item.buyPrice) || 0) * (Number(item.quantity) || 0)), 0);
  const potentialValue = items.reduce((acc, item) => acc + ((Number(item.sellPrice) || 0) * (Number(item.quantity) || 0)), 0);

  // Get recent transactions (flattened)
  const recentTransactions = items
    .flatMap(item => item.transactions.map(t => ({ ...t, itemName: item.name, itemImage: item.image })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // Brand-based summary calculation
  const brandSummaries = Object.values(
    items.reduce((acc, item) => {
      const brand = item.brand || 'Markasız';
      if (!acc[brand]) {
        acc[brand] = {
          name: brand,
          productCount: 0,
          totalQuantity: 0,
          totalBuyValue: 0,
          totalSellValue: 0,
        };
      }
      acc[brand].productCount += 1;
      acc[brand].totalQuantity += Number(item.quantity) || 0;
      acc[brand].totalBuyValue += (Number(item.buyPrice) || 0) * (Number(item.quantity) || 0);
      acc[brand].totalSellValue += (Number(item.sellPrice) || 0) * (Number(item.quantity) || 0);
      return acc;
    }, {} as Record<string, any>)
  ).sort((a, b) => b.productCount - a.productCount);

  const salesSummary = useMemo(() => {
    const start = new Date(salesDates.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(salesDates.end);
    end.setHours(23, 59, 59, 999);

    const totals = {
      Pazaryeri: { buyTotal: 0, sellTotal: 0 },
      Perakende: { buyTotal: 0, sellTotal: 0 },
      Toptan: { buyTotal: 0, sellTotal: 0 },
    };

    items.forEach((item) => {
      item.transactions.forEach((t) => {
        const tDate = new Date(t.date);
        if (t.type === 'OUT' && tDate >= start && tDate <= end) {
          const channel = (t.channel as keyof typeof totals) || 'Perakende';
          if (channel in totals) {
            totals[channel].buyTotal += t.quantity * (Number(item.buyPrice) || 0);
            totals[channel].sellTotal += t.quantity * (Number(item.sellPrice) || 0);
          }
        }
      });
    });

    return totals;
  }, [items, salesDates]);

  const recentSales = useMemo(() => {
    return items
      .flatMap(item =>
        item.transactions
          .filter(t => t.type === 'OUT')
          .map(t => ({
            ...t,
            itemName: item.name,
            channel: t.channel || 'Perakende',
          }))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [items]);

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Özet Paneli</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Ürün Çeşidi</CardTitle>
            <Package className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-zinc-500">Stokta kayıtlı barkod sayısı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Stok Adedi</CardTitle>
            <AlertCircle className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalQuantity}</div>
            <p className="text-xs text-zinc-500">Raflardaki toplam ürün</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Alış Değeri</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalValue)}
            </div>
            <p className="text-xs text-zinc-500">Maliyet bazlı toplam değer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potansiyel Ciro</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(potentialValue)}
            </div>
            <p className="text-xs text-zinc-500">Satış fiyatı bazlı değer</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Recent Transactions */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Son Hareketler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTransactions.length === 0 ? (
                <p className="text-sm text-zinc-500">Henüz bir hareket yok.</p>
              ) : (
                recentTransactions.map((t, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-white/5 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${t.type === 'IN' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm font-medium leading-none">{t.itemName}</p>
                        <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                      </div>
                    </div>
                    <div className={`font-bold ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                      {t.type === 'IN' ? '+' : '-'}{t.quantity}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Brand Summary Table */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Marka Bazlı Stok Özeti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto max-h-[400px]">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-900 sticky top-0 z-10 text-xs uppercase text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Marka</th>
                    <th className="px-4 py-3 text-center">Çeşit</th>
                    <th className="px-4 py-3 text-center">Adet</th>
                    <th className="px-4 py-3 text-right">Maliyet (TL)</th>
                    <th className="px-4 py-3 text-right rounded-tr-lg">Potansiyel Satış (TL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {brandSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        Henüz data bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    brandSummaries.map((brand) => (
                      <tr key={brand.name} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{brand.name}</td>
                        <td className="px-4 py-3 text-center text-zinc-400">{brand.productCount}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 rounded-full bg-zinc-800 text-zinc-300 font-bold border border-zinc-700">
                            {brand.totalQuantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-400">
                          {new Intl.NumberFormat('tr-TR').format(brand.totalBuyValue)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-zinc-200">
                          {new Intl.NumberFormat('tr-TR').format(brand.totalSellValue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Toplam Satışlar</CardTitle>
              <p className="text-xs text-zinc-500">Seçili tarih aralığında kanal bazlı alış/satış tutarları</p>
            </div>
            <div className="flex items-center gap-2 bg-zinc-950/60 p-2 rounded-lg border border-white/5">
              <Input
                type="date"
                className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                value={salesDates.start}
                onChange={(e) => setSalesDates((prev) => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-xs text-zinc-600">→</span>
              <Input
                type="date"
                className="bg-transparent border-0 h-8 text-xs w-32 p-1 focus-visible:ring-0"
                value={salesDates.end}
                onChange={(e) => setSalesDates((prev) => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {(['Pazaryeri', 'Perakende', 'Toptan'] as const).map((channel) => (
                <div key={channel} className="bg-zinc-900/50 border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{channel} Satış</p>
                  <p className="text-sm text-zinc-400 mt-2">Alış Tutarı</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(salesSummary[channel].buyTotal)}
                  </p>
                  <p className="text-sm text-zinc-400 mt-2">Satış Tutarı</p>
                  <p className="text-lg font-bold text-blue-400">
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(salesSummary[channel].sellTotal)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-zinc-900/70 border border-white/10 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Toplam Satış (3 Kanal)</p>
                <p className="text-xs text-zinc-500">Alış + Satış toplamları</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-400">Alış Toplamı</p>
                <p className="text-xl font-bold text-emerald-400">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                    salesSummary.Pazaryeri.buyTotal + salesSummary.Perakende.buyTotal + salesSummary.Toptan.buyTotal
                  )}
                </p>
                <p className="text-sm text-zinc-400 mt-1">Satış Toplamı</p>
                <p className="text-xl font-bold text-blue-400">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                    salesSummary.Pazaryeri.sellTotal + salesSummary.Perakende.sellTotal + salesSummary.Toptan.sellTotal
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Son Satışlar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.length === 0 ? (
                <p className="text-sm text-zinc-500">Henüz satış yok.</p>
              ) : (
                recentSales.map((t, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-white/5 last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="text-sm font-medium leading-none">{t.itemName}</p>
                      <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                      <p className="text-xs text-zinc-500">{t.channel}</p>
                    </div>
                    <div className="font-bold text-red-500">-{t.quantity}</div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
