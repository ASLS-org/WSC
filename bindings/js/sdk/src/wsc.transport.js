/**
 * WSC Transport Descriptor
 * Describes how a gateway should forward a packet to a downstream protocol.
 *
 * Constants (Protocol, Iface, Addr, Param, Defaults, CompatMatrix) are
 * defined as static members of WscTransport so they live in one namespace
 * and cannot be confused with packet-level constants.
 */

import { BinaryReader, BinaryWriter } from './wsc.utils.js';

export class WscTransport {
  // ─── Transport Protocols ────────────────────────────────────────────────────
  /**
   * Downstream protocol identifiers.
   * @enum {number}
   */
  static Protocol = {
    // Lighting
    DMX512: 0x01,
    ARTNET: 0x02,
    SACN: 0x03,
    KINET: 0x04,
    RDM: 0x05,

    // Audio / MIDI
    MIDI: 0x10,
    MIDI2: 0x11,
    MSC: 0x12, // MIDI Show Control
    MTC: 0x13, // MIDI Time Code
    MMC: 0x14, // MIDI Machine Control
    OSC: 0x15,

    // Video
    NDI: 0x20,
    VISCA: 0x21,

    // Machine / Motion
    MODBUS: 0x30,
    CANOPEN: 0x31,
    ETHERCAT: 0x32,
    PROFINET: 0x33,

    // Broadcast / Tally
    GPI_GPO: 0x40,
    TALLY: 0x41,

    // Generic
    HTTP: 0xF0,
    WEBSOCKET: 0xF1,
    MQTT: 0xF2,
    RAW: 0xFF,
  };

  // ─── Physical Interfaces ────────────────────────────────────────────────────
  /**
   * Physical / link-layer interface types.
   * @enum {number}
   */
  static Iface = {
    UDP: 0x01,
    TCP: 0x02,
    SERIAL: 0x03,
    USB: 0x04,
    WEBSOCKET: 0x05,
    HTTP: 0x06,
  };

  // ─── Address Types ──────────────────────────────────────────────────────────
  /**
   * Address encoding variants for the addrData field.
   * @enum {number}
   */
  static Addr = {
    NONE: 0x00,
    IPV4: 0x01,
    IPV6: 0x02,
    SERIAL: 0x03,
    USB: 0x04,
    HOSTNAME: 0x05,
    URL: 0x06,
  };

  // ─── Optional Transport Parameters ─────────────────────────────────────────
  /**
   * Key codes for the optional params map carried in the transport descriptor.
   * @enum {number}
   */
  static Param = {
    PRIORITY: 0x01,
    TTL: 0x02,
    BAUD_RATE: 0x03,
    SEQUENCE: 0x04,
    IFACE_IDX: 0x05,
  };

  // ─── Protocol Defaults ──────────────────────────────────────────────────────
  /**
   * Sensible defaults for each downstream protocol.
   * Keyed by WscTransport.Protocol value.
   */
  static defaults = {
    [WscTransport.Protocol?.ARTNET]: { port: 6454, multicast: false },
    [WscTransport.Protocol?.SACN]: { port: 5568, multicast: true, multicastBase: '239.255.0.0' },
    [WscTransport.Protocol?.KINET]: { port: 6038 },
    [WscTransport.Protocol?.OSC]: { port: 8000 },
    [WscTransport.Protocol?.HTTP]: { port: 80, portSecure: 443 },
    [WscTransport.Protocol?.WEBSOCKET]: { port: 80, portSecure: 443 },
    [WscTransport.Protocol?.MQTT]: { port: 1883, portSecure: 8883 },
    [WscTransport.Protocol?.MODBUS]: { port: 502, baudRate: 9600 },
    [WscTransport.Protocol?.DMX512]: { baudRate: 250000, dataBits: 8, stopBits: 2 },
    [WscTransport.Protocol?.MIDI]: { baudRate: 31250 },
    [WscTransport.Protocol?.VISCA]: { baudRate: 9600, port: 52381 },
  };

  // ─── Compatibility Matrices ─────────────────────────────────────────────────

  /**
   * Which physical interfaces each protocol may travel over.
   * Keyed by WscTransport.Protocol value → WscTransport.Iface[].
   */
  static ifaceCompat = null; // Initialized after class definition (see bottom of file)

  // ─── Constructor ────────────────────────────────────────────────────────────

  /**
   * @param {number}     protocol
   * @param {number}     iface
   * @param {number}     addrType
   * @param {Uint8Array} addrData
   * @param {Map}        [params]
   */
  constructor(protocol, iface, addrType, addrData, params = new Map()) {
    this.protocol = protocol;
    this.iface = iface;
    this.addrType = addrType;
    this.addrData = addrData instanceof Uint8Array ? addrData : new Uint8Array(addrData);
    this.params = params instanceof Map ? params : new Map(Object.entries(params));
  }

  // ─── Factory Methods ────────────────────────────────────────────────────────

  static udp(protocol, ip, port, params = new Map()) {
    const addr = WscTransport._encodeIPv4(ip, port);
    return new WscTransport(protocol, WscTransport.Iface.UDP, WscTransport.Addr.IPV4, addr, params);
  }

  static tcp(protocol, ip, port, params = new Map()) {
    const addr = WscTransport._encodeIPv4(ip, port);
    return new WscTransport(protocol, WscTransport.Iface.TCP, WscTransport.Addr.IPV4, addr, params);
  }

  static serial(protocol, portIndex, baudRate) {
    const params = new Map();
    if (baudRate !== undefined) {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, baudRate, false);
      params.set(WscTransport.Param.BAUD_RATE, b);
    }
    return new WscTransport(
      protocol,
      WscTransport.Iface.SERIAL,
      WscTransport.Addr.SERIAL,
      new Uint8Array([portIndex & 0xFF]),
      params,
    );
  }

  static usb(protocol, vendorId, productId) {
    const addr = new Uint8Array(4);
    const dv = new DataView(addr.buffer);
    dv.setUint16(0, vendorId, false);
    dv.setUint16(2, productId, false);
    return new WscTransport(protocol, WscTransport.Iface.USB, WscTransport.Addr.USB, addr);
  }

  static http(protocol, url) {
    return new WscTransport(
      protocol,
      WscTransport.Iface.HTTP,
      WscTransport.Addr.URL,
      WscTransport._encodeURL(url),
    );
  }

  static websocket(protocol, url) {
    return new WscTransport(
      protocol,
      WscTransport.Iface.WEBSOCKET,
      WscTransport.Addr.URL,
      WscTransport._encodeURL(url),
    );
  }

  /** RAW transport — no specific address, used for TUNNEL_RAW packets. */
  static raw(params = new Map()) {
    return new WscTransport(
      WscTransport.Protocol.RAW,
      0,
      WscTransport.Addr.NONE,
      new Uint8Array(0),
      params,
    );
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  serialize() {
    const w = new BinaryWriter();
    w.writeUInt8(this.protocol);
    w.writeUInt8(this.iface);
    w.writeUInt8(this.addrType);
    w.writeBytes(this.addrData);
    w.writeUInt8(this.params.size);
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of this.params) {
      w.writeUInt8(key);
      w.writeUInt8(value.length);
      w.writeBytes(value);
    }
    return w.toUint8Array();
  }

  static deserialize(buffer) {
    const r = new BinaryReader(buffer);
    const protocol = r.readUInt8();
    const iface = r.readUInt8();
    const addrType = r.readUInt8();
    const addrData = WscTransport._readAddress(r, addrType);

    const paramCount = r.readUInt8();
    const params = new Map();
    for (let i = 0; i < paramCount; i++) {
      const key = r.readUInt8();
      const len = r.readUInt8();
      params.set(key, r.readBytes(len));
    }
    return new WscTransport(protocol, iface, addrType, addrData, params);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get ipv4() {
    if (this.addrType !== WscTransport.Addr.IPV4) return null;
    const dv = new DataView(this.addrData.buffer, this.addrData.byteOffset);
    return {
      ip: `${this.addrData[0]}.${this.addrData[1]}.${this.addrData[2]}.${this.addrData[3]}`,
      port: dv.getUint16(4, false),
    };
  }

  get ipv6() {
    if (this.addrType !== WscTransport.Addr.IPV6) return null;
    const dv = new DataView(this.addrData.buffer, this.addrData.byteOffset);
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push(dv.getUint16(i * 2, false).toString(16));
    return { ip: parts.join(':'), port: dv.getUint16(16, false) };
  }

  get serial() {
    if (this.addrType !== WscTransport.Addr.SERIAL) return null;
    const baudBytes = this.params.get(WscTransport.Param.BAUD_RATE);
    return {
      port: this.addrData[0],
      baud: baudBytes ? new DataView(baudBytes.buffer).getUint32(0, false) : null,
    };
  }

  get usb() {
    if (this.addrType !== WscTransport.Addr.USB) return null;
    const dv = new DataView(this.addrData.buffer, this.addrData.byteOffset);
    return { vid: dv.getUint16(0, false), pid: dv.getUint16(2, false) };
  }

  get url() {
    if (this.addrType !== WscTransport.Addr.URL) return null;
    const len = this.addrData[0];
    return new TextDecoder().decode(this.addrData.slice(1, 1 + len));
  }

  get hostname() {
    if (this.addrType !== WscTransport.Addr.HOSTNAME) return null;
    const len = this.addrData[0];
    const host = new TextDecoder().decode(this.addrData.slice(1, 1 + len));
    const dv = new DataView(this.addrData.buffer, this.addrData.byteOffset + 1 + len);
    return { host, port: dv.getUint16(0, false) };
  }

  getParam(key) { return this.params.get(key); }

  setParam(key, value) {
    this.params.set(
      key,
      value instanceof Uint8Array
        ? value
        : new Uint8Array([value]),
    );
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  clone() {
    return new WscTransport(
      this.protocol,
      this.iface,
      this.addrType,
      new Uint8Array(this.addrData),
      new Map(this.params),
    );
  }

  toString() {
    const proto = Object.keys(WscTransport.Protocol).find(
      (k) => WscTransport.Protocol[k] === this.protocol,
    ) ?? `0x${this.protocol.toString(16)}`;

    let addr = '';
    if (this.ipv4) addr = `${this.ipv4.ip}:${this.ipv4.port}`;
    else if (this.ipv6) addr = `[${this.ipv6.ip}]:${this.ipv6.port}`;
    else if (this.serial) addr = `Serial(${this.serial.port}, ${this.serial.baud})`;
    else if (this.usb) addr = `USB(${this.usb.vid.toString(16)}:${this.usb.pid.toString(16)})`;
    else if (this.url) addr = this.url;
    else if (this.hostname) addr = `${this.hostname.host}:${this.hostname.port}`;

    return `${proto} → ${addr}`;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────────

  static _encodeIPv4(ip, port) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      throw new Error(`Invalid IPv4: ${ip}`);
    }
    if (port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
    const addr = new Uint8Array(6);
    addr.set(parts, 0);
    new DataView(addr.buffer).setUint16(4, port, false);
    return addr;
  }

  static _encodeURL(url) {
    const urlBytes = new TextEncoder().encode(url);
    const addr = new Uint8Array(1 + urlBytes.length);
    addr[0] = urlBytes.length;
    addr.set(urlBytes, 1);
    return addr;
  }

  static _readAddress(reader, addrType) {
    const { Addr } = WscTransport;
    switch (addrType) {
      case Addr.NONE: return new Uint8Array(0);
      case Addr.IPV4: return reader.readBytes(6);
      case Addr.IPV6: return reader.readBytes(18);
      case Addr.SERIAL: return reader.readBytes(1);
      case Addr.USB: return reader.readBytes(4);
      case Addr.URL:
      case Addr.HOSTNAME: {
        const len = reader.readUInt8();
        const data = reader.readBytes(len);
        const extra = addrType === Addr.HOSTNAME ? 2 : 0;
        const out = new Uint8Array(1 + len + extra);
        out[0] = len;
        out.set(data, 1);
        if (extra) out.set(reader.readBytes(2), 1 + len);
        return out;
      }
      default:
        throw new Error(`Unknown address type: 0x${addrType.toString(16)}`);
    }
  }
}

// ─── Interface Compatibility Matrix ─────────────────────────────────────────
// Defined after class body so static references resolve correctly.

const { Protocol: P, Iface: I } = WscTransport;

WscTransport.ifaceCompat = {
  [P.DMX512]: [I.SERIAL, I.USB],
  [P.ARTNET]: [I.UDP],
  [P.SACN]: [I.UDP],
  [P.KINET]: [I.UDP],
  [P.RDM]: [I.SERIAL, I.USB, I.UDP],
  [P.MIDI]: [I.SERIAL, I.USB, I.UDP],
  [P.MIDI2]: [I.USB, I.UDP],
  [P.MSC]: [I.SERIAL, I.USB, I.UDP],
  [P.MTC]: [I.SERIAL, I.USB, I.UDP],
  [P.MMC]: [I.SERIAL, I.USB],
  [P.OSC]: [I.UDP, I.TCP, I.WEBSOCKET],
  [P.NDI]: [I.UDP, I.TCP],
  [P.VISCA]: [I.SERIAL, I.UDP],
  [P.MODBUS]: [I.SERIAL, I.TCP, I.UDP],
  [P.CANOPEN]: [I.SERIAL, I.USB],
  [P.ETHERCAT]: [I.UDP],
  [P.PROFINET]: [I.UDP],
  [P.GPI_GPO]: [I.SERIAL, I.USB],
  [P.TALLY]: [I.UDP, I.TCP, I.SERIAL],
  [P.HTTP]: [I.HTTP],
  [P.WEBSOCKET]: [I.WEBSOCKET],
  [P.MQTT]: [I.TCP, I.WEBSOCKET],
  [P.RAW]: [I.UDP, I.TCP, I.SERIAL, I.USB, I.WEBSOCKET, I.HTTP],
};
