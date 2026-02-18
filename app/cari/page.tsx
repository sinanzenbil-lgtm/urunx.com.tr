'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Users, PlusCircle, Search, Pencil, Trash2 } from 'lucide-react';
import { Customer } from '@/types';
import * as dbActions from '@/lib/actions';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

export default function CariListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await dbActions.getCustomers();
      if (!cancelled) setCustomers(rows || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openEdit = (c: Customer) => {
    setEditing(c);
    setEditCode(c.customerCode || '');
    setEditName(c.name || '');
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      toast.error('Cari ismi boş olamaz');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Cari güncelleniyor...');
    try {
      const res = await dbActions.updateCustomer(editing.id, { customerCode: editCode.trim(), name });
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      const rows = await dbActions.getCustomers();
      setCustomers(rows || []);
      toast.success('Cari güncellendi', { id: toastId });
      setEditOpen(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      toast.error('Cari güncellenemedi', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (c: Customer) => {
    setDeleting(c);
    setDeleteOpen(true);
  };

  const submitDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const toastId = toast.loading('Cari siliniyor...');
    try {
      const res = await dbActions.removeCustomer(deleting.id);
      if (!res.success) throw new Error(typeof res.error === 'string' ? res.error : 'failed');
      const rows = await dbActions.getCustomers();
      setCustomers(rows || []);
      toast.success('Cari silindi', { id: toastId });
      setDeleteOpen(false);
      setDeleting(null);
    } catch (e) {
      console.error(e);
      toast.error('Cari silinemedi', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr-TR');
    if (!s) return customers;
    return customers.filter((c) => {
      const name = (c.name || '').toLocaleLowerCase('tr-TR');
      const code = (c.customerCode || '').toLocaleLowerCase('tr-TR');
      return name.includes(s) || code.includes(s);
    });
  }, [customers, q]);

  return (
    <div className="space-y-6 animate-enter">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-sky-400" />
            Cari Takip
          </h1>
          <p className="text-zinc-500">Cariler ve firma hareketleri</p>
        </div>
        <Link href="/cari/yeni">
          <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
            <PlusCircle className="w-5 h-5" />
            Cari Ekle
          </Button>
        </Link>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
        <Input
          placeholder="Cari adı veya cari kodu ara..."
          className="pl-10 h-12 text-lg bg-zinc-900/50 border-zinc-800 focus:border-primary/50"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cariler ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-6 py-4">Cari Kodu</th>
                  <th className="px-6 py-4">Cari İsmi</th>
                  <th className="px-6 py-4 text-right">Borç</th>
                  <th className="px-6 py-4 text-right">Alacak</th>
                  <th className="px-6 py-4 text-right">Düzenle</th>
                  <th className="px-6 py-4 text-right">Sil</th>
                  <th className="px-6 py-4 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                      Henüz cari yok.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-zinc-300">{c.customerCode || '-'}</td>
                      <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                      <td className="px-6 py-4 text-right font-bold text-red-400">
                        {c.balance && c.balance > 0 ? currency(c.balance) : currency(0)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400">
                        {c.balance && c.balance < 0 ? currency(Math.abs(c.balance)) : currency(0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          className="border-zinc-700 gap-2"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="w-4 h-4" />
                          Düzenle
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="destructive"
                          className="gap-2"
                          onClick={() => openDelete(c)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Sil
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/cari/${c.id}`}>
                          <Button variant="outline" className="border-zinc-700">
                            Hareketler
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(open) => !saving && setEditOpen(open)}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Cari Düzenle</DialogTitle>
            <DialogDescription>Cari kodu ve ismini güncelleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari Kodu</label>
              <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="Örn: 12" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Cari İsmi</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Örn: ABC Ltd." />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700" onClick={() => setEditOpen(false)} disabled={saving}>
              İptal
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submitEdit} disabled={saving}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => !saving && setDeleteOpen(open)}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Cari Sil
            </DialogTitle>
            <DialogDescription>
              Bu cariyi silmek istediğinize emin misiniz? Tahsilatlar silinir; stok hareketleri korunur ve cariden ayrılır.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-zinc-300">
              Silinecek cari: <span className="font-semibold text-white">{deleting?.name}</span>
              {deleting?.customerCode ? <span className="text-zinc-400"> ({deleting.customerCode})</span> : null}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={submitDelete} disabled={saving}>
              Evet, Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

