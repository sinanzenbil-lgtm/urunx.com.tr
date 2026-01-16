'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useState } from 'react';

export default function MovementsPage() {
    const items = useStockStore((state) => state.items);
    const [searchQuery, setSearchQuery] = useState('');

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

    return (
        <div className="space-y-6 animate-enter">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ürün Hareketleri</h1>
                        <p className="text-zinc-500">Tüm stok giriş ve çıkış geçmişi</p>
                    </div>
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
                                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                                            {allTransactions.length === 0 ? "Henüz işlem kaydı yok." : "Aranan kriterlere uygun kayıt bulunamadı."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map((t) => (
                                        <tr key={t.id} className="hover:bg-zinc-900/50 transition-colors">
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
                                                <div className="font-medium text-white">{t.productName}</div>
                                                <div className="text-xs text-zinc-500">{t.brand}</div>
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
        </div>
    );
}
