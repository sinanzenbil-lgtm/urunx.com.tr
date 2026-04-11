/**
 * Veritabanını geri yüklenebilir .sql dosyası olarak yedekler (pg_dump yoksa alternatif).
 * Kullanım: node scripts/backup-database-sql.js
 * Ortam: .env.production.local içindeki DATABASE_URL (veya .env.local — aşağıdaki sıra).
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const postgres = require('postgres');
require('dotenv').config({ path: path.join(process.cwd(), '.env.production.local') });
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return `'\\\\x${value.toString('hex')}'`;
  if (Array.isArray(value)) {
    const inner = value.map((v) => sqlLiteral(v)).join(', ');
    return `ARRAY[${inner}]`;
  }
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

const TABLE_ORDER = [
  'customers',
  'items',
  'company_settings',
  'members',
  'customer_payments',
  'transactions',
];

const ORDER_BY = {
  customers: 'created_at ASC',
  customer_payments: 'created_at ASC',
  items: 'updated_at DESC',
  transactions: 'date DESC',
  company_settings: 'updated_at DESC',
  members: 'created_at ASC',
};

async function fetchAll(sql, table) {
  const ob = ORDER_BY[table];
  if (!ob) {
    return sql.unsafe(`SELECT * FROM ${table}`);
  }
  return sql.unsafe(`SELECT * FROM ${table} ORDER BY ${ob}`);
}

function buildInsertBatches(table, rows, batchSize = 200) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  const chunks = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const values = slice
      .map((row) => {
        const tuple = cols.map((c) => sqlLiteral(row[c])).join(', ');
        return `(${tuple})`;
      })
      .join(',\n');
    chunks.push(`INSERT INTO "${table}" (${colList}) VALUES\n${values};`);
  }
  return chunks;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL bulunamadı (.env.production.local veya .env.local).');
  }

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 0, connect_timeout: 60 });

  const existing = new Set(
    (
      await sql`
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `
    ).map((r) => r.name)
  );

  const tablesToDump = TABLE_ORDER.filter((t) => existing.has(t));
  if (!tablesToDump.length) {
    throw new Error('Yedeklenecek tablo bulunamadı (public şeması boş).');
  }

  const truncateList = [...tablesToDump].reverse().join(', ');
  const lines = [
    '-- urunx database backup (SQL)',
    `-- created: ${new Date().toISOString()}`,
    'BEGIN;',
    `TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE;`,
  ];

  const counts = {};

  try {
    for (const table of tablesToDump) {
      let rows;
      try {
        rows = await fetchAll(sql, table);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/does not exist|relation.*not found/i.test(msg)) {
          counts[table] = 0;
          continue;
        }
        throw e;
      }
      counts[table] = rows.length;
      const batches = buildInsertBatches(table, rows);
      if (batches.length) {
        lines.push('', `-- ${table} (${rows.length} rows)`);
        for (const stmt of batches) lines.push(stmt);
      }
    }

    lines.push('COMMIT;');

    const backupsDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupsDir, { recursive: true });
    const filename = `urunx_db_backup_${getTimestamp()}.sql`;
    const filepath = path.join(backupsDir, filename);
    await fs.writeFile(filepath, lines.join('\n'), 'utf8');

    console.log(filepath);
    console.log(JSON.stringify({ tableCounts: counts }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
