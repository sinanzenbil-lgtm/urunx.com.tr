'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  X,
  Package,
  PlusCircle,
  Trash2,
  Loader2,
  FileText,
  Users,
  CalendarDays,
  ShoppingBag,
  Tag,
  Percent,
} from 'lucide-react';
import { Customer, StockItem } from '@/types';
import * as dbActions from '@/lib/actions';
import * as quoteActions from '@/lib/quotes';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

const toNumber = (raw: string | number) => {
  const normalized = String(raw ?? '').replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const todayInput = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const plusDaysInput = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

interface QuoteLine {
  id: string;
  stockItem: StockItem;
  unitPrice: string; // KDV hariç teklif birim fiyatı (input değeri)
  quantity: string;
  vatRate: string;
}

function lineMath(line: { unitPrice: string; quantity: string; vatRate: string }) {
  const unitPrice = Math.max(0, toNumber(line.unitPrice));
  const quantity = Math.max(0, Math.floor(toNumber(line.quantity)));
  const vatRate = Math.max(0, toNumber(line.vatRate));
  const subtotal = round2(unitPrice * quantity);
  const vat = round2((subtotal * vatRate) / 100);
  const total = round2(subtotal + vat);
  return { unitPrice, quantity, vatRate, subtotal, vat, total };
}

export default function YeniTeklifPage() {
  const router = useRouter();
  const items = useStockStore((s) => s.items);
  const dbSyncStatus = useStockStore((s) => s.dbSyncStatus);

  // Cari
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerComboRef = useRef<HTMLDivElement>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerCode, setNewCustomerCode] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  // Tarih
  const [date, setDate] = useState(todayInput());
  const [validUntil, setValidUntil] = useState(plusDaysInput(15));
  const [note, setNote] = useState('');

  // Ürün seçimi (hazırlık alanı)
  const [productQuery, setProductQuery] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productComboRef = useRef<HTMLDivElement>(null);
  const [pendingItem, setPendingItem] = useState<StockItem | null>(null);
  const [pendingPrice, setPendingPrice] = useState('');
  const [pendingQty, setPendingQty] = useState('1');
  const [pendingVat, setPendingVat] = useState('20');
  const pendingPriceRef = useRef<HTMLInputElement>(null);

  // Satırlar
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rows, qsRes] = await Promise.all([dbActions.getCustomers(), quoteActions.getQuoteSettings()]);
      if (cancelled) return;
      setCustomers(rows || []);
      // Teklif ayarları: varsayılan geçerlilik süresi ve not
      const qs = qsRes.settings;
      setValidUntil(qs.validityDays > 0 ? plusDaysInput(qs.validityDays) : '');
      setNote((prev) => prev || qs.defaultNote || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (customerComboRef.current && !customerComboRef.current.contains(e.target as Node)) setCustomerDropdownOpen(false);
      if (productComboRef.current && !productComboRef.current.contains(e.target as Node)) setProductDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const customersForDropdown = useMemo(() => {
    const q = customerQuery.trim().toLocaleLowerCase('tr-TR');
    const list = q
      ? customers.filter((c) => {
          const name = (c.name || '').toLocaleLowerCase('tr-TR');
          const code = (c.customerCode || '').toLocaleLowerCase('tr-TR');
          return name.includes(q) || code.includes(q);
        })
      : customers;
    return list.slice(0, 50);
  }, [customers, customerQuery]);

  const productsForDropdown = useMemo(() => {
    const q = productQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return [];
    return items
      .filter((item) => {
        const name = (item.name || '').toLocaleLowerCase('tr-TR');
        const barcode = (item.barcode || '').toLocaleLowerCase('tr-TR');
        const stockCode = (item.stockCode || '').toLocaleLowerCase('tr-TR');
        const brand = (item.brand || '').toLocaleLowerCase('tr-TR');
        return name.includes(q) || barcode.includes(q) || stockCode.includes(q) || brand.includes(q);
      })
      .slice(0, 40);
  }, [items, productQuery]);

  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerQuery(c.customerCode ? `${c.customerCode} — ${c.name}` : c.name);
    setCustomerDropdownOpen(false);
  };

  const pickProduct = (item: StockItem) => {
    setPendingItem(item);
    setPendingPrice(Number(item.sellPrice) > 0 ? String(Number(item.sellPrice)) : '');
    setPendingQty('1');
    setPendingVat(String(Number.isFinite(Number(item.vatRate)) ? Number(item.vatRate) : 20));
    setProductQuery('');
    setProductDropdownOpen(false);
    setTimeout(() => {
      pendingPriceRef.current?.focus();
      pendingPriceRef.current?.select();
    }, 0);
  };

  const pending = useMemo(
    () => lineMath({ unitPrice: pendingPrice, quantity: pendingQty, vatRate: pendingVat }),
    [pendingPrice, pendingQty, pendingVat]
  );

  const addLine = () => {
    if (!pendingItem) {
      toast.error('Önce bir ürün seçin');
      return;
    }
    if (pending.unitPrice <= 0) {
      toast.error('Teklif fiyatı girilmeli');
      pendingPriceRef.current?.focus();
      return;
    }
    if (pending.quantity <= 0) {
      toast.error('Adet 1 veya daha fazla olmalı');
      return;
    }
    const newLine: QuoteLine = {
      id: uuidv4(),
      stockItem: pendingItem,
      unitPrice: String(pending.unitPrice),
      quantity: String(pending.quantity),
      vatRate: String(pending.vatRate),
    };
    setLines((prev) => [...prev, newLine]);
    setPendingItem(null);
    setPendingPrice('');
    setPendingQty('1');
    setPendingVat('20');
    toast.success(`${pendingItem.name} teklife eklendi`);
  };

  const updateLine = (id: string, patch: Partial<Pick<QuoteLine, 'unitPrice' | 'quantity' | 'vatRate'>>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const l of lines) {
      const m = lineMath(l);
      subtotal += m.subtotal;
      vat += m.vat;
    }
    subtotal = round2(subtotal);
    vat = round2(vat);
    return { subtotal, vat, grand: round2(subtotal + vat) };
  }, [lines]);

  const canSubmit = !!selectedCustomer && lines.length > 0 && lines.every((l) => lineMath(l).unitPrice > 0 && lineMath(l).quantity > 0);

  const submitQuote = async () => {
    if (!selectedCustomer) {
      toast.error('Teklif için cari seçmelisiniz');
      return;
    }
    if (lines.length === 0) {
      toast.error('En az bir ürün satırı ekleyin');
      return;
    }
    const invalid = lines.find((l) => lineMath(l).unitPrice <= 0 || lineMath(l).quantity <= 0);
    if (invalid) {
      toast.error(`"${invalid.stockItem.name}" satırında fiyat/adet eksik`);
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Teklif oluşturuluyor...');
    try {
      const res = await quoteActions.createQuote({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCode: selectedCustomer.customerCode || null,
        date: new Date(`${date}T12:00:00`).toISOString(),
        validUntil: validUntil ? new Date(`${validUntil}T12:00:00`).toISOString() : null,
        note: note.trim() || null,
        lines: lines.map((l) => {
          const m = lineMath(l);
          return {
            itemId: l.stockItem.id,
            name: l.stockItem.name,
            stockCode: l.stockItem.stockCode || null,
            barcode: l.stockItem.barcode || null,
            brand: l.stockItem.brand || null,
            buyPrice: Number(l.stockItem.buyPrice) || 0,
            unitPrice: m.unitPrice,
            quantity: m.quantity,
            vatRate: m.vatRate,
          };
        }),
      });
      if (!res.success || !res.quoteId) throw new Error(res.error || 'Teklif kaydedilemedi');
      toast.success(`${res.quoteNo} numaralı teklif oluşturuldu`, { id: toastId });
      router.push(`/teklif/${res.quoteId}?indir=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Teklif kaydedilemedi';
      toast.error(message, { id: toastId });
      setSaving(false);
    }
  };

  const submitNewCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) {
      toast.error('Cari ismi boş olamaz');
      return;
    }
    setNewCustomerSaving(true);
    const toastId = toast.loading('Cari ekleniyor...');
    try {
      const res = await dbActions.addCustomer({ customerCode: newCustomerCode.trim(), name });
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      const rows = await dbActions.getCustomers();
      setCustomers(rows || []);
      const created = (rows || []).find((c) => c.name === name && (!newCustomerCode.trim() || c.customerCode === newCustomerCode.trim()));
      if (created) pickCustomer(created);
      toast.success('Cari eklendi', { id: toastId });
      setAddCustomerOpen(false);
      setNewCustomerCode('');
      setNewCustomerName('');
    } catch {
      toast.error('Cari eklenemedi', { id: toastId });
    } finally {
      setNewCustomerSaving(false);
    }
  };

  const labelCls = 'text-[10px] uppercase tracking-wider text-zinc-500 font-semibold';

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
            Yeni Teklif
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Cari ve tarihi seçin, ürünleri satır satır ekleyin, ardından teklifi oluşturun.</p>
        </div>
        <Link href="/teklif">
          <Button variant="outline" className="border-zinc-700 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Teklif Listesi
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sol: Teklif bilgileri + ürün ekleme */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-400" />
                Cari ve Tarih
              </CardTitle>
              <CardDescription>Teklifin hazırlandığı müşteri ve tarih bilgileri</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className={labelCls}>Cari Seç</label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Yeni Cari
                  </button>
                </div>
                <div className="relative z-30" ref={customerComboRef}>
                  <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500 pointer-events-none" />
                  <Input
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setSelectedCustomerId('');
                      setCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    placeholder="Cari isim veya kodu yazın..."
                    className="pl-10 pr-10 h-12"
                    autoComplete="off"
                  />
                  {customerQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerQuery('');
                        setSelectedCustomerId('');
                        setCustomerDropdownOpen(false);
                      }}
                      className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  )}
                  {customerDropdownOpen && !selectedCustomerId && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 shadow-xl">
                      {customersForDropdown.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-zinc-500 text-center">Cari bulunamadı.</div>
                      ) : (
                        customersForDropdown.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCustomer(c)}
                            className="w-full text-left px-3 py-2.5 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-900 transition-colors"
                          >
                            <div className="font-medium text-white">{c.name}</div>
                            <div className="text-xs text-zinc-500">{c.customerCode || '-'}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between text-xs rounded-md border border-sky-700/40 bg-sky-500/10 px-3 py-2">
                    <span className="text-sky-200">
                      Seçili: {(selectedCustomer.customerCode ? `${selectedCustomer.customerCode} - ` : '') + selectedCustomer.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setCustomerQuery('');
                      }}
                      className="text-sky-300 hover:text-sky-200"
                    >
                      Temizle
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-amber-300">Teklif oluşturmak için cari seçmelisiniz</div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={labelCls}>Teklif Tarihi</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-9 h-11" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Geçerlilik Tarihi (opsiyonel)</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="pl-9 h-11" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                Ürün Ekle
              </CardTitle>
              <CardDescription>
                Ürünü arayıp seçin, teklif fiyatını ve adedi girin, &quot;Ürün Ekle&quot; ile satıra dönüştürün.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative z-20" ref={productComboRef}>
                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500 pointer-events-none" />
                <Input
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    setProductDropdownOpen(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => {
                    if (productQuery.trim().length > 0) setProductDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productsForDropdown.length > 0) {
                      e.preventDefault();
                      pickProduct(productsForDropdown[0]);
                    }
                  }}
                  placeholder="Ürün adı, stok kodu, barkod veya marka yazın..."
                  className="pl-10 pr-10 h-12"
                  autoComplete="off"
                />
                {productQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductQuery('');
                      setProductDropdownOpen(false);
                    }}
                    className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                )}
                {productDropdownOpen && productQuery.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 shadow-xl">
                    {dbSyncStatus === 'syncing' && items.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-zinc-500 text-center">
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        Ürünler yükleniyor...
                      </div>
                    ) : productsForDropdown.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-zinc-500 text-center">Ürün bulunamadı.</div>
                    ) : (
                      productsForDropdown.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickProduct(item)}
                          className="w-full text-left px-3 py-2.5 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-900 transition-colors flex items-center gap-3"
                        >
                          <div className="w-11 h-11 rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                            {item.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-zinc-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-white truncate">{item.name}</div>
                            <div className="text-xs text-zinc-500 truncate">
                              {[item.stockCode, item.barcode, item.brand].filter(Boolean).join(' • ') || '-'}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-zinc-500">Alış: {currency(item.buyPrice)}</div>
                            <div className="text-xs text-zinc-400">Satış: {currency(item.sellPrice)}</div>
                            <div className="text-[10px] text-zinc-600">Stok: {item.quantity} • KDV %{item.vatRate}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {pendingItem ? (
                <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/5 p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-md bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                      {pendingItem.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pendingItem.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate">{pendingItem.name}</div>
                      <div className="text-xs text-zinc-500 truncate">
                        {[pendingItem.stockCode, pendingItem.barcode, pendingItem.brand].filter(Boolean).join(' • ') || '-'}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Stokta <span className="text-white font-medium">{pendingItem.quantity}</span> adet
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingItem(null)}
                      className="text-zinc-500 hover:text-white"
                      title="Seçimi kaldır"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <label className={labelCls}>Alış Fiyatı (bilgi)</label>
                      <div className="h-11 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 flex items-center text-zinc-300 font-medium">
                        {currency(pendingItem.buyPrice)}
                      </div>
                      <div className="text-[10px] text-zinc-600">PDF&apos;e yazılmaz</div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Teklif Fiyatı (KDV hariç)</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-3.5 w-4 h-4 text-emerald-500 pointer-events-none" />
                        <Input
                          ref={pendingPriceRef}
                          type="number"
                          min={0}
                          step="0.01"
                          value={pendingPrice}
                          onChange={(e) => setPendingPrice(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addLine();
                            }
                          }}
                          className="pl-9 h-11 font-semibold text-white border-emerald-700/40"
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Adet</label>
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        value={pendingQty}
                        onChange={(e) => setPendingQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addLine();
                          }
                        }}
                        className="h-11 text-center font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>KDV Oranı</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          value={pendingVat}
                          onChange={(e) => setPendingVat(e.target.value)}
                          className="pl-9 h-11"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="text-sm text-zinc-400">
                      KDV hariç <span className="text-white font-medium">{currency(pending.subtotal)}</span>
                      <span className="mx-2 text-zinc-700">|</span>
                      KDV <span className="text-white font-medium">{currency(pending.vat)}</span>
                      <span className="mx-2 text-zinc-700">|</span>
                      Toplam <span className="text-emerald-300 font-bold">{currency(pending.total)}</span>
                    </div>
                    <Button onClick={addLine} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 px-5">
                      <PlusCircle className="w-5 h-5" />
                      Ürün Ekle
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                  Yukarıdan bir ürün arayıp seçin. Seçtiğiniz ürünün alış fiyatı bilgi amaçlı gösterilir, teklif fiyatını siz yazarsınız.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white">Teklif Satırları</CardTitle>
                <span className="text-xs text-zinc-500">{lines.length} kalem</span>
              </div>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">Henüz satır eklenmedi.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-950/60 text-zinc-400">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-medium w-10">#</th>
                        <th className="text-left px-3 py-2.5 font-medium">Ürün</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Alış</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Birim Fiyat</th>
                        <th className="text-right px-3 py-2.5 font-medium">Adet</th>
                        <th className="text-right px-3 py-2.5 font-medium">KDV %</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Toplam (KDV dahil)</th>
                        <th className="px-2 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const m = lineMath(line);
                        const invalid = m.unitPrice <= 0 || m.quantity <= 0;
                        return (
                          <tr key={line.id} className={cn('border-t border-zinc-800', invalid && 'bg-amber-500/5')}>
                            <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3 min-w-[200px]">
                                <div className="w-10 h-10 rounded-md bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                                  {line.stockItem.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={line.stockItem.image} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <Package className="w-4 h-4 text-zinc-600" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-white font-medium truncate max-w-[260px]">{line.stockItem.name}</div>
                                  <div className="text-xs text-zinc-500 truncate">
                                    {[line.stockItem.stockCode, line.stockItem.barcode].filter(Boolean).join(' • ') || '-'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-500 whitespace-nowrap">{currency(line.stockItem.buyPrice)}</td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={line.unitPrice}
                                onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                                className={cn('h-9 w-28 text-right ml-auto', m.unitPrice <= 0 && 'border-amber-600/60')}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                value={line.quantity}
                                onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                                className={cn('h-9 w-20 text-right ml-auto', m.quantity <= 0 && 'border-amber-600/60')}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={line.vatRate}
                                onChange={(e) => updateLine(line.id, { vatRate: e.target.value })}
                                className="h-9 w-20 text-right ml-auto"
                              />
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="text-white font-semibold">{currency(m.total)}</div>
                              <div className="text-[11px] text-zinc-500">
                                {currency(m.subtotal)} + KDV {currency(m.vat)}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="text-rose-400 hover:text-rose-300 p-1"
                                title="Satırı sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sağ: Özet */}
        <div className="space-y-6">
          <Card className="bg-zinc-900/60 border-zinc-800 xl:sticky xl:top-24">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white">Teklif Özeti</CardTitle>
              <CardDescription>Oluşturulan teklif PDF olarak indirilebilir</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Cari</span>
                  <span className="text-white font-medium text-right truncate max-w-[60%]">{selectedCustomer?.name || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Tarih</span>
                  <span className="text-white">{date ? new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR') : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Kalem</span>
                  <span className="text-white">{lines.length}</span>
                </div>
              </div>

              <div className="h-px bg-zinc-800" />

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Ara Toplam (KDV hariç)</span>
                  <span className="text-white font-medium">{currency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Toplam KDV</span>
                  <span className="text-white font-medium">{currency(totals.vat)}</span>
                </div>
                <div className="h-px bg-zinc-800" />
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold">Genel Toplam</span>
                  <span className="text-2xl font-extrabold text-emerald-300">{currency(totals.grand)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className={labelCls}>Not (opsiyonel, PDF&apos;te görünür)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Teslim süresi, ödeme koşulları vb."
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>

              <Button
                onClick={submitQuote}
                disabled={!canSubmit || saving}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white gap-2 text-base font-semibold"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                Teklif Oluştur
              </Button>
              {!canSubmit && (
                <div className="text-xs text-zinc-500 text-center">
                  {!selectedCustomer ? 'Cari seçin' : lines.length === 0 ? 'En az bir ürün ekleyin' : 'Eksik fiyat/adet olan satırları düzeltin'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Yeni Cari</DialogTitle>
            <DialogDescription>Teklif için hızlıca yeni bir cari ekleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Cari Kodu (opsiyonel)</label>
              <Input value={newCustomerCode} onChange={(e) => setNewCustomerCode(e.target.value)} placeholder="Örn: C001" />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Cari İsmi</label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Firma / kişi adı"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNewCustomer();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setAddCustomerOpen(false)} disabled={newCustomerSaving}>
              Vazgeç
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitNewCustomer} disabled={newCustomerSaving}>
              {newCustomerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
