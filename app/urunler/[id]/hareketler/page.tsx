'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Package, Loader2, ChevronRight, List } from 'lucide-react';
import * as dbActions from '@/lib/actions';
import { StockItem, Transaction } from '@/types';

const currency = (value: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

export default function ProductMovementsPage() {
    const params = useParams<{ id: string }>();
    const id = String(params?.id || '');
    const router = useRouter();

    const [item, setItem] = useState<StockItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const row = await dbActions.getItemById(id);
            if (!row) {
                setMissing(true);
                setItem(null);
            } else {
                setItem(row);
                setMissing(false);
            }
        } catch (e) {
            console.error(e);
            toast.error('Ürün hareketleri yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const isOpeningTx = (t: Transaction) => {
        if (!item) return false;
        if (t.kind === 'OPENING') return true;
        const createdAtTs = new Date(item.createdAt).getTime();
        const txTs = new Date(t.date).getTime();
        const nearCreation = Number.isFinite(createdAtTs) && Number.isFinite(txTs) && Math.abs(createdAtTs - txTs) <= 60_000;
        return t.type === 'IN' && (t.kind === 'NORMAL' || !t.kind) && (t.channel || '') === 'Pazaryeri' && !t.customerId && nearCreation;
    };

    const rows = useMemo(() => {
        if (!item) return [];
        return [...item.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [item]);

    const totals = useMemo(() => {
        let inQty = 0;
        let outQty = 0;
        let salesAmount = 0;
        rows.forEach((t) => {
            if (t.type === 'IN') inQty += Number(t.quantity) || 0;
            else outQty += Number(t.quantity) || 0;
            if (t.type === 'OUT' || (t.type === 'IN' && t.kind === 'RETURN')) {
                salesAmount +=
                    Number(t.totalPrice) ||
                    ((Number(t.unitPrice) || Number(item?.sellPrice) || 0) * (Number(t.quantity) || 0));
            }
        });
        return { inQty, outQty, salesAmount };
    }, [rows, item]);

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-enter">
            <div className="flex items-center gap-3">
                <Button variant="outline" className="border-zinc-700 gap-2" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" />
                    Geri
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">Ürün Hareketleri</h1>
            </div>

            {loading ? (
                <Card>
                    <CardContent className="flex items-center justify-center gap-2 py-16 text-zinc-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Yükleniyor...
                    </CardContent>
                </Card>
            ) : missing || !item ? (
                <Card>
                    <CardContent className="py-16 text-center space-y-4">
                        <p className="text-zinc-400">Ürün bulunamadı. Silinmiş olabilir.</p>
                        <Link href="/urunler">
                            <Button variant="outline" className="border-zinc-700">Ürün listesine dön</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Ürün başlık kartı */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="w-20 h-20 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {item.image ? (
                                        <img src={item.image} className="w-full h-full object-contain" alt={item.name} />
                                    ) : (
                                        <Package className="w-7 h-7 text-zinc-700" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-lg font-semibold text-white">{item.name}</div>
                                    <div className="text-xs text-zinc-500 font-mono">
                                        {item.barcode || '—'}
                                        {item.stockCode ? ` • ${item.stockCode}` : ''}
                                    </div>
                                    {item.brand && <div className="text-xs text-zinc-500">{item.brand}</div>}
                                </div>
                                <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center">
                                    <div>
                                        <div className="text-xs text-zinc-500">Mevcut Stok</div>
                                        <div className="text-lg font-bold text-white">{item.quantity}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-zinc-500">Alış</div>
                                        <div className="text-sm font-medium text-zinc-300">{currency(Number(item.buyPrice) || 0)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-zinc-500">Satış</div>
                                        <div className="text-sm font-medium text-primary">{currency(Number(item.sellPrice) || 0)}</div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Özet satırı */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-zinc-500">Toplam Giriş</div>
                                <div className="text-xl font-bold text-green-500">+{totals.inQty}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-zinc-500">Toplam Çıkış</div>
                                <div className="text-xl font-bold text-red-500">-{totals.outQty}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-zinc-500">Toplam Satış Tutarı</div>
                                <div className="text-xl font-bold text-blue-300">{currency(totals.salesAmount)}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Hareket tablosu */}
                    <Card>
                        <CardContent className="p-0">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                                <span className="text-sm text-zinc-400">Tüm hareketler ({rows.length})</span>
                                <Link href={`/hareketler?item=${encodeURIComponent(item.id)}`}>
                                    <Button variant="ghost" size="sm" className="text-zinc-300 gap-2">
                                        <List className="w-4 h-4" />
                                        Hareketler listesinde aç
                                    </Button>
                                </Link>
                            </div>
                            <div className="relative w-full overflow-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                                        <tr>
                                            <th className="px-4 py-3">Tarih</th>
                                            <th className="px-4 py-3">İşlem Tipi</th>
                                            <th className="px-4 py-3 text-center">Adet</th>
                                            <th className="px-4 py-3 text-right">Birim Fiyat</th>
                                            <th className="px-4 py-3 text-right">Tutar</th>
                                            <th className="px-4 py-3">Cari</th>
                                            <th className="px-4 py-3">Kanal / Not</th>
                                            <th className="px-4 py-3 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                                                    Bu ürün için hareket bulunamadı.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((t) => (
                                                <tr
                                                    key={t.id}
                                                    onClick={() => router.push(`/hareketler/${encodeURIComponent(t.id)}`)}
                                                    className="hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                                                    title="Hareket detayına git"
                                                >
                                                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs whitespace-nowrap">
                                                        {new Date(t.date).toLocaleString('tr-TR')}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isOpeningTx(t) ? (
                                                            <span className="inline-flex items-center gap-2 font-medium text-cyan-400">
                                                                <ArrowDownCircle className="w-4 h-4" /> Devir Bakiye
                                                            </span>
                                                        ) : t.type === 'IN' && t.kind === 'RETURN' ? (
                                                            <span className="inline-flex items-center gap-2 font-medium text-purple-400">
                                                                <ArrowDownCircle className="w-4 h-4" /> İade (Giriş)
                                                            </span>
                                                        ) : (
                                                            <span className={`inline-flex items-center gap-2 font-medium ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {t.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                                                                {t.type === 'IN' ? 'Giriş' : 'Çıkış'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                            {t.type === 'IN' ? '+' : '-'}{t.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-300 font-mono text-xs">
                                                        {isOpeningTx(t)
                                                            ? '-'
                                                            : t.type === 'OUT' || (t.type === 'IN' && t.kind === 'RETURN')
                                                                ? currency(Number(t.unitPrice) || 0)
                                                                : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-xs">
                                                        {!isOpeningTx(t) && (t.type === 'OUT' || (t.type === 'IN' && t.kind === 'RETURN')) ? (
                                                            <span className="font-bold text-blue-300">
                                                                {currency(
                                                                    Number(t.totalPrice) ||
                                                                    ((Number(t.unitPrice) || Number(item.sellPrice) || 0) * (Number(t.quantity) || 0))
                                                                )}
                                                            </span>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {t.customerName || t.customerCode ? (
                                                            <div className="text-xs">
                                                                <div className="font-medium text-white line-clamp-1">{t.customerName}</div>
                                                                {t.customerCode && <div className="text-zinc-500 font-mono">{t.customerCode}</div>}
                                                            </div>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {t.channel ? (
                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                                {t.channel}
                                                            </span>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors inline" />
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
