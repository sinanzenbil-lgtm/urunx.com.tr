'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription as DDesc, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Scan, Search, Package, Save, Trash2, PlusCircle, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Customer, StockItem } from '@/types';
import * as dbActions from '@/lib/actions';
import { cn } from '@/lib/utils';

export default function EntryPage() {
  const storeItems = useStockStore((s) => s.items);
  const getItemByBarcode = useStockStore((s) => s.getItemByBarcode);
  const addTransaction = useStockStore((s) => s.addTransaction);
  const updateItem = useStockStore((s) => s.updateItem);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerCode, setNewCustomerCode] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);

  const [barcodeOrStockCode, setBarcodeOrStockCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCartId, setActiveCartId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const customerComboRef = useRef<HTMLDivElement>(null);

  interface CartItem {
    id: string;
    stockItem: StockItem;
    quantity: number;
    unitBuyPrice: string;
  }

  const currency = (value: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

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
    const handleDown = (e: MouseEvent) => {
      if (customerComboRef.current && !customerComboRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return [];
    return storeItems
      .filter((item) => {
        const name = (item.name || '').toLocaleLowerCase('tr-TR');
        const barcode = (item.barcode || '').toLocaleLowerCase('tr-TR');
        const stockCode = (item.stockCode || '').toLocaleLowerCase('tr-TR');
        const brand = (item.brand || '').toLocaleLowerCase('tr-TR');
        return name.includes(q) || barcode.includes(q) || stockCode.includes(q) || brand.includes(q);
      })
      .slice(0, 40);
  }, [storeItems, searchQuery]);

  const getItemByBarcodeOrStockCode = (value: string): StockItem | undefined => {
    const t = value.trim();
    if (!t) return undefined;
    return getItemByBarcode(t) || storeItems.find((item) => (item.stockCode || '').toLowerCase() === t.toLowerCase());
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
        unitBuyPrice: String(Number(item.buyPrice) || ''),
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
    const totalCost = cart.reduce((acc, c) => acc + toNumber(c.unitBuyPrice) * (Number(c.quantity) || 0), 0);
    return { totalQty, totalCost };
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
      const code = newCustomerCode.trim();
      const nm = newCustomerName.trim();
      setCustomerQuery(code ? `${code} — ${nm}` : nm);
      setCustomerDropdownOpen(false);
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

  const saveEntry = async () => {
    if (saving) return;
    if (cart.length === 0) return;
    if (!selectedCustomerId) {
      toast.error('Cari seçiniz');
      return;
    }

    for (const c of cart) {
      if (!Number.isFinite(c.quantity) || c.quantity <= 0) {
        toast.error('Sepette geçersiz adet var');
        return;
      }
      if (toNumber(c.unitBuyPrice) <= 0) {
        toast.error(`Alış fiyatı giriniz: ${c.stockItem.name}`);
        return;
      }
    }

    setSaving(true);
    const toastId = toast.loading('Stok girişi kaydediliyor...');
    const now = new Date().toISOString();

    try {
      const results = await Promise.all(
        cart.map(async (c) => {
          const unitBuyPrice = toNumber(c.unitBuyPrice);
          const totalPrice = unitBuyPrice * (Number(c.quantity) || 0);

          // Update product buy price (store + DB) to latest entered value
          updateItem(c.stockItem.id, { buyPrice: unitBuyPrice });
          await dbActions.updateItem(c.stockItem.id, { buyPrice: unitBuyPrice });

          const tx = {
            id: uuidv4(),
            date: now,
            type: 'IN' as const,
            quantity: c.quantity,
            customerId: selectedCustomerId,
            unitPrice: unitBuyPrice,
            totalPrice,
          };

          addTransaction(c.stockItem.id, tx);
          return dbActions.addTransaction(c.stockItem.id, tx);
        })
      );

      const anyFail = results.some((r) => !r.success);
      if (anyFail) throw new Error('DB sync failed');

      toast.success('Stok girişi kaydedildi', { id: toastId });
      setCart([]);
      setActiveCartId(null);
      focusScan();
    } catch (err) {
      toast.error('Stok girişi kaydedilirken hata oluştu', { id: toastId });
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
          <h1 className="text-3xl font-bold tracking-tight text-green-500">Stok Giriş</h1>
          <p className="text-zinc-500">Barkod okutun / arayın, sepete ekleyin ve stok girişini kaydedin</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-zinc-400">
          <div className="text-right">
            <div className="text-xs text-zinc-500">Sepet</div>
            <div className="text-sm font-bold text-white">
              {cart.length} çeşit • {cartTotals.totalQty} adet • {currency(cartTotals.totalCost)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-green-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-green-500" />
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
              <Button type="submit" size="lg" className="h-14 px-6 bg-green-600 hover:bg-green-700">
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
                    <span className="sr-only">Temizle</span>
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
                    const unit = toNumber(c.unitBuyPrice);
                    const lineTotal = unit * (Number(c.quantity) || 0);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setActiveCartId(c.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                          isActive ? 'border-green-500/40 bg-green-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50'
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
                            <span>{currency(unit)}</span>
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

        <Card className="border-green-900/30">
          <CardHeader className="pb-2">
            <CardTitle>Stok Giriş Detayı</CardTitle>
            <CardDescription>Cari seçin, adet ve alış fiyatını girin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                              setCustomerQuery(c.customerCode ? `${c.customerCode} — ${c.name}` : c.name);
                              setCustomerDropdownOpen(false);
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2.5 border-b border-zinc-800 last:border-b-0 transition-colors',
                              isSelected ? 'bg-sky-600/15' : 'hover:bg-zinc-900'
                            )}
                          >
                            <div className={cn('font-medium', isSelected ? 'text-sky-300' : 'text-white')}>{c.name}</div>
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
              {!selectedCustomerId && <div className="text-xs text-amber-300">Stok girişi kaydetmek için cari seçmelisiniz</div>}
            </div>

            {!activeCartItem ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                <Package className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">Sepetten ürün seçilmedi.</p>
                <p className="text-sm">Soldan sepete ekleyip bir ürünü seçin.</p>
              </div>
            ) : (
              (() => {
                const item = activeCartItem.stockItem;
                const unit = toNumber(activeCartItem.unitBuyPrice);
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
                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Eklenecek Adet</label>
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
                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Gerçekleşen Alış Fiyatı (Birim)</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={activeCartItem.unitBuyPrice}
                          onChange={(e) => updateCartItem(activeCartItem.id, { unitBuyPrice: e.target.value })}
                          className="text-center font-bold text-2xl h-14 bg-zinc-950 border-zinc-800"
                        />
                        {toNumber(activeCartItem.unitBuyPrice) <= 0 && (
                          <div className="text-xs text-amber-300">Alış fiyatı girilmeden kaydedilemez</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Toplam Maliyet</div>
                        <div className="text-xs text-zinc-500">
                          {activeCartItem.quantity} × {currency(unit)}
                        </div>
                      </div>
                      <div className="text-2xl font-black text-blue-300">{currency(lineTotal)}</div>
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
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                        onClick={saveEntry}
                        disabled={cart.length === 0 || saving}
                      >
                        <Save className="w-5 h-5" />
                        {saving ? 'Kaydediliyor...' : `Kaydet (${currency(cartTotals.totalCost)})`}
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
              <Input value={newCustomerCode} onChange={(e) => setNewCustomerCode(e.target.value)} placeholder="Boş bırakılırsa otomatik atanır" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari İsmi</label>
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Örn: Tedarikçi A.Ş." />
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
