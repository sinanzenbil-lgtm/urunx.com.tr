'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search, Edit, Trash2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { StockItem } from '@/types';
import * as dbActions from '@/lib/actions';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [transactionsItem, setTransactionsItem] = useState<StockItem | null>(null);

    const searchItems = useStockStore((state) => state.searchItems);
    const updateItem = useStockStore((state) => state.updateItem);
    const removeItem = useStockStore((state) => state.removeItem);

    // If query is empty, show all items (or slice of them). 
    // searchItems return all containing empty string which is everything.
    const results = searchItems(query);
    const sortedResults = useMemo(() => {
        return [...results].sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'tr'));
    }, [results]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem) return;

        const result = await dbActions.updateItem(editingItem.id, editingItem);
        if (result.success) {
            updateItem(editingItem.id, editingItem);
            toast.success('Ürün güncellendi');
            setEditingItem(null);
        } else {
            toast.error('Güncelleme kaydedilemedi');
        }
    };

    const handleDelete = (id: string) => {
        if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
            removeItem(id);
            toast.success('Ürün silindi');
        }
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex items-center gap-4 sticky top-[72px] z-40 bg-zinc-950/80 backdrop-blur-md p-4 rounded-xl border border-white/5">
                <Search className="text-zinc-400" />
                <Input
                    className="flex-1 bg-transparent border-none text-xl focus-visible:ring-0 px-0 placeholder:text-zinc-600"
                    placeholder="Ürün adı, barkod veya marka ara..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedResults.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-zinc-500">
                        Ürün bulunamadı.
                    </div>
                ) : (
                    sortedResults.map((item) => (
                        <Card key={item.id} className="group hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setTransactionsItem(item)}>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex justify-between items-start">
                                    <span className="truncate" title={item.name}>{item.name}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingItem(item)}>
                                            <Edit size={16} />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500" onClick={() => handleDelete(item.id)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </CardTitle>
                                <div className="text-xs text-zinc-500 font-mono">{item.barcode}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="aspect-video relative mb-4 rounded-md overflow-hidden bg-white/5 flex items-center justify-center">
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="object-cover w-full h-full" />
                                    ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-zinc-400">Marka</div>
                                    <div className="text-right">{item.brand || '-'}</div>
                                    <div className="text-zinc-400">Stok</div>
                                    <div className="text-right font-bold text-white">{item.quantity}</div>
                                    <div className="text-zinc-400">Alış</div>
                                    <div className="text-right text-zinc-300">{Number(item.buyPrice) ?? 0} ₺</div>
                                    <div className="text-zinc-400">Toptan Satış</div>
                                    <div className="text-right font-bold text-primary">{item.sellPrice} ₺</div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={!!transactionsItem} onOpenChange={(open) => !open && setTransactionsItem(null)}>
                <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-6">
                    {transactionsItem && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Stok Hareketleri</DialogTitle>
                                <DialogDescription>
                                    {transactionsItem.name} için son hareketler
                                </DialogDescription>
                            </DialogHeader>
                            <div className="mt-2 space-y-3 max-h-[60vh] overflow-auto">
                                {transactionsItem.transactions.length === 0 ? (
                                    <p className="text-sm text-zinc-500">Bu ürün için hareket bulunamadı.</p>
                                ) : (
                                    transactionsItem.transactions
                                        .slice()
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map((t) => (
                                            <div key={t.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                                                <div>
                                                    <p className="text-sm font-medium text-white">
                                                        {t.type === 'IN' ? 'Giriş' : 'Çıkış'} • {t.quantity} adet
                                                    </p>
                                                    <p className="text-xs text-zinc-500">{new Date(t.date).toLocaleString('tr-TR')}</p>
                                                    {t.channel && (
                                                        <p className="text-xs text-zinc-500">{t.channel}</p>
                                                    )}
                                                </div>
                                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {t.type === 'IN' ? '+' : '-'}{t.quantity}
                                                </span>
                                            </div>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit Modal - portal ile body'e render, her zaman en üstte görünsün */}
            {editingItem && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setEditingItem(null)}>
                    <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800 shadow-2xl relative z-10 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Ürün Düzenle</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setEditingItem(null)}><X /></Button>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleUpdate} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">Ürün Adı</label>
                                    <Input
                                        className="bg-zinc-900 border-zinc-700"
                                        value={editingItem.name}
                                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Alış Fiyatı</label>
                                        <Input
                                            type="number"
                                            className="bg-zinc-900 border-zinc-700"
                                            value={editingItem.buyPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, buyPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Toptan Satış Fiyatı</label>
                                        <Input
                                            type="number"
                                            className="bg-zinc-900 border-zinc-700"
                                            value={editingItem.sellPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, sellPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Stok Adedi</label>
                                        <Input
                                            type="number"
                                            className="bg-zinc-900 border-zinc-700"
                                            value={editingItem.quantity}
                                            onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">KDV</label>
                                        <Input
                                            type="number"
                                            className="bg-zinc-900 border-zinc-700"
                                            value={editingItem.vatRate}
                                            onChange={(e) => setEditingItem({ ...editingItem, vatRate: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-300">Resim URL</label>
                                    <Input
                                        className="bg-zinc-900 border-zinc-700"
                                        value={editingItem.image || ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                                    />
                                </div>
                                <div className="pt-4 flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setEditingItem(null)}>İptal</Button>
                                    <Button type="submit">Kaydet</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>,
                document.body
            )}
        </div>
    );
}
