/**
 * Bağımlılıksız, akış (stream) tabanlı ZIP paketleyici.
 *
 * Yedek paketi sunucu belleğine sığmayabileceği için arşiv parça parça üretilir:
 * her dosya tek tek sıkıştırılıp yayınlanır, merkezi dizin en sona yazılır.
 * Boyutu önceden bilinmeyen (akıştan gelen) dosyalar için "data descriptor"
 * kullanılır; 4 GB üstü dosya/ofset durumunda ZIP64 alanları eklenir.
 */
import { Readable } from 'node:stream';
import { createDeflateRaw } from 'node:zlib';

const LOCAL_HEADER_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;

const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_UTF8 = 0x0800;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

/** CRC-32 (zip standardı). `previous` ile parça parça hesaplanabilir. */
export function crc32(buffer: Uint8Array, previous = 0): number {
  let crc = ~previous;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return ~crc >>> 0;
}

export type ZipEntryInput = {
  /** Arşiv içindeki yol (klasörler "/" ile). */
  name: string;
  /** Hazır içerik ya da parça parça içerik üreten bir akış. */
  data: Buffer | string | AsyncIterable<Buffer | Uint8Array | string>;
  /** true ise sıkıştırma uygulanmaz (JPEG/PNG gibi zaten sıkışık dosyalar için). */
  store?: boolean;
  date?: Date;
};

type CentralEntry = {
  name: Buffer;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
};

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = date.getFullYear();
  if (year < 1980) return { dosTime: 0, dosDate: 33 }; // 1980-01-01
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function asBuffer(chunk: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  return Buffer.from(chunk);
}

/** Kaynağı akıtırken CRC ve ham boyutu biriktirir. */
async function* meter(
  source: AsyncIterable<Buffer | Uint8Array | string>,
  state: { crc: number; size: number }
): AsyncGenerator<Buffer> {
  for await (const raw of source) {
    const chunk = asBuffer(raw);
    if (chunk.length === 0) continue;
    state.crc = crc32(chunk, state.crc);
    state.size += chunk.length;
    yield chunk;
  }
}

/** Ham deflate (zip method 8) akışı. */
async function* deflateStream(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
  const deflate = createDeflateRaw({ level: 6 });
  const input = Readable.from(source);
  input.on('error', (err) => deflate.destroy(err));
  input.pipe(deflate);
  for await (const chunk of deflate) yield chunk as Buffer;
}

function localFileHeader(entry: CentralEntry, useDataDescriptor: boolean): Buffer {
  const header = Buffer.alloc(30 + entry.name.length);
  header.writeUInt32LE(LOCAL_HEADER_SIG, 0);
  header.writeUInt16LE(20, 4); // gereken sürüm: 2.0
  header.writeUInt16LE(entry.flags, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(useDataDescriptor ? 0 : entry.crc, 14);
  header.writeUInt32LE(useDataDescriptor ? 0 : Math.min(entry.compressedSize, U32_MAX), 18);
  header.writeUInt32LE(useDataDescriptor ? 0 : Math.min(entry.uncompressedSize, U32_MAX), 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  entry.name.copy(header, 30);
  return header;
}

function dataDescriptor(entry: CentralEntry): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(DATA_DESCRIPTOR_SIG, 0);
  buf.writeUInt32LE(entry.crc, 4);
  buf.writeUInt32LE(entry.compressedSize, 8);
  buf.writeUInt32LE(entry.uncompressedSize, 12);
  return buf;
}

function centralFileHeader(entry: CentralEntry): Buffer {
  const needsZip64 =
    entry.compressedSize > U32_MAX || entry.uncompressedSize > U32_MAX || entry.offset > U32_MAX;

  let extra = Buffer.alloc(0);
  if (needsZip64) {
    extra = Buffer.alloc(4 + 24);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(24, 2);
    extra.writeBigUInt64LE(BigInt(entry.uncompressedSize), 4);
    extra.writeBigUInt64LE(BigInt(entry.compressedSize), 12);
    extra.writeBigUInt64LE(BigInt(entry.offset), 20);
  }

  const header = Buffer.alloc(46 + entry.name.length + extra.length);
  header.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
  header.writeUInt16LE(needsZip64 ? 45 : 20, 4); // oluşturan sürüm
  header.writeUInt16LE(needsZip64 ? 45 : 20, 6); // gereken sürüm
  header.writeUInt16LE(entry.flags, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(needsZip64 ? U32_MAX : entry.compressedSize, 20);
  header.writeUInt32LE(needsZip64 ? U32_MAX : entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(0, 32); // yorum uzunluğu
  header.writeUInt16LE(0, 34); // disk no
  header.writeUInt16LE(0, 36); // iç özellikler
  header.writeUInt32LE(0, 38); // dış özellikler
  header.writeUInt32LE(needsZip64 ? U32_MAX : entry.offset, 42);
  entry.name.copy(header, 46);
  if (extra.length) extra.copy(header, 46 + entry.name.length);
  return header;
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const needsZip64 = count > U16_MAX || size > U32_MAX || offset > U32_MAX;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(needsZip64 ? U16_MAX : count, 8);
  eocd.writeUInt16LE(needsZip64 ? U16_MAX : count, 10);
  eocd.writeUInt32LE(needsZip64 ? U32_MAX : size, 12);
  eocd.writeUInt32LE(needsZip64 ? U32_MAX : offset, 16);
  eocd.writeUInt16LE(0, 20);
  if (!needsZip64) return eocd;

  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(ZIP64_EOCD_SIG, 0);
  zip64Eocd.writeBigUInt64LE(BigInt(44), 4); // bu kayıttan sonraki boyut
  zip64Eocd.writeUInt16LE(45, 12);
  zip64Eocd.writeUInt16LE(45, 14);
  zip64Eocd.writeUInt32LE(0, 16);
  zip64Eocd.writeUInt32LE(0, 20);
  zip64Eocd.writeBigUInt64LE(BigInt(count), 24);
  zip64Eocd.writeBigUInt64LE(BigInt(count), 32);
  zip64Eocd.writeBigUInt64LE(BigInt(size), 40);
  zip64Eocd.writeBigUInt64LE(BigInt(offset), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(ZIP64_LOCATOR_SIG, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(offset + size), 8); // ZIP64 EOCD ofseti
  locator.writeUInt32LE(1, 16);

  return Buffer.concat([zip64Eocd, locator, eocd]);
}

/**
 * Verilen dosyaları sırayla ZIP akışına çevirir.
 * Dosyalar tek tek üretildiği için binlerce görsel bellek şişirmeden paketlenebilir.
 */
export async function* createZipStream(
  entries: AsyncIterable<ZipEntryInput> | Iterable<ZipEntryInput>
): AsyncGenerator<Buffer> {
  const central: CentralEntry[] = [];
  let offset = 0;

  for await (const input of entries) {
    const name = Buffer.from(input.name.replace(/\\/g, '/'), 'utf8');
    const method = input.store ? METHOD_STORE : METHOD_DEFLATE;
    const { dosTime, dosDate } = toDosDateTime(input.date || new Date());
    const isBuffered = Buffer.isBuffer(input.data) || typeof input.data === 'string';

    const entry: CentralEntry = {
      name,
      flags: FLAG_UTF8 | (isBuffered ? 0 : FLAG_DATA_DESCRIPTOR),
      method,
      dosTime,
      dosDate,
      crc: 0,
      compressedSize: 0,
      uncompressedSize: 0,
      offset,
    };

    if (isBuffered) {
      // Boyut ve CRC baştan bilindiği için data descriptor'a gerek yok
      // (bazı eski arşiv programları descriptor'lı girdileri sevmiyor).
      const raw = asBuffer(input.data as Buffer | string);
      const parts: Buffer[] = [];
      if (method === METHOD_STORE) {
        parts.push(raw);
      } else {
        for await (const chunk of deflateStream((async function* () { yield raw; })())) parts.push(chunk);
      }
      const payload = Buffer.concat(parts);
      entry.crc = crc32(raw);
      entry.uncompressedSize = raw.length;
      entry.compressedSize = payload.length;

      const header = localFileHeader(entry, false);
      yield header;
      if (payload.length) yield payload;
      offset += header.length + payload.length;
    } else {
      const state = { crc: 0, size: 0 };
      const metered = meter(input.data as AsyncIterable<Buffer | Uint8Array | string>, state);
      const header = localFileHeader(entry, true);
      yield header;
      offset += header.length;

      let compressed = 0;
      const output = method === METHOD_STORE ? metered : deflateStream(metered);
      for await (const chunk of output) {
        if (chunk.length === 0) continue;
        compressed += chunk.length;
        offset += chunk.length;
        yield chunk;
      }

      entry.crc = state.crc;
      entry.uncompressedSize = state.size;
      entry.compressedSize = compressed;
      if (state.size > U32_MAX || compressed > U32_MAX) {
        throw new Error(`ZIP: 4 GB üstü akış desteklenmiyor (${input.name})`);
      }
      const descriptor = dataDescriptor(entry);
      yield descriptor;
      offset += descriptor.length;
    }

    central.push(entry);
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const entry of central) {
    const header = centralFileHeader(entry);
    centralSize += header.length;
    yield header;
  }

  yield endOfCentralDirectory(central.length, centralSize, centralStart);
}
