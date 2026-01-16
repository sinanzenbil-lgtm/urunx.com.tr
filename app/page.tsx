'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, TrendingDown, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const items = useStockStore((state) => state.items);
  const [mounted, setMounted] = useState(false);

  // Hydration fix for persistent store
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

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
    </div>
  );
}
