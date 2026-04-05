'use client';

import Link from 'next/link';
import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type BrandSummary = {
  name: string;
  productCount: number;
  totalQuantity: number;
  totalBuyValue: number;
  totalSellValue: number;
};

export default function Home() {
  const items = useStockStore((state) => state.items);
  const dbSyncStatus = useStockStore((state) => state.dbSyncStatus);
  const [movementItemId, setMovementItemId] = useState<string | null>(null);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().split('T')[0];
  const [salesDates, setSalesDates] = useState({ start: yearStart, end: today });

  const totalItems = items.length;
  const totalQuantity = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  // Calculate total buy value (Cost * Quantity)
  const totalValue = items.reduce((acc, item) => {
    const price = Number(item.buyPrice) || 0;
    const qty = Number(item.quantity) || 0;
    return acc + (price * qty);
  }, 0);

  // Calculate potential sell value (Sell Price * Quantity)
  const potentialValue = items.reduce((acc, item) => {
    const price = Number(item.sellPrice) || 0;
    const qty = Number(item.quantity) || 0;
    return acc + (price * qty);
  }, 0);

  const toDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const capitalizeTr = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);

  // Flatten recent transactions for dashboard cards
  const recentTransactions = useMemo(
    () =>
      items
        .flatMap((item) =>
          item.transactions.map((t) => ({
            ...t,
            itemId: item.id,
            itemName: item.name,
            itemImage: item.image,
          }))
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [items]
  );

  const groupedRecentTransactions = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const daySlots = [0, 1, 2].map((offset) => {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - offset);
      return {
        key: toDayKey(d),
        date: d,
        relative: offset === 0 ? 'bugün' : offset === 1 ? 'dün' : 'evvel gün',
      };
    });

    const groups = daySlots.reduce((acc, slot) => {
      acc[slot.key] = [];
      return acc;
    }, {} as Record<string, typeof recentTransactions>);

    recentTransactions.forEach((t) => {
      const key = toDayKey(new Date(t.date));
      if (groups[key]) groups[key].push(t);
    });

    return daySlots
      .map((slot) => {
        const weekday = capitalizeTr(slot.date.toLocaleDateString('tr-TR', { weekday: 'long' }));
        return {
          key: slot.key,
          title: `${weekday} (${slot.relative})`,
          items: groups[slot.key] || [],
        };
      })
      .filter((g) => g.items.length > 0);
  }, [recentTransactions]);

  const movementItem = useMemo(() => {
    if (!movementItemId) return null;
    return items.find((i) => i.id === movementItemId) || null;
  }, [items, movementItemId]);

  const movementRows = useMemo(() => {
    if (!movementItem) return [];
    return [...movementItem.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movementItem]);

  // Brand-based summary calculation
  const brandSummaries = Object.values(
    items.reduce<Record<string, BrandSummary>>((acc, item) => {
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
    }, {})
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
            const unit = Number(t.unitPrice) || Number(item.sellPrice) || 0;
            const total = Number(t.totalPrice) || (unit * (Number(t.quantity) || 0));
            totals[channel].sellTotal += total;
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

  const totalSalesBuy =
    salesSummary.Pazaryeri.buyTotal + salesSummary.Perakende.buyTotal + salesSummary.Toptan.buyTotal;
  const totalSalesSell =
    salesSummary.Pazaryeri.sellTotal + salesSummary.Perakende.sellTotal + salesSummary.Toptan.sellTotal;

  // Avoid showing stale localStorage numbers before DB sync finishes.
  if (dbSyncStatus !== 'synced') {
    return (
      <div className="space-y-6 animate-enter">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Özet Paneli</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-32 bg-zinc-800/70 rounded animate-pulse" />
                <div className="h-4 w-4 bg-zinc-800/70 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-zinc-800/70 rounded animate-pulse" />
                <div className="mt-2 h-3 w-40 bg-zinc-800/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-sm text-zinc-500">
          Veriler eşitleniyor{dbSyncStatus === 'error' ? ' (hata oluştu)' : '...'}
        </p>
      </div>
    );
  }

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
            <p className="text-xs text-zinc-500">Toptan satış fiyatı bazlı değer</p>
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
            <div className="max-h-[440px] overflow-y-auto pr-1 space-y-4">
              {groupedRecentTransactions.length === 0 ? (
                <p className="text-sm text-zinc-500">Son 3 günde hareket yok.</p>
              ) : (
                groupedRecentTransactions.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 sticky top-0 bg-zinc-900/80 backdrop-blur py-1 px-1 rounded">
                      {group.title}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((t) => (
                        <div key={`${t.itemId}-${t.id}`} className="flex items-center justify-between border-b border-white/5 last:border-0 pb-2 last:pb-0">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${t.type === 'IN' ? 'bg-green-500' : 'bg-red-500'}`} />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => setMovementItemId(t.itemId)}
                                className="text-sm font-medium leading-none text-left text-white hover:underline underline-offset-4 line-clamp-1"
                              >
                                {t.itemName}
                              </button>
                              <p className="text-[11px] text-zinc-500 mt-1">
                                {new Date(t.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                {t.channel ? ` • ${t.channel}` : ''}
                                {t.channel === 'Toptan' && (t.customerName || t.customerCode)
                                  ? ` • ${t.customerName || t.customerCode}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <div className={`font-bold text-sm ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                            {t.type === 'IN' ? '+' : '-'}{t.quantity}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!movementItemId} onOpenChange={(open) => !open && setMovementItemId(null)}>
          <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
            {movementItem && (
              <>
                <DialogHeader>
                  <DialogTitle>Ürün Hareketliliği</DialogTitle>
                  <DialogDescription>
                    {movementItem.name} için son hareketler
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-3 max-h-[60vh] overflow-auto">
                  {movementRows.length === 0 ? (
                    <p className="text-sm text-zinc-500">Bu ürün için hareket bulunamadı.</p>
                  ) : (
                    movementRows.map((t) => (
                      <div key={t.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {t.type === 'IN' && t.kind === 'RETURN' ? 'İade' : t.type === 'IN' ? 'Giriş' : 'Çıkış'} • {t.quantity} adet
                          </p>
                          <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                          {t.channel ? (
                            <p className="text-[11px] text-zinc-500">
                              {t.channel}
                              {t.channel === 'Toptan' && (t.customerName || t.customerCode)
                                ? ` • ${t.customerName || t.customerCode}`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
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
                    <th className="px-4 py-3 text-right rounded-tr-lg">Potansiyel Toptan Satış (TL)</th>
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
                        <td className="px-4 py-3 font-medium text-white">
                          <Link
                            href={{ pathname: '/urunler', query: { marka: brand.name } }}
                            className="hover:underline underline-offset-4"
                            title={`${brand.name} ürünlerini görüntüle`}
                          >
                            {brand.name}
                          </Link>
                        </td>
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
              <p className="text-xs text-zinc-500">Seçili tarih aralığında kanal bazlı satılan malın alış maliyeti / satış tutarları</p>
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
                  <p className="text-sm text-zinc-400 mt-2">Satılan Malın Alış Maliyeti</p>
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
                <p className="text-xs text-zinc-500">Satılan malın alış maliyeti + Satış toplamları</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-400">Satılan Malın Alış Maliyeti Toplamı</p>
                <p className="text-xl font-bold text-emerald-400">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalSalesBuy)}
                </p>
                <p className="text-sm text-zinc-400 mt-1">Satış Toplamı</p>
                <p className="text-xl font-bold text-blue-400">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalSalesSell)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Satışların maliyeti: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totalSalesBuy)}
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
