/**
 * Yedek paketinin içine konan "araclar/geri-yukle.js" betiği.
 *
 * Paketten çıkan JSON dosyalarını ve görselleri okuyup veritabanına geri yazar.
 * Metin olarak tutulur; ZIP'e olduğu gibi eklenir. (Backtick/`${}` kullanmadan
 * yazıldı ki şablon dizesi içinde sorunsuz taşınabilsin.)
 */
export const RESTORE_SCRIPT = String.raw`#!/usr/bin/env node
/**
 * URUNX — Yedek geri yükleme betiği
 * =================================
 *
 * Kullanim:
 *   cd /urunx/proje/klasoru
 *   DATABASE_URL="postgres://kullanici:sifre@sunucu/veritabani" node /yedek/klasoru/araclar/geri-yukle.js /yedek/klasoru
 *
 * Betik yedekteki veri/*.json dosyalarini ve gorseller/ klasorundeki resimleri
 * okuyup veritabanina yazar. Gorsel dosyalari tekrar base64'e cevrilerek
 * "items.image" alanina konur.
 *
 * DIKKAT: Hedef veritabanindaki mevcut kayitlar silinir ve yedekteki hale
 * donulur. Tum islem tek transaction icinde calisir.
 *
 * Gereksinim: "postgres" npm paketi (Urunx projesinde kurulu gelir).
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('HATA: DATABASE_URL tanimli degil.');
  console.error('Ornek: DATABASE_URL="postgres://..." node araclar/geri-yukle.js /yedek/klasoru');
  process.exit(1);
}

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Okunamadi: ' + relativePath, error.message);
    return [];
  }
}

/** Gorsel ayri dosyada ise base64 data-url'e cevirir. */
function imageValue(row) {
  const relative = row.gorsel_dosyasi;
  if (relative) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) {
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'image/jpeg';
      return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
    }
    console.warn('UYARI: gorsel bulunamadi -> ' + relative);
  }
  const value = row.image !== undefined ? row.image : row.logo;
  return value === undefined ? null : value;
}

function orDefault(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

const TABLES = [
  {
    name: 'customers',
    file: 'veri/cariler.json',
    sql: 'INSERT INTO customers (id, customer_code, name, created_at) VALUES ($1, $2, $3, $4)',
    values: (r) => [r.id, orDefault(r.customer_code, null), orDefault(r.name, ''), orDefault(r.created_at, new Date())],
  },
  {
    name: 'items',
    file: 'veri/urunler.json',
    sql:
      'INSERT INTO items (id, barcode, stock_code, name, image, description, brand, vat_rate, buy_price, sell_price, quantity, created_at, updated_at)' +
      ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    values: (r) => [
      r.id,
      orDefault(r.barcode, null),
      orDefault(r.stock_code, null),
      orDefault(r.name, ''),
      imageValue(r),
      orDefault(r.description, null),
      orDefault(r.brand, null),
      orDefault(r.vat_rate, 20),
      orDefault(r.buy_price, 0),
      orDefault(r.sell_price, 0),
      orDefault(r.quantity, 0),
      orDefault(r.created_at, new Date()),
      orDefault(r.updated_at, new Date()),
    ],
  },
  {
    name: 'transactions',
    file: 'veri/hareketler.json',
    sql:
      'INSERT INTO transactions (id, item_id, customer_id, date, type, kind, quantity, channel, unit_price, total_price, created_at)' +
      ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    values: (r) => [
      r.id,
      orDefault(r.item_id, null),
      orDefault(r.customer_id, null),
      orDefault(r.date, new Date()),
      orDefault(r.type, 'IN'),
      orDefault(r.kind, 'NORMAL'),
      orDefault(r.quantity, 0),
      orDefault(r.channel, null),
      orDefault(r.unit_price, 0),
      orDefault(r.total_price, 0),
      orDefault(r.created_at, new Date()),
    ],
  },
  {
    name: 'customer_payments',
    file: 'veri/tahsilatlar.json',
    sql:
      'INSERT INTO customer_payments (id, customer_id, date, amount, direction, method, description, created_at)' +
      ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    values: (r) => [
      r.id,
      orDefault(r.customer_id, null),
      orDefault(r.date, new Date()),
      orDefault(r.amount, 0),
      orDefault(r.direction, 'IN'),
      orDefault(r.method, 'Nakit'),
      orDefault(r.description, null),
      orDefault(r.created_at, new Date()),
    ],
  },
  {
    name: 'company_settings',
    file: 'veri/sirket-ayarlari.json',
    sql:
      'INSERT INTO company_settings (id, company_name, trade_name, address, phone, email, logo, monthly_interest_rate, updated_at)' +
      ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    values: (r) => [
      r.id,
      orDefault(r.company_name, ''),
      orDefault(r.trade_name, ''),
      orDefault(r.address, ''),
      orDefault(r.phone, ''),
      orDefault(r.email, ''),
      imageValue(r),
      orDefault(r.monthly_interest_rate, 0),
      orDefault(r.updated_at, new Date()),
    ],
  },
  {
    name: 'members',
    file: 'veri/uyeler.json',
    sql:
      'INSERT INTO members (id, username, password_hash, first_name, last_name, company_name, menu_routes, sales_perakende, sales_toptan, created_at)' +
      // menu_routes jsonb: metin olarak gonderilip cast edilmezse JSON dizisi degil JSON metni olarak kaydolur
      ' VALUES ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8, $9, $10)',
    values: (r) => [
      r.id,
      r.username,
      r.password_hash,
      orDefault(r.first_name, ''),
      orDefault(r.last_name, ''),
      orDefault(r.company_name, ''),
      JSON.stringify(orDefault(r.menu_routes, [])),
      r.sales_perakende !== false,
      r.sales_toptan !== false,
      orDefault(r.created_at, new Date()),
    ],
  },
];

/** "postgres" paketini once calisilan klasorde, sonra yedek klasorunde arar. */
function loadPostgres() {
  const candidates = [
    'postgres',
    path.join(process.cwd(), 'node_modules', 'postgres'),
    path.join(root, 'node_modules', 'postgres'),
    path.join(__dirname, '..', 'node_modules', 'postgres'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      // sonraki adaya gec
    }
  }
  return null;
}

async function main() {
  const postgres = loadPostgres();
  if (!postgres) {
    console.error('HATA: "postgres" paketi bulunamadi.');
    console.error('Betigi Urunx proje klasorunden calistirin ya da "npm install postgres" komutunu verin.');
    process.exit(1);
  }

  const data = TABLES.map((table) => ({ table, rows: readJson(table.file) }));

  console.log('Yedek klasoru : ' + root);
  for (const entry of data) console.log('  ' + entry.table.name + ': ' + entry.rows.length + ' kayit');

  // 'prefer': sunucu destekliyorsa SSL kullanir (Neon), yerel sunucuda duz baglanir
  const sql = postgres(databaseUrl, { ssl: 'prefer', max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe('DELETE FROM transactions');
      await tx.unsafe('DELETE FROM customer_payments');
      await tx.unsafe('DELETE FROM items');
      await tx.unsafe('DELETE FROM customers');
      await tx.unsafe('DELETE FROM company_settings');
      const members = data.find((entry) => entry.table.name === 'members');
      if (members && members.rows.length) await tx.unsafe('DELETE FROM members');

      for (const entry of data) {
        for (const row of entry.rows) {
          await tx.unsafe(entry.table.sql, entry.table.values(row));
        }
        if (entry.rows.length) console.log(entry.table.name + ' yuklendi (' + entry.rows.length + ')');
      }
    });
    console.log('Geri yukleme tamamlandi.');
  } catch (error) {
    console.error('Geri yukleme BASARISIZ:', error && error.message ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
`;
