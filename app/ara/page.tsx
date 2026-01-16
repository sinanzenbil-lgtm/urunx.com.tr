'use client';

import { useState } from 'react';
import { useStockStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Edit, Trash2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { StockItem } from '@/types';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);

    const searchItems = useStockStore((state) => state.searchItems);
    const updateItem = useStockStore((state) => state.updateItem);
    const removeItem = useStockStore((state) => state.removeItem);

    // If query is empty, show all items (or slice of them). 
    // searchItems return all containing empty string which is everything.
    const results = searchItems(query);

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingItem) return;

        // In a real app we would use a form library here too, but simple object modification is enough
        updateItem(editingItem.id, editingItem);
        toast.success('Ürün güncellendi');
        setEditingItem(null);
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
                {results.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-zinc-500">
                        Ürün bulunamadı.
                    </div>
                ) : (
                    results.map((item) => (
                        <Card key={item.id} className="group hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex justify-between items-start">
                                    <span className="truncate" title={item.name}>{item.name}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                {item.image && (
                                    <div className="aspect-video relative mb-4 rounded-md overflow-hidden bg-white/5">
                                        <img src={item.image} alt={item.name} className="object-cover w-full h-full" />
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-zinc-400">Marka</div>
                                    <div className="text-right">{item.brand || '-'}</div>
                                    <div className="text-zinc-400">Stok</div>
                                    <div className="text-right font-bold text-white">{item.quantity}</div>
                                    <div className="text-zinc-400">Satış</div>
                                    <div className="text-right font-bold text-primary">{item.sellPrice} ₺</div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Edit Modal (Simple overlay) */}
            {editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-zinc-950 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Ürün Düzenle</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setEditingItem(null)}><X /></Button>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleUpdate} className="space-y-4">
                                <div className="space-y-2">
                                    <label>Ürün Adı</label>
                                    <Input
                                        value={editingItem.name}
                                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label>Alış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={editingItem.buyPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, buyPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label>Satış Fiyatı</label>
                                        <Input
                                            type="number"
                                            value={editingItem.sellPrice}
                                            onChange={(e) => setEditingItem({ ...editingItem, sellPrice: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label>Stok Adedi</label>
                                        <Input
                                            type="number"
                                            value={editingItem.quantity}
                                            onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label>KDV</label>
                                        <Input
                                            type="number"
                                            value={editingItem.vatRate}
                                            onChange={(e) => setEditingItem({ ...editingItem, vatRate: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label>Resim URL</label>
                                    <Input
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
                </div>
            )}
        </div>
    );
}
