'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, PlusCircle, Search, Trash2, Eye, FileDown, Loader2, Settings, Pencil } from 'lucide-react';
import { DEFAULT_QUOTE_SETTINGS, Quote, QuoteSettings, QuoteStatus, QUOTE_STATUS_OPTIONS } from '@/types';
import * as quoteActions from '@/lib/quotes';
import { cn } from '@/lib/utils';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

const STATUS_STYLES: Record<QuoteStatus, string> = {
  HAZIRLANDI: 'bg-zinc-500/15 text-zinc-300 border-zinc-600/40',
  GONDERILDI: 'bg-sky-500/15 text-sky-300 border-sky-600/40',
  ONAYLANDI: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  REDDEDILDI: 'bg-rose-500/15 text-rose-300 border-rose-600/40',
};

export default function TeklifListPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'ALL'>('ALL');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [qs, setQs] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);

  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    const res = await quoteActions.getQuoteSettings();
    setQs(res.settings);
    setSettingsLoading(false);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    const toastId = toast.loading('Ayarlar kaydediliyor...');
    const res = await quoteActions.upsertQuoteSettings(qs);
    setSettingsSaving(false);
    if (!res.success) {
      toast.error('Ayarlar kaydedilemedi', { id: toastId });
      return;
    }
    toast.success('Teklif ayarları kaydedildi', { id: toastId });
    setSettingsOpen(false);
  };

  const load = async () => {
    setLoading(true);
    const rows = await quoteActions.getQuotes();
    setQuotes(rows || []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await quoteActions.getQuotes();
      if (cancelled) return;
      setQuotes(rows || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLocaleLowerCase('tr-TR');
    return quotes.filter((quote) => {
      if (statusFilter !== 'ALL' && quote.status !== statusFilter) return false;
      if (!query) return true;
      return (
        quote.quoteNo.toLocaleLowerCase('tr-TR').includes(query) ||
        (quote.customerName || '').toLocaleLowerCase('tr-TR').includes(query) ||
        (quote.customerCode || '').toLocaleLowerCase('tr-TR').includes(query)
      );
    });
  }, [quotes, q, statusFilter]);

  const totals = useMemo(() => {
    const count = filtered.length;
    const sum = filtered.reduce((acc, quote) => acc + (Number(quote.grandTotal) || 0), 0);
    return { count, sum };
  }, [filtered]);

  const changeStatus = async (quote: Quote, status: QuoteStatus) => {
    if (quote.status === status) return;
    const prev = quotes;
    setQuotes((rows) => rows.map((r) => (r.id === quote.id ? { ...r, status } : r)));
    const res = await quoteActions.updateQuoteStatus(quote.id, status);
    if (!res.success) {
      setQuotes(prev);
      toast.error('Durum güncellenemedi');
      return;
    }
    toast.success('Teklif durumu güncellendi');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const toastId = toast.loading('Teklif siliniyor...');
    const res = await quoteActions.removeQuote(deleting.id);
    setBusy(false);
    if (!res.success) {
      toast.error('Teklif silinemedi', { id: toastId });
      return;
    }
    toast.success('Teklif silindi', { id: toastId });
    setDeleteOpen(false);
    setDeleting(null);
    await load();
  };

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
            Teklifler
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Hazırlanan teklifleri görüntüleyin, PDF olarak indirin ve durumlarını takip edin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-zinc-700 gap-2 h-11" onClick={openSettings}>
            <Settings className="w-4 h-4" />
            Ayarlar
          </Button>
          <Link href="/teklif/yeni">
            <Button className="bg-primary hover:bg-primary/90 text-white gap-2 h-11 px-5">
              <PlusCircle className="w-5 h-5" />
              Yeni Teklif Oluştur
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Toplam Teklif</div>
            <div className="text-2xl font-bold text-white mt-1">{quotes.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Onaylanan</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{quotes.filter((x) => x.status === 'ONAYLANDI').length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Bekleyen</div>
            <div className="text-2xl font-bold text-sky-400 mt-1">
              {quotes.filter((x) => x.status === 'HAZIRLANDI' || x.status === 'GONDERILDI').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Listelenen Tutar</div>
            <div className="text-xl font-bold text-white mt-1 truncate">{currency(totals.sum)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <CardTitle className="text-lg text-white">Teklif Listesi</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    statusFilter === 'ALL' ? 'bg-white/10 text-white border-white/20' : 'text-zinc-400 border-zinc-800 hover:text-white'
                  )}
                >
                  Tümü
                </button>
                {QUOTE_STATUS_OPTIONS.map((o) => (
                  <button
                    type="button"
                    key={o.key}
                    onClick={() => setStatusFilter(o.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      statusFilter === o.key ? STATUS_STYLES[o.key] : 'text-zinc-400 border-zinc-800 hover:text-white'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teklif no / cari ara..." className="pl-9" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950/60 text-zinc-400">
                <tr>
                  <th className="text-left px-3 py-3 font-medium">Teklif No</th>
                  <th className="text-left px-3 py-3 font-medium">Tarih</th>
                  <th className="text-left px-3 py-3 font-medium">Cari</th>
                  <th className="text-right px-3 py-3 font-medium">Kalem</th>
                  <th className="text-right px-3 py-3 font-medium">KDV Hariç</th>
                  <th className="text-right px-3 py-3 font-medium">Genel Toplam</th>
                  <th className="text-left px-3 py-3 font-medium">Durum</th>
                  <th className="text-right px-3 py-3 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-zinc-500">
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                      Teklifler yükleniyor...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                      {quotes.length === 0 ? (
                        <div className="space-y-3">
                          <div>Henüz teklif oluşturulmadı.</div>
                          <Link href="/teklif/yeni" className="inline-block">
                            <Button variant="outline" className="border-zinc-700 gap-2">
                              <PlusCircle className="w-4 h-4" />
                              İlk teklifi oluştur
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        'Aramanıza uygun teklif bulunamadı.'
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((quote) => (
                    <tr key={quote.id} className="border-t border-zinc-800 hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3 font-mono text-white whitespace-nowrap">
                        <Link href={`/teklif/${quote.id}`} className="hover:text-primary transition-colors">
                          {quote.quoteNo}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-zinc-300 whitespace-nowrap">
                        <div>{formatDate(quote.date)}</div>
                        {quote.validUntil ? (
                          <div className="text-[11px] text-zinc-500">Geçerlilik: {formatDate(quote.validUntil)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-white font-medium">{quote.customerName || '-'}</div>
                        {quote.customerCode ? <div className="text-xs text-zinc-500">{quote.customerCode}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-300">{quote.itemCount ?? '-'}</td>
                      <td className="px-3 py-3 text-right text-zinc-300 whitespace-nowrap">{currency(quote.subtotal)}</td>
                      <td className="px-3 py-3 text-right text-white font-semibold whitespace-nowrap">{currency(quote.grandTotal)}</td>
                      <td className="px-3 py-3">
                        <select
                          value={quote.status}
                          onChange={(e) => changeStatus(quote, e.target.value as QuoteStatus)}
                          className={cn(
                            'h-8 rounded-md border px-2 text-xs font-medium bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-primary',
                            STATUS_STYLES[quote.status]
                          )}
                        >
                          {QUOTE_STATUS_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key} className="bg-zinc-950 text-white">
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/teklif/${quote.id}`} title="Görüntüle">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Link href={`/teklif/yeni?id=${quote.id}`} title="Düzenle">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-400 hover:text-amber-300">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Link href={`/teklif/${quote.id}?indir=1`} title="PDF İndir">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-400 hover:text-sky-300">
                              <FileDown className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-400 hover:text-rose-300"
                            title="Sil"
                            onClick={() => {
                              setDeleting(quote);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && filtered.length > 0 ? (
                <tfoot className="bg-zinc-950/60 border-t border-zinc-800">
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-zinc-400 text-xs uppercase tracking-wider font-semibold">
                      {totals.count} teklif
                    </td>
                    <td className="px-3 py-3 text-right text-white font-bold whitespace-nowrap">{currency(totals.sum)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Teklifi sil</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-white">{deleting?.quoteNo}</span> numaralı teklif kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={confirmDelete} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Teklif Formu Ayarları
            </DialogTitle>
            <DialogDescription>
              Burada tanımlanan başlık, açıklama maddeleri ve varsayılanlar teklif PDF&apos;inde ve yeni teklif formunda kullanılır.
            </DialogDescription>
          </DialogHeader>
          {settingsLoading ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
              Ayarlar yükleniyor...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Üst Başlık</label>
                  <Input value={qs.subtitle} onChange={(e) => setQs({ ...qs, subtitle: e.target.value })} placeholder="FİYAT TEKLİFİ" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Ana Başlık</label>
                  <Input value={qs.title} onChange={(e) => setQs({ ...qs, title: e.target.value })} placeholder="TEKLİF FORMU" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Geçerlilik (gün)</label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={qs.validityDays}
                    onChange={(e) => setQs({ ...qs, validityDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                  <div className="text-[10px] text-zinc-600">0 = geçerlilik tarihi önerilmez</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Açıklama / Koşullar (her satır bir madde)</label>
                <textarea
                  value={qs.terms}
                  onChange={(e) => setQs({ ...qs, terms: e.target.value })}
                  rows={5}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder={'Fiyatlar Türk Lirası (₺) cinsindendir; KDV tutarları ayrıca gösterilmiştir.\nBu teklif {gecerlilik} tarihine kadar geçerlidir.'}
                />
                <div className="text-[10px] text-zinc-600">
                  <code className="text-zinc-400">{'{gecerlilik}'}</code> yazan yere teklifin geçerlilik tarihi gelir; geçerlilik tarihi yoksa o madde gösterilmez.
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Varsayılan Not (yeni teklifte önceden dolu gelir)</label>
                <textarea
                  value={qs.defaultNote}
                  onChange={(e) => setQs({ ...qs, defaultNote: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Teslimat 5 iş günü içinde yapılır. Ödeme: %50 sipariş onayında, %50 teslimatta."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>
              Vazgeç
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-white" onClick={saveSettings} disabled={settingsSaving || settingsLoading}>
              {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
