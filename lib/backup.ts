/**
 * Tam sistem yedeği: veritabanındaki tüm tabloları + ürün görsellerini
 * tek bir ZIP paketine dönüştürür.
 *
 * Paket, sunucu belleğine sığmayacak kadar büyük olabileceği için tablolar
 * sayfa sayfa okunur ve arşiv akış halinde üretilir (bkz. lib/zip-stream.ts).
 */
import { sql } from './db';
import type { ZipEntryInput } from './zip-stream';
import type { BackupOptions } from '@/types';
import { RESTORE_SCRIPT } from './backup-restore-script';

export const BACKUP_FORMAT_VERSION = 1;

/** Yedeklenen tablolar (silme/ekleme sırası FK'lere göre ayarlanır). */
const BACKUP_TABLES = ['customers', 'items', 'transactions', 'customer_payments', 'company_settings', 'members'] as const;


const PAGE_ITEMS = 500;
const PAGE_ROWS = 2000;
/** Görsel taşıyan sorgularda sayfa boyutu satır sayısına değil, bayta göre ayarlanır. */
const IMAGE_PAGE_TARGET_BYTES = 4 * 1024 * 1024;
const IMAGE_PAGE_MIN = 5;
const IMAGE_PAGE_MAX = 250;
const IMAGE_PAGE_INITIAL = 25;

type Row = Record<string, unknown>;

export type BackupStats = {
  counts: Record<string, number>;
  imageFiles: number;
  imageBytes: number;
  externalImages: number;
  files: { name: string; bytes: number }[];
  warnings: string[];
};

export type BackupContext = {
  options: BackupOptions;
  /** Arşivin içindeki kök klasör adı. */
  root: string;
  createdAt: Date;
  createdBy: string;
  settings: Row | null;
  stats: BackupStats;
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

/** Dosya adı için güvenli, Türkçe karakterlerden arındırılmış kısa ad. */
export function slugify(value: string, maxLength = 48): string {
  const ascii = (value || '')
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
};

/** "data:image/png;base64,..." → ikili veri. Değilse null. */
export function parseDataUrl(value: string): { buffer: Buffer; extension: string } | null {
  if (!value.startsWith('data:')) return null;
  const comma = value.indexOf(',');
  if (comma < 0) return null;
  const meta = value.slice(5, comma);
  const isBase64 = meta.includes(';base64');
  const mime = meta.split(';')[0].toLowerCase();
  const payload = value.slice(comma + 1);
  try {
    const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (!buffer.length) return null;
    return { buffer, extension: MIME_EXTENSIONS[mime] || 'bin' };
  } catch {
    return null;
  }
}

function isExternalImage(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** CSV/rapor için gg.aa.yyyy ss:dd biçimi. */
function trDateTime(value: unknown): string {
  const date = toDate(value);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Excel (tr-TR) ondalık ayıracı virgüldür. */
function trNumber(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return String(Math.round(num * 100) / 100).replace('.', ',');
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const cleaned = text.replace(/\r?\n/g, ' ').trim();
  return `"${cleaned.replace(/"/g, '""')}"`;
}

function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(';')}\r\n`;
}

/** Postgres literali (INSERT ifadeleri için). */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/* ------------------------------------------------------------------ */
/* Veri okuma (sayfalı)                                                */
/* ------------------------------------------------------------------ */

type PageFetcher = (lastId: string, limit: number) => Promise<unknown>;

/** id'ye göre keyset sayfalama — büyük tablolarda bellek şişirmez. */
async function* pagedRows(fetchPage: PageFetcher, limit: number): AsyncGenerator<Row> {
  let lastId = '';
  for (;;) {
    const result = (await fetchPage(lastId, limit)) as Row[];
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    if (rows.length < limit) return;
    lastId = String(rows[rows.length - 1].id ?? '');
    if (!lastId) return;
  }
}

/**
 * Görsel içeren tablolarda sabit satır sayısı ya çok yavaş (küçük görseller) ya da
 * çok büyük yanıtlar (yüksek çözünürlüklü görseller) üretir; sayfa boyutu son
 * sayfanın ortalama satır ağırlığına göre ayarlanır.
 */
async function* pagedRowsByBytes(fetchPage: PageFetcher, measure: (row: Row) => number): AsyncGenerator<Row> {
  let lastId = '';
  let limit = IMAGE_PAGE_INITIAL;
  for (;;) {
    const result = (await fetchPage(lastId, limit)) as Row[];
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return;

    let bytes = 0;
    for (const row of rows) {
      bytes += measure(row);
      yield row;
    }
    if (rows.length < limit) return;
    lastId = String(rows[rows.length - 1].id ?? '');
    if (!lastId) return;

    const perRow = Math.max(1, bytes / rows.length);
    limit = Math.min(IMAGE_PAGE_MAX, Math.max(IMAGE_PAGE_MIN, Math.round(IMAGE_PAGE_TARGET_BYTES / perRow)));
  }
}

/** Bir satırın kabaca kaç bayt taşıdığı (görsel alanı baskın). */
function rowWeight(row: Row): number {
  const image = typeof row.image === 'string' ? row.image.length : 0;
  return image + 300;
}

const itemsWithImagePage: PageFetcher = (lastId, limit) =>
  sql`SELECT id, stock_code, barcode, name, image FROM items WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const itemsPage: PageFetcher = (lastId, limit) =>
  sql`SELECT id, barcode, stock_code, name, description, brand, vat_rate, buy_price, sell_price, quantity,
             created_at, updated_at
      FROM items WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const itemsFullPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM items WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const transactionsPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM transactions WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const transactionsDetailPage: PageFetcher = (lastId, limit) =>
  sql`SELECT t.id, t.date, t.type, t.kind, t.quantity, t.channel, t.unit_price, t.total_price,
             i.name AS item_name, i.stock_code AS item_stock_code, i.barcode AS item_barcode,
             c.name AS customer_name, c.customer_code AS customer_code
      FROM transactions t
      LEFT JOIN items i ON i.id = t.item_id
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE t.id > ${lastId} ORDER BY t.id LIMIT ${limit}`;

const customersPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM customers WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const paymentsPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM customer_payments WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const paymentsDetailPage: PageFetcher = (lastId, limit) =>
  sql`SELECT p.id, p.date, p.amount, p.direction, p.method, p.description,
             c.name AS customer_name, c.customer_code AS customer_code
      FROM customer_payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.id > ${lastId} ORDER BY p.id LIMIT ${limit}`;

const settingsPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM company_settings WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

const membersPage: PageFetcher = (lastId, limit) =>
  sql`SELECT * FROM members WHERE id > ${lastId} ORDER BY id LIMIT ${limit}`;

async function fetchCompanySettings(): Promise<Row | null> {
  try {
    const rows = (await sql`SELECT * FROM company_settings ORDER BY updated_at DESC LIMIT 1`) as Row[];
    return rows[0] || null;
  } catch {
    return null;
  }
}

const COUNT_QUERIES: Record<string, () => Promise<unknown>> = {
  customers: () => sql`SELECT COUNT(*)::int AS c FROM customers`,
  items: () => sql`SELECT COUNT(*)::int AS c FROM items`,
  transactions: () => sql`SELECT COUNT(*)::int AS c FROM transactions`,
  customer_payments: () => sql`SELECT COUNT(*)::int AS c FROM customer_payments`,
  company_settings: () => sql`SELECT COUNT(*)::int AS c FROM company_settings`,
  members: () => sql`SELECT COUNT(*)::int AS c FROM members`,
};

/** Tablo başına kayıt sayısı. Tablo yoksa -1 döner (kurulum yapılmamış olabilir). */
export async function fetchTableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    try {
      const rows = (await COUNT_QUERIES[table]()) as Row[];
      counts[table] = Number(rows[0]?.c) || 0;
    } catch {
      counts[table] = -1;
    }
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Yedek özeti (Ayarlar ekranındaki kutu için)                         */
/* ------------------------------------------------------------------ */

export type BackupOverview = {
  counts: Record<string, number>;
  embeddedImages: number;
  externalImages: number;
  imageBase64Bytes: number;
  itemsTextBytes: number;
  transactionsBytes: number;
  othersBytes: number;
  logoBytes: number;
  generatedAt: string;
};

export async function readBackupOverview(): Promise<BackupOverview> {
  const counts = await fetchTableCounts();

  let images: Row = {};
  try {
    const imageRows = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE image LIKE 'data:%')::int AS embedded,
        COUNT(*) FILTER (WHERE image IS NOT NULL AND image <> '' AND image NOT LIKE 'data:%')::int AS external,
        COALESCE(SUM(length(image)) FILTER (WHERE image LIKE 'data:%'), 0)::bigint AS base64_bytes,
        COALESCE(SUM(
          length(coalesce(id,'')) + length(coalesce(barcode,'')) + length(coalesce(stock_code,'')) +
          length(coalesce(name,'')) + length(coalesce(description,'')) + length(coalesce(brand,''))
        ), 0)::bigint AS text_bytes
      FROM items
    `) as Row[];
    images = imageRows[0] || {};
  } catch {
    images = {};
  }

  let logoBytes = 0;
  try {
    const logoRows = (await sql`
      SELECT COALESCE(MAX(length(logo)), 0)::bigint AS logo_bytes FROM company_settings WHERE logo LIKE 'data:%'
    `) as Row[];
    logoBytes = Number(logoRows[0]?.logo_bytes) || 0;
  } catch {
    logoBytes = 0;
  }

  const itemsTextBytes = Number(images.text_bytes) || 0;
  const rowCount = (table: string) => Math.max(0, counts[table] || 0);
  const transactionsBytes = rowCount('transactions') * 180;
  const othersBytes = (rowCount('customers') + rowCount('customer_payments') + rowCount('members')) * 220;

  return {
    counts,
    embeddedImages: Number(images.embedded) || 0,
    externalImages: Number(images.external) || 0,
    imageBase64Bytes: Number(images.base64_bytes) || 0,
    itemsTextBytes: itemsTextBytes + rowCount('items') * 120,
    transactionsBytes,
    othersBytes,
    logoBytes,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Paket parçaları                                                     */
/* ------------------------------------------------------------------ */

/** Akış halindeki metin girdilerinin ham boyutunu istatistiğe yazar. */
function measured(ctx: BackupContext, name: string, source: AsyncIterable<string>): AsyncIterable<string> {
  return (async function* () {
    let bytes = 0;
    for await (const chunk of source) {
      bytes += Buffer.byteLength(chunk, 'utf8');
      yield chunk;
    }
    ctx.stats.files.push({ name, bytes });
  })();
}

function buffered(ctx: BackupContext, name: string, content: string | Buffer): ZipEntryInput {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  ctx.stats.files.push({ name, bytes: buffer.length });
  return { name: `${ctx.root}/${name}`, data: buffer, date: ctx.createdAt };
}

function streamed(ctx: BackupContext, name: string, source: AsyncIterable<string>): ZipEntryInput {
  return { name: `${ctx.root}/${name}`, data: measured(ctx, name, source), date: ctx.createdAt };
}

/** Satırları JSON dizisi olarak akıtır (tek seferde belleğe alınmaz). */
async function* jsonArrayStream(rows: AsyncIterable<Row>, transform?: (row: Row) => Row): AsyncGenerator<string> {
  yield '[\n';
  let first = true;
  for await (const row of rows) {
    const value = transform ? transform(row) : row;
    yield `${first ? '' : ',\n'}  ${JSON.stringify(value)}`;
    first = false;
  }
  yield '\n]\n';
}

async function* csvStream(header: string[], rows: AsyncIterable<unknown[]>): AsyncGenerator<string> {
  yield '\ufeff'; // Excel'in UTF-8 algılaması için BOM
  yield csvLine(header);
  for await (const cells of rows) yield csvLine(cells);
}

/* ---- Görseller ---------------------------------------------------- */

type ImageIndex = {
  /** ürün id → arşiv içindeki görsel yolu */
  files: Map<string, string>;
  /** ürün id → internetteki görsel adresi (indirilemeyen görseller) */
  externalById: Map<string, string>;
  external: { id: string; stockCode: string; name: string; url: string }[];
};

/** Ürün görsellerini tek tek çözüp arşive yazar, yol haritasını döndürür. */
async function* imageEntries(ctx: BackupContext, index: ImageIndex): AsyncGenerator<ZipEntryInput> {
  const used = new Set<string>();

  for await (const row of pagedRowsByBytes(itemsWithImagePage, rowWeight)) {
    const raw = typeof row.image === 'string' ? row.image : '';
    if (!raw) continue;
    const id = String(row.id);

    if (isExternalImage(raw)) {
      index.externalById.set(id, raw.trim());
      index.external.push({
        id,
        stockCode: String(row.stock_code || ''),
        name: String(row.name || ''),
        url: raw.trim(),
      });
      continue;
    }

    const parsed = parseDataUrl(raw);
    if (!parsed) {
      ctx.stats.warnings.push(`Ürün ${id}: görsel biçimi tanınmadı, pakete eklenemedi.`);
      continue;
    }

    const base = slugify(String(row.stock_code || row.barcode || row.name || 'urun')) || 'urun';
    let fileName = `${base}_${id.slice(0, 8)}.${parsed.extension}`;
    let counter = 2;
    while (used.has(fileName)) fileName = `${base}_${id.slice(0, 8)}-${counter++}.${parsed.extension}`;
    used.add(fileName);

    const archivePath = `gorseller/urunler/${fileName}`;
    index.files.set(id, archivePath);
    ctx.stats.imageFiles += 1;
    ctx.stats.imageBytes += parsed.buffer.length;
    ctx.stats.files.push({ name: archivePath, bytes: parsed.buffer.length });

    // Görseller zaten sıkıştırılmış formatta; tekrar sıkıştırmak sadece CPU harcar.
    yield { name: `${ctx.root}/${archivePath}`, data: parsed.buffer, store: true, date: ctx.createdAt };
  }

  const logo = typeof ctx.settings?.logo === 'string' ? ctx.settings.logo : '';
  if (logo) {
    const parsed = parseDataUrl(logo);
    if (parsed) {
      const archivePath = `gorseller/logo.${parsed.extension}`;
      ctx.stats.imageFiles += 1;
      ctx.stats.imageBytes += parsed.buffer.length;
      ctx.stats.files.push({ name: archivePath, bytes: parsed.buffer.length });
      yield { name: `${ctx.root}/${archivePath}`, data: parsed.buffer, store: true, date: ctx.createdAt };
    } else if (isExternalImage(logo)) {
      index.external.push({ id: 'logo', stockCode: '', name: 'Şirket logosu', url: logo.trim() });
    }
  }
}

/* ---- SQL geri yükleme dosyası -------------------------------------- */

type ColumnInfo = { table: string; column: string; type: string; nullable: boolean; def: string | null };

async function readSchema(): Promise<ColumnInfo[]> {
  const rows = (await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${BACKUP_TABLES as unknown as string[]})
    ORDER BY table_name, ordinal_position
  `) as Row[];
  return rows.map((r) => {
    const length = r.character_maximum_length ? `(${r.character_maximum_length})` : '';
    return {
      table: String(r.table_name),
      column: String(r.column_name),
      type: `${String(r.data_type)}${length}`,
      nullable: String(r.is_nullable).toUpperCase() === 'YES',
      def: r.column_default === null || r.column_default === undefined ? null : String(r.column_default),
    };
  });
}

function createTableStatement(table: string, columns: ColumnInfo[]): string {
  const lines = columns.map((c) => {
    const parts = [`  ${quoteIdent(c.column)} ${c.type}`];
    if (c.def) parts.push(`DEFAULT ${c.def}`);
    if (!c.nullable) parts.push('NOT NULL');
    return parts.join(' ');
  });
  if (columns.some((c) => c.column === 'id')) lines.push('  PRIMARY KEY ("id")');
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${lines.join(',\n')}\n);\n`;
}

async function* insertStatements(
  table: string,
  columns: string[],
  rows: AsyncIterable<Row>,
  batchSize: number
): AsyncGenerator<string> {
  const columnList = columns.map(quoteIdent).join(', ');
  let batch: string[] = [];
  let total = 0;

  for await (const row of rows) {
    batch.push(`(${columns.map((c) => sqlLiteral(row[c])).join(', ')})`);
    total += 1;
    if (batch.length >= batchSize) {
      yield `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES\n${batch.join(',\n')};\n`;
      batch = [];
    }
  }
  if (batch.length) {
    yield `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES\n${batch.join(',\n')};\n`;
  }
  yield `-- ${table}: ${total} kayıt\n\n`;
}

async function* sqlDumpStream(ctx: BackupContext): AsyncGenerator<string> {
  const schema = await readSchema();
  const columnsOf = (table: string) => schema.filter((c) => c.table === table);
  const includeMembers = ctx.options.members;

  yield `-- =====================================================================\n`;
  yield `-- URUNX STOK TAKİP — TAM SİSTEM YEDEĞİ (SQL geri yükleme dosyası)\n`;
  yield `-- Oluşturma: ${ctx.createdAt.toISOString()}\n`;
  yield `-- Oluşturan : ${ctx.createdBy}\n`;
  yield `--\n`;
  yield `-- DİKKAT: Bu dosya çalıştırıldığında hedef veritabanındaki tabloların\n`;
  yield `-- içeriği SİLİNİR ve yedekteki hale döndürülür. Tek işlem (transaction)\n`;
  yield `-- içinde çalışır; hata olursa hiçbir değişiklik uygulanmaz.\n`;
  yield `--\n`;
  yield `-- Kullanım: psql "postgresql://kullanici:sifre@sunucu/veritabani" -f geri-yukleme.sql\n`;
  yield `-- =====================================================================\n\n`;
  yield `BEGIN;\n\n`;

  yield `-- --- Şema (tablo yoksa oluşturulur) ---------------------------------\n`;
  for (const table of BACKUP_TABLES) {
    if (table === 'members' && !includeMembers) continue;
    const columns = columnsOf(table);
    if (!columns.length) {
      ctx.stats.warnings.push(`${table} tablosu veritabanında bulunamadı, SQL dosyasına eklenmedi.`);
      continue;
    }
    yield createTableStatement(table, columns);
  }
  yield `\n-- --- Mevcut kayıtların temizlenmesi ---------------------------------\n`;
  yield `DELETE FROM "transactions";\n`;
  yield `DELETE FROM "customer_payments";\n`;
  yield `DELETE FROM "items";\n`;
  yield `DELETE FROM "customers";\n`;
  yield `DELETE FROM "company_settings";\n`;
  if (includeMembers) yield `DELETE FROM "members";\n`;
  yield `\n`;

  const tableSources: { table: string; rows: AsyncIterable<Row>; batch: number }[] = [
    { table: 'customers', rows: pagedRows(customersPage, PAGE_ROWS), batch: 100 },
    { table: 'items', rows: pagedRowsByBytes(itemsFullPage, rowWeight), batch: 1 },
    { table: 'transactions', rows: pagedRows(transactionsPage, PAGE_ROWS), batch: 100 },
    { table: 'customer_payments', rows: pagedRows(paymentsPage, PAGE_ROWS), batch: 100 },
    { table: 'company_settings', rows: pagedRows(settingsPage, PAGE_ROWS), batch: 1 },
  ];
  if (includeMembers) {
    tableSources.push({ table: 'members', rows: pagedRows(membersPage, PAGE_ROWS), batch: 50 });
  }

  for (const source of tableSources) {
    const columns = columnsOf(source.table).map((c) => c.column);
    if (!columns.length) continue;
    yield `-- --- ${source.table} --------------------------------------------------\n`;
    yield* insertStatements(source.table, columns, source.rows, source.batch);
  }

  yield `COMMIT;\n`;
}

/* ---- Açıklama dosyaları -------------------------------------------- */

function readmeText(ctx: BackupContext): string {
  const o = ctx.options;
  const lines = [
    'URUNX STOK TAKİP — TAM SİSTEM YEDEĞİ',
    '=====================================',
    '',
    `Oluşturma tarihi : ${trDateTime(ctx.createdAt)}`,
    `Oluşturan üye    : ${ctx.createdBy}`,
    `Şirket           : ${String(ctx.settings?.company_name || '-')}`,
    `Yedek sürümü     : ${BACKUP_FORMAT_VERSION}`,
    '',
    'PAKET İÇERİĞİ',
    '-------------',
    'veri/                  Tüm tabloların JSON kopyası (ürünler, hareketler, cariler,',
    '                       tahsilat/ödemeler, şirket ayarları' + (o.members ? ', üyeler' : '') + ').',
  ];
  if (o.images) {
    lines.push(
      'gorseller/urunler/     Ürün görselleri gerçek resim dosyası olarak (jpg/png/webp...).',
      'gorseller/logo.*       Şirket logosu.',
      '                       veri/urunler.json içindeki "gorsel_dosyasi" alanı hangi ürünün',
      '                       hangi dosyaya karşılık geldiğini gösterir.'
    );
  }
  if (o.csv) {
    lines.push('tablolar/              Excel ile açılabilen CSV tabloları (noktalı virgül ayraçlı).');
  }
  if (o.sql) {
    lines.push(
      'sql/geri-yukleme.sql   Veritabanını tek dosyadan geri yükleyen SQL betiği.',
      '                       Görseller bu dosyanın içine gömülüdür.'
    );
  }
  lines.push(
    'araclar/geri-yukle.js  JSON + görsellerden veritabanını geri yükleyen Node betiği.',
    'yedek-bilgi.json       Paket künyesi: kayıt sayıları, dosya listesi, uyarılar.',
    '',
    'GERİ YÜKLEME',
    '------------'
  );
  if (o.sql) {
    lines.push(
      '1) En kolay yol — SQL dosyası:',
      '   psql "POSTGRES_BAGLANTI_ADRESI" -f sql/geri-yukleme.sql',
      '   (Bu işlem hedef veritabanındaki mevcut kayıtları siler ve yedekteki hale döndürür.)',
      ''
    );
  }
  lines.push(
    `${o.sql ? '2' : '1'}) Node betiği ile (JSON + görsel dosyalarından):`,
    '   - Paketi bir klasöre çıkarın.',
    '   - Urunx proje klasöründe: DATABASE_URL=... node /paket/yolu/araclar/geri-yukle.js /paket/yolu',
    '   - Betik önce mevcut kayıtları siler, sonra yedekteki verileri yazar.',
    '',
    'GÜVENLİK UYARISI',
    '----------------',
    'Bu paket şirketinizin tüm ticari verisini içerir' +
      (o.members ? ' ve üye hesaplarının şifre özetlerini (hash) barındırır.' : '.'),
    'Paketi güvenli bir yerde saklayın, e-posta/WhatsApp gibi kanallarla paylaşmayın.',
    ''
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Paketin tamamı                                                      */
/* ------------------------------------------------------------------ */

export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `urunx-yedek-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

export function createBackupContext(options: BackupOptions, createdBy: string): BackupContext {
  const createdAt = new Date();
  return {
    options,
    root: backupFileName(createdAt),
    createdAt,
    createdBy,
    settings: null,
    stats: { counts: {}, imageFiles: 0, imageBytes: 0, externalImages: 0, files: [], warnings: [] },
  };
}

/** ZIP paketini oluşturan girdi akışı. */
export async function* backupEntries(ctx: BackupContext): AsyncGenerator<ZipEntryInput> {
  ctx.settings = await fetchCompanySettings();
  ctx.stats.counts = await fetchTableCounts();

  const index: ImageIndex = { files: new Map(), externalById: new Map(), external: [] };

  yield buffered(ctx, 'OKUBENI.txt', readmeText(ctx));

  if (ctx.options.images) {
    yield* imageEntries(ctx, index);
    ctx.stats.externalImages = index.external.length;
    if (index.external.length) {
      const lines = ['\ufeff', csvLine(['Ürün Id', 'Stok Kodu', 'Ürün Adı', 'Görsel Bağlantısı'])];
      for (const row of index.external) lines.push(csvLine([row.id, row.stockCode, row.name, row.url]));
      yield buffered(ctx, 'gorseller/harici-gorsel-linkleri.csv', lines.join(''));
    }
  }

  /* ---- veri/ ---- */
  const itemRowsForJson = ctx.options.images
    ? pagedRows(itemsPage, PAGE_ITEMS)
    : pagedRowsByBytes(itemsFullPage, rowWeight);
  yield streamed(
    ctx,
    'veri/urunler.json',
    jsonArrayStream(itemRowsForJson, (row) => {
      const id = String(row.id);
      const file = index.files.get(id);
      if (file) return { ...row, gorsel_dosyasi: file };
      const url = index.externalById.get(id);
      return url ? { ...row, image: url } : row;
    })
  );

  yield streamed(ctx, 'veri/hareketler.json', jsonArrayStream(pagedRows(transactionsPage, PAGE_ROWS)));
  yield streamed(ctx, 'veri/cariler.json', jsonArrayStream(pagedRows(customersPage, PAGE_ROWS)));
  yield streamed(ctx, 'veri/tahsilatlar.json', jsonArrayStream(pagedRows(paymentsPage, PAGE_ROWS)));
  yield streamed(
    ctx,
    'veri/sirket-ayarlari.json',
    jsonArrayStream(pagedRows(settingsPage, PAGE_ROWS), (row) => {
      const logo = typeof row.logo === 'string' ? row.logo : '';
      if (!ctx.options.images || !logo || !logo.startsWith('data:')) return row;
      const parsed = parseDataUrl(logo);
      return parsed ? { ...row, logo: null, gorsel_dosyasi: `gorseller/logo.${parsed.extension}` } : row;
    })
  );

  if (ctx.options.members) {
    yield streamed(ctx, 'veri/uyeler.json', jsonArrayStream(pagedRows(membersPage, PAGE_ROWS)));
  }

  /* ---- tablolar/ (Excel) ---- */
  if (ctx.options.csv) {
    yield streamed(
      ctx,
      'tablolar/urunler.csv',
      csvStream(
        ['Stok Kodu', 'Barkod', 'Ürün Adı', 'Marka', 'Açıklama', 'KDV %', 'Alış Fiyatı', 'Satış Fiyatı', 'Stok', 'Görsel Dosyası', 'Oluşturma', 'Güncelleme'],
        (async function* () {
          for await (const row of pagedRows(itemsPage, PAGE_ITEMS)) {
            yield [
              row.stock_code,
              row.barcode,
              row.name,
              row.brand,
              row.description,
              trNumber(row.vat_rate),
              trNumber(row.buy_price),
              trNumber(row.sell_price),
              Number(row.quantity) || 0,
              index.files.get(String(row.id)) || index.externalById.get(String(row.id)) || '',
              trDateTime(row.created_at),
              trDateTime(row.updated_at),
            ];
          }
        })()
      )
    );

    yield streamed(
      ctx,
      'tablolar/hareketler.csv',
      csvStream(
        ['Tarih', 'İşlem', 'Kayıt Tipi', 'Ürün', 'Stok Kodu', 'Barkod', 'Miktar', 'Kanal', 'Birim Fiyat', 'Toplam Tutar', 'Cari Kodu', 'Cari Adı'],
        (async function* () {
          for await (const row of pagedRows(transactionsDetailPage, PAGE_ROWS)) {
            yield [
              trDateTime(row.date),
              row.type === 'IN' ? 'Giriş' : 'Çıkış',
              row.kind || 'NORMAL',
              row.item_name,
              row.item_stock_code,
              row.item_barcode,
              Number(row.quantity) || 0,
              row.channel,
              trNumber(row.unit_price),
              trNumber(row.total_price),
              row.customer_code,
              row.customer_name,
            ];
          }
        })()
      )
    );

    yield streamed(
      ctx,
      'tablolar/cariler.csv',
      csvStream(
        ['Cari Kodu', 'Cari Adı', 'Kayıt Tarihi'],
        (async function* () {
          for await (const row of pagedRows(customersPage, PAGE_ROWS)) {
            yield [row.customer_code, row.name, trDateTime(row.created_at)];
          }
        })()
      )
    );

    yield streamed(
      ctx,
      'tablolar/tahsilat-odeme.csv',
      csvStream(
        ['Tarih', 'Cari Kodu', 'Cari Adı', 'Yön', 'Tutar', 'Yöntem', 'Açıklama'],
        (async function* () {
          for await (const row of pagedRows(paymentsDetailPage, PAGE_ROWS)) {
            yield [
              trDateTime(row.date),
              row.customer_code,
              row.customer_name,
              row.direction === 'OUT' ? 'Ödeme' : 'Tahsilat',
              trNumber(row.amount),
              row.method,
              row.description,
            ];
          }
        })()
      )
    );
  }

  /* ---- sql/ ---- */
  if (ctx.options.sql) {
    yield streamed(ctx, 'sql/geri-yukleme.sql', sqlDumpStream(ctx));
  }

  /* ---- araclar/ ---- */
  yield buffered(ctx, 'araclar/geri-yukle.js', RESTORE_SCRIPT);

  /* ---- künye (en sonda: tüm sayaçlar artık kesin) ---- */
  const manifest = {
    uygulama: 'Urunx Stok Takip',
    yedekSurumu: BACKUP_FORMAT_VERSION,
    olusturmaTarihi: ctx.createdAt.toISOString(),
    olusturan: ctx.createdBy,
    sirket: {
      companyName: ctx.settings?.company_name ?? '',
      tradeName: ctx.settings?.trade_name ?? '',
      email: ctx.settings?.email ?? '',
      phone: ctx.settings?.phone ?? '',
    },
    secenekler: ctx.options,
    kayitSayilari: ctx.stats.counts,
    gorseller: {
      pakettekiDosya: ctx.stats.imageFiles,
      toplamBayt: ctx.stats.imageBytes,
      hariciBaglanti: ctx.stats.externalImages,
    },
    dosyalar: ctx.stats.files.map((f) => ({ ad: f.name, bayt: f.bytes })),
    toplamHamBayt: ctx.stats.files.reduce((sum, f) => sum + f.bytes, 0),
    uyarilar: ctx.stats.warnings,
  };
  yield {
    name: `${ctx.root}/yedek-bilgi.json`,
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    date: ctx.createdAt,
  };
}
