'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription as DDesc, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RotateCcw, Scan, Search, X, Package, Save, Trash2, Users, PlusCircle, Store, User, Building2 } from 'lucide-react';
import { Customer, StockItem } from '@/types';
import * as dbActions from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';

type ReturnChannel = 'Pazaryeri' | 'Perakende' | 'Toptan';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

interface CartItem {
  id: string;
  stockItem: StockItem;
  quantity: number;
  unitReturnPrice: string; // optional for Pazaryeri
}

export default function IadePage() {
  const items = useStockStore((s) => s.items);
  const getItemByBarcode = useStockStore((s) => s.getItemByBarcode);
  const addTransaction = useStockStore((s) => s.addTransaction);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerCode, setNewCustomerCode] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [channel, setChannel] = useState<ReturnChannel>('Pazaryeri');

  const [barcodeOrStockCode, setBarcodeOrStockCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toNumber = (raw: string) => {
    const normalized = (raw || '').replace(',', '.').trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await dbActions.getCustomers();
      if (!cancelled) setCustomers(rows || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCustomers = async () => {
    const rows = await dbActions.getCustomers();
    setCustomers(rows || []);
    return rows || [];
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
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
  }, [items, searchQuery]);

  const getItemByBarcodeOrStockCode = (value: string): StockItem | undefined => {
    const t = value.trim();
    if (!t) return undefined;
    return getItemByBarcode(t) || items.find((item) => (item.stockCode || '').toLowerCase() === t.toLowerCase());
  };

  const focusScan = () => setTimeout(() => inputRef.current?.focus(), 0);

  const activeCartItem = useMemo(() => {
    if (!activeCartId) return null;
    return cart.find((c) => c.id === activeCartId) || null;
  }, [cart, activeCartId]);

  const addToCart = (item: StockItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.stockItem.id === item.id);
      if (existing) {
        const next = prev.map((c) => (c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
        setActiveCartId(existing.id);
        return next;
      }
      const newRow: CartItem = {
        id: uuidv4(),
        stockItem: item,
        quantity: 1,
        unitReturnPrice: '',
      };
      setActiveCartId(newRow.id);
      return [newRow, ...prev];
    });
    toast.success('Sepete eklendi');
    setBarcodeOrStockCode('');
    setSearchQuery('');
    focusScan();
  };

  const updateCartItem = (id: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const removeCartItem = (id: string) => {
    setCart((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeCartId === id) setActiveCartId(next[0]?.id || null);
      return next;
    });
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = barcodeOrStockCode.trim();
    if (!t) return;
    const found = getItemByBarcodeOrStockCode(t);
    if (!found) {
      toast.error('Ürün bulunamadı!');
      setBarcodeOrStockCode('');
      focusScan();
      return;
    }
    addToCart(found);
  };

  const cartTotals = useMemo(() => {
    const totalQty = cart.reduce((acc, c) => acc + (Number(c.quantity) || 0), 0);
    const totalAmount = cart.reduce((acc, c) => acc + toNumber(c.unitReturnPrice) * (Number(c.quantity) || 0), 0);
    return { totalQty, totalAmount };
  }, [cart]);

  const submitNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error('Cari ismi zorunlu');
      return;
    }
    setNewCustomerSaving(true);
    const toastId = toast.loading('Cari ekleniyor...');
    try {
      const res = await dbActions.addCustomer({
        customerCode: newCustomerCode.trim(),
        name: newCustomerName.trim(),
      });
      if (!(res as any).success) throw new Error(String((res as any).error || 'failed'));
      const id = (res as any).id as string;
      await refreshCustomers();
      setSelectedCustomerId(id);
      toast.success('Cari eklendi ve seçildi', { id: toastId });
      setAddCustomerOpen(false);
      setNewCustomerCode('');
      setNewCustomerName('');
    } catch (err) {
      toast.error('Cari eklenirken hata oluştu', { id: toastId });
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setNewCustomerSaving(false);
    }
  };

  const saveReturn = async () => {
    if (saving) return;
    if (cart.length === 0) return;

    if (channel === 'Toptan' && !selectedCustomerId) {
      toast.error('Toptan iade için cari seçiniz');
      return;
    }

    for (const c of cart) {
      if (!Number.isFinite(c.quantity) || c.quantity <= 0) {
        toast.error('Sepette geçersiz adet var');
        return;
      }
      if (channel !== 'Pazaryeri' && toNumber(c.unitReturnPrice) <= 0) {
        toast.error(`İade fiyatı giriniz: ${c.stockItem.name}`);
        return;
      }
    }

    setSaving(true);
    const toastId = toast.loading('İade kaydediliyor...');
    const now = new Date().toISOString();

    try {
      const results = await Promise.all(
        cart.map((c) => {
          const unit = channel === 'Pazaryeri' ? 0 : toNumber(c.unitReturnPrice);
          const total = unit * (Number(c.quantity) || 0);
          const tx = {
            id: uuidv4(),
            date: now,
            type: 'IN' as const,
            kind: 'RETURN' as const,
            quantity: c.quantity,
            channel,
            unitPrice: unit,
            totalPrice: total,
            customerId: channel === 'Toptan' ? selectedCustomerId : undefined,
          };
          addTransaction(c.stockItem.id, tx);
          return dbActions.addTransaction(c.stockItem.id, tx);
        })
      );

      const anyFail = results.some((r) => !r.success);
      if (anyFail) throw new Error('DB sync failed');

      toast.success('İade kaydedildi', { id: toastId });
      setCart([]);
      setActiveCartId(null);
      focusScan();
    } catch (err) {
      toast.error('İade kaydedilirken hata oluştu', { id: toastId });
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-enter">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-purple-400 flex items-center gap-2">
            <RotateCcw className="w-7 h-7" />
            İade
          </h1>
          <p className="text-zinc-500">İade gelen ürünleri seçin ve stoğa geri alın</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-zinc-400">
          <div className="text-right">
            <div className="text-xs text-zinc-500">Sepet</div>
            <div className="text-sm font-bold text-white">
              {cart.length} çeşit • {cartTotals.totalQty} adet • {currency(cartTotals.totalAmount)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-purple-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-purple-400" />
              Barkod / Stok Kodu
            </CardTitle>
            <CardDescription>Okutunca sepete eklenir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleScanSubmit} className="flex gap-3">
              <Input
                ref={inputRef}
                value={barcodeOrStockCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setBarcodeOrStockCode(val);
                  const exactMatch = getItemByBarcodeOrStockCode(val);
                  if (exactMatch) addToCart(exactMatch);
                }}
                placeholder="Barkod veya stok kodu okutun / yapıştırın..."
                className="text-xl h-14 font-mono w-full"
                autoFocus
              />
              <Button type="submit" size="lg" className="h-14 px-6 bg-purple-600 hover:bg-purple-700">
                <Scan className="mr-2" /> Sepete Ekle
              </Button>
            </form>

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                <Input
                  placeholder="İsim / barkod / stok kodu ile ara..."
                  className="pl-10 bg-zinc-900/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                    type="button"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {searchQuery && filteredItems.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden max-h-96 overflow-y-auto">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0"
                      onClick={() => addToCart(item)}
                    >
                      <div className="w-10 h-10 bg-zinc-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image ? (
                          <img src={item.image} className="w-full h-full object-contain p-0.5" alt={item.name} />
                        ) : (
                          <Package className="w-5 h-5 text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-white">{item.name}</div>
                        <div className="text-xs text-zinc-500 flex gap-2">
                          <span className="font-mono">{item.barcode}</span>
                          {item.stockCode && <span>• {item.stockCode}</span>}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-zinc-400">{item.quantity} Adet</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-white">Sepet</div>
                <div className="text-xs text-zinc-500">
                  {cart.length} çeşit • {cartTotals.totalQty} adet
                </div>
              </div>

              {cart.length === 0 ? (
                <div className="text-sm text-zinc-600 border border-dashed border-zinc-800 rounded-lg p-4">
                  Sepet boş. Ürün eklemek için barkod okutun veya arama yapın.
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((c) => {
                    const isActive = c.id === activeCartId;
                    const unit = toNumber(c.unitReturnPrice);
                    const lineTotal = unit * (Number(c.quantity) || 0);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setActiveCartId(c.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                          isActive ? 'border-purple-500/40 bg-purple-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50'
                        }`}
                      >
                        <div className="w-10 h-10 bg-zinc-950 rounded-md border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {c.stockItem.image ? (
                            <img src={c.stockItem.image} alt={c.stockItem.name} className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <Package className="w-5 h-5 text-zinc-700" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{c.stockItem.name}</div>
                          <div className="text-xs text-zinc-500 flex gap-2">
                            <span className="font-mono">{c.quantity} adet</span>
                            <span>•</span>
                            <span>{channel === 'Pazaryeri' ? 'Fiyat yok' : currency(unit)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">{channel === 'Pazaryeri' ? '-' : currency(lineTotal)}</div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCartItem(c.id);
                            }}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                            Sil
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-900/30">
          <CardHeader className="pb-2">
            <CardTitle>İade Detayı</CardTitle>
            <CardDescription>İade tipi, cari ve fiyatı seçin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">İade Tipi</label>
              <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800 h-14 items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => { setChannel('Pazaryeri'); setSelectedCustomerId(''); }}
                  className={`flex-1 h-12 rounded-md transition-all flex items-center justify-center gap-2 ${
                    channel === 'Pazaryeri' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Store size={16} />
                  <span className="font-semibold">Pazaryeri</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setChannel('Perakende'); setSelectedCustomerId(''); }}
                  className={`flex-1 h-12 rounded-md transition-all flex items-center justify-center gap-2 ${
                    channel === 'Perakende' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <User size={16} />
                  <span className="font-semibold">Perakende</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('Toptan')}
                  className={`flex-1 h-12 rounded-md transition-all flex items-center justify-center gap-2 ${
                    channel === 'Toptan' ? 'bg-orange-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Building2 size={16} />
                  <span className="font-semibold">Toptan</span>
                </button>
              </div>
            </div>

            {channel === 'Toptan' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Cari Seç</label>
                  <button
                    type="button"
                    onClick={() => setAddCustomerOpen(true)}
                    className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Yeni Cari
                  </button>
                </div>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none"
                >
                  <option value="">Cari seçiniz...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.customerCode ? `${c.customerCode} - ` : '') + c.name}
                    </option>
                  ))}
                </select>
                {!selectedCustomerId && <div className="text-xs text-amber-300">Toptan iade kaydetmek için cari seçmelisiniz</div>}
              </div>
            )}

            {!activeCartItem ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                <Package className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">Sepetten ürün seçilmedi.</p>
                <p className="text-sm">Soldan sepete ekleyip bir ürünü seçin.</p>
              </div>
            ) : (
              (() => {
                const item = activeCartItem.stockItem;
                const unit = toNumber(activeCartItem.unitReturnPrice);
                const lineTotal = unit * (Number(activeCartItem.quantity) || 0);
                return (
                  <div className="space-y-4">
                    <div className="flex gap-4 items-start">
                      <div className="w-28 h-28 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <Package className="w-10 h-10 text-zinc-700" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-lg font-bold text-white leading-tight">{item.name}</div>
                        <div className="mt-1 text-sm text-zinc-500 flex flex-wrap gap-2">
                          <span className="font-mono">{item.barcode || '-'}</span>
                          {item.stockCode && <span className="text-zinc-600">• {item.stockCode}</span>}
                          {item.brand && <span className="text-zinc-600">• {item.brand}</span>}
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="text-zinc-500">Mevcut stok: </span>
                          <span className="font-bold text-white">{item.quantity}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">İade Adedi</label>
                        <Input
                          type="number"
                          min={1}
                          value={activeCartItem.quantity === 0 ? '' : activeCartItem.quantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            const n = val === '' ? 0 : parseInt(val, 10);
                            updateCartItem(activeCartItem.id, { quantity: Number.isFinite(n) && n > 0 ? n : 0 });
                          }}
                          onBlur={() => {
                            if (activeCartItem.quantity <= 0) updateCartItem(activeCartItem.id, { quantity: 1 });
                          }}
                          className="text-center font-bold text-2xl h-14 bg-zinc-950 border-zinc-800"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">İade Fiyatı (Birim)</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={channel === 'Pazaryeri' ? '' : activeCartItem.unitReturnPrice}
                          onChange={(e) => updateCartItem(activeCartItem.id, { unitReturnPrice: e.target.value })}
                          disabled={channel === 'Pazaryeri'}
                          placeholder={channel === 'Pazaryeri' ? 'Pazaryeri iadede fiyat seçilmez' : 'Örn: 200'}
                          className="text-center font-bold text-2xl h-14 bg-zinc-950 border-zinc-800 disabled:opacity-70"
                        />
                        {channel !== 'Pazaryeri' && toNumber(activeCartItem.unitReturnPrice) <= 0 && (
                          <div className="text-xs text-amber-300">İade fiyatı girilmeden kaydedilemez</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">İade Tutarı</div>
                        <div className="text-xs text-zinc-500">
                          {activeCartItem.quantity} × {channel === 'Pazaryeri' ? '-' : currency(unit)}
                        </div>
                      </div>
                      <div className="text-2xl font-black text-blue-300">
                        {channel === 'Pazaryeri' ? '-' : currency(lineTotal)}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 border-zinc-700"
                        onClick={() => {
                          removeCartItem(activeCartItem.id);
                          focusScan();
                        }}
                      >
                        Bu Ürünü Sil
                      </Button>
                      <Button
                        type="button"
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                        onClick={saveReturn}
                        disabled={cart.length === 0 || saving}
                      >
                        <Save className="w-5 h-5" />
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                      </Button>
                    </div>
                  </div>
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Yeni Cari Ekle</DialogTitle>
            <DDesc>Cari kodu boş bırakılırsa otomatik atanır. Kaydedince otomatik seçilir.</DDesc>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari Kodu</label>
              <Input
                value={newCustomerCode}
                onChange={(e) => setNewCustomerCode(e.target.value)}
                placeholder="Boş bırakılırsa otomatik atanır"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari İsmi</label>
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Örn: ABC Ltd." />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700" onClick={() => setAddCustomerOpen(false)} disabled={newCustomerSaving}>
              İptal
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitNewCustomer} disabled={newCustomerSaving}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

