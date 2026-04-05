'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, ImagePlus, Package, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStockStore } from '@/lib/store';
import * as dbActions from '@/lib/actions';
import { StockItem } from '@/types';

type FormState = {
  name: string;
  barcode: string;
  stockCode: string;
  brand: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  vatRate: string;
  description: string;
  image: string;
};

const INITIAL_FORM: FormState = {
  name: '',
  barcode: '',
  stockCode: '',
  brand: '',
  buyPrice: '',
  sellPrice: '',
  quantity: '0',
  vatRate: '20',
  description: '',
  image: '',
};

export default function NewProductPage() {
  const router = useRouter();
  const items = useStockStore((state) => state.items);
  const addItem = useStockStore((state) => state.addItem);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const duplicateBarcodeItem = useMemo(() => {
    const barcode = form.barcode.trim();
    if (!barcode) return undefined;
    return items.find((item) => item.barcode.trim() === barcode);
  }, [form.barcode, items]);

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      updateForm('image', reader.result as string);
      toast.success('Gorsel yüklendi');
    };
    reader.readAsDataURL(file);
  };

  const handleLoadFromUrl = async () => {
    if (!imageUrl.trim()) {
      toast.error('Once gorsel URL girin');
      return;
    }

    try {
      const res = await fetch(imageUrl.trim());
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        updateForm('image', reader.result as string);
        setImageUrl('');
        toast.success('Gorsel URL uzerinden yuklendi');
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      toast.error('Gorsel URL uzerinden alinamadi');
      console.error(error);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardItems = await (navigator as Navigator & {
        clipboard: {
          read: () => Promise<Array<{ types: string[]; getType: (type: string) => Promise<Blob> }>>;
        };
      }).clipboard.read();

      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;

        const blob = await item.getType(imageType);
        const reader = new FileReader();
        reader.onloadend = () => {
          updateForm('image', reader.result as string);
          toast.success('Panodan gorsel yapistirildi');
        };
        reader.readAsDataURL(blob);
        return;
      }

      toast.error('Panoda gorsel bulunamadi');
    } catch (error) {
      toast.error('Panoya erisilemedi');
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    const name = form.name.trim();
    const barcode = form.barcode.trim();
    const stockCode = form.stockCode.trim();
    const brand = form.brand.trim();
    const description = form.description.trim();
    const buyPrice = Number(form.buyPrice.replace(',', '.')) || 0;
    const sellPrice = Number(form.sellPrice.replace(',', '.')) || 0;
    const quantity = Math.max(0, Number(form.quantity) || 0);
    const vatRate = Number(form.vatRate) || 0;

    if (!name) {
      toast.error('Urun adi zorunlu');
      return;
    }

    if (!barcode && !stockCode) {
      toast.error('Barkod veya stok kodundan en az biri girilmeli');
      return;
    }

    if (duplicateBarcodeItem) {
      toast.warning('Bu barkodu kullanan başka bir ürün var.');
    }

    const now = new Date().toISOString();
    const newItem: StockItem = {
      id: uuidv4(),
      name,
      barcode,
      stockCode,
      brand,
      description,
      image: form.image || undefined,
      vatRate,
      buyPrice,
      sellPrice,
      quantity,
      transactions: [],
      createdAt: now,
      updatedAt: now,
    };

    setSaving(true);
    const toastId = toast.loading('Urun karti kaydediliyor...');

    try {
      const result = await dbActions.addItem(newItem);
      if (!result.success) throw new Error('add-item-failed');

      addItem(newItem);
      toast.success('Yeni urun tanimlandi', { id: toastId });
      router.push('/urunler');
      router.refresh();
    } catch (error) {
      toast.error('Urun kaydi olusturulamadi', { id: toastId });
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-enter">
      <div className="space-y-2">
        <Link href="/urunler" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Urun listesine don
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Yeni Urun Tanimlama</h1>
          <p className="text-zinc-500">Yeni urun kartini olusturun.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-zinc-800 overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-950/40">
            <CardTitle>Urun Bilgileri</CardTitle>
            <CardDescription>Temel tanim, fiyat, stok ve gorsel bilgilerini girin.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-zinc-200">Urun Adi</label>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Ornek: 3'lu saklama kabi seti"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Marka</label>
                <Input
                  value={form.brand}
                  onChange={(e) => updateForm('brand', e.target.value)}
                  placeholder="Marka"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">KDV Orani</label>
                <select
                  value={form.vatRate}
                  onChange={(e) => updateForm('vatRate', e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="1">%1</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Barkod</label>
                <Input
                  value={form.barcode}
                  onChange={(e) => updateForm('barcode', e.target.value)}
                  placeholder="Barkod"
                />
                {duplicateBarcodeItem && (
                  <p className="text-xs text-amber-400">
                    Bu barkodu kullanan başka bir ürün var; kayıt yine de yapılır.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Stok Kodu</label>
                <Input
                  value={form.stockCode}
                  onChange={(e) => updateForm('stockCode', e.target.value)}
                  placeholder="Stok kodu"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Alis Fiyati</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.buyPrice}
                  onChange={(e) => updateForm('buyPrice', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Toptan Satis Fiyati</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sellPrice}
                  onChange={(e) => updateForm('sellPrice', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Acilis Stogu</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => updateForm('quantity', e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Durum Notu</label>
                <div className="h-10 rounded-md border border-zinc-800 bg-zinc-950 px-3 flex items-center text-sm text-zinc-400">
                  Urun karti kaydedilir, stok hareketi daha sonra girilir.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-200">Aciklama</label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Urun hakkinda kisa aciklama, varyant veya not bilgisi..."
                rows={5}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-200">Görsel</label>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                <div className="shrink-0 w-full sm:w-[200px] mx-auto sm:mx-0">
                  <div className="aspect-square rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden flex items-center justify-center">
                    {form.image ? (
                      <img
                        src={form.image}
                        alt="Ürün görseli önizleme"
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <Package className="w-10 h-10 text-zinc-600" />
                        <span className="text-xs text-zinc-500">Önizleme için görsel ekleyin</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="cursor-pointer file:cursor-pointer file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary/90"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 w-fit"
                    onClick={handlePasteFromClipboard}
                  >
                    <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                    Panodan yapıştır
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Görsel URL"
                      className="flex-1"
                    />
                    <Button type="button" variant="secondary" className="shrink-0" onClick={handleLoadFromUrl}>
                      Yükle
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Link href="/urunler" className="flex-1">
                <Button type="button" variant="outline" className="w-full border-zinc-700 text-zinc-200 hover:bg-zinc-900">
                  Iptal
                </Button>
              </Link>
              <Button type="submit" disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Kaydediliyor...' : 'Urunu Kaydet'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
