/* eslint-disable max-len */
/**
 * WSC Binary Utilities
 * Low-level binary serialization and host validation helpers.
 */

/* eslint-disable max-classes-per-file */

export const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d{1,2})(\.(25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/;
export const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(::1)|(::))$/;

/**
 * Validate a hostname, IPv4, or IPv6 address string.
 */
export function isValidHost(host) {
  if (!host || host.length > 255) return false;
  const labels = host.split('.');
  const hostnameRegex = /^[a-zA-Z0-9-]{1,63}$/;
  const isHostname = labels.every(
    (label) => hostnameRegex.test(label) && !label.startsWith('-') && !label.endsWith('-'),
  );
  return ipv4Regex.test(host) || ipv6Regex.test(host) || isHostname;
}

export function combineToUInt16(hi, lo) {
  return ((hi & 0xff) << 8) | (lo & 0xff);
}

export function combineToUInt32(b0, b1, b2, b3) {
  return (
    ((b0 & 0xff) << 24)
    | ((b1 & 0xff) << 16)
    | ((b2 & 0xff) << 8)
    | (b3 & 0xff)
  ) >>> 0;
}

export function uint16ToBytes(value) {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

export function float32ToBytes(value, le = false) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, le);
  return new Uint8Array(buffer);
}

export function float64ToBytes(value, le = false) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, le);
  return new Uint8Array(buffer);
}

export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

export function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

// ─── BinaryReader ─────────────────────────────────────────────────────────────

export class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    this.offset = 0;
  }

  get remaining() { return this.buffer.length - this.offset; }

  get eof() { return this.offset >= this.buffer.length; }

  readUInt8() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }

  readUInt16(le = false) { const v = this.view.getUint16(this.offset, le); this.offset += 2; return v; }

  readUInt32(le = false) { const v = this.view.getUint32(this.offset, le); this.offset += 4; return v; }

  readUInt64(le = false) { const v = this.view.getBigUint64(this.offset, le); this.offset += 8; return v; }

  readInt8() { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }

  readInt16(le = false) { const v = this.view.getInt16(this.offset, le); this.offset += 2; return v; }

  readInt32(le = false) { const v = this.view.getInt32(this.offset, le); this.offset += 4; return v; }

  readFloat32(le = false) { const v = this.view.getFloat32(this.offset, le); this.offset += 4; return v; }

  readFloat64(le = false) { const v = this.view.getFloat64(this.offset, le); this.offset += 8; return v; }

  readBytes(length) {
    if (this.offset + length > this.buffer.length) {
      throw new Error(`Cannot read ${length} bytes, only ${this.remaining} remaining`);
    }
    const value = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readString(length, encoding = 'utf-8') {
    return new TextDecoder(encoding).decode(this.readBytes(length));
  }

  readLengthPrefixedString() {
    const len = this.readUInt16();
    return this.readString(len);
  }

  skip(bytes) { this.offset += bytes; }

  seek(offset) { this.offset = offset; }
}

// ─── BinaryWriter ─────────────────────────────────────────────────────────────

export class BinaryWriter {
  constructor(initialSize = 256) {
    this.buffer = new Uint8Array(initialSize);
    this.view = new DataView(this.buffer.buffer);
    this.offset = 0;
  }

  get length() { return this.offset; }

  _grow(additional) {
    const required = this.offset + additional;
    if (required > this.buffer.length) {
      const newBuffer = new Uint8Array(Math.max(required, this.buffer.length * 2));
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  writeUInt8(v) { this._grow(1); this.view.setUint8(this.offset, v); this.offset += 1; }

  writeUInt16(v, le = false) { this._grow(2); this.view.setUint16(this.offset, v, le); this.offset += 2; }

  writeUInt32(v, le = false) { this._grow(4); this.view.setUint32(this.offset, v, le); this.offset += 4; }

  writeUInt64(v, le = false) { this._grow(8); this.view.setBigUint64(this.offset, BigInt(v), le); this.offset += 8; }

  writeInt8(v) { this._grow(1); this.view.setInt8(this.offset, v); this.offset += 1; }

  writeInt16(v, le = false) { this._grow(2); this.view.setInt16(this.offset, v, le); this.offset += 2; }

  writeInt32(v, le = false) { this._grow(4); this.view.setInt32(this.offset, v, le); this.offset += 4; }

  writeFloat32(v, le = false) { this._grow(4); this.view.setFloat32(this.offset, v, le); this.offset += 4; }

  writeFloat64(v, le = false) { this._grow(8); this.view.setFloat64(this.offset, v, le); this.offset += 8; }

  writeBytes(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this._grow(arr.length);
    this.buffer.set(arr, this.offset);
    this.offset += arr.length;
  }

  writeString(str) { this.writeBytes(new TextEncoder().encode(str)); }

  writeLengthPrefixedString(str) {
    const bytes = new TextEncoder().encode(str);
    this.writeUInt16(bytes.length);
    this.writeBytes(bytes);
  }

  toUint8Array() { return this.buffer.slice(0, this.offset); }

  toArrayBuffer() { return this.toUint8Array().buffer; }
}
