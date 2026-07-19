'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as dbActions from '@/lib/actions';
import type { MovementRow, DashboardBrand } from '@/lib/actions';
import { StockItem } from '@/types';

type DashboardStats = {
  totalItems: number;
  totalQuantity: number;
  totalBuyValue: number;
  totalSellValue: number;
  brands: DashboardBrand[];
};

type SalesSummary = {
  Pazaryeri: { buyTotal: number; sellTotal: number };
  Perakende: { buyTotal: number; sellTotal: number };
  Toptan: { buyTotal: number; sellTotal: number };
};

const EMPTY_SALES: SalesSummary = {
  Pazaryeri: { buyTotal: 0, sellTotal: 0 },
  Perakende: { buyTotal: 0, sellTotal: 0 },
  Toptan: { buyTotal: 0, sellTotal: 0 },
};

const tl = (v: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(v) || 0);

export default function Home() {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().split('T')[0];
  const [salesDates, setSalesDates] = useState({ start: yearStart, end: today });

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentTx, setRecentTx] = useState<MovementRow[]>([]);
  const [recentSales, setRecentSales] = useState<MovementRow[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary>(EMPTY_SALES);
  const [loading, setLoading] = useState(true);

  const [movementItemId, setMovementItemId] = useState<string | null>(null);
  const [movementItem, setMovementItem] = useState<StockItem | null>(null);
  const [loadingMovement, setLoadingMovement] = useState(false);

  const toDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const capitalizeTr = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);

  // İlk yükleme: üst kartlar + marka özeti + son 3 gün hareketleri + son satışlar (paralel, hızlı)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const threeDaysAgo = new Date();
    threeDaysAgo.setHours(0, 0, 0, 0);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    (async () => {
      try {
        const [s, recent, sales] = await Promise.all([
          dbActions.getDashboardStats(),
          dbActions.getTransactionsPaginated({ startDate: threeDaysAgo.toISOString(), limit: 500 }),
          dbActions.getTransactionsPaginated({ type: 'OUT', limit: 8 }),
        ]);
        if (cancelled) return;
        setStats(s);
        setRecentTx(recent.rows as unknown as MovementRow[]);
        setRecentSales(sales.rows as unknown as MovementRow[]);
      } catch (e) {
        if (!cancelled) console.error('Özet verileri yüklenemedi:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toplam Satışlar kartı: tarih aralığı değişince sunucudan yeniden hesaplanır.
  useEffect(() => {
    let cancelled = false;
    const start = new Date(salesDates.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(salesDates.end);
    end.setHours(23, 59, 59, 999);
    (async () => {
      try {
        const res = await dbActions.getSalesSummaryByChannel(start.toISOString(), end.toISOString());
        if (!cancelled) setSalesSummary(res);
      } catch (e) {
        if (!cancelled) console.error('Satış özeti yüklenemedi:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salesDates.start, salesDates.end]);

  // Bir ürünün hareketleri diyaloğu: talep üzerine getItemById ile çekilir.
  useEffect(() => {
    if (!movementItemId) {
      setMovementItem(null);
      return;
    }
    let cancelled = false;
    setLoadingMovement(true);
    (async () => {
      try {
        const item = await dbActions.getItemById(movementItemId);
        if (!cancelled) setMovementItem(item);
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setLoadingMovement(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [movementItemId]);

  const totalItems = stats?.totalItems ?? 0;
  const totalQuantity = stats?.totalQuantity ?? 0;
  const totalValue = stats?.totalBuyValue ?? 0;
  const potentialValue = stats?.totalSellValue ?? 0;
  const brandSummaries = stats?.brands ?? [];

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
    }, {} as Record<string, MovementRow[]>);

    recentTx.forEach((t) => {
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
  }, [recentTx]);

  const movementRows = useMemo(() => {
    if (!movementItem) return [];
    return [...movementItem.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movementItem]);

  const totalSalesBuy =
    salesSummary.Pazaryeri.buyTotal + salesSummary.Perakende.buyTotal + salesSummary.Toptan.buyTotal;
  const totalSalesSell =
    salesSummary.Pazaryeri.sellTotal + salesSummary.Perakende.sellTotal + salesSummary.Toptan.sellTotal;

  // Verileri çekerken iskelet göster (eski localStorage değerleri asla görünmesin).
  if (loading) {
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
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Veriler yükleniyor...
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
            <div className="text-2xl font-bold text-green-500">{tl(totalValue)}</div>
            <p className="text-xs text-zinc-500">Maliyet bazlı toplam değer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potansiyel Ciro</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{tl(potentialValue)}</div>
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
                                {t.productName}
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
            <DialogHeader>
              <DialogTitle>Ürün Hareketliliği</DialogTitle>
              <DialogDescription>
                {movementItem ? `${movementItem.name} için son hareketler` : 'Yükleniyor...'}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 space-y-3 max-h-[60vh] overflow-auto">
              {loadingMovement ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Hareketler yükleniyor...
                </div>
              ) : movementRows.length === 0 ? (
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
                  <p className="text-lg font-bold text-emerald-400">{tl(salesSummary[channel].buyTotal)}</p>
                  <p className="text-sm text-zinc-400 mt-2">Satış Tutarı</p>
                  <p className="text-lg font-bold text-blue-400">{tl(salesSummary[channel].sellTotal)}</p>
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
                <p className="text-xl font-bold text-emerald-400">{tl(totalSalesBuy)}</p>
                <p className="text-sm text-zinc-400 mt-1">Satış Toplamı</p>
                <p className="text-xl font-bold text-blue-400">{tl(totalSalesSell)}</p>
                <p className="text-xs text-zinc-500 mt-1">Satışların maliyeti: {tl(totalSalesBuy)}</p>
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
                recentSales.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-b border-white/5 last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="text-sm font-medium leading-none">{t.productName}</p>
                      <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                      <p className="text-xs text-zinc-500">{t.channel || 'Perakende'}</p>
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
