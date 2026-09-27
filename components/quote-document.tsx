import { Package } from 'lucide-react';
import type { CompanySettings, Quote, QuoteSettings } from '@/types';
import { DEFAULT_QUOTE_SETTINGS } from '@/types';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');
const formatPercent = (value: number) => `%${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}`;

/*
 * Yalın teklif formu: kutu/çerçeve yerine ince cetvel çizgileri ve tipografi hiyerarşisi.
 * Yazdırmada sayfa tam A4 boyuna oturur, alt bilgi sayfanın en altında kalır.
 * Yazdırma kuralları (nav gizleme, @page A4) app/globals.css içindedir.
 */
const STYLES = `
.qd{font-size:11px;line-height:1.4;color:#18181b;display:flex;flex-direction:column}
.qd-label{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#71717a;font-weight:600}
.qd-head{display:grid;grid-template-columns:1.1fr 1fr 1.1fr;gap:20px;align-items:start;padding-top:22px}
.qd-logo{height:56px;display:flex;align-items:center}
.qd-logo img{max-height:56px;max-width:200px;object-fit:contain;object-position:left}
.qd-company{margin-top:8px;font-size:12.5px;font-weight:700;line-height:1.25}
.qd-company-sub{font-size:10px;color:#52525b;margin-top:2px}
.qd-title-wrap{text-align:center;padding-top:6px}
.qd-eyebrow{font-size:9px;letter-spacing:.32em;text-transform:uppercase;color:#71717a}
.qd-title{font-size:26px;font-weight:800;letter-spacing:-.01em;line-height:1.1;margin-top:4px}
.qd-meta{margin-top:12px;display:inline-grid;grid-template-columns:auto auto;column-gap:14px;row-gap:2px;text-align:left;font-size:10.5px}
.qd-meta span:nth-child(odd){color:#71717a}
.qd-meta span:nth-child(even){font-weight:600;font-variant-numeric:tabular-nums}
.qd-customer{text-align:right}
.qd-customer-name{font-size:13px;font-weight:700;line-height:1.3;margin-top:4px;overflow-wrap:anywhere}
.qd-customer-line{font-size:10.5px;color:#3f3f46;margin-top:2px;overflow-wrap:anywhere}
.qd-rule{height:1.5px;background:#18181b;margin:28px 0 0}
.qd-table{width:100%;border-collapse:collapse;margin-top:6px}
.qd-table th{font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:#71717a;font-weight:600;text-align:left;padding:10px 6px 8px;border-bottom:1px solid #d4d4d8;white-space:nowrap}
.qd-table td{padding:9px 6px;border-bottom:1px solid #ececef;vertical-align:middle}
.qd-table tr:last-child td{border-bottom:1px solid #d4d4d8}
.qd-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.qd-no{color:#a1a1aa;width:22px}
.qd-thumb{width:84px;height:84px;border:1px solid #e4e4e7;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.qd-thumb img{width:100%;height:100%;object-fit:contain}
.qd-name{font-size:11.5px;font-weight:600;line-height:1.3}
.qd-sub{font-size:9.5px;color:#71717a;margin-top:3px}
.qd-bottom{display:grid;grid-template-columns:1fr 240px;gap:32px;margin-top:16px;align-items:start}
.qd-terms{font-size:9.5px;color:#52525b;line-height:1.5}
.qd-terms p{white-space:pre-wrap;color:#3f3f46;margin-bottom:6px}
.qd-terms ul{padding-left:12px;margin:0}
.qd-terms li{margin-top:2px}
.qd-tot{display:flex;justify-content:space-between;padding:5px 0;font-size:11px;font-variant-numeric:tabular-nums}
.qd-tot span:first-child{color:#52525b}
.qd-grand{display:flex;justify-content:space-between;align-items:baseline;border-top:1.5px solid #18181b;margin-top:6px;padding-top:8px}
.qd-grand span:first-child{font-size:9px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.qd-grand span:last-child{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.qd-grand-sub{text-align:right;font-size:8.5px;color:#71717a;margin-top:2px}
.qd-footer{margin-top:auto;padding-top:14px;border-top:1px solid #d4d4d8;font-size:9.5px;color:#52525b;display:flex;justify-content:space-between;gap:16px}
.qd-footer b{color:#18181b}
@media print{
  .qd{min-height:273mm}
}
`;

export default function QuoteDocument({
  quote,
  settings,
  quoteSettings,
}: {
  quote: Quote;
  settings: CompanySettings;
  quoteSettings?: QuoteSettings;
}) {
  const qs = quoteSettings ?? DEFAULT_QUOTE_SETTINGS;
  const companyTitle = settings.tradeName || settings.companyName || 'Şirket Bilgisi Girilmedi';
  const validityText = quote.validUntil ? formatDate(quote.validUntil) : '';
  const termLines = (qs.terms || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => validityText || !line.includes('{gecerlilik}'))
    .map((line) => line.replace(/\{gecerlilik\}/g, validityText));
  const contact = [settings.phone, settings.email].filter(Boolean).join(' · ');
  const items = quote.items || [];

  return (
    <div className="quote-sheet qd bg-white text-zinc-900 border border-zinc-800/20 shadow-xl p-10 max-w-[210mm] mx-auto">
      <style>{STYLES}</style>

      {/* Üst bölüm: sol firma, orta başlık + künye, sağ müşteri */}
      <div className="qd-head">
        <div>
          <div className="qd-logo">
            {settings.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo} alt="Şirket logosu" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="bg-zinc-900 text-white p-1.5 rounded-md">
                  <Package className="w-5 h-5" />
                </div>
                <span className="font-bold tracking-tight text-base">{companyTitle}</span>
              </div>
            )}
          </div>
          <p className="qd-company">{companyTitle}</p>
          {settings.companyName && settings.tradeName ? <p className="qd-company-sub">{settings.companyName}</p> : null}
        </div>

        <div className="qd-title-wrap">
          {qs.subtitle ? <p className="qd-eyebrow">{qs.subtitle}</p> : null}
          <p className="qd-title">{qs.title || 'TEKLİF FORMU'}</p>
          <div className="qd-meta">
            <span>Teklif No</span>
            <span>{quote.quoteNo}</span>
            <span>Tarih</span>
            <span>{formatDate(quote.date)}</span>
            {quote.validUntil ? (
              <>
                <span>Geçerlilik</span>
                <span>{formatDate(quote.validUntil)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="qd-customer">
          <p className="qd-label">Sayın</p>
          <p className="qd-customer-name">{quote.customerName || '-'}</p>
          {quote.customerAddress ? <p className="qd-customer-line">{quote.customerAddress}</p> : null}
          {quote.customerPhone ? <p className="qd-customer-line">{quote.customerPhone}</p> : null}
          {quote.customerCode ? <p className="qd-customer-line">Cari Kodu: {quote.customerCode}</p> : null}
        </div>
      </div>

      <div className="qd-rule" />

      {/* Ürünler */}
      <table className="quote-table qd-table">
        <thead>
          <tr>
            <th className="qd-no">#</th>
            <th style={{ width: 96 }}>Görsel</th>
            <th>Ürün</th>
            <th className="qd-num">Birim Fiyat</th>
            <th className="qd-num">Adet</th>
            <th className="qd-num">KDV %</th>
            <th className="qd-num">KDV Tutarı</th>
            <th className="qd-num">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {items.map((line, index) => (
            <tr key={line.id}>
              <td className="qd-no">{index + 1}</td>
              <td>
                <div className="qd-thumb">
                  {line.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.image} alt="" />
                  ) : (
                    <Package className="w-6 h-6 text-zinc-300" />
                  )}
                </div>
              </td>
              <td>
                <div className="qd-name">{line.name}</div>
                <div className="qd-sub">
                  {[line.brand, line.stockCode ? `Kod: ${line.stockCode}` : null, line.barcode ? `Barkod: ${line.barcode}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </td>
              <td className="qd-num">{currency(line.unitPrice)}</td>
              <td className="qd-num">{line.quantity}</td>
              <td className="qd-num">{formatPercent(line.vatRate)}</td>
              <td className="qd-num">{currency(line.lineVat)}</td>
              <td className="qd-num" style={{ fontWeight: 700 }}>
                {currency(line.lineTotal)}
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', color: '#71717a', padding: 24 }}>
                Bu teklifte ürün satırı yok.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Koşullar + toplamlar */}
      <div className="quote-totals qd-bottom">
        <div className="qd-terms">
          {quote.note || termLines.length > 0 ? <p className="qd-label" style={{ marginBottom: 6 }}>Açıklama / Koşullar</p> : null}
          {quote.note ? <p>{quote.note}</p> : null}
          {termLines.length > 0 ? (
            <ul>
              {termLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <div className="qd-tot">
            <span>Ara Toplam (KDV Hariç)</span>
            <span>{currency(quote.subtotal)}</span>
          </div>
          <div className="qd-tot">
            <span>Toplam KDV</span>
            <span>{currency(quote.vatTotal)}</span>
          </div>
          <div className="qd-grand">
            <span>Genel Toplam</span>
            <span>{currency(quote.grandTotal)}</span>
          </div>
          <div className="qd-grand-sub">KDV dahil</div>
        </div>
      </div>

      {/* Alt bilgi: satıcı iletişim */}
      <div className="quote-footer qd-footer">
        <div>
          <b>{settings.companyName || companyTitle}</b>
          {settings.address ? <div>{settings.address}</div> : null}
        </div>
        {contact ? <div style={{ textAlign: 'right' }}>{contact}</div> : null}
      </div>
    </div>
  );
}
