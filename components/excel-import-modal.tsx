'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { useStockStore } from '@/lib/store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { bulkAddItems } from '@/lib/actions';
import { StockItem } from '@/types';

export default function ExcelImportModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const addItem = useStockStore((state) => state.addItem);

    const processFile = async (file: File) => {
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            setPreviewData(jsonData);
            toast.success(`${jsonData.length} satır veri okundu.`);
        } catch (error) {
            toast.error('Dosya okunurken hata oluştu.');
            console.error(error);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    const handleImport = async () => {
        if (previewData.length === 0) return;

        const itemsToImport: any[] = [];
        let failCount = 0;

        previewData.forEach((row: any) => {
            try {
                if (!row['UrunAdi'] && !row['Barkod']) {
                    failCount++;
                    return;
                }

                const newItem: StockItem = {
                    id: uuidv4(),
                    barcode: String(row['Barkod'] || ''),
                    stockCode: String(row['StokKodu'] || ''),
                    name: String(row['UrunAdi'] || 'İsimsiz Ürün'),
                    brand: String(row['Marka'] || ''),
                    buyPrice: parseFloat(row['AlisFiyati']) || 0,
                    sellPrice: parseFloat(row['SatisFiyati']) || 0,
                    quantity: parseInt(row['StokAdedi']) || 0,
                    vatRate: parseFloat(row['KDV']) || 20,
                    image: String(row['ResimURL'] || ''),
                    description: '',
                    transactions: [
                        {
                            id: uuidv4(),
                            date: new Date().toISOString(),
                            type: (row['Adet'] > 0 ? 'IN' : 'IN') as any,
                            quantity: Math.abs(parseInt(row['StokAdedi'])) || 0,
                            channel: 'Pazaryeri'
                        }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                itemsToImport.push(newItem);
            } catch (e) {
                failCount++;
            }
        });

        // Upload in chunks of 50 to avoid timeout
        const CHUNK_SIZE = 50;
        let successCount = 0;

        for (let i = 0; i < itemsToImport.length; i += CHUNK_SIZE) {
            const chunk = itemsToImport.slice(i, i + CHUNK_SIZE);
            const progress = Math.min(i + CHUNK_SIZE, itemsToImport.length);

            toast.loading(`Yükleniyor: ${progress}/${itemsToImport.length}`, { id: 'upload-progress' });

            const result = await bulkAddItems(chunk);
            if (result.success) {
                chunk.forEach(item => addItem(item)); // Keep local store in sync
                successCount += chunk.length;
            } else {
                toast.error(`Hata: ${i}-${progress} arası yüklenemedi`);
                break;
            }
        }

        toast.dismiss('upload-progress');

        if (successCount > 0) {
            toast.success(`İçe aktarım tamamlandı: ${successCount} ürün başarıyla yüklendi.`);
        } else {
            toast.error('Veritabanına yükleme yapılırken hata oluştu.');
        }

        setIsOpen(false);
        setPreviewData([]);
    };

    const downloadTemplate = () => {
        const headers = ['UrunAdi', 'Barkod', 'StokKodu', 'Marka', 'AlisFiyati', 'SatisFiyati', 'StokAdedi', 'KDV', 'ResimURL'];
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sablon");
        XLSX.writeFile(wb, "Urunx_Urun_Sablonu.xlsx");
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-green-700/50 text-green-500 hover:bg-green-500/10">
                    <FileSpreadsheet className="w-5 h-5" />
                    Excel'den Yükle
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
                <CardHeader>
                    <CardTitle>Excel İle Toplu Ürün Yükleme</CardTitle>
                    <CardDescription>
                        Ürünlerinizi Excel dosyasından hızlıca içe aktarın.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Instructions */}
                    <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 text-sm text-blue-200 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-blue-400">
                            <AlertCircle size={16} />
                            <span>Dikkat Edilecekler</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 opacity-80">
                            <li>Sütun başlıkları tam olarak şablondaki gibi olmalıdır.</li>
                            <li>Barkod alanı zorunludur ve benzersiz olmalıdır.</li>
                            <li>Excel formatı .xlsx veya .xls olmalıdır.</li>
                        </ul>
                        <Button
                            variant="link"
                            className="text-blue-400 p-0 h-auto font-bold gap-1 mt-2"
                            onClick={downloadTemplate}
                        >
                            <Download size={14} /> Örnek Şablonu İndir
                        </Button>
                    </div>

                    {/* Drop Zone */}
                    <div
                        className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-all gap-4
                            ${isDragging ? 'border-primary bg-primary/10' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".xlsx, .xls"
                            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                        />
                        <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-500">
                            <Upload size={32} />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-zinc-300">Excel dosyasını buraya sürükleyin</p>
                            <p className="text-sm text-zinc-500 mt-1">veya seçmek için tıklayın</p>
                        </div>
                    </div>

                    {/* Preview */}
                    {previewData.length > 0 && (
                        <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-green-500 flex items-center gap-2">
                                    <CheckCircle size={16} />
                                    {previewData.length} ürün bulundu
                                </span>
                            </div>
                            <div className="text-xs text-zinc-500 max-h-32 overflow-y-auto font-mono">
                                {JSON.stringify(previewData[0], null, 2)}
                                {previewData.length > 1 && `\n... ve ${previewData.length - 1} tane daha`}
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>İptal</Button>
                    <Button
                        onClick={handleImport}
                        disabled={previewData.length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        İçe Aktarmayı Başlat
                    </Button>
                </CardFooter>
            </DialogContent>
        </Dialog>
    );
}
