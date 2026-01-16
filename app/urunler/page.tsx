'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ExcelImportModal from '@/components/excel-import-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { StockItem } from '@/types';
import { Package, Scan, Search, Edit, X, PlusCircle, MinusCircle, Trash2 } from 'lucide-react';

export default function ProductsPage() {
    const items = useStockStore((state) => state.items);
    const updateItem = useStockStore((state) => state.updateItem);
    const removeItem = useStockStore((state) => state.removeItem);
    const addTransaction = useStockStore((state) => state.addTransaction);

    const [searchQuery, setSearchQuery] = useState('');
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [transactionModal, setTransactionModal] = useState<{ item: StockItem, type: 'IN' | 'OUT' } | null>(null);

    const filteredItems = items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery) ||
        item.stockCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem) return;
        updateItem(editingItem.id, editingItem);
        toast.success('Ürün güncellendi');
        setEditingItem(null);
    };

    const handleTransaction = (e: React.FormEvent) => {
        e.preventDefault();
        if (!transactionModal) return;

        const form = e.target as HTMLFormElement;
        const quantity = parseInt((form.elements.namedItem('quantity') as HTMLInputElement).value);

        if (quantity <= 0) {
            toast.error('Geçerli bir adet giriniz');
            return;
        }

        if (transactionModal.type === 'OUT' && transactionModal.item.quantity < quantity) {
            toast.error('Yetersiz stok!');
            return;
        }

        addTransaction(transactionModal.item.id, {
            id: crypto.randomUUID(), // using native randomUUID since we might need uuid import otherwise
            date: new Date().toISOString(),
            type: transactionModal.type,
            quantity: quantity
        });

        toast.success(transactionModal.type === 'IN' ? 'Stok Eklendi' : 'Satış Yapıldı / Stoktan Düştü');
        setTransactionModal(null);
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Listesi</h1>
                        <p className="text-zinc-500">Kayıtlı tüm ürünler ({items.length})</p>
                    </div>
                    <div className="flex gap-2">
                        <ExcelImportModal />
                        <Link href="/giris?mode=new">
                            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_-3px_rgba(22,163,74,0.5)]">
                                <PlusCircle className="w-5 h-5" />
                                Yeni Ürün Ekle
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="relative w-full">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                    <Input
                        placeholder="Ürün adı, barkod veya stok kodu ara..."
                        className="pl-10 h-12 text-lg bg-zinc-900/50 border-zinc-800 focus:border-primary/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                                <tr>
                                    <th className="px-6 py-4 w-[120px]">Görsel</th>
                                    <th className="px-6 py-4">Marka</th>
                                    <th className="px-6 py-4">Ürün Bilgisi</th>
                                    <th className="px-6 py-4">Stok Kodu</th>
                                    <th className="px-6 py-4">Barkod</th>
                                    <th className="px-6 py-4 text-center">Stok</th>
                                    <th className="px-6 py-4 text-right">Alış Fiyatı</th>
                                    <th className="px-6 py-4 text-right">Satış Fiyatı</th>
                                    <th className="px-6 py-4 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-zinc-500">
                                            {items.length === 0 ? "Henüz ürün eklenmemiş." : "Aranan kriterlere uygun ürün bulunamadı."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((item) => (
                                        <tr key={item.id} className="hover:bg-zinc-900/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="w-24 h-24 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    ) : (
                                                        <Package className="w-8 h-8 text-zinc-700" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-zinc-300 font-medium">{item.brand || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-lg text-white">{item.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-zinc-400 font-mono">{item.stockCode || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-zinc-500">
                                                {item.barcode}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${item.quantity > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {item.quantity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right text-zinc-400">
                                                {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(item.buyPrice)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-bold text-white text-lg">
                                                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(item.sellPrice)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                                        onClick={() => setTransactionModal({ item, type: 'IN' })}
                                                        title="Stok Giriş / Alış"
                                                    >
                                                        <PlusCircle className="w-5 h-5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={() => setTransactionModal({ item, type: 'OUT' })}
                                                        title="Stok Çıkış / Satış"
                                                    >
                                                        <MinusCircle className="w-5 h-5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setEditingItem(item)} title="Düzenle">
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            if (window.confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
                                                                removeItem(item.id);
                                                                toast.success('Ürün silindi');
                                                            }
                                                        }}
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!transactionModal} onOpenChange={(open) => !open && setTransactionModal(null)}>
                <DialogContent className="sm:max-w-sm bg-zinc-950 border-zinc-800 p-6">
                    {transactionModal && (
                        <>
                            <DialogHeader>
                                <DialogTitle className={transactionModal.type === 'IN' ? 'text-green-500' : 'text-red-500'}>
                                    {transactionModal.type === 'IN' ? 'Stok Giriş / Alış' : 'Stok Çıkış / Satış'}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <p className="font-medium text-white">{transactionModal.item.name}</p>
                                <p className="text-sm text-zinc-500">Mevcut Stok: {transactionModal.item.quantity}</p>
                            </div>
                            <form onSubmit={handleTransaction} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Adet</label>
                                    <Input
                                        name="quantity"
                                        type="number"
                                        min="1"
                                        defaultValue="1"
                                        autoFocus
                                        className="text-center text-2xl font-bold h-14"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setTransactionModal(null)}>İptal</Button>
                                    <Button
                                        type="submit"
                                        variant={transactionModal.type === 'IN' ? 'default' : 'destructive'}
                                        className={transactionModal.type === 'IN' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    >
                                        Onayla
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
                    {editingItem && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Ürün Düzenle</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Ürün Adı</label>
                                    <Input
                                        value={editingItem.name}
                                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Marka</label>
                                        <Input
                                            value={editingItem.brand || ''}
                                            onChange={(e) => setEditingItem({ ...editingItem, brand: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Stok Kodu</label>
                                        <Input
                                            value={editingItem.stockCode || ''}
                                            onChange={(e) => setEditingItem({ ...editingItem, stockCode: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Alış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={editingItem.buyPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, buyPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Satış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={editingItem.sellPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, sellPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Stok Adedi</label>
                                        <Input
                                            type="number"
                                            value={editingItem.quantity}
                                            onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">KDV</label>
                                        <Input
                                            type="number"
                                            value={editingItem.vatRate}
                                            onChange={(e) => setEditingItem({ ...editingItem, vatRate: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Resim URL (Base64)</label>
                                    <Input
                                        value={editingItem.image || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                                        className="text-xs font-mono truncate"
                                    />
                                </div>
                                <div className="pt-4 flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setEditingItem(null)}>İptal</Button>
                                    <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">Kaydet</Button>
                                </div>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
