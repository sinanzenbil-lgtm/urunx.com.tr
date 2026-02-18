'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, PlusCircle, Search } from 'lucide-react';
import { Customer } from '@/types';
import * as dbActions from '@/lib/actions';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

export default function CariListPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');

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
                  <th className="px-6 py-4 text-right">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
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
    </div>
  );
}

