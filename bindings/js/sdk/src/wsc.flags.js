/**
 * WSC Packet Flags
 * Manages the 16-bit flags field in every WSC packet header.
 */

export class WscFlags {
  /**
   * Bitmask definitions — collocated here since only WscFlags uses them.
   * @enum {number}
   */
  static Bit = {
    NONE: 0x0000,
    TR: 0x8000, // Transport descriptor present
    GW: 0x4000, // Gateway forwarding requested
    ACK: 0x2000, // Acknowledgment required
    MC: 0x1000, // Multicast delivery
    TS: 0x0800, // Timestamp prefix attached
  };

  /**
   * @param {boolean} tr  - Transport present
   * @param {boolean} gw  - Gateway forward
   * @param {boolean} ack - Acknowledgment required
   * @param {boolean} mc  - Multicast
   * @param {boolean} ts  - Timestamp prefix
   */
  constructor(tr = false, gw = false, ack = false, mc = false, ts = false) {
    this.tr = !!tr;
    this.gw = !!gw;
    this.ack = !!ack;
    this.mc = !!mc;
    this.ts = !!ts;
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  serialize() {
    const { Bit } = WscFlags;
    return (
      (this.tr ? Bit.TR : 0)
      | (this.gw ? Bit.GW : 0)
      | (this.ack ? Bit.ACK : 0)
      | (this.mc ? Bit.MC : 0)
      | (this.ts ? Bit.TS : 0)
    );
  }

  static deserialize(value) {
    const { Bit } = WscFlags;
    return new WscFlags(
      (value & Bit.TR) !== 0,
      (value & Bit.GW) !== 0,
      (value & Bit.ACK) !== 0,
      (value & Bit.MC) !== 0,
      (value & Bit.TS) !== 0,
    );
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Returns a list of rule violations (empty = valid).
   * @returns {string[]}
   */
  validate() {
    const errors = [];
    if (this.gw && !this.tr) errors.push('GW flag requires TR flag');
    return errors;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  clone() {
    return new WscFlags(this.tr, this.gw, this.ack, this.mc, this.ts);
  }

  toString() {
    const parts = [];
    if (this.tr) parts.push('TR');
    if (this.gw) parts.push('GW');
    if (this.ack) parts.push('ACK');
    if (this.mc) parts.push('MC');
    if (this.ts) parts.push('TS');
    return parts.length > 0 ? parts.join('|') : 'NONE';
  }
}
