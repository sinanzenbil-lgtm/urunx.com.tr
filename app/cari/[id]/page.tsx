'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Package, PlusCircle, Landmark, Banknote, MoreHorizontal } from 'lucide-react';
import * as dbActions from '@/lib/actions';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

export default function CariDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id as string;

  const [rows, setRows] = useState<any[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [payDate, setPayDate] = useState(today);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Banka' | 'Nakit' | 'Diğer'>('Banka');
  const [payDesc, setPayDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await dbActions.getCustomerMovements(customerId);
      if (!cancelled) setRows((res as any).rows || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const totals = useMemo(() => {
    const sales = rows.filter((r) => r.kind === 'TX' && r.type === 'OUT');
    const payments = rows.filter((r) => r.kind === 'PAYMENT');
    const qty = sales.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
    const salesAmount = sales.reduce((acc, r) => acc + (Number(r.totalPrice) || 0), 0);
    const paymentAmount = payments.reduce((acc, r) => acc + (Number(r.totalPrice) || 0), 0);
    const balance = salesAmount - paymentAmount;
    return { qty, salesAmount, paymentAmount, balance };
  }, [rows]);

  const submitPayment = async () => {
    const amount = Number(String(payAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Tahsilat tutarı geçerli olmalı');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Tahsilat kaydediliyor...');
    try {
      const isoDate = new Date(`${payDate}T12:00:00`).toISOString();
      const res = await dbActions.addCustomerPayment({
        customerId,
        date: isoDate,
        amount,
        method: payMethod,
        description: payDesc.trim() || undefined,
      });
      if (!(res as any).success) throw new Error(String((res as any).error || 'failed'));
      const updated = await dbActions.getCustomerMovements(customerId);
      setRows((updated as any).rows || []);
      toast.success('Tahsilat eklendi', { id: toastId });
      setPaymentOpen(false);
      setPayAmount('');
      setPayDesc('');
      setPayMethod('Banka');
      setPayDate(today);
    } catch (err) {
      toast.error('Tahsilat eklenirken hata oluştu', { id: toastId });
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setSaving(false);
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
            onClick={() => setPaymentOpen(true)}
          >
            <PlusCircle className="w-5 h-5" />
            Tahsilat Ekle
          </Button>
          <Link href="/cari">
            <Button variant="outline" className="border-zinc-700 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Geri
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Toplam Satış Adedi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-white">{totals.qty}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Toplam Satış Tutarı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-300">{currency(totals.salesAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Toplam Tahsilat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-300">{currency(totals.paymentAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Bakiye (Borç/Alacak)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-black ${totals.balance > 0 ? 'text-red-400' : totals.balance < 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>
              {totals.balance > 0 ? `Borç ${currency(totals.balance)}` : totals.balance < 0 ? `Alacak ${currency(Math.abs(totals.balance))}` : currency(0)}
            </div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
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
                        {r.kind === 'PAYMENT' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            Tahsilat
                          </span>
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
                            {r.type === 'IN' && r.txKind === 'RETURN' ? 'İade' : r.type === 'IN' ? 'Stok Giriş' : 'Satış'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {r.kind === 'PAYMENT' ? (
                          <div className="text-sm">
                            <div className="text-white font-medium">{r.method}</div>
                            {r.description ? <div className="text-xs text-zinc-500">{r.description}</div> : <div className="text-xs text-zinc-600">—</div>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {r.image ? <img src={r.image} className="w-full h-full object-contain" alt={r.itemName} /> : <Package className="w-4 h-4 text-zinc-700" />}
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
                      <td className={`px-6 py-4 text-right font-bold ${r.kind === 'PAYMENT' ? 'text-emerald-300' : 'text-blue-300'}`}>
                        {currency(Number(r.totalPrice) || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Tahsilat Ekle</DialogTitle>
            <DialogDescription>
              Tahsilat tarihi, tutarı ve ödeme cinsini seçin. Açıklama opsiyonel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Tahsilat Tarihi</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Tahsilat Tutarı</label>
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
            <Button variant="outline" className="border-zinc-700" onClick={() => setPaymentOpen(false)} disabled={saving}>
              İptal
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submitPayment} disabled={saving}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

