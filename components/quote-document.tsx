import { Package } from 'lucide-react';
import type { CompanySettings, Quote, QuoteSettings } from '@/types';
import { DEFAULT_QUOTE_SETTINGS } from '@/types';

const currency = (value: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');
const formatPercent = (value: number) => `%${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}`;

/** Tek vurgu rengi: lacivert. Siyah-beyaz yazıcıda koyu gri basılır; kontrast tona/ağırlığa dayanır. */
const NAVY = '#1c2b4a';
const RULE = '#c8ccd4'; // iç cetvel çizgileri
const FRAME = '#9ca3af'; // ikincil çerçeveler

/* Tasarıma özgü stiller kapsamlı (qv1-) sınıflarla tanımlanır; yazdırma kuralları app/globals.css içindedir. */
const STYLES = `
.qv1{font-size:11px;line-height:1.35;color:#18181b}
.qv1 *{box-sizing:border-box}
.qv1-rule{border-top:3px solid ${NAVY};padding-top:3px}
.qv1-rule>div{border-top:1px solid ${NAVY}}
.qv1-head{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:start;margin-top:18px}
.qv1-brand{min-width:0}
.qv1-logo{height:56px;display:flex;align-items:center;overflow:hidden}
.qv1-logo img{max-height:56px;max-width:180px;object-fit:contain;object-position:left center}
.qv1-mark{display:flex;align-items:center;gap:10px;min-width:0;height:56px}
.qv1-mark-box{width:36px;height:36px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:${NAVY};color:#fff}
.qv1-mark-text{font-size:19px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${NAVY};line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qv1-brand-name{font-size:12px;font-weight:700;margin-top:8px;line-height:1.25;overflow-wrap:anywhere}
.qv1-brand-legal{font-size:10.5px;color:#52525b;margin-top:2px;line-height:1.3;overflow-wrap:anywhere}
.qv1-title{text-align:center;padding:4px 8px 0}
.qv1-eyebrow{font-size:9px;font-weight:600;letter-spacing:.42em;color:#71717a;line-height:1;padding-left:.42em}
.qv1-h1{font-size:26px;font-weight:800;letter-spacing:.06em;color:${NAVY};line-height:1;margin-top:6px;white-space:nowrap;padding-left:.06em}
.qv1-dash{width:64px;height:1px;background:${NAVY};margin:10px auto 0}
.qv1-no{margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:.04em;color:#3f3f46;white-space:nowrap}
.qv1-cust-wrap{display:flex;justify-content:flex-end;min-width:0}
.qv1-box{border:1px solid ${NAVY};overflow:hidden}
.qv1-box--soft{border-color:${FRAME}}
.qv1-cust{width:100%;max-width:230px}
.qv1-cap{background:${NAVY};color:#fff;font-size:9px;font-weight:700;letter-spacing:.18em;line-height:1;padding:5px 10px}
.qv1-cust-body{padding:8px 10px}
.qv1-cust-name{font-size:12.5px;font-weight:700;line-height:1.3;overflow-wrap:anywhere}
.qv1-cust-code{font-size:10.5px;color:#52525b;margin-top:4px}
.qv1-cust-code b{color:#27272a;font-weight:600}
.qv1-meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid ${NAVY};margin-top:18px}
.qv1-meta>div{padding:6px 10px;min-width:0}
.qv1-meta>div+div{border-left:1px solid ${NAVY}}
.qv1-label{font-size:8.5px;font-weight:600;letter-spacing:.14em;color:#71717a;line-height:1}
.qv1-meta-val{margin-top:5px;font-size:11.5px;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qv1-meta-val--mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.04em}
.qv1-table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:16px;font-size:11px;font-variant-numeric:tabular-nums}
.qv1-table thead th{background:${NAVY};color:#fff;padding:6px 6px;vertical-align:middle;font-weight:600;border:1px solid rgba(255,255,255,.28);border-top-color:${NAVY};border-bottom-color:${NAVY}}
.qv1-table thead th:first-child{border-left-color:${NAVY}}
.qv1-table thead th:last-child{border-right-color:${NAVY}}
.qv1-th{font-size:9px;letter-spacing:.12em;line-height:1}
.qv1-th-sub{font-size:8px;font-weight:400;letter-spacing:.04em;line-height:1;margin-top:4px;color:rgba(255,255,255,.78)}
.qv1-th-sub--empty{visibility:hidden}
.qv1-table tbody td{padding:7px 6px;vertical-align:middle;border:1px solid ${RULE}}
.qv1-table tbody td:first-child{border-left-color:${NAVY}}
.qv1-table tbody td:last-child{border-right-color:${NAVY}}
.qv1-table tbody tr:last-child td{border-bottom-color:${NAVY}}
.qv1-table tbody tr:nth-child(even) td{background:#fafafa}
.qv1-c{text-align:center}
.qv1-l{text-align:left}
.qv1-r{text-align:right;white-space:nowrap}
.qv1-idx{color:#71717a}
.qv1-thumb{width:48px;height:48px;margin:0 auto;border:1px solid #d4d4d8;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.qv1-thumb img{width:100%;height:100%;object-fit:contain}
.qv1-name{font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.qv1-meta-line{font-size:9.5px;color:#71717a;margin-top:2px;line-height:1.3;overflow-wrap:anywhere}
.qv1-vat-amt{font-size:9.5px;color:#71717a}
.qv1-total-cell{font-weight:700}
.qv1-empty{padding:28px 12px;text-align:center;color:#71717a}
.qv1-bottom{display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start;margin-top:16px}
.qv1-terms{padding:8px 10px;font-size:10.5px;color:#3f3f46;line-height:1.55}
.qv1-terms p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.qv1-terms ul{margin:0;padding:0;list-style:none;color:#71717a}
.qv1-terms ul li{padding-left:10px;text-indent:-10px}
.qv1-terms ul li:before{content:"–";display:inline-block;width:10px;text-indent:0}
.qv1-terms p+ul{margin-top:6px;padding-top:6px;border-top:1px solid #e4e4e7}
.qv1-tot-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;font-size:11px;border-bottom:1px solid ${RULE};font-variant-numeric:tabular-nums}
.qv1-tot-row span:first-child{color:#52525b}
.qv1-tot-row span:last-child{font-weight:600;white-space:nowrap}
.qv1-tot-row--last{border-bottom-color:${NAVY}}
.qv1-grand{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:${NAVY};color:#fff;font-variant-numeric:tabular-nums}
.qv1-grand span:first-child{font-size:10px;font-weight:700;letter-spacing:.16em}
.qv1-grand span:last-child{font-size:17px;font-weight:800;line-height:1;white-space:nowrap}
.qv1-foot{display:grid;grid-template-columns:2fr 3fr;gap:20px;align-items:start;margin-top:20px;padding-top:14px;border-top:1px solid ${NAVY}}
.qv1-seller{font-size:10.5px;color:#52525b;line-height:1.5;min-width:0}
.qv1-seller p{margin:0;overflow-wrap:anywhere}
.qv1-seller .qv1-seller-name{font-weight:700;color:#18181b;margin-top:4px}
.qv1-sign{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.qv1-sign-box{border:1px solid ${FRAME}}
.qv1-sign-head{padding:4px 8px;font-size:8.5px;font-weight:600;letter-spacing:.14em;color:#52525b;background:#f4f4f5;border-bottom:1px solid #d4d4d8;line-height:1.2}
.qv1-sign-body{height:62px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px}
.qv1-sign-body span{font-size:8.5px;letter-spacing:.06em;color:#a1a1aa}
.qv1-close{margin-top:16px;border-top:1px solid ${NAVY}}
`;

const HEAD_COLUMNS: { title: string; sub?: string; align: 'qv1-c' | 'qv1-r' | 'qv1-l'; width: number | null }[] = [
  { title: 'NO', align: 'qv1-c', width: 30 },
  { title: 'GÖRSEL', align: 'qv1-c', width: 62 },
  { title: 'ÜRÜN AÇIKLAMASI', align: 'qv1-l', width: null },
  { title: 'BİRİM FİYAT', sub: 'KDV Hariç', align: 'qv1-r', width: 94 },
  { title: 'MİKTAR', align: 'qv1-r', width: 48 },
  { title: 'KDV', align: 'qv1-r', width: 72 },
  { title: 'TUTAR', sub: 'KDV Dahil', align: 'qv1-r', width: 104 },
];

/**
 * Teklif formu — "Kurumsal Klasik" varyantı.
 * Çift üst cetvel, lacivert tek vurgu, çerçeveli bilgi blokları, tam cetvel çizgili tablo,
 * sağ altta kutulu toplamlar, çerçeveli kaşe/imza alanları.
 */
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
  const validityText = quote.validUntil ? formatDate(quote.validUntil) : '';
  const termLines = (qs.terms || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    // Geçerlilik tarihi yoksa {gecerlilik} içeren maddeyi atla
    .filter((line) => validityText || !line.includes('{gecerlilik}'))
    .map((line) => line.replace(/\{gecerlilik\}/g, validityText));
  const companyTitle = settings.tradeName || settings.companyName || 'Şirket Bilgisi Girilmedi';
  const showLegalName = Boolean(settings.companyName && settings.tradeName && settings.companyName !== settings.tradeName);
  const items = quote.items || [];
  const contact = [settings.phone, settings.email].filter(Boolean);

  return (
    <div className="quote-sheet qv1 bg-white text-zinc-900 border border-zinc-800/20 shadow-xl p-8 md:p-10 max-w-[210mm] mx-auto">
      <style>{STYLES}</style>

      {/* Çift üst cetvel */}
      <div className="qv1-rule">
        <div />
      </div>

      {/* Başlık: sol logo + firma, orta başlık, sağ müşteri */}
      <div className="qv1-head">
        <div className="qv1-brand">
          {settings.logo ? (
            <div className="qv1-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.logo} alt="Şirket logosu" />
            </div>
          ) : (
            <div className="qv1-mark">
              <div className="qv1-mark-box">
                <Package style={{ width: 18, height: 18 }} strokeWidth={1.75} />
              </div>
              <span className="qv1-mark-text">{companyTitle}</span>
            </div>
          )}
          <p className="qv1-brand-name">{companyTitle}</p>
          {showLegalName ? <p className="qv1-brand-legal">{settings.companyName}</p> : null}
        </div>

        <div className="qv1-title">
          {qs.subtitle ? <p className="qv1-eyebrow">{qs.subtitle}</p> : null}
          <p className="qv1-h1">{qs.title || 'TEKLİF FORMU'}</p>
          <div className="qv1-dash" />
          <p className="qv1-no">No: {quote.quoteNo}</p>
        </div>

        <div className="qv1-cust-wrap">
          <div className="qv1-box qv1-cust">
            <div className="qv1-cap">SAYIN / MÜŞTERİ</div>
            <div className="qv1-cust-body">
              <p className="qv1-cust-name">{quote.customerName || '-'}</p>
              {quote.customerCode ? (
                <p className="qv1-cust-code">
                  Cari Kodu: <b>{quote.customerCode}</b>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Belge bilgileri şeridi: cetvelli hücreler */}
      <div className="qv1-meta">
        <div>
          <p className="qv1-label">TEKLİF NO</p>
          <p className="qv1-meta-val qv1-meta-val--mono">{quote.quoteNo}</p>
        </div>
        <div>
          <p className="qv1-label">TEKLİF TARİHİ</p>
          <p className="qv1-meta-val">{formatDate(quote.date)}</p>
        </div>
        <div>
          <p className="qv1-label">GEÇERLİLİK TARİHİ</p>
          <p className="qv1-meta-val">{quote.validUntil ? formatDate(quote.validUntil) : '—'}</p>
        </div>
        <div>
          <p className="qv1-label">KALEM SAYISI</p>
          <p className="qv1-meta-val">{items.length} kalem</p>
        </div>
      </div>

      {/* Ürün tablosu: tam cetvel çizgili */}
      <table className="quote-table qv1-table">
        <colgroup>
          {HEAD_COLUMNS.map((c) => (
            <col key={c.title} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {HEAD_COLUMNS.map((c) => (
              <th key={c.title} className={c.align}>
                <div className="qv1-th">{c.title}</div>
                <div className={c.sub ? 'qv1-th-sub' : 'qv1-th-sub qv1-th-sub--empty'}>{c.sub || '·'}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((line, index) => {
            const meta = [
              line.brand,
              line.stockCode ? `Stok Kodu: ${line.stockCode}` : null,
              line.barcode ? `Barkod: ${line.barcode}` : null,
            ].filter(Boolean);
            return (
              <tr key={line.id}>
                <td className="qv1-c qv1-idx">{index + 1}</td>
                <td>
                  <div className="qv1-thumb">
                    {line.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.image} alt="" />
                    ) : (
                      <Package style={{ width: 16, height: 16, color: '#d4d4d8' }} strokeWidth={1.5} />
                    )}
                  </div>
                </td>
                <td>
                  <div className="qv1-name">{line.name}</div>
                  {meta.length ? <div className="qv1-meta-line">{meta.join('  ·  ')}</div> : null}
                </td>
                <td className="qv1-r">{currency(line.unitPrice)}</td>
                <td className="qv1-r">{line.quantity}</td>
                <td className="qv1-r">
                  <div>{formatPercent(line.vatRate)}</div>
                  <div className="qv1-vat-amt">{currency(line.lineVat)}</div>
                </td>
                <td className="qv1-r qv1-total-cell">{currency(line.lineTotal)}</td>
              </tr>
            );
          })}
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="qv1-empty">
                Bu teklifte ürün satırı yok.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Koşullar + toplamlar */}
      <div className="quote-totals qv1-bottom">
        <div className="qv1-box qv1-box--soft">
          <div className="qv1-cap">AÇIKLAMA / KOŞULLAR</div>
          <div className="qv1-terms">
            {quote.note ? <p>{quote.note}</p> : null}
            {termLines.length > 0 ? (
              <ul>
                {termLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="qv1-box">
          <div className="qv1-tot-row">
            <span>Ara Toplam (KDV Hariç)</span>
            <span>{currency(quote.subtotal)}</span>
          </div>
          <div className="qv1-tot-row qv1-tot-row--last">
            <span>Toplam KDV</span>
            <span>{currency(quote.vatTotal)}</span>
          </div>
          <div className="qv1-grand">
            <span>GENEL TOPLAM</span>
            <span>{currency(quote.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Alt bilgi: satıcı iletişim + kaşe/imza */}
      <div className="quote-footer qv1-foot">
        <div className="qv1-seller">
          <p className="qv1-label">SATICI FİRMA</p>
          <p className="qv1-seller-name">{settings.companyName || companyTitle}</p>
          {settings.address ? <p>{settings.address}</p> : null}
          {contact.length ? <p>{contact.join('  ·  ')}</p> : null}
        </div>
        <div className="qv1-sign">
          <div className="qv1-sign-box">
            <div className="qv1-sign-head">{qs.preparerLabel || 'TEKLİFİ HAZIRLAYAN'}</div>
            <div className="qv1-sign-body">
              <span>Kaşe / İmza</span>
            </div>
          </div>
          <div className="qv1-sign-box">
            <div className="qv1-sign-head">{qs.approvalLabel || 'MÜŞTERİ ONAYI'}</div>
            <div className="qv1-sign-body">
              <span>Kaşe / İmza</span>
            </div>
          </div>
        </div>
      </div>

      {/* Kapanış cetveli */}
      <div className="qv1-close" />
    </div>
  );
}
