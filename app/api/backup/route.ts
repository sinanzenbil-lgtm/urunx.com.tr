/**
 * Tam sistem yedeği indirme ucu.
 *
 * POST /api/backup  { username, password, options }
 *   → ZIP paketi (akış halinde döner; büyük paketlerde bellek şişmez)
 *
 * Uygulamada sunucu tarafı oturum yok; bu uç tüm ticari veriyi verdiği için
 * istek gövdesinde üye adı + şifre doğrulaması ister ve yalnızca "ayarlar"
 * yetkisi olan üyelere izin verir.
 */
import { backupEntries, backupFileName, createBackupContext } from '@/lib/backup';
import { sql } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { createZipStream } from '@/lib/zip-stream';
import { DEFAULT_BACKUP_OPTIONS, type BackupOptions } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type MemberRow = {
  id: string;
  username: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  menu_routes: unknown;
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function canOpenSettings(menuRoutes: unknown): boolean {
  let routes: unknown = menuRoutes;
  if (typeof routes === 'string') {
    try {
      routes = JSON.parse(routes);
    } catch {
      routes = [];
    }
  }
  if (!Array.isArray(routes) || routes.length === 0) return true; // eski kayıtlar: tüm menüler
  return routes.includes('ayarlar');
}

function normalizeOptions(raw: unknown): BackupOptions {
  const input = (raw || {}) as Partial<Record<keyof BackupOptions, unknown>>;
  const pick = (key: keyof BackupOptions) =>
    input[key] === undefined ? DEFAULT_BACKUP_OPTIONS[key] : Boolean(input[key]);
  return { images: pick('images'), csv: pick('csv'), sql: pick('sql'), members: pick('members') };
}

/** Akış üreticisini web ReadableStream'e çevirir. */
function toReadableStream(generator: AsyncGenerator<Buffer>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await generator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(value));
      } catch (error) {
        console.error('Yedek akışı hatası:', error);
        controller.error(error);
      }
    },
    async cancel() {
      await generator.return(undefined as never).catch(() => undefined);
    },
  });
}

export async function POST(request: Request) {
  let body: { username?: string; password?: string; options?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_body', 400);
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return jsonError('missing_credentials', 400);

  let member: MemberRow | undefined;
  try {
    const rows = (await sql`
      SELECT id, username, password_hash, first_name, last_name, menu_routes
      FROM members
      WHERE lower(username) = lower(${username})
      LIMIT 1
    `) as MemberRow[];
    member = rows[0];
  } catch (error) {
    console.error('Yedek doğrulama hatası:', error);
    return jsonError('server_error', 500);
  }

  if (!member || !verifyPassword(password, member.password_hash)) {
    // Kaba kuvvet denemelerini biraz yavaşlat
    await new Promise((resolve) => setTimeout(resolve, 600));
    return jsonError('invalid_credentials', 401);
  }
  if (!canOpenSettings(member.menu_routes)) return jsonError('forbidden', 403);

  const options = normalizeOptions(body.options);
  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();
  const context = createBackupContext(options, fullName ? `${fullName} (${member.username})` : member.username);
  const fileName = `${backupFileName(context.createdAt)}.zip`;

  const stream = toReadableStream(createZipStream(backupEntries(context)));

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      // Vercel/Nginx ara belleklemesini kapat: indirme anında akmaya başlasın
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return jsonError('method_not_allowed', 405);
}
