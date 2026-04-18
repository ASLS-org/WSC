/**
 * WSC Packet
 *
 * Central class for the WSC protocol. Carries:
 *  - The binary packet format (header, payload, transport descriptor)
 *  - Message-type constants (WscPacket.Type)
 *  - Value-type constants for typed parameters (WscPacket.ValueType)
 *  - Cue-action constants (WscPacket.CueAction)
 *  - Payload codecs — static encode/decode per message type
 *  - A factory method (WscPacket.create) replacing the old payloads helpers
 *  - Inline validation (WscPacket.validate)
 */

import { BinaryReader, BinaryWriter, bytesEqual } from './wsc.utils.js';
import { WscFlags } from './wsc.flags.js';
import { WscTransport } from './wsc.transport.js';
import { WscError } from './wsc.error.js';
import { WscAddress } from './wsc.address.js';

// ─── Protocol Identity ────────────────────────────────────────────────────────

const MAGIC = new Uint8Array([0x57, 0x53, 0x43, 0x21]); // "WSC!"
const VERSION = new Uint8Array([1, 0, 0]);
const HEADER_SIZE = 19; // bytes
const ID_MIN = 0x00000001;
const ID_MAX = 0xFFFFFFFF;
const EPOCH = new Date('2024-01-01T00:00:00Z');

export class WscPacket {
  // ─── Message Type Enum ─────────────────────────────────────────────────────
  /**
   * All valid message types, grouped by functional range.
   *
   * Streaming  (0x1000–0x1FFF): continuous data feeds.
   * Control    (0x2000–0x2FFF): discrete show-control actions and parameter control.
   * Tunnel     (0xE000–0x4FFF): opaque binary passthrough.
   * State      (0xF000–0xFFFF): protocol housekeeping.
   *
   * @enum {number}
   */
  static Type = {
    // Streaming
    STREAM_CHANNELS: 0x1000, // Bulk channel values (DMX universe, etc.)
    STREAM_TIMECODE: 0x1003, // Linear timecode (SMPTE / MTC)

    // Parameters
    CONTROL_CUE: 0x2000, // Set a named parameter to an exact value
    CONTROL_PARAM: 0x2001, // Set a named parameter to an exact value

    // Tunnel
    TUNNEL_RAW: 0xE000, // Opaque payload, protocol = RAW

    // State / housekeeping
    STATE_QUERY: 0xF000,
    STATE_ANSWER: 0xF001,
    STATE_ERROR: 0xF004,
  };

  // ─── Cue Actions ──────────────────────────────────────────────────────────
  /**
   * Action codes for CMD_CUE payloads.
   * @enum {number}
   */
  static CueAction = {
    LOAD: 0x00,
    START: 0x01,
    STOP: 0x02,
    PAUSE: 0x03,
    RESUME: 0x04,
    RELEASE: 0x05,
  };

  // ─── Parameter Value Types ─────────────────────────────────────────────────
  /**
   * Wire type codes for typed parameter values (PARAM_SET / PARAM_FADE / PARAM_DELTA).
   * @enum {number}
   */
  static ValueType = {
    U8: 0x01,
    U16: 0x02,
    U32: 0x03,
    U64: 0x04,
    I8: 0x05,
    I16: 0x06,
    I32: 0x07,
    I64: 0x08,
    F32: 0x09,
    F64: 0x0A,
    STRING: 0x0B,
    BOOL: 0x0C,
  };

  // ─── State Query Types ──────────────────────────────────────────────────────
  /**
   * Sub-types for STATE_QUERY / STATE_ANSWER payloads.
   * (Formerly WSC_CONFIG_TYPE.)
   * @enum {number}
   */
  static StateQuery = {
    KEEPALIVE: 0x0000,
  };

  // ─── Error Codes ───────────────────────────────────────────────────────────
  /**
   * Numeric error codes used in STATE_ERROR payloads.
   * @enum {number}
   */
  static ErrorCode = {
    PROTOCOL_VERSION: 0x0001,
    INVALID_MESSAGE_TYPE: 0x0002,
    MALFORMED_PACKET: 0x0003,
    INCOMPATIBLE_PROTOCOL: 0x0004,
    INCOMPATIBLE_IFACE: 0x0005,
    MISSING_TRANSPORT: 0x0006,
    MISSING_TRANSPORT_FLAG: 0x0007,
    INVALID_TUNNEL: 0x0008,
    NO_ROUTE: 0x0009,
    VALIDATION_FAILED: 0x000A,
    CONFIG_ERROR: 0x000B,
  };

  // ─── Status Codes ──────────────────────────────────────────────────────────
  /**
   * Response status codes used in STATE_ANSWER payloads.
   * @enum {number}
   */
  static Status = {
    SUCCESS: 0x00,
    PARTIAL: 0x01,
    ERROR: 0x02,
    NOT_FOUND: 0x03,
    NOT_SUPPORTED: 0x04,
    BUSY: 0x05,
  };

  static get protocolVersion() {
    return `v${VERSION[0]}.${VERSION[1]}.${VERSION[2]}.`;
  }

  // ─── Protocol / Message Compatibility Matrix ────────────────────────────────
  /**
   * Which downstream protocols can carry each message type.
   * Keyed by WscPacket.Type → WscTransport.Protocol[].
   */
  static typeProtocolCompat = null; // Initialized after class body.

  // ─── Protocol Constants (re-exported for convenience) ──────────────────────
  static readonly = Object.freeze({
    HEADER_SIZE, MAGIC_STR: 'WSC!', EPOCH, ID_MIN, ID_MAX,
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  /**
   * Low-level constructor. Prefer WscPacket.create() for typed packets.
   *
   * @param {number}       type
   * @param {WscFlags}     flags
   * @param {number}       id        - Packet sequence ID (1 – 0xFFFFFFFF)
   * @param {Uint8Array}   payload
   * @param {WscTransport|null} transport
   */
  constructor(type, flags, id, payload, transport = null) {
    this.type = type;
    this.flags = flags instanceof WscFlags ? flags : new WscFlags();
    this.id = WscPacket._normalizeId(id);
    this.payload = payload instanceof Uint8Array ? payload : new Uint8Array(0);
    this.transport = transport instanceof WscTransport ? transport : null;

    // Flag consistency: TR must match transport presence
    this.flags.tr = this.transport !== null;
    if (!this.flags.tr) this.flags.gw = false;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  /**
   * High-level factory. Encodes a typed payload and returns a ready packet.
   *
   * @param {number}          type       - WscPacket.Type value
   * @param {object}          data       - Message-specific fields (see encode* methods)
   * @param {object}          [opts]
   * @param {number}          [opts.id]
   * @param {WscFlags}        [opts.flags]
   * @param {WscTransport}    [opts.transport]
   * @returns {WscPacket}
   *
   * @example
   * const pkt = WscPacket.create(WscPacket.Type.CMD_CUE, {
   *   cueId: 'Q42', action: WscPacket.CueAction.START, fadeMs: 2000,
   * }, { flags: new WscFlags(false, false, true) }); // ACK requested
   */
  static create(type, data = {}, opts = {}) {
    const payload = WscPacket._encode(type, data);
    return new WscPacket(
      type,
      opts.flags ?? new WscFlags(),
      opts.id ?? 1,
      payload,
      opts.transport ?? null,
    );
  }

  /**
   * Decode the payload of a packet into a plain object.
   * Returns null if no decoder is registered for the type.
   *
   * @param {WscPacket} packet
   * @returns {object|null}
   */
  static decode(packet) {
    return WscPacket._decode(packet.type, packet.payload);
  }

  // ─── Serialization ─────────────────────────────────────────────────────────

  serialize() {
    const transportBytes = this.transport ? this.transport.serialize() : new Uint8Array(0);
    const w = new BinaryWriter(HEADER_SIZE + this.payload.length + transportBytes.length);

    w.writeBytes(MAGIC);
    w.writeBytes(VERSION);
    w.writeUInt16(this.type);
    w.writeUInt16(this.flags.serialize());
    w.writeUInt32(this.id);
    w.writeUInt16(this.payload.length);
    w.writeUInt16(transportBytes.length);
    w.writeBytes(this.payload);
    w.writeBytes(transportBytes);

    return w.toUint8Array();
  }

  static deserialize(buffer) {
    if (buffer.length < HEADER_SIZE) {
      throw new Error(`Packet too short: ${buffer.length} < ${HEADER_SIZE}`);
    }

    const r = new BinaryReader(buffer);
    const magic = r.readBytes(4);
    if (!bytesEqual(magic, MAGIC)) {
      throw new Error(`Invalid magic: expected WSC!, got ${Array.from(magic)}`);
    }

    const ver = r.readBytes(3);
    if (ver[0] !== VERSION[0]) {
      throw new Error(`Incompatible version: ${ver[0]}.${ver[1]}.${ver[2]}, expected ${VERSION[0]}.x.x`);
    }

    const type = r.readUInt16();
    const flagsRaw = r.readUInt16();
    const id = r.readUInt32();
    const payloadLen = r.readUInt16();
    const transportLen = r.readUInt16();

    const knownTypes = Object.values(WscPacket.Type);
    if (!knownTypes.includes(type)) {
      throw new Error(`Unknown message type: 0x${type.toString(16).padStart(4, '0')}`);
    }

    const payload = r.readBytes(payloadLen);
    const transportRaw = transportLen > 0 ? r.readBytes(transportLen) : null;
    return new WscPacket(
      type,
      WscFlags.deserialize(flagsRaw),
      id,
      payload,
      transportRaw ? WscTransport.deserialize(transportRaw) : null,
    );
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate a packet's structural and protocol-level consistency.
   *
   * @param {WscPacket} packet
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  static validate(packet) {
    const errors = [];
    const warnings = [];

    // ── Structural checks ──────────────────────────────────────────────────

    const flagErrors = packet.flags.validate();
    errors.push(...flagErrors);

    if (packet.flags.tr && !packet.transport) {
      throw new WscError(
        WscError.Type.PACKET,
        WscPacket.ErrorCode.MISSING_TRANSPORT,
        'TR flag set but no transport descriptor present',
      );
    }
    if (!packet.flags.tr && packet.transport) {
      throw new WscError(
        WscError.Type.PACKET,
        WscPacket.ErrorCode.MISSING_TRANSPORT_FLAG,
        'Transport descriptor present but TR flag not set',
      );
    }
    if (packet.id < ID_MIN || packet.id > ID_MAX) {
      errors.push(`Packet ID out of range: ${packet.id}`);
    }

    // ── Routing checks (only when gateway forwarding is requested) ─────────

    if (!packet.flags.gw) {
      return { valid: errors.length === 0, errors, warnings };
    }

    if (!packet.transport) {
      errors.push('GW flag set but no transport descriptor — cannot forward');
      return { valid: false, errors, warnings };
    }

    // TUNNEL_RAW must use protocol RAW
    if (packet.type === WscPacket.Type.TUNNEL_RAW) {
      if (packet.transport.protocol !== WscTransport.Protocol.RAW) {
        throw new WscError(
          WscError.Type.PACKET,
          WscPacket.ErrorCode.INCOMPATIBLE_PROTOCOL,
          'TUNNEL_RAW packets must use transport protocol RAW',
        );
      }
      return { valid: errors.length === 0, errors, warnings };
    }

    // Message type → protocol compatibility
    const compatProtocols = WscPacket.typeProtocolCompat[packet.type];
    if (!compatProtocols) {
      throw new WscError(
        WscError.Type.PACKET,
        WscPacket.ErrorCode.INCOMPATIBLE_PROTOCOL,
        `No protocol compatibility defined for type 0x${packet.type.toString(16)}`,
      );
    } else if (!compatProtocols.includes(packet.transport.protocol)) {
      const protoName = WscPacket._protoName(packet.transport.protocol);
      const typeName = WscPacket._typeName(packet.type);
      throw new WscError(
        WscError.Type.PACKET,
        WscPacket.ErrorCode.INCOMPATIBLE_PROTOCOL,
        `Protocol ${protoName} cannot carry message type ${typeName}`,
      );
    }

    // Protocol → interface compatibility
    const compatIfaces = WscTransport.ifaceCompat[packet.transport.protocol];
    if (compatIfaces && !compatIfaces.includes(packet.transport.iface)) {
      const protoName = WscPacket._protoName(packet.transport.protocol);
      const ifaceName = Object.keys(WscTransport.Iface).find(
        (k) => WscTransport.Iface[k] === packet.transport.iface,
      ) ?? `0x${packet.transport.iface.toString(16)}`;
      throw new WscError(
        WscError.Type.PACKET,
        WscPacket.ErrorCode.INCOMPATIBLE_IFACE,
        `Protocol ${protoName} cannot use interface ${ifaceName}`,
      );
    }

    // ── Advisory warnings ──────────────────────────────────────────────────

    const p = packet.transport.protocol;
    const { Protocol: P } = WscTransport;

    // HTTP / Modbus benefit from ACK
    if ([P.HTTP, P.MODBUS].includes(p) && !packet.flags.ack) {
      warnings.push(`Protocol ${WscPacket._protoName(p)} works best with ACK flag set`);
    }

    // Streaming over UDP should not request ACK
    const isStream = packet.type >= 0x1000 && packet.type < 0x2000;
    const isUdpProto = [P.ARTNET, P.SACN, P.OSC].includes(p);
    if (isStream && isUdpProto && packet.flags.ack) {
      warnings.push('ACK on streaming packets over UDP may cause throughput issues');
    }

    // Multicast only makes sense on protocols that support it
    if (packet.flags.mc && ![P.ARTNET, P.SACN].includes(p)) {
      warnings.push(`Protocol ${WscPacket._protoName(p)} may not support multicast`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ─── Packet Utilities ──────────────────────────────────────────────────────

  get size() {
    const tSize = this.transport ? this.transport.serialize().length : 0;
    return HEADER_SIZE + this.payload.length + tSize;
  }

  clone() {
    return new WscPacket(
      this.type,
      this.flags.clone(),
      this.id,
      new Uint8Array(this.payload),
      this.transport ? this.transport.clone() : null,
    );
  }

  typeName() { return WscPacket._typeName(this.type); }

  toString() {
    return `WscPacket(${this.typeName()}, id=${this.id}, flags=${this.flags}, size=${this.size}B)`;
  }

  // ─── Payload Codecs ────────────────────────────────────────────────────────
  // Each message type gets a dedicated encode/decode pair.
  // `_encode` dispatches on type to build the binary payload.
  // `_decode` dispatches on type to reconstruct the plain object.
  //
  // Naming convention:  _enc<TypeName> / _dec<TypeName>

  static _encode(type, data) {
    const { Type } = WscPacket;
    switch (type) {
      case Type.STREAM_CHANNELS: return WscPacket._encChannels(data);
      case Type.STREAM_TIMECODE: return WscPacket._encTimecode(data);
      case Type.CONTROL_CUE: return WscPacket._encControlCue(data);
      case Type.CONTROL_PARAM: return WscPacket._encControlParam(data);
      case Type.STATE_QUERY: return WscPacket._encStateQuery(data);
      case Type.STATE_ANSWER: return WscPacket._encStateAnswer(data);
      case Type.STATE_ERROR: return WscPacket._encStateError(data);
      case Type.TUNNEL_RAW:
        return data.raw instanceof Uint8Array ? data.raw : new TextEncoder().encode(String(data.raw ?? ''));
      default:
        return new Uint8Array(0);
    }
  }

  static _decode(type, payload) {
    const { Type } = WscPacket;
    try {
      switch (type) {
        case Type.STREAM_CHANNELS: return WscPacket._decChannels(payload);
        case Type.CONTROL_CUE: return WscPacket._decControlCue(payload);
        case Type.CONTROL_PARAM: return WscPacket._decControlParam(payload);
        case Type.STATE_QUERY: return WscPacket._decStateQuery(payload);
        case Type.STATE_ANSWER: return WscPacket._decStateAnswer(payload);
        case Type.STATE_ERROR: return WscPacket._decStateError(payload);
        case Type.TUNNEL_RAW: return { raw: payload };
        default: return null;
      }
    } catch {
      return null;
    }
  }

  // ── STREAM_CHANNELS ─────────────────────────────────────────────────────────
  // Bulk channel values, e.g. a DMX universe slice.
  // { universe: number, startChannel: number, values: Uint8Array }

  static _encChannels({ universe, startChannel = 1, values }) {
    const w = new BinaryWriter();
    w.writeUInt16(universe);
    w.writeUInt16(startChannel);
    w.writeUInt16(values.length);
    w.writeBytes(values);
    return w.toUint8Array();
  }

  static _decChannels(payload) {
    const r = new BinaryReader(payload);
    return {
      universe: r.readUInt16(),
      startChannel: r.readUInt16(),
      count: r.readUInt16(),
      values: r.readBytes(r.remaining),
    };
  }

  // ── STREAM_TIMECODE ─────────────────────────────────────────────────────────
  // { hours: number, minutes: number, seconds: number, frames: number, rate?: number }

  static _encTimecode({
    hours, minutes, seconds, frames, rate = 30,
  }) {
    const w = new BinaryWriter();
    w.writeUInt8(hours);
    w.writeUInt8(minutes);
    w.writeUInt8(seconds);
    w.writeUInt8(frames);
    w.writeUInt8(rate);
    return w.toUint8Array();
  }

  static _decTimecode(payload) {
    const r = new BinaryReader(payload);
    return {
      hours: r.readUInt8(),
      minutes: r.readUInt8(),
      seconds: r.readUInt8(),
      frames: r.readUInt8(),
      rate: r.readUInt8(),
    };
  }

  // ── CONTROL_CUE ───────────────────────────────────────────────────────────────
  // Control a cue state
  //
  // { address: WscAddress|string, action: CueAction }

  static _encControlCue({
    address, action,
  }) {
    const addr = WscPacket._resolveAddress(address);
    const addrBytes = addr.serialize();
    const w = new BinaryWriter();
    w.writeUInt16(addrBytes.length);
    w.writeBytes(addrBytes);
    w.writeUInt8(action);
    return w.toUint8Array();
  }

  static _decControlCue(payload) {
    const r = new BinaryReader(payload);
    const addrLen = r.readUInt16();
    const address = WscAddress.deserialize(r.readBytes(addrLen));
    return {
      address,
      action: r.readUInt8(),
    };
  }

  // ── CONTROL_PARAM ───────────────────────────────────────────────────────────────
  // Set a parameter to an exact value.
  //
  // { address: WscAddress|string, valueType: ValueType, value: number|string|boolean }

  static _encControlParam({ address, valueType, value }) {
    const addr = WscPacket._resolveAddress(address);
    const addrBytes = addr.serialize();
    const w = new BinaryWriter();
    w.writeUInt16(addrBytes.length);
    w.writeBytes(addrBytes);
    w.writeUInt8(valueType);
    WscPacket._writeTypedValue(w, valueType, value);
    return w.toUint8Array();
  }

  static _decControlParam(payload) {
    const r = new BinaryReader(payload);
    const addrLen = r.readUInt16();
    const address = WscAddress.deserialize(r.readBytes(addrLen));
    const valueType = r.readUInt8();
    const value = WscPacket._readTypedValue(r, valueType);
    return { address, valueType, value };
  }

  // ── STATE_QUERY ─────────────────────────────────────────────────────────────
  // { queryType: StateQuery, targetId?: string }

  static _encStateQuery({ queryType, targetId = '' }) {
    const w = new BinaryWriter();
    w.writeUInt8(queryType);
    w.writeLengthPrefixedString(String(targetId));
    return w.toUint8Array();
  }

  static _decStateQuery(payload) {
    const r = new BinaryReader(payload);
    return { queryType: r.readUInt8(), targetId: r.readLengthPrefixedString() };
  }

  // ── STATE_ANSWER ────────────────────────────────────────────────────────────
  // { queryId: number, status: Status, data: object|Uint8Array }

  static _encStateAnswer({ queryId, status, data }) {
    const w = new BinaryWriter();
    w.writeUInt32(queryId);
    w.writeUInt8(status);

    const isJson = !(data instanceof Uint8Array);
    const dataBytes = isJson
      ? new TextEncoder().encode(JSON.stringify(data))
      : data;

    w.writeUInt8(isJson ? 0x01 : 0x00); // format: 0 = raw, 1 = JSON
    w.writeUInt16(dataBytes.length);
    w.writeBytes(dataBytes);
    return w.toUint8Array();
  }

  static _decStateAnswer(payload) {
    const r = new BinaryReader(payload);
    const queryId = r.readUInt32();
    const status = r.readUInt8();
    const format = r.readUInt8();
    const len = r.readUInt16();
    const bytes = r.readBytes(len);
    const data = format === 0x01 ? JSON.parse(new TextDecoder().decode(bytes)) : bytes;
    return { queryId, status, data };
  }

  // ── STATE_ERROR ─────────────────────────────────────────────────────────────
  // { errorCode: ErrorCode, message: string, context?: object }

  static _encStateError({ errorCode, message, context = {} }) {
    const w = new BinaryWriter();
    w.writeUInt16(errorCode);
    w.writeLengthPrefixedString(String(message));
    const ctxBytes = new TextEncoder().encode(JSON.stringify(context));
    w.writeUInt16(ctxBytes.length);
    w.writeBytes(ctxBytes);
    return w.toUint8Array();
  }

  static _decStateError(payload) {
    const r = new BinaryReader(payload);
    const errorCode = r.readUInt16();
    const message = r.readLengthPrefixedString();
    const ctxLen = r.readUInt16();
    const context = ctxLen > 0
      ? JSON.parse(new TextDecoder().decode(r.readBytes(ctxLen)))
      : {};
    return { errorCode, message, context };
  }

  // ── Address helper ────────────────────────────────────────────────────────
  // Accepts a WscAddress instance or a dot-notation string.

  static _resolveAddress(address) {
    if (address instanceof WscAddress) return address;
    if (typeof address === 'string') return WscAddress.parse(address);
    throw new Error(`Invalid address: expected WscAddress or string, got ${typeof address}`);
  }

  // ── Typed value read/write (shared by PARAM_SET) ──────────────────────────

  static _writeTypedValue(w, type, value) {
    const V = WscPacket.ValueType;
    switch (type) {
      case V.U8: w.writeUInt8(value); break;
      case V.U16: w.writeUInt16(value); break;
      case V.U32: w.writeUInt32(value); break;
      case V.U64: w.writeUInt64(value); break;
      case V.I8: w.writeInt8(value); break;
      case V.I16: w.writeInt16(value); break;
      case V.I32: w.writeInt32(value); break;
      case V.F32: w.writeFloat32(value); break;
      case V.F64: w.writeFloat64(value); break;
      case V.BOOL: w.writeUInt8(value ? 1 : 0); break;
      case V.STRING: w.writeLengthPrefixedString(String(value)); break;
      default: throw new Error(`Unsupported value type: 0x${type.toString(16)}`);
    }
  }

  static _readTypedValue(r, type) {
    const V = WscPacket.ValueType;
    switch (type) {
      case V.U8: return r.readUInt8();
      case V.U16: return r.readUInt16();
      case V.U32: return r.readUInt32();
      case V.U64: return r.readUInt64();
      case V.I8: return r.readInt8();
      case V.I16: return r.readInt16();
      case V.I32: return r.readInt32();
      case V.F32: return r.readFloat32();
      case V.F64: return r.readFloat64();
      case V.BOOL: return r.readUInt8() !== 0;
      case V.STRING: return r.readLengthPrefixedString();
      default: throw new Error(`Unsupported value type: 0x${type.toString(16)}`);
    }
  }

  // ── Name helpers (for error messages) ────────────────────────────────────

  static _typeName(type) {
    return Object.keys(WscPacket.Type).find((k) => WscPacket.Type[k] === type)
      ?? `0x${type.toString(16).padStart(4, '0')}`;
  }

  static _protoName(protocol) {
    return Object.keys(WscTransport.Protocol).find((k) => WscTransport.Protocol[k] === protocol)
      ?? `0x${protocol.toString(16)}`;
  }

  static _normalizeId(id) {
    return (((id - 1) >>> 0) % ID_MAX) + 1;
  }
}

// ─── Message-Type → Protocol Compatibility Matrix ─────────────────────────────
// Defined after the class body so both WscPacket.Type and WscTransport.Protocol
// are fully initialized before being referenced.

const { Type: T } = WscPacket;
const { Protocol: P } = WscTransport;

WscPacket.typeProtocolCompat = {
  // Streaming
  [T.STREAM_CHANNELS]: [P.DMX512, P.ARTNET, P.SACN, P.KINET, P.MODBUS, P.OSC, P.RAW],
  [T.STREAM_TIMECODE]: [P.MTC, P.OSC, P.MIDI, P.ARTNET, P.RAW],

  // Conrol
  [T.CONTROL_CUE]: [P.MSC,
    P.OSC,
    P.MIDI,
    P.HTTP,
    P.WEBSOCKET,
    P.GPI_GPO,
    P.RAW,
  ],

  [T.CONTROL_PARAM]: [
    P.OSC,
    P.MIDI,
    P.MIDI2,
    P.MODBUS,
    P.HTTP,
    P.WEBSOCKET,
    P.CANOPEN,
    P.PROFINET,
    P.ETHERCAT,
    P.RAW,
  ],

  // Tunnel
  [T.TUNNEL_RAW]: [P.RAW],

  // State — all protocols
  ...((() => {
    const all = Object.values(P);
    return {
      [T.STATE_QUERY]: all,
      [T.STATE_ANSWER]: all,
      [T.STATE_ERROR]: all,
    };
  })()),
};
