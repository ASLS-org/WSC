/**
 * WSC Address
 *
 * Defines a compact, hierarchical, software-agnostic address system for
 * WSC cue and parameter targets.
 *
 * An address is a sequence of typed segments:
 *
 *   <domain>.<entity>.<index>.<entity>.<index>...<leaf>
 *
 * Examples (human notation → wire):
 *
 *   lighting.layer.2.intensity
 *   audio.track.3.send.1.level
 *   video.layer.1.clip.4.opacity
 *   motion.axis.2.position
 *   env.zone.1.fog.density
 *
 * On the wire each segment is two bytes:
 *
 *   [u8 token][u8 value_or_zero]
 *
 * Token values < 0x80 are named tokens (domain, entity, leaf).
 * Token 0x80 is INDEX — its companion byte carries the index (0–255).
 * For indices > 255, two consecutive INDEX segments encode a u16 (big-endian).
 *
 * This keeps packets small: a 4-segment path like lighting.layer.2.intensity
 * encodes in 8 bytes, vs "lighting.layer.2.intensity" = 26 bytes as a string.
 *
 * Software-specific routing (Resolume layer → OSC address, Ableton track → API
 * call, etc.) belongs in the WscTransport param map, not here.
 */

import { BinaryReader, BinaryWriter } from './wsc.utils.js';

// ─── Token Definitions ────────────────────────────────────────────────────────

/**
 * All named path tokens.
 * Segments are one byte; INDEX (0x80) uses the following byte as the value.
 *
 * Ranges:
 *   0x00        reserved / NONE
 *   0x01–0x0F   top-level domains
 *   0x10–0x3F   structural entity tokens (shared across domains)
 *   0x40–0x6F   leaf parameter tokens — lighting
 *   0x70–0x7F   leaf parameter tokens — video
 *   0x80        INDEX sentinel (value in next byte)
 *   0x81–0x9F   leaf parameter tokens — audio
 *   0xA0–0xBF   leaf parameter tokens — motion
 *   0xC0–0xCF   leaf parameter tokens — env
 *   0xD0–0xDF   leaf parameter tokens — network / generic
 *   0xFE        CUSTOM — followed by u8-length-prefixed string (escape hatch)
 *   0xFF        RAW
 *
 * @enum {number}
 */
export const WscToken = {
  NONE: 0x00,

  // ── Domains (0x01–0x0F) ────────────────────────────────────────────────────
  LIGHTING: 0x01,
  AUDIO: 0x02,
  VIDEO: 0x03,
  MOTION: 0x04, // motors, kinetics, automation
  ENV: 0x05, // environment — fog, HVAC, pyro, climate
  NETWORK: 0x06, // infrastructure-level targets

  // ── Structural entities (0x10–0x3F) ────────────────────────────────────────
  // Shared across domains; always followed by an INDEX segment or another entity.
  LAYER: 0x10,
  TRACK: 0x11,
  BUS: 0x12,
  SEND: 0x13,
  GROUP: 0x14,
  UNIVERSE: 0x15,
  CHANNEL: 0x16,
  FIXTURE: 0x17,
  CLIP: 0x18,
  CUE: 0x19,
  SCENE: 0x1A,
  DEVICE: 0x1B, // plugin, effect device, hardware unit
  EFFECT: 0x1C,
  AXIS: 0x1D, // motion axis
  ZONE: 0x1E, // environment zone
  PARAM: 0x1F, // generic named parameter slot

  // ── INDEX sentinel ──────────────────────────────────────────────────────────
  INDEX: 0x80, // next byte = index value (u8); two consecutive = u16

  // ── Leaf tokens — LIGHTING (0x40–0x6F) ─────────────────────────────────────
  INTENSITY: 0x40,
  HUE: 0x41,
  SATURATION: 0x42,
  COLOR_TEMP: 0x43,
  RED: 0x44,
  GREEN: 0x45,
  BLUE: 0x46,
  WHITE: 0x47,
  AMBER: 0x48,
  UV: 0x49,
  PAN: 0x4A,
  TILT: 0x4B,
  ZOOM: 0x4C,
  FOCUS: 0x4D,
  IRIS: 0x4E,
  STROBE: 0x4F,
  GOBO: 0x50,
  PRISM: 0x51,
  FROST: 0x52,
  SHUTTER: 0x53,
  DIMMER_CURVE: 0x54,
  FADE: 0x55,

  // ── Leaf tokens — VIDEO (0x70–0x7F) ────────────────────────────────────────
  OPACITY: 0x70,
  BLEND_MODE: 0x71,
  SPEED: 0x72,
  POSITION_X: 0x73,
  POSITION_Y: 0x74,
  SCALE: 0x75,
  ROTATION: 0x76,
  CROP_X: 0x77,
  CROP_Y: 0x78,
  CROP_W: 0x79,
  CROP_H: 0x7A,
  GAMMA: 0x7B,
  CONTRAST: 0x7C,
  BRIGHTNESS: 0x7D,

  // ── Leaf tokens — AUDIO (0x81–0x9F) ────────────────────────────────────────
  LEVEL: 0x81,
  GAIN: 0x82,
  MUTE: 0x83,
  SOLO: 0x84,
  PAN_AUDIO: 0x85, // distinct from PAN (lighting)
  SEND_LEVEL: 0x86,
  FREQ: 0x87,
  BAND_Q: 0x88,
  ATTACK: 0x89,
  RELEASE: 0x8A,
  THRESHOLD: 0x8B,
  RATIO: 0x8C,
  PITCH: 0x8D,
  TEMPO: 0x8E,
  LOOP: 0x8F,

  // ── Leaf tokens — MOTION (0xA0–0xBF) ───────────────────────────────────────
  POSITION: 0xA0,
  VELOCITY: 0xA1,
  ACCELERATION: 0xA2,
  TORQUE: 0xA3,
  HOME: 0xA4,
  LIMIT_MIN: 0xA5,
  LIMIT_MAX: 0xA6,
  ENABLED: 0xA7,

  // ── Leaf tokens — ENV (0xC0–0xCF) ──────────────────────────────────────────
  DENSITY: 0xC0,
  TEMPERATURE: 0xC1,
  PRESSURE: 0xC2,
  HUMIDITY: 0xC3,
  FLOW: 0xC4,

  // ── Leaf tokens — generic / shared (0xD0–0xDF) ─────────────────────────────
  TRIGGER: 0xD0,
  RESET: 0xD1,
  POWER: 0xD2,
  MODE_LEAF: 0xD3, // mode token at leaf position (not structural)
  VALUE: 0xD4, // generic scalar leaf
  /** @proposal Generic cue control proposals */
  START: 0xD5,
  PAUSE: 0xD6,
  RESUME: 0xD7,
  STOP: 0xD8,

  // ── Escape hatches ──────────────────────────────────────────────────────────
  CUSTOM: 0xFE, // followed by [u8 len][...utf-8 string]
  RAW: 0xFF,
};

// Reverse lookup: token value → name (for debugging / toString)
const TOKEN_NAMES = Object.fromEntries(
  Object.entries(WscToken).map(([k, v]) => [v, k]),
);

// ─── WscAddress ───────────────────────────────────────────────────────────────

/**
 * A structured, hierarchical address for a WSC cue or parameter target.
 *
 * Build with WscAddress.parse() from human notation or WscAddress.build()
 * from a segment array; serialize/deserialize for the wire.
 *
 * @example
 * // From human notation
 * const addr = WscAddress.parse('lighting.layer.2.intensity');
 *
 * @example
 * // From segment array
 * const addr = WscAddress.build([
 *   WscToken.AUDIO,
 *   WscToken.TRACK, 3,
 *   WscToken.SEND, 1,
 *   WscToken.SEND_LEVEL,
 * ]);
 *
 * @example
 * // Round-trip
 * const bytes = addr.serialize();
 * const addr2 = WscAddress.deserialize(bytes);
 * console.log(addr2.toString()); // 'audio.track.3.send.1.send_level'
 */
export class WscAddress {
  /**
   * @param {Array<{token: number, index?: number, custom?: string}>} segments
   */
  constructor(segments) {
    this.segments = segments;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  /**
   * Build an address from a flat array of WscToken values and bare numbers.
   *
   * Rules:
   *   - WscToken.* constants    → named segment
   *   - Bare numbers (integers) → INDEX segment (always, even if value matches a token)
   *   - Bare strings            → CUSTOM segment
   *
   * This avoids any ambiguity between small token values (0x01, 0x02…) and
   * index values like 1, 2, 3.  Always pass WscToken.FOO for named segments.
   *
   * @param {Array<number|string>} parts
   * @returns {WscAddress}
   *
   * @example
   * WscAddress.build([WscToken.VIDEO, WscToken.LAYER, 1, WscToken.CLIP, 4, WscToken.OPACITY])
   */
  static build(parts) {
    // Collect the set of known token values for O(1) lookup
    const knownTokens = new Set(Object.values(WscToken));

    const segments = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];

      if (typeof p === 'string') {
        segments.push({ token: WscToken.CUSTOM, custom: p });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (typeof p !== 'number' || !Number.isInteger(p)) {
        throw new Error(`WscAddress.build: invalid part at [${i}]: ${p}`);
      }

      // Decide: is this part being used as a named token or an index?
      //
      // Heuristic: if the previous segment was an entity token (one that
      // typically precedes an index: LAYER, TRACK, CLIP, etc.) OR the value
      // is not in the known-tokens set, treat it as an INDEX.
      //
      // For unambiguous usage, callers should always use WscToken.* for named
      // segments and plain integers for indices. We enforce this by treating
      // any integer that follows an entity-type token as an INDEX.
      const prevToken = segments[segments.length - 1]?.token;
      const prevIsEntity = prevToken !== undefined && WscAddress._isEntityToken(prevToken);
      const valueIsKnownToken = knownTokens.has(p);

      if (prevIsEntity || !valueIsKnownToken) {
        // Treat as index
        segments.push({ token: WscToken.INDEX, index: p });
      } else {
        // Named token
        segments.push({ token: p });
      }
    }
    return new WscAddress(segments);
  }

  /** Entity tokens that are always followed by an index in normal usage. */
  static _isEntityToken(t) {
    const {
      LAYER, TRACK, BUS, SEND, GROUP, UNIVERSE, CHANNEL,
      FIXTURE, CLIP, CUE, SCENE, DEVICE, EFFECT, AXIS, ZONE, PARAM,
    } = WscToken;
    return [LAYER, TRACK, BUS, SEND, GROUP, UNIVERSE, CHANNEL,
      FIXTURE, CLIP, CUE, SCENE, DEVICE, EFFECT, AXIS, ZONE, PARAM].includes(t);
  }

  /**
   * Parse human-readable dot-notation into a WscAddress.
   * Numeric path elements become INDEX segments.
   * Unknown string tokens become CUSTOM segments (escape hatch).
   *
   * @param {string} path  e.g. 'lighting.layer.2.intensity'
   * @returns {WscAddress}
   */
  static parse(path) {
    const parts = path.split('.');
    const segments = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const part of parts) {
      const upper = part.toUpperCase().replace(/-/g, '_');
      const tokenVal = WscToken[upper];

      if (tokenVal !== undefined) {
        segments.push({ token: tokenVal });
      } else if (/^\d+$/.test(part)) {
        segments.push({ token: WscToken.INDEX, index: parseInt(part, 10) });
      } else {
        // Unknown token → CUSTOM (preserves extensibility)
        segments.push({ token: WscToken.CUSTOM, custom: part });
      }
    }

    return new WscAddress(segments);
  }

  // ─── Serialization ─────────────────────────────────────────────────────────

  /**
   * Wire encoding:
   *   Named token:  [u8 token]
   *   Index ≤ 255:  [0x80][u8 index]
   *   Index ≤ 65535:[0x80][hi byte][0x80][lo byte]  (two INDEX segments)
   *   Custom:       [0xFE][u8 len][...utf-8]
   *   Terminated by [0x00]
   *
   * @returns {Uint8Array}
   */
  serialize() {
    const w = new BinaryWriter(this.segments.length * 2 + 1);

    // eslint-disable-next-line no-restricted-syntax
    for (const seg of this.segments) {
      if (seg.token === WscToken.INDEX) {
        const idx = seg.index;
        if (idx <= 0xFF) {
          w.writeUInt8(WscToken.INDEX);
          w.writeUInt8(idx);
        } else {
          // Encode as two INDEX segments (big-endian u16)
          w.writeUInt8(WscToken.INDEX);
          w.writeUInt8((idx >> 8) & 0xFF);
          w.writeUInt8(WscToken.INDEX);
          w.writeUInt8(idx & 0xFF);
        }
      } else if (seg.token === WscToken.CUSTOM) {
        const strBytes = new TextEncoder().encode(seg.custom);
        if (strBytes.length > 255) throw new Error('CUSTOM segment string exceeds 255 bytes');
        w.writeUInt8(WscToken.CUSTOM);
        w.writeUInt8(strBytes.length);
        w.writeBytes(strBytes);
      } else {
        w.writeUInt8(seg.token);
      }
    }

    w.writeUInt8(WscToken.NONE); // terminator
    return w.toUint8Array();
  }

  /**
   * @param {Uint8Array} buffer
   * @returns {WscAddress}
   */
  static deserialize(buffer) {
    const r = new BinaryReader(buffer);
    const segments = [];

    while (!r.eof) {
      const token = r.readUInt8();

      if (token === WscToken.NONE) break; // terminator

      if (token === WscToken.INDEX) {
        const hi = r.readUInt8();
        // Peek: is next byte also an INDEX? → u16
        if (!r.eof && buffer[r.offset] === WscToken.INDEX) {
          r.readUInt8(); // consume the second INDEX sentinel
          const lo = r.readUInt8();
          segments.push({ token: WscToken.INDEX, index: (hi << 8) | lo });
        } else {
          segments.push({ token: WscToken.INDEX, index: hi });
        }
      } else if (token === WscToken.CUSTOM) {
        const len = r.readUInt8();
        const str = r.readString(len);
        segments.push({ token: WscToken.CUSTOM, custom: str });
      } else {
        segments.push({ token });
      }
    }

    return new WscAddress(segments);
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  /** Top-level domain token, e.g. WscToken.LIGHTING */
  get domain() {
    return this.segments[0]?.token ?? WscToken.NONE;
  }

  /** Leaf (last) token */
  get leaf() {
    return this.segments[this.segments.length - 1]?.token ?? WscToken.NONE;
  }

  /** Wire byte length (including terminator) */
  get size() {
    return this.serialize().length;
  }

  /**
   * Return the index value following a given entity token, or null.
   * e.g. addr.indexOf(WscToken.LAYER) → 2
   *
   * @param {number} entityToken
   * @returns {number|null}
   */
  indexOf(entityToken) {
    for (let i = 0; i < this.segments.length - 1; i++) {
      if (this.segments[i].token === entityToken
          && this.segments[i + 1].token === WscToken.INDEX) {
        return this.segments[i + 1].index;
      }
    }
    return null;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Human-readable dot-notation. Reconstructs the canonical string form.
   * @returns {string}
   */
  toString() {
    return this.segments.map((seg) => {
      if (seg.token === WscToken.INDEX) return String(seg.index);
      if (seg.token === WscToken.CUSTOM) return seg.custom;
      return (TOKEN_NAMES[seg.token] ?? `0x${seg.token.toString(16).padStart(2, '0')}`).toLowerCase();
    }).join('.');
  }

  clone() {
    return new WscAddress(this.segments.map((s) => ({ ...s })));
  }
}
