'use client';

import { useState, useRef, useEffect } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Search, Scan, Plus, Save, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useForm } from 'react-hook-form';
import * as dbActions from '@/lib/actions';

export default function EntryPage() {
    const [barcode, setBarcode] = useState('');
    const [rapidMode, setRapidMode] = useState(true);
    const [isNewItem, setIsNewItem] = useState(false);
    const [foundItem, setFoundItem] = useState<any>(null);
    const [manualEntry, setManualEntry] = useState(false);
    const [imageUrlInput, setImageUrlInput] = useState('');

    const addItem = useStockStore((state) => state.addItem);
    const addTransaction = useStockStore((state) => state.addTransaction);
    const getItemByBarcode = useStockStore((state) => state.getItemByBarcode);
    const searchItems = useStockStore((state) => state.searchItems);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const quantityInputRef = useRef<HTMLInputElement>(null);

    // Form for new item
    const { register, handleSubmit, reset, setValue } = useForm();

    // Focus barcode input on mount and after actions
    // Focus barcode input on mount and after actions
    useEffect(() => {
        if (!isNewItem && !foundItem) {
            inputRef.current?.focus();
        }
    }, [isNewItem, foundItem]);

    // Check for "new" mode from URL (optional, though cleaner to use SearchParams but a manual check works roughly)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search.includes('mode=new')) {
            setManualEntry(true);
            setIsNewItem(true);
            setValue('barcode', '');
        }
    }, [setValue]);

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcode.trim()) return;

        const existing = getItemByBarcode(barcode);

        if (existing) {
            if (rapidMode) {
                const newTransaction = {
                    id: uuidv4(),
                    date: new Date().toISOString(),
                    type: 'IN' as const,
                    quantity: 1
                };
                dbActions.addTransaction(existing.id, newTransaction); // Sync to DB
                addTransaction(existing.id, newTransaction); // Sync to Local Store
                toast.success(`${existing.name}: +1 Adet Eklendi`, { duration: 1000 });
                setBarcode('');
                inputRef.current?.focus();
            } else if (foundItem && foundItem.id === existing.id) {
                // If same item is already open, increment quantity
                if (quantityInputRef.current) {
                    const currentQty = parseInt(quantityInputRef.current.value) || 0;
                    quantityInputRef.current.value = (currentQty + 1).toString();
                    toast.success(`${existing.name}: Adet güncellendi (${currentQty + 1})`, { duration: 800 });
                }
                setBarcode('');
                inputRef.current?.focus();
            } else {
                setFoundItem(existing);
                setBarcode('');
                setTimeout(() => quantityInputRef.current?.focus(), 50);
            }
        } else {
            // New Item
            setIsNewItem(true);
            setValue('barcode', barcode);
            // Play a sound?
            toast.info('Yeni ürün tespit edildi. Lütfen bilgilerini giriniz.');
        }
    };

    const handleManualAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const qty = parseInt((form.elements.namedItem('quantity') as HTMLInputElement).value);

        if (qty > 0 && foundItem) {
            const newTransaction = {
                id: uuidv4(),
                date: new Date().toISOString(),
                type: 'IN' as const,
                quantity: qty
            };
            const result = await dbActions.addTransaction(foundItem.id, newTransaction);
            if (result.success) {
                addTransaction(foundItem.id, newTransaction);
                toast.success(`${foundItem.name}: +${qty} Adet Eklendi`);
            } else {
                toast.error('Kayıt yapılırken bir hata oluştu');
            }
            setFoundItem(null);
            setBarcode('');
            inputRef.current?.focus();
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setValue('image', reader.result as string);
                toast.success('Resim yüklendi');
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const items = await (navigator as any).clipboard.read();
            for (const item of items) {
                const types = item.types;
                if (types.includes('image/png') || types.includes('image/jpeg') || types.includes('image/webp')) {
                    const blob = await item.getType(types[0]);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setValue('image', reader.result as string);
                        toast.success('Panodan resim yapıştırıldı');
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
            toast.error('Panoda resim bulunamadı');
        } catch (error) {
            toast.error('Panoya erişilemedi');
        }
    };

    const handleLoadFromUrl = async () => {
        if (!imageUrlInput) {
            toast.error('Lütfen bir URL girin');
            return;
        }
        try {
            const res = await fetch(imageUrlInput);
            const blob = await res.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
                setValue('image', reader.result as string);
                toast.success('URL üzerinden resim yüklendi');
                setImageUrlInput('');
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            toast.error('URL üzerinden resim alınamadı');
        }
    };

    const onNewItemSubmit = async (data: any) => {
        const newItem = {
            id: uuidv4(),
            barcode: data.barcode || uuidv4().slice(0, 8).toUpperCase(),
            stockCode: data.stockCode || '',
            name: data.name,
            image: data.image || '',
            description: data.description || '',
            brand: data.brand || '',
            vatRate: parseFloat(data.vatRate) || 18,
            buyPrice: parseFloat(data.buyPrice) || 0,
            sellPrice: parseFloat(data.sellPrice) || 0,
            quantity: parseFloat(data.quantity) || 0,
            transactions: [
                {
                    id: uuidv4(),
                    date: new Date().toISOString(),
                    type: 'IN' as const,
                    quantity: parseFloat(data.quantity) || 0
                }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const result = await dbActions.addItem(newItem);
        if (result.success) {
            addItem(newItem);
            toast.success('Yeni ürün kaydedildi');
        } else {
            toast.error('Ürün kaydedilirken hata oluştu');
        }
        setIsNewItem(false);
        reset();
        setBarcode('');
        inputRef.current?.focus();
    };

    // Search effect
    useEffect(() => {
        if (searchQuery.trim().length > 1) {
            const results = searchItems(searchQuery);
            setSearchResults(results.slice(0, 5));
        } else {
            setSearchResults([]);
        }
    }, [searchQuery, searchItems]);

    const handleSearchResultClick = async (item: any) => {
        if (rapidMode) {
            const newTransaction = {
                id: uuidv4(),
                date: new Date().toISOString(),
                type: 'IN' as const,
                quantity: 1
            };
            await dbActions.addTransaction(item.id, newTransaction);
            addTransaction(item.id, newTransaction);
            toast.success(`${item.name}: +1 Adet Eklendi`, { duration: 1000 });
            setSearchQuery('');
        } else if (foundItem && foundItem.id === item.id) {
            // If same item is already open, increment quantity
            if (quantityInputRef.current) {
                const currentQty = parseInt(quantityInputRef.current.value) || 0;
                quantityInputRef.current.value = (currentQty + 1).toString();
                toast.success(`${item.name}: Adet güncellendi (${currentQty + 1})`, { duration: 800 });
            }
            setSearchQuery('');
        } else {
            setFoundItem(item);
            setSearchQuery('');
            setTimeout(() => quantityInputRef.current?.focus(), 50);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-enter">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Stok Giriş</h1>
                <div className="flex items-center gap-2 bg-zinc-900 p-2 rounded-lg border border-white/10">
                    <label className="text-sm font-medium cursor-pointer text-zinc-300" htmlFor="rapid-mode">Otomatik Hızlı Mod</label>
                    <input
                        id="rapid-mode"
                        type="checkbox"
                        checked={rapidMode}
                        onChange={(e) => setRapidMode(e.target.checked)}
                        className="w-5 h-5 accent-primary"
                    />
                </div>
            </div>

            {!isNewItem && !foundItem && (
                <Card className="border-primary/50 shadow-[0_0_30px_-10px_var(--primary)]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Scan className="w-6 h-6 text-primary" />
                            Barkod Okutunuz
                        </CardTitle>
                        <CardDescription>
                            Ürünü eklemek için barkodu okutun veya elle yazıp Enter'a basın.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleScan} className="flex gap-4">
                            <Input
                                ref={inputRef}
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                placeholder="Barkod..."
                                className="text-2xl h-16 tracking-widest font-mono"
                                autoComplete="off"
                            />
                            <Button type="submit" size="lg" className="h-16 px-8">
                                GİRİŞ
                            </Button>
                        </form>

                        {/* Search Input */}
                        <div className="mt-6 relative">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                                <Input
                                    placeholder="Ürün adı veya marka ile ara..."
                                    className="pl-10 bg-zinc-950/50 border-zinc-800"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-20 overflow-hidden">
                                    {searchResults.map(item => (
                                        <div
                                            key={item.id}
                                            className="p-3 hover:bg-zinc-800 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0"
                                            onClick={() => handleSearchResultClick(item)}
                                        >
                                            <div className="w-10 h-10 bg-zinc-800 rounded-md flex items-center justify-center overflow-hidden">
                                                {item.image ? <img src={item.image} className="w-full h-full object-contain p-0.5" /> : <Scan className="w-5 h-5 text-zinc-600" />}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{item.name}</div>
                                                <div className="text-xs text-zinc-500">{item.barcode}</div>
                                            </div>
                                            <div className="ml-auto text-sm font-bold text-zinc-400">
                                                {item.quantity} Adet
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
                            <Button variant="ghost" className="text-zinc-400" onClick={() => {
                                setManualEntry(true);
                                setIsNewItem(true);
                                setValue('barcode', '');
                            }}>
                                Barkodsuz / Manuel Ürün Tanımla
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {foundItem && (
                <Card className="animate-enter bg-zinc-900/80 border-primary">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-2xl">{foundItem.name}</CardTitle>
                                <CardDescription className="mt-1 font-mono">{foundItem.barcode}</CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setFoundItem(null); setBarcode(''); inputRef.current?.focus(); }}>
                                <X />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-zinc-950 p-4 rounded-lg">
                                <p className="text-sm text-zinc-400">Mevcut Stok</p>
                                <p className="text-4xl font-bold">{foundItem.quantity}</p>
                                <div className="mt-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-500">Alış Fiyatı</span>
                                        <span>{foundItem.buyPrice} ₺</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-500">Satış Fiyatı</span>
                                        <span>{foundItem.sellPrice} ₺</span>
                                    </div>
                                </div>
                            </div>

                            <form onSubmit={handleManualAdd} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Eklenecek Adet</label>
                                    <Input
                                        name="quantity"
                                        type="number"
                                        defaultValue="1"
                                        min="1"
                                        className="text-center text-4xl h-20 font-bold"
                                        ref={quantityInputRef}
                                    />
                                </div>
                                <Button type="submit" className="w-full h-12 text-lg">
                                    ONAYLA VE EKLE
                                </Button>
                            </form>
                        </div>
                    </CardContent>
                </Card>
            )}

            {isNewItem && (
                <Card className="animate-enter border-blue-500/50">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Yeni Ürün Tanımla</CardTitle>
                            <Button variant="ghost" onClick={() => { setIsNewItem(false); setBarcode(''); reset(); }}>İptal</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onNewItemSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm">Barkod</label>
                                    <div className="flex gap-2">
                                        <Input {...register('barcode')} readOnly={!manualEntry} className={!manualEntry ? "bg-zinc-900" : ""} placeholder={manualEntry ? "Barkod Giriniz (Boşsa otomatik üretilir)" : ""} />
                                        {manualEntry && (
                                            <Button type="button" variant="secondary" onClick={() => setValue('barcode', uuidv4().slice(0, 8).toUpperCase())}>
                                                Rastgele
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">Stok Kodu (Opsiyonel)</label>
                                    <Input {...register('stockCode')} placeholder="Örn: STK-001" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">Marka</label>
                                    <Input {...register('brand')} placeholder="Örn: Ülker" autoFocus />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-sm">Ürün Adı</label>
                                    <Input {...register('name', { required: true })} placeholder="Örn: Çikolatalı Gofret" />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-sm">Açıklama</label>
                                    <Input {...register('description')} placeholder="Ürün açıklaması..." />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-sm">Resim Yükle (Opsiyonel)</label>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="cursor-pointer file:cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                                    />
                                    {/* Hidden input to store base64 string */}
                                    <input type="hidden" {...register('image')} />
                                    <div className="space-y-2 mt-2">
                                        <Button type="button" variant="secondary" onClick={handlePasteFromClipboard} className="w-full">
                                            Panodan Yapıştır
                                        </Button>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Resim URL girin"
                                                value={imageUrlInput}
                                                onChange={(e) => setImageUrlInput(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Button type="button" variant="secondary" onClick={handleLoadFromUrl} className="whitespace-nowrap">
                                                Yükle
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">Alış Fiyatı (₺)</label>
                                    <Input {...register('buyPrice')} type="number" step="0.01" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">Satış Fiyatı (₺)</label>
                                    <Input {...register('sellPrice')} type="number" step="0.01" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">KDV Oranı (%)</label>
                                    <select
                                        {...register('vatRate')}
                                        className="w-full h-10 px-3 rounded-md bg-zinc-900 border border-zinc-800 focus:border-primary/50 focus:outline-none"
                                        defaultValue="20"
                                    >
                                        <option value="1">%1</option>
                                        <option value="10">%10</option>
                                        <option value="20">%20</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm">Başlangıç Stoğu</label>
                                    <Input {...register('quantity')} type="number" defaultValue="1" />
                                </div>
                            </div>
                            <Button type="submit" className="w-full text-lg mt-4" size="lg">
                                <Save className="mr-2 w-5 h-5" /> KAYDET VE EKLE
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
