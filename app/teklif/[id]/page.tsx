'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileDown, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompanySettings, DEFAULT_QUOTE_SETTINGS, Quote, QuoteSettings, QUOTE_STATUS_OPTIONS } from '@/types';
import * as dbActions from '@/lib/actions';
import * as quoteActions from '@/lib/quotes';
import { cn } from '@/lib/utils';
import QuoteDocument from '@/components/quote-document';

const EMPTY_SETTINGS: CompanySettings = {
  companyName: '',
  tradeName: '',
  address: '',
  phone: '',
  email: '',
  logo: '',
};

const STATUS_BADGE: Record<Quote['status'], string> = {
  HAZIRLANDI: 'bg-zinc-500/15 text-zinc-300 border-zinc-600/40',
  GONDERILDI: 'bg-sky-500/15 text-sky-300 border-sky-600/40',
  ONAYLANDI: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  REDDEDILDI: 'bg-rose-500/15 text-rose-300 border-rose-600/40',
};

export default function TeklifDetayPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const quoteId = String(params?.id || '');

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(EMPTY_SETTINGS);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [quoteRes, settingsRes, quoteSettingsRes] = await Promise.all([
        quoteActions.getQuoteById(quoteId),
        dbActions.getCompanySettings(),
        quoteActions.getQuoteSettings(),
      ]);
      if (cancelled) return;
      const company = (settingsRes as unknown as { settings?: CompanySettings }).settings || EMPTY_SETTINGS;
      setQuoteSettings(quoteSettingsRes.settings);
      setSettings({
        companyName: company.companyName || '',
        tradeName: company.tradeName || '',
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        logo: company.logo || '',
      });
      if (!quoteRes.success || !quoteRes.quote) {
        setError('Teklif bulunamadı');
        setQuote(null);
      } else {
        setQuote(quoteRes.quote);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  // PDF dosya adı teklif numarası olsun
  useEffect(() => {
    if (!quote) return;
    const previous = document.title;
    document.title = `Teklif ${quote.quoteNo} - ${quote.customerName}`;
    return () => {
      document.title = previous;
    };
  }, [quote]);

  useEffect(() => {
    if (loading || !quote) return;
    if (searchParams.get('indir') !== '1') return;
    const t = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(t);
  }, [loading, quote, searchParams]);

  const statusLabel = useMemo(
    () => QUOTE_STATUS_OPTIONS.find((o) => o.key === quote?.status)?.label || '',
    [quote?.status]
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link href="/teklif">
          <Button variant="outline" className="border-zinc-700 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Teklif Listesi
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {quote ? (
            <span className={cn('text-xs font-medium border rounded-md px-2.5 py-1.5', STATUS_BADGE[quote.status])}>{statusLabel}</span>
          ) : null}
          <Link href="/teklif/yeni">
            <Button variant="outline" className="border-zinc-700 gap-2">
              <Pencil className="w-4 h-4" />
              Yeni Teklif
            </Button>
          </Link>
          <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2" onClick={() => window.print()} disabled={!quote}>
            <FileDown className="w-4 h-4" />
            PDF İndir
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="quote-sheet bg-white text-zinc-900 rounded-xl border border-zinc-800/20 shadow-xl p-8 md:p-10 max-w-[210mm] mx-auto">
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Teklif hazırlanıyor...
          </div>
        </div>
      ) : error || !quote ? (
        <div className="quote-sheet bg-white text-zinc-900 rounded-xl border border-zinc-800/20 shadow-xl p-8 md:p-10 max-w-[210mm] mx-auto">
          <div className="text-center py-10 text-zinc-600">{error || 'Teklif bulunamadı'}</div>
        </div>
      ) : (
        <QuoteDocument quote={quote} settings={settings} quoteSettings={quoteSettings} />
      )}
    </div>
  );
}
