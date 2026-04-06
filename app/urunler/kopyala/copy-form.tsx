'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStockStore } from '@/lib/store';
import * as dbActions from '@/lib/actions';
import { StockItem } from '@/types';

/** Türkçe: binlik `.`, ondalık `,` — sayıya çevirir */
function parseTrMoney(s: string): number {
  const x = s.trim().replace(/\s/g, '');
  if (!x) return 0;
  const commaIdx = x.lastIndexOf(',');
  if (commaIdx >= 0) {
    const intPart = x.slice(0, commaIdx).replace(/\./g, '');
    const decPart = x.slice(commaIdx + 1).replace(/[^\d]/g, '');
    const n = Number(`${intPart}.${decPart}`);
    return Number.isFinite(n) ? n : 0;
  }
  const onlyInt = x.replace(/\./g, '');
  const n = Number(onlyInt);
  return Number.isFinite(n) ? n : 0;
}

function formatTrMoney(n: number): string {
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export type DraftRow = {
  key: string;
  image: string;
  brand: string;
  name: string;
  description: string;
  stockCode: string;
  barcode: string;
  vatRate: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
};

function buildDraftsFromSource(source: StockItem, count: number): DraftRow[] {
  const baseSc = (source.stockCode || '').trim();
  const baseBc = (source.barcode || '').trim();
  const rows: DraftRow[] = [];
  for (let i = 1; i <= count; i++) {
    const suffix = `-K${i}`;
    rows.push({
      key: `row-${i}-${source.id}`,
      image: source.image || '',
      brand: source.brand || '',
      name: source.name,
      description: source.description || '',
      stockCode: baseSc ? `${baseSc}${suffix}` : `KOPYA${suffix}`,
      barcode: baseBc ? `${baseBc}${suffix}` : '',
      vatRate: String(source.vatRate ?? 20),
      buyPrice: formatTrMoney(Number(source.buyPrice) || 0),
      sellPrice: formatTrMoney(Number(source.sellPrice) || 0),
      quantity: '0',
    });
  }
  return rows;
}

export default function CopyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceId = (searchParams.get('kaynak') || '').trim();
  const adetRaw = searchParams.get('adet');
  const adet = Math.min(100, Math.max(1, parseInt(String(adetRaw || '1'), 10) || 1));

  const items = useStockStore((state) => state.items);
  const addItem = useStockStore((state) => state.addItem);

  const source = useMemo(() => items.find((x) => x.id === sourceId), [items, sourceId]);

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!source) return;
    setRows(buildDraftsFromSource(source, adet));
  }, [source, adet]);

  const updateRow = useCallback((key: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const handleSave = async () => {
    if (!source || rows.length === 0) return;

    for (const row of rows) {
      const name = row.name.trim();
      if (!name) {
        toast.error('Tüm satırlarda ürün adı dolu olmalı');
        return;
      }
      const bc = row.barcode.trim();
      const sc = row.stockCode.trim();
      if (!bc && !sc) {
        toast.error('Her satırda barkod veya stok kodundan en az biri olmalı');
        return;
      }
    }

    const now = new Date().toISOString();
    const newItems: StockItem[] = rows.map((row) => {
      const buyPrice = parseTrMoney(row.buyPrice);
      const sellPrice = parseTrMoney(row.sellPrice);
      const quantity = Math.max(0, Number(row.quantity) || 0);
      const vatRate = Number(row.vatRate) || 0;
      return {
        id: uuidv4(),
        name: row.name.trim(),
        barcode: row.barcode.trim(),
        stockCode: row.stockCode.trim(),
        brand: row.brand.trim(),
        description: row.description.trim(),
        image: row.image || undefined,
        vatRate,
        buyPrice,
        sellPrice,
        quantity,
        transactions: [],
        createdAt: now,
        updatedAt: now,
      };
    });

    setSaving(true);
    const toastId = toast.loading('Kopyalar kaydediliyor...');
    try {
      const result = await dbActions.bulkAddItems(newItems);
      if (!result.success) {
        const msg = typeof result.error === 'string' ? result.error : 'Kayıt başarısız';
        toast.error(msg, { id: toastId });
        return;
      }
      newItems.forEach((it) => addItem(it));
      toast.success(`${newItems.length} ürün kaydedildi`, { id: toastId });
      router.push('/urunler');
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kayıt sırasında hata oluştu';
      toast.error(msg, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (!sourceId) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="text-zinc-400">Kaynak ürün belirtilmedi.</p>
        <Link href="/urunler" className="text-primary hover:underline">
          Ürün listesine dön
        </Link>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <p className="text-zinc-400">Kaynak ürün bulunamadı (liste henüz yüklenmedi veya geçersiz ID).</p>
        <Link href="/urunler" className="text-primary hover:underline">
          Ürün listesine dön
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-enter max-w-[1600px] mx-auto px-2 sm:px-4 pb-10">
      <div className="space-y-2">
        <Link href="/urunler" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Ürün listesine dön
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Ürün kopyala</h1>
          <p className="text-zinc-500 text-sm sm:text-base">
            Kaynak: <span className="text-zinc-300">{source.name}</span> — {rows.length} kopya satırı düzenleyip kaydedin.
          </p>
        </div>
      </div>

      <Card className="border-zinc-800">
        <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
          <CardTitle>Kopya satırları</CardTitle>
          <CardDescription>
            Görsel, marka, ürün bilgisi, stok kodu, KDV, alış ve satış fiyatları kaynak üründen getirildi; kayıt öncesi düzenleyebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[1180px] table-fixed">
              <colgroup>
                <col className="w-[72px]" />
                <col className="w-[12ch]" />
                <col />
                <col className="w-[168px]" />
                <col className="w-[188px]" />
                <col className="w-[4.5rem]" />
                <col className="w-[7rem]" />
                <col className="w-[7rem]" />
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead className="bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2 py-2">Görsel</th>
                  <th className="px-1 py-2">Marka</th>
                  <th className="px-2 py-2">Ürün bilgisi</th>
                  <th className="px-1 py-2">Stok kodu</th>
                  <th className="px-2 py-2">Barkod</th>
                  <th className="px-1 py-2 text-center">KDV %</th>
                  <th className="px-1 py-2 text-right">Alış</th>
                  <th className="px-1 py-2 text-right">Satış</th>
                  <th className="px-1 py-2 text-center">Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((row) => (
                  <tr key={row.key} className="hover:bg-zinc-900/40 align-top">
                    <td className="px-2 py-2">
                      <div className="w-14 h-14 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden">
                        {row.image ? (
                          <img src={row.image} alt="" className="w-full h-full object-contain p-0.5" />
                        ) : (
                          <Package className="w-7 h-7 text-zinc-700" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 min-w-0">
                      <Input
                        value={row.brand}
                        onChange={(e) => updateRow(row.key, { brand: e.target.value })}
                        className="h-9 text-sm bg-zinc-950 border-zinc-800 w-full min-w-0 px-2"
                        placeholder="Marka"
                      />
                    </td>
                    <td className="px-2 py-2 min-w-0">
                      <Input
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        className="h-9 text-xs bg-zinc-950 border-zinc-800 w-full min-w-0"
                        placeholder="Ürün adı"
                      />
                    </td>
                    <td className="px-2 py-2 min-w-0">
                      <Input
                        value={row.stockCode}
                        onChange={(e) => updateRow(row.key, { stockCode: e.target.value })}
                        className="h-9 text-sm font-mono bg-zinc-950 border-zinc-800 w-full min-w-0 px-2"
                      />
                    </td>
                    <td className="px-2 py-2 min-w-0">
                      <Input
                        value={row.barcode}
                        onChange={(e) => updateRow(row.key, { barcode: e.target.value })}
                        className="h-9 text-sm font-mono bg-zinc-950 border-zinc-800 w-full min-w-0 px-2"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={row.vatRate}
                        onChange={(e) => updateRow(row.key, { vatRate: e.target.value })}
                        className="h-9 text-sm text-center bg-zinc-950 border-zinc-800 w-full min-w-0 px-2"
                      />
                    </td>
                    <td className="px-1 py-2 min-w-0 text-right">
                      <Input
                        inputMode="decimal"
                        value={row.buyPrice}
                        onChange={(e) => updateRow(row.key, { buyPrice: e.target.value })}
                        onBlur={(e) => {
                          const n = parseTrMoney(e.target.value);
                          updateRow(row.key, { buyPrice: formatTrMoney(n) });
                        }}
                        className="h-9 text-sm tabular-nums text-right tracking-tighter bg-zinc-950 border-zinc-800 w-full min-w-0 px-1.5"
                        title="Binlik ayırıcı nokta (örn. 12.345,67)"
                      />
                    </td>
                    <td className="px-1 py-2 min-w-0 text-right">
                      <Input
                        inputMode="decimal"
                        value={row.sellPrice}
                        onChange={(e) => updateRow(row.key, { sellPrice: e.target.value })}
                        onBlur={(e) => {
                          const n = parseTrMoney(e.target.value);
                          updateRow(row.key, { sellPrice: formatTrMoney(n) });
                        }}
                        className="h-9 text-sm tabular-nums text-right tracking-tighter bg-zinc-950 border-zinc-800 w-full min-w-0 px-1.5"
                        title="Binlik ayırıcı nokta (örn. 12.345,67)"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        className="h-9 text-xs text-center bg-zinc-950 border-zinc-800"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button type="button" variant="outline" className="border-zinc-700" onClick={() => router.push('/urunler')}>
          İptal
        </Button>
        <Button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={saving || rows.length === 0}
          onClick={() => void handleSave()}
        >
          {saving ? 'Kaydediliyor...' : 'Kopya kaydet'}
        </Button>
      </div>
    </div>
  );
}
