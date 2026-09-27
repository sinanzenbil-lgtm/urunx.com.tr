import { Package } from 'lucide-react';
import type { CompanySettings, Quote } from '@/types';
import { cn } from '@/lib/utils';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');
const formatPercent = (value: number) => `%${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}`;

/**
 * Teklif formu (PDF / yazdırma görünümü).
 * Sol üst: logo + şirket, orta: TEKLİF FORMU başlığı, sağ: müşteri.
 * Altında görselli ürün tablosu, toplamlar ve imza alanı.
 */
export default function QuoteDocument({ quote, settings }: { quote: Quote; settings: CompanySettings }) {
  const companyTitle = settings.tradeName || settings.companyName || 'Şirket Bilgisi Girilmedi';

  return (
    <div className="quote-sheet bg-white text-zinc-900 rounded-xl border border-zinc-800/20 shadow-xl p-8 md:p-10 max-w-[210mm] mx-auto">
      {/* Üst bant */}
      <div className="h-1.5 w-full bg-zinc-900 rounded-full mb-6" />

      {/* Başlık: sol logo + şirket, orta başlık, sağ müşteri */}
      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="min-w-0">
          <div className="h-[64px] flex items-center overflow-hidden">
            {settings.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo} alt="Şirket logosu" className="max-h-[64px] max-w-[190px] object-contain object-left" />
            ) : (
              <div className="flex items-center gap-2 text-zinc-800">
                <div className="bg-zinc-900 text-white p-1.5 rounded-md">
                  <Package className="w-5 h-5" />
                </div>
                <span className="font-bold tracking-tight">URUNX</span>
              </div>
            )}
          </div>
          <p className="text-sm font-bold mt-2 leading-tight">{companyTitle}</p>
          {settings.companyName && settings.tradeName ? (
            <p className="text-[11px] text-zinc-600 leading-tight">{settings.companyName}</p>
          ) : null}
        </div>

        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.35em] text-zinc-500">Fiyat Teklifi</p>
          <p className="text-3xl font-extrabold tracking-tight mt-1">TEKLİF FORMU</p>
          <div className="inline-block mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-left">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-zinc-500 w-20">Teklif No</span>
              <span className="font-mono font-semibold">{quote.quoteNo}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-zinc-500 w-20">Tarih</span>
              <span className="font-semibold">{formatDate(quote.date)}</span>
            </div>
            {quote.validUntil ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-zinc-500 w-20">Geçerlilik</span>
                <span className="font-semibold">{formatDate(quote.validUntil)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-full max-w-[220px] rounded-lg bg-zinc-100 border border-zinc-200 p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Sayın / Müşteri</p>
            <p className="text-base font-bold leading-snug mt-1 break-words">{quote.customerName || '-'}</p>
            {quote.customerCode ? <p className="text-[11px] text-zinc-600 mt-0.5">Cari Kodu: {quote.customerCode}</p> : null}
          </div>
        </div>
      </div>

      {/* Ürün tablosu */}
      <div className="mt-7 overflow-hidden rounded-lg border border-zinc-300">
        <table className="quote-table w-full text-[12px]">
          <thead className="bg-zinc-900 text-white">
            <tr>
              <th className="px-2 py-2.5 text-left w-8">#</th>
              <th className="px-2 py-2.5 text-left w-[64px]">Görsel</th>
              <th className="px-2 py-2.5 text-left">Ürün</th>
              <th className="px-2 py-2.5 text-right whitespace-nowrap">Birim Fiyat</th>
              <th className="px-2 py-2.5 text-right">Adet</th>
              <th className="px-2 py-2.5 text-right">KDV</th>
              <th className="px-2 py-2.5 text-right whitespace-nowrap">Toplam Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {(quote.items || []).map((line, index) => (
              <tr key={line.id} className={cn('border-t border-zinc-200', index % 2 === 1 && 'bg-zinc-50')}>
                <td className="px-2 py-2 text-zinc-500 align-middle">{index + 1}</td>
                <td className="px-2 py-2 align-middle">
                  <div className="w-[52px] h-[52px] rounded-md border border-zinc-200 bg-white overflow-hidden flex items-center justify-center">
                    {line.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.image} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Package className="w-5 h-5 text-zinc-300" />
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 align-middle">
                  <div className="font-semibold text-zinc-900 leading-snug">{line.name}</div>
                  <div className="text-[10.5px] text-zinc-500 mt-0.5">
                    {[line.brand, line.stockCode ? `Kod: ${line.stockCode}` : null, line.barcode ? `Barkod: ${line.barcode}` : null]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                </td>
                <td className="px-2 py-2 text-right align-middle whitespace-nowrap">{currency(line.unitPrice)}</td>
                <td className="px-2 py-2 text-right align-middle">{line.quantity}</td>
                <td className="px-2 py-2 text-right align-middle whitespace-nowrap">
                  <div>{formatPercent(line.vatRate)}</div>
                  <div className="text-[10px] text-zinc-500">{currency(line.lineVat)}</div>
                </td>
                <td className="px-2 py-2 text-right align-middle font-semibold whitespace-nowrap">{currency(line.lineTotal)}</td>
              </tr>
            ))}
            {(quote.items || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  Bu teklifte ürün satırı yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Toplamlar + not */}
      <div className="quote-totals mt-5 grid grid-cols-5 gap-4">
        <div className="col-span-3">
          {quote.note ? (
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Açıklama / Koşullar</p>
              <p className="text-[12px] text-zinc-700 mt-1 whitespace-pre-wrap leading-relaxed">{quote.note}</p>
            </div>
          ) : null}
          <div className={cn('text-[10.5px] text-zinc-500 leading-relaxed', quote.note ? 'mt-3' : '')}>
            <p>• Fiyatlar Türk Lirası (₺) cinsindendir; KDV tutarları ayrıca gösterilmiştir.</p>
            {quote.validUntil ? <p>• Bu teklif {formatDate(quote.validUntil)} tarihine kadar geçerlidir.</p> : null}
          </div>
        </div>
        <div className="col-span-2">
          <div className="rounded-lg border border-zinc-300 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 text-[12px] border-b border-zinc-200">
              <span className="text-zinc-600">Ara Toplam (KDV Hariç)</span>
              <span className="font-semibold">{currency(quote.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-[12px] border-b border-zinc-200">
              <span className="text-zinc-600">Toplam KDV</span>
              <span className="font-semibold">{currency(quote.vatTotal)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-3 bg-zinc-900 text-white">
              <span className="font-semibold text-[12px] uppercase tracking-wider">Genel Toplam</span>
              <span className="text-lg font-extrabold">{currency(quote.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alt bilgi: şirket iletişim + imza */}
      <div className="quote-footer mt-8 pt-4 border-t border-zinc-200 grid grid-cols-2 gap-6">
        <div className="text-[11px] text-zinc-600 leading-relaxed">
          <p className="font-semibold text-zinc-800">{companyTitle}</p>
          {settings.address ? <p>{settings.address}</p> : null}
          <p>
            {settings.phone ? <span>{settings.phone}</span> : null}
            {settings.phone && settings.email ? <span> • </span> : null}
            {settings.email ? <span>{settings.email}</span> : null}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-[10.5px] text-zinc-500">
          <div>
            <div className="h-14 border-b border-zinc-300" />
            <p className="mt-1 text-center">Teklifi Hazırlayan (Kaşe / İmza)</p>
          </div>
          <div>
            <div className="h-14 border-b border-zinc-300" />
            <p className="mt-1 text-center">Müşteri Onayı (Kaşe / İmza)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
