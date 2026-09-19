'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Images,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import * as dbActions from '@/lib/actions';
import type { BackupOverview } from '@/lib/backup';
import { formatBytes } from '@/lib/utils';
import { DEFAULT_BACKUP_OPTIONS, type BackupOptions, type User } from '@/types';

const LAST_BACKUP_KEY = 'urunx-son-yedek';
/** Bu boyutun üstünde kullanıcıyı paketi küçültmeye yönlendiriyoruz (sunucu süre sınırı). */
const LARGE_PACKAGE_BYTES = 200 * 1024 * 1024;

type LastBackup = { at: string; bytes: number; fileName: string };

/**
 * ZIP içindeki tahmini boyutlar.
 * Metin dosyaları deflate ile ~4 kat küçülür; base64 görseller zaten sıkışık
 * olduğu için ancak %20 civarı kazanç sağlar, ikili kopyaları ise base64'ün
 * 3/4'ü kadar yer kaplar.
 */
const TEXT_COMPRESSION = 0.25;
const BASE64_COMPRESSION = 0.78;
const BASE64_TO_BINARY = 0.75;

function estimateSizes(overview: BackupOverview | null, options: BackupOptions) {
  if (!overview) return { images: 0, data: 0, sql: 0, csv: 0, total: 0 };
  const textBytes = overview.itemsTextBytes + overview.transactionsBytes + overview.othersBytes;
  const base64Bytes = overview.imageBase64Bytes + overview.logoBytes;

  const images = options.images ? base64Bytes * BASE64_TO_BINARY : 0;
  // Görseller ayrı dosya olarak paketlenmiyorsa JSON'un içinde base64 kalır
  const data = textBytes * TEXT_COMPRESSION + (options.images ? 0 : base64Bytes * BASE64_COMPRESSION);
  const sql = options.sql ? textBytes * TEXT_COMPRESSION + base64Bytes * BASE64_COMPRESSION : 0;
  const csv = options.csv ? textBytes * 0.2 : 0;

  return { images, data, sql, csv, total: images + data + sql + csv + 24_000 };
}

function readLastBackup(): LastBackup | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastBackup;
    return parsed?.at ? parsed : null;
  } catch {
    return null;
  }
}

function fileNameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] || fallback;
}

function trDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BackupCard({ user }: { user: User | null }) {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<BackupOptions>({ ...DEFAULT_BACKUP_OPTIONS });
  const [password, setPassword] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [received, setReceived] = useState(0);
  const [lastBackup, setLastBackup] = useState<LastBackup | null>(null);
  const progressAt = useRef(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dbActions.getBackupOverview();
      if (res.success) setOverview(res.overview);
      else toast.error('Yedek özeti alınamadı');
    } catch {
      toast.error('Yedek özeti alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    setLastBackup(readLastBackup());
  }, [loadOverview]);

  const sizes = useMemo(() => estimateSizes(overview, options), [overview, options]);
  const counts = overview?.counts;
  const count = (key: string) => {
    const value = counts?.[key];
    return value === undefined || value < 0 ? '—' : value.toLocaleString('tr-TR');
  };

  const toggle = (key: keyof BackupOptions) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const startDownload = async () => {
    if (!user?.username) {
      toast.error('Üye bilgisi bulunamadı. Çıkış yapıp tekrar giriş yapın.');
      return;
    }
    if (!password) {
      toast.error('Güvenlik için şifrenizi girin');
      return;
    }

    setDownloading(true);
    setReceived(0);
    progressAt.current = 0;
    const toastId = toast.loading('Yedek paketi hazırlanıyor… Bu işlem veri boyutuna göre sürebilir.');

    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password, options }),
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({ error: 'server_error' }));
        const messages: Record<string, string> = {
          invalid_credentials: 'Şifre hatalı',
          forbidden: 'Bu işlem için Ayarlar yetkisi gerekiyor',
          missing_credentials: 'Üye adı veya şifre eksik',
          invalid_body: 'İstek geçersiz',
        };
        toast.error(messages[problem?.error as string] || 'Yedek alınamadı', { id: toastId });
        return;
      }

      const fallbackName = `urunx-yedek-${new Date().toISOString().slice(0, 10)}.zip`;
      const fileName = fileNameFromHeader(res.headers.get('Content-Disposition'), fallbackName);

      const chunks: BlobPart[] = [];
      let total = 0;
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value.slice().buffer as ArrayBuffer);
          total += value.length;
          // Her parçada state güncellemek gereksiz render üretir
          if (Date.now() - progressAt.current > 250) {
            progressAt.current = Date.now();
            setReceived(total);
          }
        }
      } else {
        const blob = await res.blob();
        chunks.push(blob);
        total = blob.size;
      }
      setReceived(total);

      const blob = new Blob(chunks, { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      const record: LastBackup = { at: new Date().toISOString(), bytes: total, fileName };
      try {
        localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(record));
      } catch {
        // localStorage kapalıysa sorun değil
      }
      setLastBackup(record);
      setPassword('');
      toast.success(`Yedek indirildi (${formatBytes(total)})`, { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Yedek indirilemedi. Bağlantınızı kontrol edip tekrar deneyin.', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const stats: { key: string; label: string; value: string }[] = [
    { key: 'items', label: 'Ürün', value: count('items') },
    { key: 'transactions', label: 'Stok hareketi', value: count('transactions') },
    { key: 'customers', label: 'Cari', value: count('customers') },
    { key: 'customer_payments', label: 'Tahsilat / Ödeme', value: count('customer_payments') },
    { key: 'members', label: 'Üye', value: count('members') },
    {
      key: 'images',
      label: 'Ürün görseli',
      value: overview ? overview.embeddedImages.toLocaleString('tr-TR') : '—',
    },
  ];

  const optionRows: {
    key: keyof BackupOptions;
    icon: React.ReactNode;
    title: string;
    description: string;
    size: number;
  }[] = [
    {
      key: 'images',
      icon: <Images className="w-4 h-4 text-sky-400" />,
      title: 'Ürün görselleri ve logo',
      description:
        'Görseller gerçek resim dosyası olarak "gorseller/" klasörüne konur; JSON dosyaları da bu dosyalara bağlanır.',
      size: sizes.images,
    },
    {
      key: 'csv',
      icon: <FileSpreadsheet className="w-4 h-4 text-emerald-400" />,
      title: 'Excel tabloları (CSV)',
      description: 'Ürünler, hareketler, cariler ve tahsilat/ödeme listeleri Excel ile açılabilir biçimde.',
      size: sizes.csv,
    },
    {
      key: 'sql',
      icon: <Database className="w-4 h-4 text-amber-400" />,
      title: 'SQL geri yükleme dosyası',
      description: 'Tek komutla tüm veritabanını geri yükler; görseller bu dosyanın içine gömülür.',
      size: sizes.sql,
    },
    {
      key: 'members',
      icon: <Users className="w-4 h-4 text-violet-400" />,
      title: 'Üye hesapları',
      description: 'Üye adları, yetkileri ve şifre özetleri (hash). Kapatılırsa geri yüklemede üyeler yeniden tanımlanır.',
      size: 0,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-emerald-400" />
            Yedekleme
          </CardTitle>
          <p className="text-sm text-zinc-500">
            Tüm sistem — ürünler, görseller, stok hareketleri, cariler, tahsilatlar ve ayarlar — tek bir ZIP
            paketi olarak bilgisayarınıza iner.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-zinc-700 gap-2 w-fit"
          onClick={() => void loadOverview()}
          disabled={loading || downloading}
          title="Kayıt sayılarını yenile"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Sistem özeti */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {stats.map((stat) => (
            <div key={stat.key} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <div className="text-lg font-semibold text-white tabular-nums">{loading ? '…' : stat.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Paket içeriği */}
        <div>
          <div className="text-sm text-zinc-300 font-medium mb-2">Pakete eklenecekler</div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/70 divide-y divide-zinc-800/80">
            {optionRows.map((row) => (
              <label
                key={row.key}
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-zinc-900/40 transition-colors"
              >
                <input
                  type="checkbox"
                  className="mt-1 rounded border-zinc-600 bg-zinc-950"
                  checked={options[row.key]}
                  onChange={() => toggle(row.key)}
                  disabled={downloading}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-white">
                    {row.icon}
                    {row.title}
                    {row.size > 0 ? (
                      <span className="text-xs text-zinc-500 font-normal">≈ {formatBytes(row.size)}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{row.description}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2 flex items-start gap-1.5">
            <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Her pakette ayrıca: tüm tabloların JSON kopyası (veri/), paket künyesi (yedek-bilgi.json), geri
            yükleme betiği (araclar/geri-yukle.js) ve açıklama dosyası (OKUBENI.txt) bulunur.
          </p>
          {overview && overview.externalImages > 0 ? (
            <p className="text-xs text-amber-400/90 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {overview.externalImages} ürünün görseli internet bağlantısı (URL) olarak kayıtlı. Bu görseller
              indirilemez; bağlantı listesi pakete eklenir.
            </p>
          ) : null}
        </div>

        {/* Tahmini boyut */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <span className="text-sm text-zinc-400">Tahmini paket boyutu</span>
            <span className="text-base font-semibold text-white">
              {loading ? '…' : `≈ ${formatBytes(sizes.total)}`}
            </span>
          </div>
          {sizes.total > LARGE_PACKAGE_BYTES ? (
            <p className="text-xs text-amber-400/90 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Paket büyük. Hazırlanması uzun sürerse “SQL geri yükleme dosyası” seçeneğini kapatıp tekrar
              deneyin; görseller ve JSON verisi yine de pakette kalır.
            </p>
          ) : null}
        </div>

        {/* İndirme */}
        <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Güvenlik doğrulaması
          </div>
          <p className="text-xs text-zinc-500">
            Paket tüm ticari verinizi içerdiği için indirmeden önce
            {user?.username ? ` "${user.username}" ` : ' '}
            hesabınızın şifresini girin.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Giriş şifreniz"
              autoComplete="current-password"
              disabled={downloading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !downloading) void startDownload();
              }}
            />
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 sm:w-64 shrink-0"
              onClick={() => void startDownload()}
              disabled={downloading || loading}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
              {downloading ? 'Yedek hazırlanıyor…' : 'Yedeği İndir (ZIP)'}
            </Button>
          </div>

          {downloading ? (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500" />
              </div>
              <p className="text-xs text-zinc-500">
                İndirilen: {formatBytes(received)} — paket hazırlanırken sayfayı kapatmayın.
              </p>
            </div>
          ) : null}

          {lastBackup && !downloading ? (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Son yedek: {trDateTime(lastBackup.at)} — {formatBytes(lastBackup.bytes)} ({lastBackup.fileName})
            </p>
          ) : null}
        </div>

        <p className="text-xs text-zinc-500">
          Yedek dosyası şirketinizin tüm verisini içerir. Güvenli bir yerde (harici disk, şifreli bulut klasörü)
          saklayın ve paylaşmayın. Geri yükleme adımları paketin içindeki OKUBENI.txt dosyasında anlatılır.
        </p>
      </CardContent>
    </Card>
  );
}
