'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Building2, FileDown, Package, PlusCircle, Landmark, Banknote, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import * as dbActions from '@/lib/actions';
import { useStockStore } from '@/lib/store';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

type MovementTxKind = 'NORMAL' | 'RETURN';
type MovementChannel = 'Pazaryeri' | 'Perakende' | 'Toptan';
type PaymentMethod = 'Banka' | 'Nakit' | 'Diğer';

type TxMovementRow = {
  kind: 'TX';
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  txKind: MovementTxKind | null;
  quantity: number;
  channel: MovementChannel | null;
  unitPrice: number;
  totalPrice: number;
  itemId: string | null;
  itemName: string | null;
  barcode: string | null;
  stockCode: string | null;
  image: string | null;
  brand: string | null;
};

type PaymentMovementRow = {
  kind: 'PAYMENT';
  id: string;
  date: string;
  type: 'PAYMENT';
  direction: 'IN' | 'OUT';
  quantity: number;
  channel: null;
  unitPrice: number;
  totalPrice: number;
  method: PaymentMethod;
  description: string | null;
  itemId: null;
  itemName: null;
  barcode: null;
  stockCode: null;
  image: null;
  brand: null;
};

type OpeningMovementRow = {
  kind: 'OPENING';
  id: string;
  date: string;
  type: 'OPENING';
  direction: 'IN' | 'OUT';
  quantity: number;
  channel: null;
  unitPrice: number;
  totalPrice: number;
  method: 'Açılış Bakiyesi';
  description: string | null;
  itemId: null;
  itemName: null;
  barcode: null;
  stockCode: null;
  image: null;
  brand: null;
};

type MovementRow = TxMovementRow | PaymentMovementRow | OpeningMovementRow;

export default function CariDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id as string;
  const setItems = useStockStore((s) => s.setItems);

  const [rows, setRows] = useState<MovementRow[]>([]);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [moneyDirection, setMoneyDirection] = useState<'IN' | 'OUT'>('IN'); // IN=tahsilat, OUT=ödeme
  const today = new Date().toISOString().split('T')[0];
  const [payDate, setPayDate] = useState(today);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Banka' | 'Nakit' | 'Diğer'>('Banka');
  const [payDesc, setPayDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MovementRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editChannel, setEditChannel] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState<'Banka' | 'Nakit' | 'Diğer'>('Banka');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await dbActions.getCustomerMovements(customerId);
      if (!cancelled) setRows(((res as unknown as { rows?: MovementRow[] }).rows || []) as MovementRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const totals = useMemo(() => {
    const tx = rows.filter((r): r is TxMovementRow => r.kind === 'TX');
    const money = rows.filter((r): r is PaymentMovementRow => r.kind === 'PAYMENT');
    const opening = rows.filter((r): r is OpeningMovementRow => r.kind === 'OPENING');

    const salesQty = tx.filter((r) => r.type === 'OUT').reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);

    const creditTotal = tx.reduce((acc, r) => {
      const amount = Number(r.totalPrice) || 0;
      if (r.type === 'OUT') return acc + amount; // satış => alacak
      if (r.type === 'IN' && r.txKind === 'RETURN') return acc - amount; // satış iadesi => alacak düşer
      return acc;
    }, 0);

    const debtTotal = tx.reduce((acc, r) => {
      const amount = Number(r.totalPrice) || 0;
      if (r.type === 'IN' && r.txKind !== 'RETURN') return acc + amount; // alış => borç
      return acc;
    }, 0);
    const openingCreditTotal = opening.reduce((acc, r) => acc + (r.direction === 'IN' ? Number(r.totalPrice) || 0 : 0), 0);
    const openingDebtTotal = opening.reduce((acc, r) => acc + (r.direction === 'OUT' ? Number(r.totalPrice) || 0 : 0), 0);

    const collectionTotal = money.reduce((acc, r) => acc + (r.direction === 'IN' ? (Number(r.totalPrice) || 0) : 0), 0);
    const paymentTotal = money.reduce((acc, r) => acc + (r.direction === 'OUT' ? (Number(r.totalPrice) || 0) : 0), 0);

    const totalCredit = creditTotal + openingCreditTotal;
    const totalDebt = debtTotal + openingDebtTotal;

    const creditBalance = totalCredit - collectionTotal;
    const debtBalance = totalDebt - paymentTotal;

    return { salesQty, creditTotal: totalCredit, collectionTotal, creditBalance, debtTotal: totalDebt, paymentTotal, debtBalance };
  }, [rows]);

  const submitMoney = async () => {
    const amount = Number(String(payAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(moneyDirection === 'IN' ? 'Tahsilat tutarı geçerli olmalı' : 'Ödeme tutarı geçerli olmalı');
      return;
    }
    setSaving(true);
    const toastId = toast.loading(moneyDirection === 'IN' ? 'Tahsilat kaydediliyor...' : 'Ödeme kaydediliyor...');
    try {
      const isoDate = new Date(`${payDate}T12:00:00`).toISOString();
      const res = await dbActions.addCustomerPayment({
        customerId,
        date: isoDate,
        amount,
        direction: moneyDirection,
        method: payMethod,
        description: payDesc.trim() || undefined,
      });
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      const updated = await dbActions.getCustomerMovements(customerId);
      setRows(((updated as unknown as { rows?: MovementRow[] }).rows || []) as MovementRow[]);
      toast.success(moneyDirection === 'IN' ? 'Tahsilat eklendi' : 'Ödeme eklendi', { id: toastId });
      setMoneyOpen(false);
      setPayAmount('');
      setPayDesc('');
      setPayMethod('Banka');
      setPayDate(today);
    } catch (err) {
      toast.error(moneyDirection === 'IN' ? 'Tahsilat eklenirken hata oluştu' : 'Ödeme eklenirken hata oluştu', { id: toastId });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    const updated = await dbActions.getCustomerMovements(customerId);
    setRows(((updated as unknown as { rows?: MovementRow[] }).rows || []) as MovementRow[]);
    const nextItems = await dbActions.getItems();
    setItems(nextItems || []);
  };

  const openEdit = (r: MovementRow) => {
    if (r.kind === 'OPENING') return;
    setEditingRow(r);
    setEditDate(toLocalInput(r.date));
    if (r.kind === 'TX') {
      setEditQty(String(r.quantity ?? 1));
      setEditChannel(String(r.channel || ''));
      setEditUnitPrice(String(r.unitPrice ?? ''));
    } else {
      setEditAmount(String(r.totalPrice ?? ''));
      setEditMethod(r.method || 'Banka');
      setEditDesc(String(r.description || ''));
    }
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editingRow) return;
    setSavingEdit(true);
    const toastId = toast.loading('Güncelleniyor...');
    try {
      const isoDate = new Date(editDate).toISOString();
      if (editingRow.kind === 'TX') {
        const qty = Number(editQty);
        if (!Number.isFinite(qty) || qty <= 0) {
          toast.error('Adet geçerli olmalı', { id: toastId });
          return;
        }
        const isPriced = editingRow.type === 'OUT' || (editingRow.type === 'IN' && editingRow.txKind === 'RETURN');
        const unitPrice = isPriced ? Number(String(editUnitPrice).replace(',', '.')) : 0;
        if (isPriced && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
          toast.error('Birim fiyat geçerli olmalı', { id: toastId });
          return;
        }
        const res = await dbActions.updateTransaction(editingRow.id, {
          date: isoDate,
          quantity: qty,
          channel: (editChannel || '').trim() || null,
          unitPrice,
          customerId, // keep same customer
        });
        if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      } else if (editingRow.kind === 'PAYMENT') {
        const amount = Number(String(editAmount).replace(',', '.'));
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error('Tutar geçerli olmalı', { id: toastId });
          return;
        }
        const res = await dbActions.updateCustomerPayment(editingRow.id, {
          date: isoDate,
          amount,
          method: editMethod,
          description: editDesc.trim() || '',
        });
        if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      } else {
        toast.error('Açılış bakiyesi satırı düzenlenemez', { id: toastId });
        return;
      }
      await refresh();
      toast.success('Güncellendi', { id: toastId });
      setEditOpen(false);
      setEditingRow(null);
    } catch (e) {
      console.error(e);
      toast.error('Güncellenemedi', { id: toastId });
    } finally {
      setSavingEdit(false);
    }
  };

  const openDelete = (r: MovementRow) => {
    if (r.kind === 'OPENING') return;
    setEditingRow(r);
    setDeleteOpen(true);
  };

  const submitDelete = async () => {
    if (!editingRow) return;
    const toastId = toast.loading('Siliniyor...');
    try {
      if (editingRow.kind === 'TX') {
        const res = await dbActions.removeTransactions([editingRow.id]);
        if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      } else if (editingRow.kind === 'PAYMENT') {
        const res = await dbActions.removeCustomerPayments([editingRow.id]);
        if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      } else {
        toast.error('Açılış bakiyesi satırı silinemez', { id: toastId });
        return;
      }
      await refresh();
      toast.success('Silindi', { id: toastId });
      setDeleteOpen(false);
      setEditingRow(null);
    } catch (e) {
      console.error(e);
      toast.error('Silinemedi', { id: toastId });
    }
  };

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-sky-400" />
            Cari Hareketleri
          </h1>
          <p className="text-zinc-500">Bu cariye yapılan işlemler</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setMoneyDirection('IN');
              setMoneyOpen(true);
            }}
          >
            <PlusCircle className="w-5 h-5" />
            Tahsilat Ekle
          </Button>
          <Button
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => {
              setMoneyDirection('OUT');
              setMoneyOpen(true);
            }}
          >
            <PlusCircle className="w-5 h-5" />
            Ödeme Ekle
          </Button>
          <Link href={`/cari/${customerId}/ekstre?indir=1`} target="_blank">
            <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
              <FileDown className="w-4 h-4" />
              PDF İndir
            </Button>
          </Link>
          <Link href="/cari">
            <Button variant="outline" className="border-zinc-700 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Geri
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Satış Adedi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{totals.salesQty}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Toplam Alacak</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-300">{currency(totals.creditTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Tahsilat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-300">{currency(totals.collectionTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Kalan Alacak</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-200">{currency(totals.creditBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Toplam Borç</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-red-300">{currency(totals.debtTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Kalan Borç</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-200">{currency(totals.debtBalance)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>İşlemler ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-6 py-4">Tarih</th>
                  <th className="px-6 py-4">Tip</th>
                  <th className="px-6 py-4">Detay</th>
                  <th className="px-6 py-4 text-center">Adet</th>
                  <th className="px-6 py-4 text-right">Tutar</th>
                  <th className="px-6 py-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      Kayıt yok.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                        {new Date(r.date).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-6 py-4">
                        {r.kind === 'OPENING' ? (
                          r.direction === 'OUT' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20">
                              Açılış Borç
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                              Açılış Alacak
                            </span>
                          )
                        ) : r.kind === 'PAYMENT' ? (
                          r.direction === 'OUT' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-amber-500/10 text-amber-200 border border-amber-500/20">
                              Ödeme
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              Tahsilat
                            </span>
                          )
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs border ${
                              r.type === 'IN' && r.txKind === 'RETURN'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                : r.type === 'IN'
                                  ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                  : 'bg-red-500/10 text-red-300 border-red-500/20'
                            }`}
                          >
                            {r.type === 'IN' && r.txKind === 'RETURN' ? 'İade' : r.type === 'IN' ? 'Alış' : 'Satış'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {r.kind === 'OPENING' ? (
                          <div className="text-sm">
                            <div className="text-white font-medium">Açılış Bakiyesi</div>
                            <div className="text-xs text-zinc-500">Sabit tarih: 01.01.2000</div>
                          </div>
                        ) : r.kind === 'PAYMENT' ? (
                          <div className="text-sm">
                            <div className="text-white font-medium">{r.method}</div>
                            {r.description ? <div className="text-xs text-zinc-500">{r.description}</div> : <div className="text-xs text-zinc-600">—</div>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {r.image ? <img src={r.image} className="w-full h-full object-contain" alt={r.itemName ?? ''} /> : <Package className="w-4 h-4 text-zinc-700" />}
                            </div>
                            <div>
                              <div className="font-medium text-white line-clamp-1">{r.itemName}</div>
                              <div className="text-xs text-zinc-500">{r.barcode}</div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {r.kind === 'TX' ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${r.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {r.type === 'IN' ? '+' : '-'}{r.quantity}
                          </span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${
                        r.kind === 'OPENING'
                          ? (r.direction === 'OUT' ? 'text-rose-300' : 'text-cyan-300')
                          : r.kind === 'PAYMENT'
                          ? (r.direction === 'OUT' ? 'text-amber-200' : 'text-emerald-300')
                          : 'text-blue-300'
                      }`}>
                        {currency(Number(r.totalPrice) || 0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.kind === 'OPENING' ? (
                          <span className="text-xs text-zinc-600">Sabit</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" className="border-zinc-700 px-2" onClick={() => openEdit(r)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" className="px-2" onClick={() => openDelete(r)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(open) => !savingEdit && setEditOpen(open)}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>
              {editingRow?.kind === 'PAYMENT'
                ? (editingRow.direction === 'OUT' ? 'Ödeme Düzenle' : 'Tahsilat Düzenle')
                : 'Hareket Düzenle'}
            </DialogTitle>
            <DialogDescription>
              {editingRow?.kind === 'PAYMENT'
                ? (editingRow.direction === 'OUT' ? 'Ödeme bilgisini güncelleyin.' : 'Tahsilat bilgisini güncelleyin.')
                : 'Satış / alış / iade hareketini güncelleyin.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Tarih</label>
              <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>

            {editingRow?.kind === 'PAYMENT' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Tutar</label>
                  <Input
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="Örn: 1500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Ödeme Cinsi</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={`gap-2 border-zinc-700 ${editMethod === 'Banka' ? 'bg-sky-600/20 text-white border-sky-500/50' : ''}`}
                      onClick={() => setEditMethod('Banka')}
                    >
                      <Landmark className="w-4 h-4" />
                      Banka
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={`gap-2 border-zinc-700 ${editMethod === 'Nakit' ? 'bg-emerald-600/20 text-white border-emerald-500/50' : ''}`}
                      onClick={() => setEditMethod('Nakit')}
                    >
                      <Banknote className="w-4 h-4" />
                      Nakit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={`gap-2 border-zinc-700 ${editMethod === 'Diğer' ? 'bg-zinc-700/30 text-white border-zinc-500/50' : ''}`}
                      onClick={() => setEditMethod('Diğer')}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      Diğer
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Açıklama (opsiyonel)</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="İsterseniz açıklama girebilirsiniz..."
                    className="w-full min-h-[90px] rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-zinc-950"
                  />
                </div>
              </>
            ) : (
              <>
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
                  <label className="text-sm font-medium text-zinc-300">Birim Fiyat</label>
                  <Input
                    inputMode="decimal"
                    value={editUnitPrice}
                    onChange={(e) => setEditUnitPrice(e.target.value)}
                    placeholder="Örn: 200"
                    disabled={!(editingRow?.type === 'OUT' || (editingRow?.type === 'IN' && editingRow?.txKind === 'RETURN'))}
                  />
                  {!(editingRow?.type === 'OUT' || (editingRow?.type === 'IN' && editingRow?.txKind === 'RETURN')) && (
                    <p className="text-xs text-zinc-500">Sadece satış/iade hareketlerinde fiyat düzenlenir.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              İptal
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitEdit} disabled={savingEdit}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Silme Onayı
            </DialogTitle>
            <DialogDescription className="sr-only">Silme onayı.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-zinc-300">Seçili kaydı silmek istiyor musunuz?</p>
            {editingRow?.kind === 'TX' && (
              <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                Bu bir stok hareketi olduğu için silince stok miktarı otomatik düzeltilecek.
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Vazgeç</Button>
            <Button variant="destructive" onClick={submitDelete}>Evet, Sil</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moneyOpen} onOpenChange={setMoneyOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>{moneyDirection === 'IN' ? 'Tahsilat Ekle' : 'Ödeme Ekle'}</DialogTitle>
            <DialogDescription>
              {moneyDirection === 'IN'
                ? 'Tahsilat tarihi, tutarı ve ödeme cinsini seçin. Açıklama opsiyonel.'
                : 'Ödeme tarihi, tutarı ve ödeme cinsini seçin. Açıklama opsiyonel.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">{moneyDirection === 'IN' ? 'Tahsilat Tarihi' : 'Ödeme Tarihi'}</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">{moneyDirection === 'IN' ? 'Tahsilat Tutarı' : 'Ödeme Tutarı'}</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Örn: 1500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Ödeme Cinsi</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={`gap-2 border-zinc-700 ${payMethod === 'Banka' ? 'bg-sky-600/20 text-white border-sky-500/50' : ''}`}
                  onClick={() => setPayMethod('Banka')}
                >
                  <Landmark className="w-4 h-4" />
                  Banka
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`gap-2 border-zinc-700 ${payMethod === 'Nakit' ? 'bg-emerald-600/20 text-white border-emerald-500/50' : ''}`}
                  onClick={() => setPayMethod('Nakit')}
                >
                  <Banknote className="w-4 h-4" />
                  Nakit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`gap-2 border-zinc-700 ${payMethod === 'Diğer' ? 'bg-zinc-700/30 text-white border-zinc-500/50' : ''}`}
                  onClick={() => setPayMethod('Diğer')}
                >
                  <MoreHorizontal className="w-4 h-4" />
                  Diğer
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Açıklama (opsiyonel)</label>
              <textarea
                value={payDesc}
                onChange={(e) => setPayDesc(e.target.value)}
                placeholder="İsterseniz açıklama girebilirsiniz..."
                className="w-full min-h-[90px] rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-zinc-950"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700" onClick={() => setMoneyOpen(false)} disabled={saving}>
              İptal
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submitMoney} disabled={saving}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
