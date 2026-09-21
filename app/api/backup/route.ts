/**
 * Tam sistem yedeği indirme ucu.
 *
 * POST /api/backup  { options?, createdBy? }
 *   → ZIP paketi (akış halinde döner; büyük paketlerde bellek şişmez)
 *
 * Ayarlar ekranındaki yedek tuşu tek tıkla çalışsın diye doğrulama istenmez.
 * Uygulamada sunucu tarafı oturum bulunmadığından bu uca istek atabilen
 * herkes paketi alabilir; erişimi daraltmak gerekirse girişte oturum çerezi
 * üretilip burada kontrol edilmelidir.
 */
import { backupEntries, backupFileName, createBackupContext } from '@/lib/backup';
import { createZipStream } from '@/lib/zip-stream';
import { DEFAULT_BACKUP_OPTIONS, type BackupOptions } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Künyeye ve OKUBENI dosyasına yazılan "oluşturan" bilgisi; metne gömüldüğü için temizlenir. */
function normalizeCreatedBy(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'Bilinmiyor';
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
  // Gövde isteğe bağlı: boş POST da varsayılan seçeneklerle tam yedek üretir.
  let body: { options?: unknown; createdBy?: unknown } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonError('invalid_body', 400);
  }

  const options = normalizeOptions(body.options);
  const context = createBackupContext(options, normalizeCreatedBy(body.createdBy));
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
