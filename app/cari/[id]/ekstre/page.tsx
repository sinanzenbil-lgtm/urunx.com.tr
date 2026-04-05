'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileDown, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompanySettings, Customer } from '@/types';
import * as dbActions from '@/lib/actions';

type StatementTxKind = 'NORMAL' | 'RETURN';
type StatementPaymentMethod = 'Banka' | 'Nakit' | 'Diğer' | 'Açılış Bakiyesi';

type StatementMovementRow = {
  kind: 'TX' | 'PAYMENT' | 'OPENING';
  id: string;
  date: string;
  type: 'IN' | 'OUT' | 'PAYMENT' | 'OPENING';
  txKind?: StatementTxKind | null;
  quantity: number;
  channel?: string | null;
  totalPrice: number;
  direction?: 'IN' | 'OUT' | null;
  method?: StatementPaymentMethod | null;
  description?: string | null;
  itemName?: string | null;
  barcode?: string | null;
};

type StatementRowComputed = {
  row: StatementMovementRow;
  detail: string;
  debt: number;
  credit: number;
  balance: number;
};

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('tr-TR');
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

const EMPTY_SETTINGS: CompanySettings = {
  companyName: '',
  tradeName: '',
  address: '',
  phone: '',
  email: '',
  logo: '',
};

function mapRowToLedger(row: StatementMovementRow) {
  const amount = Number(row.totalPrice) || 0;
  if (row.kind === 'OPENING') {
    if (row.direction === 'OUT') return { debt: amount, credit: 0, detail: 'Devir Bakiyesi (Borç)' };
    return { debt: 0, credit: amount, detail: 'Devir Bakiyesi (Alacak)' };
  }

  if (row.kind === 'PAYMENT') {
    if (row.direction === 'OUT') return { debt: 0, credit: amount, detail: `Ödeme (${row.method || 'Diğer'})` };
    return { debt: amount, credit: 0, detail: `Tahsilat (${row.method || 'Diğer'})` };
  }

  if (row.type === 'OUT') {
    return { debt: 0, credit: amount, detail: `Satış${row.channel ? ` - ${row.channel}` : ''}` };
  }

  if (row.txKind === 'RETURN') {
    return { debt: amount, credit: 0, detail: `İade${row.channel ? ` - ${row.channel}` : ''}` };
  }

  return { debt: amount, credit: 0, detail: `Alış${row.channel ? ` - ${row.channel}` : ''}` };
}

export default function CustomerStatementPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const customerId = String(params?.id || '');

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(EMPTY_SETTINGS);
  const [rows, setRows] = useState<StatementMovementRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [movementsRes, customerRes, settingsRes] = await Promise.all([
        dbActions.getCustomerMovements(customerId),
        dbActions.getCustomerById(customerId),
        dbActions.getCompanySettings(),
      ]);
      if (cancelled) return;

      const movements = ((movementsRes as unknown as { rows?: StatementMovementRow[] }).rows || []) as StatementMovementRow[];
      const selectedCustomer = (customerRes as unknown as { customer?: Customer | null }).customer || null;
      const company = (settingsRes as unknown as { settings?: CompanySettings }).settings || EMPTY_SETTINGS;

      setRows(movements);
      setCustomer(selectedCustomer);
      setSettings({
        companyName: company.companyName || '',
        tradeName: company.tradeName || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        logo: company.logo || '',
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (loading) return;
    if (searchParams.get('indir') !== '1') return;
    const t = window.setTimeout(() => {
      window.print();
    }, 500);
    return () => window.clearTimeout(t);
  }, [loading, searchParams]);

  const computedRows = useMemo<StatementRowComputed[]>(() => {
    const asc = [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return asc.reduce<StatementRowComputed[]>((acc, row) => {
      const mapped = mapRowToLedger(row);
      const previousBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      const balance = previousBalance + mapped.credit - mapped.debt;
      acc.push({
        row,
        detail: mapped.detail,
        debt: mapped.debt,
        credit: mapped.credit,
        balance,
      });
      return acc;
    }, []);
  }, [rows]);

  const totals = useMemo(() => {
    const debt = computedRows.reduce((acc, r) => acc + r.debt, 0);
    const credit = computedRows.reduce((acc, r) => acc + r.credit, 0);
    const balance = credit - debt;
    return { debt, credit, balance };
  }, [computedRows]);

  const customerDisplay = customer?.name || 'Müşteri';

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @media print {
          nav,
          .no-print {
            display: none !important;
          }
          body {
            background: #fff !important;
          }
          main.container {
            max-width: 100% !important;
            padding: 0 !important;
          }
          .statement-sheet {
            border: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <Link href={`/cari/${customerId}`}>
          <Button variant="outline" className="border-zinc-700 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Cari Hareketlerine Dön
          </Button>
        </Link>
        <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2" onClick={() => window.print()}>
          <FileDown className="w-4 h-4" />
          PDF İndir
        </Button>
      </div>

      <div className="statement-sheet bg-white text-zinc-900 rounded-xl border border-zinc-800/20 shadow-xl p-8">
        {loading ? (
          <div className="text-sm text-zinc-500">Cari ekstre hazırlanıyor...</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-6 border-b border-zinc-200 pb-6">
              <div className="flex-1 min-w-0">
                <div className="w-full max-w-[560px] h-[120px] bg-white flex items-center overflow-hidden">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Şirket logosu" className="w-full h-full object-contain object-left" />
                  ) : (
                    <Package className="w-10 h-10 text-zinc-300" />
                  )}
                </div>
                <div className="space-y-1 mt-3">
                  <p className="text-xl font-bold">{settings.tradeName || settings.companyName || 'Şirket Bilgisi Girilmedi'}</p>
                  {settings.companyName ? <p className="text-sm text-zinc-700">{settings.companyName}</p> : null}
                  {settings.address ? <p className="text-sm text-zinc-700">{settings.address}</p> : null}
                  <div className="text-sm text-zinc-700">
                    {settings.phone ? <span>{settings.phone}</span> : null}
                    {settings.phone && settings.email ? <span> • </span> : null}
                    {settings.email ? <span>{settings.email}</span> : null}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-2xl font-extrabold tracking-tight">Cari Ekstre</p>
                <p className="text-sm text-zinc-500 mt-1">Düzenleme: {formatDateTime(new Date().toISOString())}</p>
              </div>
            </div>

            <div className="mt-6 border-b border-zinc-200 pb-5">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Sayın</p>
              <p className="text-xl font-semibold mt-1">{customerDisplay}</p>
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100">
                  <tr className="text-left text-zinc-700">
                    <th className="px-3 py-3">Tarih</th>
                    <th className="px-3 py-3">İşlem</th>
                    <th className="px-3 py-3">Ürün</th>
                    <th className="px-3 py-3 text-right">Adet</th>
                    <th className="px-3 py-3 text-right">Borç</th>
                    <th className="px-3 py-3 text-right">Alacak</th>
                    <th className="px-3 py-3 text-right">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                        Bu cari için hareket bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    computedRows.map(({ row, detail, debt, credit, balance }) => (
                      <tr key={row.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="px-3 py-2.5">
                          {row.kind === 'OPENING'
                            ? 'Devir'
                            : row.kind === 'PAYMENT'
                              ? row.direction === 'OUT'
                                ? 'Ödeme'
                                : 'Tahsilat'
                              : row.type === 'OUT'
                                ? 'Satış'
                                : row.txKind === 'RETURN'
                                  ? 'İade'
                                  : 'Alış'}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-zinc-800">{row.itemName || detail}</td>
                        <td className="px-3 py-2.5 text-right">{row.kind === 'TX' ? row.quantity : '-'}</td>
                        <td className="px-3 py-2.5 text-right">{debt > 0 ? currency(debt) : '-'}</td>
                        <td className="px-3 py-2.5 text-right">{credit > 0 ? currency(credit) : '-'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {balance >= 0 ? `${currency(balance)} (Alacak)` : `${currency(Math.abs(balance))} (Borç)`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-md rounded-lg border border-zinc-200 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">Toplam Borç</span>
                  <span className="font-semibold">{currency(totals.debt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">Toplam Alacak</span>
                  <span className="font-semibold">{currency(totals.credit)}</span>
                </div>
                <div className="h-px bg-zinc-200" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Kapanış Bakiyesi</span>
                  <span className="text-base font-extrabold">
                    {totals.balance >= 0
                      ? `${currency(totals.balance)} Alacak`
                      : `${currency(Math.abs(totals.balance))} Borç`}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
