'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, ArrowDownCircle, ArrowUpCircle, Trash2, Package } from 'lucide-react';
import { useState } from 'react';
import * as dbActions from '@/lib/actions';
import { cn } from '@/lib/utils';

export default function MovementsPage() {
    const items = useStockStore((state) => state.items);
    const removeStoreTransactions = useStockStore((state) => state.removeTransactions);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // Flatten all transactions from all items
    const allTransactions = items.flatMap(item =>
        item.transactions.map(t => ({
            ...t,
            productName: item.name,
            barcode: item.barcode,
            image: item.image,
            brand: item.brand
        }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filteredTransactions = allTransactions.filter(t =>
        t.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.barcode.includes(searchQuery) ||
        t.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.channel?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredTransactions.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredTransactions.map(t => t.id));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        toast.promise(dbActions.removeTransactions(selectedIds), {
            loading: 'İşlemler siliniyor ve stoklar güncelleniyor...',
            success: (data) => {
                if (data.success) {
                    removeStoreTransactions(selectedIds);
                    setSelectedIds([]);
                    setIsDeleteOpen(false);
                    return 'İşlemler silindi ve stoklar eski haline getirildi.';
                }
                throw new Error('Silme başarısız');
            },
            error: 'Bir hata oluştu.'
        });
    };

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Hareketleri</h1>
                        <p className="text-zinc-500">Tüm stok giriş ve çıkış geçmişi ({allTransactions.length})</p>
                    </div>
                    {selectedIds.length > 0 && (
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteOpen(true)}
                            className="gap-2 animate-in fade-in slide-in-from-right-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Seçilenleri Sil ({selectedIds.length})
                        </Button>
                    )}
                </div>
                <div className="relative w-full">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                    <Input
                        placeholder="Ürün adı, barkod, marka veya kanal ara..."
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
                                    <th className="px-4 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.length > 0 && selectedIds.length === filteredTransactions.length}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 accent-primary rounded"
                                        />
                                    </th>
                                    <th className="px-6 py-4">Tarih</th>
                                    <th className="px-6 py-4">İşlem Tipi</th>
                                    <th className="px-6 py-4">Ürün</th>
                                    <th className="px-6 py-4">Barkod</th>
                                    <th className="px-6 py-4 text-center">Adet</th>
                                    <th className="px-6 py-4">Kanal / Not</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                                            {allTransactions.length === 0 ? "Henüz işlem kaydı yok." : "Aranan kriterlere uygun kayıt bulunamadı."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map((t) => (
                                        <tr
                                            key={t.id}
                                            className={cn(
                                                "hover:bg-zinc-900/50 transition-colors group",
                                                selectedIds.includes(t.id) && "bg-primary/5"
                                            )}
                                        >
                                            <td className="px-4 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(t.id)}
                                                    onChange={() => toggleSelect(t.id)}
                                                    className="w-4 h-4 accent-primary rounded"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-zinc-400 font-mono text-xs">
                                                {new Date(t.date).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`flex items-center gap-2 font-medium ${t.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                                                    {t.type === 'IN' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                                                    {t.type === 'IN' ? 'Giriş' : 'Çıkış'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {t.image ? <img src={t.image} className="w-full h-full object-contain" /> : <Package className="w-4 h-4 text-zinc-700" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-white line-clamp-1">{t.productName}</div>
                                                        <div className="text-xs text-zinc-500">{t.brand}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-zinc-500">
                                                {t.barcode}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${t.type === 'IN' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {t.quantity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {t.channel ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                        {t.channel}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-red-500 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Hareket Kayıtlarını Sil
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-zinc-300">
                            Seçilen <strong>{selectedIds.length}</strong> hareketi silmek istediğinize emin misiniz?
                        </p>
                        <div className="bg-amber-500/10 border border-amber-500/50 p-3 rounded-lg flex gap-3">
                            <ArrowUpCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-200">
                                <strong>Önemli:</strong> Hareketler silindiğinde, ilgili ürünlerin stok miktarları otomatik olarak tersine düzeltilecektir.
                                (Örn: Bir 'Satış' hareketini silerseniz, o ürünün stoğu geri artacaktır.)
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Vazgeç</Button>
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                        >
                            Evet, Seçilenleri Sil ve Stokları Düzenle
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
