'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, PlusCircle, Users } from 'lucide-react';
import * as dbActions from '@/lib/actions';

export default function CariYeniPage() {
  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Cari ismi zorunlu');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Kaydediliyor...');
    try {
      const res = await dbActions.addCustomer({ customerCode: customerCode.trim(), name: name.trim() });
      if (!res.success) throw new Error(String((res as any).error || 'failed'));
      toast.success('Cari eklendi', { id: toastId });
      setCustomerCode('');
      setName('');
    } catch (err) {
      toast.error('Cari eklenirken hata oluştu', { id: toastId });
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-sky-400" />
            Cari Ekle
          </h1>
          <p className="text-zinc-500">Yeni müşteri / firma kaydı</p>
        </div>
        <Link href="/cari">
          <Button variant="outline" className="border-zinc-700 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
        </Link>
      </div>

      <Card className="border-sky-900/30">
        <CardHeader>
          <CardTitle>Bilgiler</CardTitle>
          <CardDescription>Cari kodu boş bırakılırsa otomatik atanır</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari Kodu</label>
              <Input
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                placeholder="Boş bırakılırsa otomatik atanır"
                className="bg-zinc-900/50 border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari İsmi</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: ABC İnşaat Ltd."
                className="bg-zinc-900/50 border-zinc-800"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                className="gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                disabled={saving}
              >
                <PlusCircle className="w-5 h-5" />
                Kaydet
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

