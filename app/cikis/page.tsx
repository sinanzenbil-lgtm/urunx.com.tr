'use client';

import { useState, useRef, useEffect } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Scan, Trash2, Save, ShoppingCart, Store, User, Building2, Search, X, Package } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { StockItem } from '@/types';
import * as dbActions from '@/lib/actions';

type SalesChannel = 'Pazaryeri' | 'Perakende' | 'Toptan';

interface CartItem {
    id: string; // unique id for cart item (not stock item id)
    stockItem: StockItem;
    quantity: number;
    channel: SalesChannel;
}

export default function ExitPage() {
    const [barcode, setBarcode] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const getItemByBarcode = useStockStore((state) => state.getItemByBarcode);
    const items = useStockStore((state) => state.items);
    const addTransaction = useStockStore((state) => state.addTransaction);

    const filteredItems = items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery) ||
        item.stockCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const addToCart = (item: StockItem) => {
        // Create a new cart entry
        const newCartItem: CartItem = {
            id: uuidv4(),
            stockItem: item,
            quantity: 1,
            channel: 'Pazaryeri'
        };
        setCart(prev => [newCartItem, ...prev]);
        toast.success('Listeye Eklendi');
        setBarcode('');
        setSearchQuery('');
        inputRef.current?.focus();
    };

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcode.trim()) return;

        const existing = getItemByBarcode(barcode);

        if (existing) {
            addToCart(existing);
        } else {
            toast.error('Ürün bulunamadı!');
            setBarcode('');
        }
    };

    const handleSearchSelect = (item: StockItem) => {
        addToCart(item);
    };

    const updateCartItem = (id: string, updates: Partial<CartItem>) => {
        setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const removeCartItem = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const completeSale = async () => {
        if (cart.length === 0) return;

        let hasError = false;

        cart.forEach(cartItem => {
            if (cartItem.stockItem.quantity < cartItem.quantity) {
                toast.error(`${cartItem.stockItem.name} için yetersiz stok!`);
                hasError = true;
            }
        });

        if (hasError) return;

        const promises = cart.map(cartItem => {
            const newTransaction = {
                id: uuidv4(),
                date: new Date().toISOString(),
                type: 'OUT' as const,
                quantity: cartItem.quantity,
                channel: cartItem.channel
            };

            // Sync to Local Store
            addTransaction(cartItem.stockItem.id, newTransaction);
            // Return promise for DB sync
            return dbActions.addTransaction(cartItem.stockItem.id, newTransaction);
        });

        try {
            await Promise.all(promises);
            toast.success(`${cart.length} kalem ürünün satışı tamamlandı.`);
            setCart([]);
            inputRef.current?.focus();
        } catch (error) {
            toast.error('Satış kaydedilirken bir hata oluştu');
            console.error(error);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-enter">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-red-500">Hızlı Stok Çıkış</h1>
                    <p className="text-zinc-500">Toplu ürün satışı ve çıkış işlemleri</p>
                </div>
                <div className="text-right flex gap-6">
                    <div>
                        <div className="text-sm text-zinc-400">Çeşit</div>
                        <div className="text-3xl font-bold font-mono">{cart.length}</div>
                    </div>
                    <div>
                        <div className="text-sm text-zinc-400">Toplam Adet</div>
                        <div className="text-3xl font-bold font-mono text-red-500">
                            {cart.reduce((acc, item) => acc + item.quantity, 0)}
                        </div>
                    </div>
                </div>
            </div>

            <Card className="border-red-900/30">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-4">
                        {/* Barcode Scan Form */}
                        <form onSubmit={handleScan} className="flex gap-4">
                            <Input
                                ref={inputRef}
                                value={barcode}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setBarcode(val);

                                    // Auto-check for exact barcode match
                                    if (val.trim()) {
                                        const exactMatch = getItemByBarcode(val.trim());
                                        if (exactMatch) {
                                            addToCart(exactMatch);
                                            // addToCart clears barcode, but since this is in onChange, 
                                            // React batching might need explicit clear here or rely on addToCart's state update.
                                            // addToCart sets barcode to '', which is good.
                                        }
                                    }
                                }}
                                placeholder="Barkod okutun..."
                                className="text-xl h-14 font-mono w-full"
                                autoFocus
                            />
                            <Button type="submit" size="lg" className="h-14 px-8 bg-red-600 hover:bg-red-700">
                                <Scan className="mr-2" /> Ekle
                            </Button>
                        </form>

                        {/* Search Bar */}
                        <div className="relative">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                                <Input
                                    placeholder="Veya isim/kod ile arayın..."
                                    className="pl-10 bg-zinc-900/50"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                                    >
                                        <X size={18} />
                                    </button>
                                )}
                            </div>

                            {/* Search Results Dropdown */}
                            {searchQuery && filteredItems.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden max-h-96 overflow-y-auto">
                                    {filteredItems.map(item => (
                                        <div
                                            key={item.id}
                                            className="p-3 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0"
                                            onClick={() => handleSearchSelect(item)}
                                        >
                                            <div className="w-10 h-10 bg-zinc-800 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
                                                {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <Scan className="w-5 h-5 text-zinc-600" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-white">{item.name}</div>
                                                <div className="text-xs text-zinc-500 flex gap-2">
                                                    <span>{item.barcode}</span>
                                                    {item.stockCode && <span>• {item.stockCode}</span>}
                                                </div>
                                            </div>
                                            <div className="text-sm font-bold text-zinc-400">
                                                {item.quantity} Adet
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cart List */}
            {cart.length > 0 && (
                <div className="space-y-4">
                    <div className="grid gap-4">
                        {cart.map((item) => (
                            <Card key={item.id} className="animate-enter bg-zinc-900/50 border-zinc-800 hover:border-red-500/30 transition-colors">
                                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    {/* Image & Basic Info */}
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-16 h-16 bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {item.stockItem.image ? (
                                                <img src={item.stockItem.image} alt={item.stockItem.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="w-8 h-8 text-zinc-700" />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg leading-tight">{item.stockItem.name}</h3>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
                                                <span className="font-mono">{item.stockItem.barcode}</span>
                                                {item.stockItem.stockCode && <span className="text-zinc-600">| {item.stockItem.stockCode}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Controls */}
                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                        {/* Sales Channel Selector */}
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Satış Kanalı</label>
                                            <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800">
                                                <button
                                                    onClick={() => updateCartItem(item.id, { channel: 'Pazaryeri' })}
                                                    className={`p-2 rounded-md transition-all ${item.channel === 'Pazaryeri' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                    title="Pazaryeri"
                                                >
                                                    <Store size={16} />
                                                </button>
                                                <button
                                                    onClick={() => updateCartItem(item.id, { channel: 'Perakende' })}
                                                    className={`p-2 rounded-md transition-all ${item.channel === 'Perakende' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                    title="Perakende"
                                                >
                                                    <User size={16} />
                                                </button>
                                                <button
                                                    onClick={() => updateCartItem(item.id, { channel: 'Toptan' })}
                                                    className={`p-2 rounded-md transition-all ${item.channel === 'Toptan' ? 'bg-orange-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                                                    title="Toptan"
                                                >
                                                    <Building2 size={16} />
                                                </button>
                                            </div>
                                            <div className="text-xs text-center text-zinc-500 mt-0.5">{item.channel}</div>
                                        </div>

                                        {/* Quantity */}
                                        <div className="flex flex-col gap-1 w-24">
                                            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Adet</label>
                                            <Input
                                                type="number"
                                                min="1"
                                                max={item.stockItem.quantity}
                                                value={item.quantity === 0 ? '' : item.quantity}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const numVal = val === '' ? 0 : parseInt(val);
                                                    updateCartItem(item.id, { quantity: isNaN(numVal) ? 0 : numVal });
                                                }}
                                                onBlur={() => {
                                                    if (item.quantity <= 0) updateCartItem(item.id, { quantity: 1 });
                                                }}
                                                className="text-center font-bold text-lg h-11 bg-zinc-950 border-zinc-800"
                                            />
                                        </div>

                                        {/* Remove */}
                                        <div className="flex flex-col gap-1 pt-4">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 h-11 w-11"
                                                onClick={() => removeCartItem(item.id)}
                                            >
                                                <Trash2 size={20} />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex justify-end pt-4 border-t border-zinc-800">
                        <Button
                            size="lg"
                            className="bg-red-600 hover:bg-red-700 text-white px-8 h-16 text-xl gap-2 shadow-[0_0_20px_-5px_rgba(220,38,38,0.5)]"
                            onClick={completeSale}
                        >
                            <Save className="w-6 h-6" />
                            HIZLI SATIŞI KAYDET
                        </Button>
                    </div>
                </div>
            )}

            {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                    <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg">Sepetiniz boş.</p>
                    <p className="text-sm">Ürün eklemek için barkod okutun veya arama yapın.</p>
                </div>
            )}
        </div>
    );
}
