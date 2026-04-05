const fs = require('node:fs/promises');
const path = require('node:path');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: path.join(process.cwd(), '.env.production.local') });

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function readTable(tableName, query) {
  try {
    const rows = await query();
    return { tableName, rows, error: null };
  } catch (error) {
    return { tableName, rows: [], error: String(error instanceof Error ? error.message : error) };
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL bulunamadi. Once `vercel env pull` calistirin.');
  }

  const sql = neon(databaseUrl);

  const tables = await Promise.all([
    readTable('customers', () => sql`SELECT * FROM customers ORDER BY created_at ASC`),
    readTable('customer_payments', () => sql`SELECT * FROM customer_payments ORDER BY created_at ASC`),
    readTable('items', () => sql`SELECT * FROM items ORDER BY updated_at DESC`),
    readTable('transactions', () => sql`SELECT * FROM transactions ORDER BY date DESC`),
  ]);

  const schemaRows = await sql`
    SELECT
      table_name as "tableName",
      column_name as "columnName",
      data_type as "dataType",
      is_nullable as "isNullable",
      column_default as "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${['customers', 'customer_payments', 'items', 'transactions']})
    ORDER BY table_name, ordinal_position
  `;

  const backupPayload = {
    meta: {
      createdAt: new Date().toISOString(),
      source: 'vercel-production',
      backupType: 'json-snapshot',
      tableCounts: tables.reduce((acc, t) => {
        acc[t.tableName] = t.rows.length;
        return acc;
      }, {}),
      errors: tables.filter((t) => t.error).map((t) => ({ table: t.tableName, error: t.error })),
    },
    schema: schemaRows,
    data: tables.reduce((acc, t) => {
      acc[t.tableName] = t.rows;
      return acc;
    }, {}),
  };

  const backupsDir = path.join(process.cwd(), 'backups');
  await fs.mkdir(backupsDir, { recursive: true });

  const filename = `urunx_prod_backup_${getTimestamp()}.json`;
  const filepath = path.join(backupsDir, filename);
  await fs.writeFile(filepath, JSON.stringify(backupPayload, null, 2), 'utf8');

  console.log(filepath);
  console.log(
    JSON.stringify(
      backupPayload.meta,
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error('Backup failed:', error);
  process.exit(1);
});
