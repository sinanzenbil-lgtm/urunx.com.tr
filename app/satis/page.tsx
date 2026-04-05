'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Scan, Search, X, Package, Save, ShoppingCart, User, Building2, Trash2, Users, PlusCircle } from 'lucide-react';
import { Customer, StockItem } from '@/types';
import * as dbActions from '@/lib/actions';
import { v4 as uuidv4 } from 'uuid';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type SalesType = 'Perakende' | 'Toptan';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

interface CartItem {
  id: string; // unique id for cart row
  stockItem: StockItem;
  quantity: number;
  channel: SalesType;
  unitPrice: string; // gerçekleşen birim satış fiyatı (input değeri)
}

export default function SatisPage() {
  const items = useStockStore((s) => s.items);
  const getItemByBarcode = useStockStore((s) => s.getItemByBarcode);
  const addTransaction = useStockStore((s) => s.addTransaction);
  const user = useStockStore((s) => s.user);
  const showPerakende = user?.salesPerakende !== false;
  const showToptan = user?.salesToptan !== false;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerCode, setNewCustomerCode] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [barcodeOrStockCode, setBarcodeOrStockCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [cartChannel, setCartChannel] = useState<SalesType>('Perakende');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const customerComboRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!showPerakende && showToptan) {
      setCartChannel('Toptan');
      setCart((prev) => prev.map((c) => ({ ...c, channel: 'Toptan' as SalesType })));
    } else if (showPerakende && !showToptan) {
      setCartChannel('Perakende');
      setCart((prev) => prev.map((c) => ({ ...c, channel: 'Perakende' as SalesType })));
      setSelectedCustomerId('');
      setCustomerQuery('');
      setCustomerDropdownOpen(false);
    }
  }, [showPerakende, showToptan]);

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

  const toNumber = (raw: string) => {
    const normalized = (raw || '').replace(',', '.').trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

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
        channel: cartChannel,
        unitPrice: String(Number(item.sellPrice) || ''),
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

  const setChannelForAll = (channel: SalesType) => {
    setCartChannel(channel);
    setCart((prev) => prev.map((c) => ({ ...c, channel })));
    if (channel !== 'Toptan') {
      setSelectedCustomerId('');
      setCustomerQuery('');
      setCustomerDropdownOpen(false);
    }
  };

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  /** Cari arama: yazı yokken liste yok; yazınca eşleşenler (açılır liste) */
  const customersForDropdown = useMemo(() => {
    const q = customerQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return [];
    return customers.filter((c) => {
      const name = (c.name || '').toLocaleLowerCase('tr-TR');
      const code = (c.customerCode || '').toLocaleLowerCase('tr-TR');
      return name.includes(q) || code.includes(q);
    });
  }, [customers, customerQuery]);

  useEffect(() => {
    if (cartChannel !== 'Toptan') setCustomerDropdownOpen(false);
  }, [cartChannel]);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (customerComboRef.current && !customerComboRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

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
    const totalAmount = cart.reduce((acc, c) => acc + toNumber(c.unitPrice) * (Number(c.quantity) || 0), 0);
    return { totalQty, totalAmount };
  }, [cart]);

  const saveSale = async () => {
    if (cart.length === 0) return;

    if (cartChannel === 'Toptan' && !selectedCustomerId) {
      toast.error('Toptan satış için cari seçiniz');
      return;
    }

    for (const c of cart) {
      if (!Number.isFinite(c.quantity) || c.quantity <= 0) {
        toast.error('Sepette geçersiz adet var');
        return;
      }
      if (toNumber(c.unitPrice) <= 0) {
        toast.error(`Fiyat giriniz: ${c.stockItem.name}`);
        return;
      }
      if (c.stockItem.quantity < c.quantity) {
        toast.error(`Yetersiz stok: ${c.stockItem.name}`);
        return;
      }
    }

    const toastId = toast.loading('Satış kaydediliyor...');
    const now = new Date().toISOString();

    try {
      const promises = cart.map((c) => {
        const unitPrice = toNumber(c.unitPrice);
        const totalPrice = unitPrice * (Number(c.quantity) || 0);
        const tx = {
          id: uuidv4(),
          date: now,
          type: 'OUT' as const,
          quantity: c.quantity,
          channel: c.channel,
          unitPrice,
          totalPrice,
          customerId: cartChannel === 'Toptan' ? selectedCustomerId : undefined,
        };
        addTransaction(c.stockItem.id, tx);
        return dbActions.addTransaction(c.stockItem.id, tx);
      });

      const results = await Promise.all(promises);
      const anyFail = results.some((r) => !r.success);
      if (anyFail) throw new Error('DB sync failed');

      toast.success('Satış kaydedildi', { id: toastId });
      setCart([]);
      setActiveCartId(null);
      focusScan();
    } catch (err) {
      toast.error('Satış kaydedilirken hata oluştu', { id: toastId });
      console.error(err);
    }
  };

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
      const result = res as { success: boolean; id?: string; error?: unknown };
      if (!result.success || !result.id) throw new Error(String(result.error || 'failed'));
      const id = result.id;
      await refreshCustomers();
      setSelectedCustomerId(id);
      setCustomerQuery('');
      toast.success('Cari eklendi ve seçildi', { id: toastId });
      setAddCustomerOpen(false);
      setNewCustomerCode('');
      setNewCustomerName('');
    } catch (err) {
      toast.error('Cari eklenirken hata oluştu', { id: toastId });
      console.error(err);
    } finally {
      setNewCustomerSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-enter">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-500">Satış</h1>
          <p className="text-zinc-500">Barkod okutun / arayın, sepete ekleyin ve satışı kaydedin</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-zinc-400">
          <ShoppingCart className="w-5 h-5" />
          <div className="text-right">
            <div className="text-xs text-zinc-500">Sepet</div>
            <div className="text-sm font-bold text-white">
              {cart.length} çeşit • {cartTotals.totalQty} adet • {currency(cartTotals.totalAmount)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: scan + search */}
        <Card className="border-emerald-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-emerald-500" />
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
              <Button type="submit" size="lg" className="h-14 px-6 bg-emerald-600 hover:bg-emerald-700">
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

            {/* Cart */}
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
                    const unit = toNumber(c.unitPrice);
                    const lineTotal = unit * (Number(c.quantity) || 0);
                    const liveQty = (items.find((i) => i.id === c.stockItem.id) ?? c.stockItem).quantity;
                    const remainingStock = liveQty - (Number(c.quantity) || 0);
                    const flashLowStock =
                      remainingStock <= 2 && remainingStock >= 0;
                    const flashOversell = remainingStock < 0;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setActiveCartId(c.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                          isActive ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50'
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
                          <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{c.channel}</span>
                            <span>•</span>
                            <span className="font-mono">{c.quantity} adet</span>
                            <span>•</span>
                            <span>{currency(unit)}</span>
                            <span>•</span>
                            <span
                              className={cn(
                                'font-mono font-semibold tabular-nums',
                                !flashLowStock && !flashOversell && 'text-zinc-200',
                                flashLowStock && 'text-red-400 animate-pulse',
                                flashOversell && 'text-red-500 animate-pulse'
                              )}
                              title="Bu satıştan sonra depoda kalacak adet"
                            >
                              Kalan stok: {remainingStock}
                            </span>
                            {cartChannel === 'Toptan' && selectedCustomer ? (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5" />
                                  {selectedCustomer.name}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">{currency(lineTotal)}</div>
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

        {/* Right: active item detail + pricing */}
        <Card className="border-emerald-900/30">
          <CardHeader className="pb-2">
            <CardTitle>Satış Detayı</CardTitle>
            <CardDescription>Sepetteki ürünü seçin, fiyatı girin ve kaydedin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeCartItem ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">Sepetten ürün seçilmedi.</p>
                <p className="text-sm">Soldan sepete ekleyip bir ürünü seçin.</p>
              </div>
            ) : (
              <>
                {(() => {
                  const item = activeCartItem.stockItem;
                  const unit = toNumber(activeCartItem.unitPrice);
                  const lineTotal = unit * (Number(activeCartItem.quantity) || 0);
                  const liveQty = (items.find((i) => i.id === item.id) ?? item).quantity;
                  const qtyInCart = Number(activeCartItem.quantity) || 0;
                  const remainingAfterSale = liveQty - qtyInCart;
                  const insufficient = liveQty < qtyInCart;
                  const flashLowStockDetail = remainingAfterSale <= 2 && remainingAfterSale >= 0;
                  const flashOversellDetail = remainingAfterSale < 0;

                  return (
                    <div className="space-y-4">
                      <div className="flex gap-4 items-start">
                        <div className="w-28 h-28 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-contain p-1"
                            />
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
                          <div className="mt-2 text-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-zinc-500">Depoda:</span>
                            <span className="font-bold text-white tabular-nums">{liveQty}</span>
                            <span className="text-zinc-600">→</span>
                            <span className="text-zinc-500">Satış sonrası kalan:</span>
                            <span
                              className={cn(
                                'font-bold tabular-nums',
                                flashLowStockDetail && 'text-red-400 animate-pulse',
                                flashOversellDetail && 'text-red-500 animate-pulse',
                                !flashLowStockDetail && !flashOversellDetail && 'text-emerald-300'
                              )}
                            >
                              {remainingAfterSale}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Alış Fiyatı</div>
                          <div className="text-lg font-bold text-white">{currency(item.buyPrice)}</div>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Kayıtlı Satış (Toptan)</div>
                          <div className="text-lg font-bold text-white">{currency(item.sellPrice)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Satış Adedi</label>
                          <Input
                            type="number"
                            min={1}
                            max={liveQty}
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
                          {insufficient && <div className="text-xs text-red-400">Yetersiz stok</div>}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Satış Türü</label>
                          {showPerakende && showToptan ? (
                            <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800 h-14 items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setChannelForAll('Perakende')}
                                className={`flex-1 h-12 rounded-md transition-all flex items-center justify-center gap-2 ${
                                  cartChannel === 'Perakende'
                                    ? 'bg-emerald-600 text-white shadow-lg'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                <User size={16} />
                                <span className="font-semibold">Perakende</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setChannelForAll('Toptan')}
                                className={`flex-1 h-12 rounded-md transition-all flex items-center justify-center gap-2 ${
                                  cartChannel === 'Toptan'
                                    ? 'bg-orange-600 text-white shadow-lg'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                <Building2 size={16} />
                                <span className="font-semibold">Toptan</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex h-14 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 px-3">
                              {showPerakende ? (
                                <span className="inline-flex items-center gap-2 font-semibold text-emerald-400">
                                  <User size={16} />
                                  Perakende
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 font-semibold text-orange-400">
                                  <Building2 size={16} />
                                  Toptan
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {cartChannel === 'Toptan' && (
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
                          <div className="relative z-20" ref={customerComboRef}>
                            <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500 pointer-events-none" />
                            <Input
                              value={customerQuery}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCustomerQuery(v);
                                setCustomerDropdownOpen(v.trim().length > 0);
                              }}
                              onFocus={() => {
                                if (customerQuery.trim().length > 0) setCustomerDropdownOpen(true);
                              }}
                              placeholder="Cari isim veya kodu yazın..."
                              className="pl-10 pr-10 h-12 bg-zinc-950 border-zinc-800"
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

                            {customerDropdownOpen && customerQuery.trim().length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 shadow-xl">
                                {customersForDropdown.length === 0 ? (
                                  <div className="px-3 py-4 text-sm text-zinc-500 text-center">Cari bulunamadı.</div>
                                ) : (
                                  customersForDropdown.map((c) => {
                                    const isSelected = c.id === selectedCustomerId;
                                    return (
                                      <button
                                        type="button"
                                        key={c.id}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setSelectedCustomerId(c.id);
                                          setCustomerQuery(
                                            c.customerCode ? `${c.customerCode} — ${c.name}` : c.name
                                          );
                                          setCustomerDropdownOpen(false);
                                        }}
                                        className={cn(
                                          'w-full text-left px-3 py-2.5 border-b border-zinc-800 last:border-b-0 transition-colors',
                                          isSelected ? 'bg-sky-600/15' : 'hover:bg-zinc-900'
                                        )}
                                      >
                                        <div className={cn('font-medium', isSelected ? 'text-sky-300' : 'text-white')}>
                                          {c.name}
                                        </div>
                                        <div className="text-xs text-zinc-500">{c.customerCode || '-'}</div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>

                          {selectedCustomerId && selectedCustomer ? (
                            <div className="flex items-center justify-between text-xs rounded-md border border-sky-700/40 bg-sky-500/10 px-3 py-2">
                              <span className="text-sky-200">
                                Seçili: {(selectedCustomer.customerCode ? `${selectedCustomer.customerCode} - ` : '') + selectedCustomer.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCustomerId('');
                                  setCustomerQuery('');
                                  setCustomerDropdownOpen(false);
                                }}
                                className="text-sky-300 hover:text-sky-200"
                              >
                                Temizle
                              </button>
                            </div>
                          ) : null}
                          {!selectedCustomerId && (
                            <div className="text-xs text-amber-300">Toptan satış kaydetmek için cari seçmelisiniz</div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Gerçekleşen Satış Fiyatı (Birim)</label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={activeCartItem.unitPrice}
                            onChange={(e) => {
                              updateCartItem(activeCartItem.id, { unitPrice: e.target.value });
                            }}
                            className="text-center font-bold text-2xl h-14 bg-zinc-950 border-zinc-800"
                          />
                          {toNumber(activeCartItem.unitPrice) <= 0 && (
                            <div className="text-xs text-amber-300">Fiyat girilmeden kaydedilemez</div>
                          )}
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex flex-col justify-between">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Satış Tutarı</div>
                          <div className="text-2xl font-black text-blue-300">{currency(lineTotal)}</div>
                          <div className="text-xs text-zinc-500">
                            {activeCartItem.quantity} × {currency(unit)}
                          </div>
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
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-[0_0_20px_-5px_rgba(16,185,129,0.45)]"
                          onClick={saveSale}
                          disabled={cart.length === 0}
                        >
                          <Save className="w-5 h-5" />
                          Satışı Kaydet ({currency(cartTotals.totalAmount)})
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Yeni Cari Ekle</DialogTitle>
            <DialogDescription>
              Cari kodu boş bırakılırsa otomatik atanır. Kaydedince otomatik seçilir.
            </DialogDescription>
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
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Örn: ABC İnşaat Ltd."
              />
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
