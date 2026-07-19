'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Package, Pencil, Trash2, Loader2, ListFilter } from 'lucide-react';
import * as dbActions from '@/lib/actions';
import type { MovementRow } from '@/lib/actions';
import { Customer } from '@/types';

const currency = (value: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

const isOpeningTx = (t: MovementRow) => {
    if (t.kind === 'OPENING') return true;
    const createdAtTs = new Date(t.itemCreatedAt).getTime();
    const txTs = new Date(t.date).getTime();
    const nearCreation = Number.isFinite(createdAtTs) && Number.isFinite(txTs) && Math.abs(createdAtTs - txTs) <= 60_000;
    return t.type === 'IN' && (t.kind === 'NORMAL' || !t.kind) && (t.channel || '') === 'Pazaryeri' && !t.customerId && nearCreation;
};

export default function TransactionDetailPage() {
    const params = useParams<{ id: string }>();
    const id = String(params?.id || '');
    const router = useRouter();

    const [tx, setTx] = useState<MovementRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editQty, setEditQty] = useState('1');
    const [editChannel, setEditChannel] = useState('');
    const [editUnitPrice, setEditUnitPrice] = useState('');
    const [editCustomerId, setEditCustomerId] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const row = await dbActions.getTransactionById(id);
            if (!row) {
                setMissing(true);
                setTx(null);
            } else {
                setTx(row);
                setMissing(false);
            }
        } catch (e) {
            console.error(e);
            toast.error('Hareket yüklenemedi.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const toLocalInput = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const isPriced = !!tx && (tx.type === 'OUT' || (tx.type === 'IN' && tx.kind === 'RETURN'));

    const openEdit = async () => {
        if (!tx) return;
        setEditDate(toLocalInput(tx.date));
        setEditQty(String(tx.quantity ?? 1));
        setEditChannel(String(tx.channel || ''));
        setEditUnitPrice(String(tx.unitPrice ?? ''));
        setEditCustomerId(String(tx.customerId || ''));
        setEditOpen(true);
        if (customers.length === 0) {
            try {
                const rows = await dbActions.getCustomers();
                setCustomers(rows || []);
            } catch {
                // ignore
            }
        }
    };

    const submitEdit = async () => {
        if (!tx) return;
        const qty = Number(editQty);
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.error('Adet geçerli olmalı');
            return;
        }
        const channel = (editChannel || '').trim();
        const customerId = (editCustomerId || '').trim();
        if (channel === 'Toptan' && !customerId) {
            toast.error('Toptan için cari seçmelisiniz');
            return;
        }
        const unitPrice = isPriced ? Number(String(editUnitPrice).replace(',', '.')) : 0;
        if (isPriced && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
            toast.error('Birim fiyat geçerli olmalı');
            return;
        }

        setSavingEdit(true);
        const toastId = toast.loading('Hareket güncelleniyor...');
        try {
            const isoDate = new Date(editDate).toISOString();
            const res = await dbActions.updateTransaction(tx.id, {
                date: isoDate,
                quantity: qty,
                channel: channel || null,
                unitPrice,
                customerId: customerId ? customerId : null,
            });
            if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
            await load();
            toast.success('Hareket güncellendi', { id: toastId });
            setEditOpen(false);
        } catch (e) {
            console.error(e);
            toast.error('Hareket güncellenemedi', { id: toastId });
        } finally {
            setSavingEdit(false);
        }
    };

    const doDelete = async () => {
        if (!tx) return;
        setDeleting(true);
        try {
            const res = await dbActions.removeTransactions([tx.id]);
            if (!res.success) throw new Error('failed');
            toast.success('Hareket silindi. Stok düzeltildi.');
            router.push('/hareketler');
        } catch (e) {
            console.error(e);
            toast.error('Hareket silinemedi.');
            setDeleting(false);
        }
    };

    const TypeBadge = ({ t }: { t: MovementRow }) => {
        if (isOpeningTx(t)) {
            return (
                <span className="inline-flex items-center gap-2 font-semibold text-cyan-400">
                    <ArrowDownCircle className="w-5 h-5" /> Devir Bakiye
                </span>
            );
        }
        if (t.type === 'IN' && t.kind === 'RETURN') {
            return (
                <span className="inline-flex items-center gap-2 font-semibold text-purple-400">
                    <ArrowDownCircle className="w-5 h-5" /> İade (Giriş)
                </span>
            );
        }
        return (
            <span className={`inline-flex items-center gap-2 font-semibold ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                {t.type === 'IN' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                {t.type === 'IN' ? 'Giriş' : 'Çıkış'}
            </span>
        );
    };

    const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-sm font-medium text-white text-right">{children}</span>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-enter">
            <div className="flex items-center gap-3">
                <Button variant="outline" className="border-zinc-700 gap-2" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" />
                    Geri
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">Hareket Detayı</h1>
            </div>

            {loading ? (
                <Card>
                    <CardContent className="flex items-center justify-center gap-2 py-16 text-zinc-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Yükleniyor...
                    </CardContent>
                </Card>
            ) : missing || !tx ? (
                <Card>
                    <CardContent className="py-16 text-center space-y-4">
                        <p className="text-zinc-400">Hareket bulunamadı. Silinmiş olabilir.</p>
                        <Link href="/hareketler">
                            <Button variant="outline" className="border-zinc-700">Hareketler listesine dön</Button>
                        </Link>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Ürün kartı */}
                    <Card>
                        <CardContent className="p-4">
                            <Link
                                href={`/hareketler?item=${encodeURIComponent(tx.itemId)}&highlight=${encodeURIComponent(tx.id)}`}
                                className="flex items-center gap-4 group"
                                title="Bu ürünün tüm hareketlerini gör"
                            >
                                <div className="w-16 h-16 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {tx.image ? (
                                        <img src={tx.image} className="w-full h-full object-contain" alt={tx.productName} />
                                    ) : (
                                        <Package className="w-6 h-6 text-zinc-700" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-semibold text-white group-hover:text-primary transition-colors line-clamp-2">
                                        {tx.productName}
                                    </div>
                                    <div className="text-xs text-zinc-500 font-mono">{tx.barcode || '—'}</div>
                                    {tx.brand && <div className="text-xs text-zinc-500">{tx.brand}</div>}
                                </div>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* Hareket bilgileri */}
                    <Card>
                        <CardContent className="p-4">
                            <Row label="İşlem Tipi"><TypeBadge t={tx} /></Row>
                            <Row label="Tarih">{new Date(tx.date).toLocaleString('tr-TR')}</Row>
                            <Row label="Adet">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${tx.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                                </span>
                            </Row>
                            {isPriced && (
                                <>
                                    <Row label="Birim Fiyat">{currency(Number(tx.unitPrice) || 0)}</Row>
                                    <Row label="Tutar">
                                        <span className="font-bold text-blue-300">
                                            {currency(
                                                Number(tx.totalPrice) ||
                                                ((Number(tx.unitPrice) || tx.itemSellPrice || 0) * (Number(tx.quantity) || 0))
                                            )}
                                        </span>
                                    </Row>
                                </>
                            )}
                            <Row label="Cari">
                                {tx.customerName || tx.customerCode ? (
                                    <span>
                                        {tx.customerName}
                                        {tx.customerCode ? <span className="text-zinc-500 font-mono"> ({tx.customerCode})</span> : null}
                                    </span>
                                ) : (
                                    '—'
                                )}
                            </Row>
                            <Row label="Kanal / Not">
                                {tx.channel ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                                        {tx.channel}
                                    </span>
                                ) : (
                                    '—'
                                )}
                            </Row>
                        </CardContent>
                    </Card>

                    {/* İşlemler */}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" className="border-zinc-700 gap-2" onClick={openEdit}>
                            <Pencil className="w-4 h-4" />
                            Düzenle
                        </Button>
                        <Button variant="destructive" className="gap-2" onClick={() => setDeleteOpen(true)}>
                            <Trash2 className="w-4 h-4" />
                            Sil
                        </Button>
                        <Link
                            href={`/hareketler?item=${encodeURIComponent(tx.itemId)}&highlight=${encodeURIComponent(tx.id)}`}
                            className="ml-auto"
                        >
                            <Button variant="ghost" className="text-zinc-300 gap-2">
                                <ListFilter className="w-4 h-4" />
                                Ürünün tüm hareketleri
                            </Button>
                        </Link>
                    </div>
                </>
            )}

            {/* Silme onayı */}
            <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Hareketi Sil
                        </DialogTitle>
                        <DialogDescription className="sr-only">Hareket silme onayı.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-zinc-300">Bu hareketi silmek istediğinize emin misiniz?</p>
                        <div className="bg-amber-500/10 border border-amber-500/50 p-3 rounded-lg flex gap-3">
                            <ArrowUpCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-200">
                                <strong>Önemli:</strong> Silince ilgili ürünün stok miktarı otomatik düzeltilecek.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>Vazgeç</Button>
                        <Button variant="destructive" onClick={doDelete} disabled={deleting}>
                            {deleting ? 'Siliniyor...' : 'Evet, Sil'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Düzenle */}
            <Dialog open={editOpen} onOpenChange={(open) => !savingEdit && setEditOpen(open)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle>Hareket Düzenle</DialogTitle>
                        <DialogDescription>Adet, tarih, kanal, fiyat ve cari bilgisini güncelleyebilirsiniz.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Tarih</label>
                            <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Adet</label>
                            <Input type="number" min={1} value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Kanal</label>
                            <select
                                value={editChannel}
                                onChange={(e) => setEditChannel(e.target.value)}
                                className="h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none w-full"
                            >
                                <option value="">—</option>
                                <option value="Pazaryeri">Pazaryeri</option>
                                <option value="Perakende">Perakende</option>
                                <option value="Toptan">Toptan</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Cari</label>
                            <select
                                value={editCustomerId}
                                onChange={(e) => setEditCustomerId(e.target.value)}
                                className="h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none w-full"
                            >
                                <option value="">—</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {(c.customerCode ? `${c.customerCode} - ` : '') + c.name}
                                    </option>
                                ))}
                            </select>
                            {editChannel === 'Toptan' && !editCustomerId && (
                                <p className="text-xs text-red-400">Toptan için cari zorunlu.</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Birim Fiyat</label>
                            <Input
                                inputMode="decimal"
                                value={editUnitPrice}
                                onChange={(e) => setEditUnitPrice(e.target.value)}
                                placeholder="Örn: 200"
                                disabled={!isPriced}
                            />
                            {!isPriced && (
                                <p className="text-xs text-zinc-500">Sadece satış/iade hareketlerinde fiyat düzenlenir.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" className="border-zinc-700" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                            İptal
                        </Button>
                        <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitEdit} disabled={savingEdit}>
                            Kaydet
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
