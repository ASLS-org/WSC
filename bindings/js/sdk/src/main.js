/**
 * Web Show Control (WSC) Protocol — SDK
 *
 * @module wsc
 * @version 3.0.0
 *
 * Public surface:
 *
 *   WscPacket      — packet construction, serialization, validation, payload codecs
 *   WscTransport   — transport descriptor (protocol, interface, address) + compat matrix
 *   WscFlags       — packet flags
 *   WscError       — typed protocol error
 *   BinaryReader   — low-level binary read helper
 *   BinaryWriter   — low-level binary write helper
 *
 * All domain constants are static members of their owning class:
 *
 *   WscPacket.Type          — message type enum
 *   WscPacket.CueAction     — cue action codes
 *   WscPacket.ValueType     — typed-parameter wire types
 *   WscPacket.StateQuery    — state query/answer sub-types
 *   WscPacket.ErrorCode     — protocol error codes
 *   WscPacket.Status        — response status codes
 *   WscPacket.typeProtocolCompat  — message-type → protocol compat matrix
 *
 *   WscTransport.Protocol   — downstream protocol identifiers
 *   WscTransport.Iface      — physical interface types
 *   WscTransport.Addr       — address encoding variants
 *   WscTransport.Param      — optional transport parameter keys
 *   WscTransport.defaults   — sensible defaults per protocol
 *   WscTransport.ifaceCompat — protocol → interface compat matrix
 *
 *   WscFlags.Bit            — bitmask definitions
 *   WscError.Type           — error type discriminants
 *
 * Quick-start examples:
 *
 *   @example — Fire a cue (string ID, protocol-agnostic)
 *   const pkt = WscPacket.create(WscPacket.Type.CMD_CUE, {
 *     cueId: 'Q10.5',
 *     action: WscPacket.CueAction.START,
 *     fadeMs: 2000,
 *   }, { flags: new WscFlags(false, false, true) }); // ACK requested
 *   const bytes = pkt.serialize();
 *
 *   @example — Set a named parameter
 *   const pkt = WscPacket.create(WscPacket.Type.PARAM_SET, {
 *     paramId: 'motor.lift1.speed',
 *     valueType: WscPacket.ValueType.F32,
 *     value: 0.75,
 *   });
 *
 *   @example — Send DMX channels via Art-Net gateway
 *   const pkt = WscPacket.create(WscPacket.Type.STREAM_CHANNELS, {
 *     universe: 1,
 *     startChannel: 1,
 *     values: new Uint8Array([255, 128, 64, 0]),
 *   }, {
 *     flags: new WscFlags(true, true),   // TR + GW
 *     transport: WscTransport.udp(WscTransport.Protocol.ARTNET, '192.168.1.100', 6454),
 *   });
 *
 *   @example — Validate a packet before sending
 *   const { valid, errors, warnings } = WscPacket.validate(pkt);
 *
 *   @example — Round-trip decode
 *   const decoded = WscPacket.decode(pkt); // → { cueId: 'Q10.5', action: 1, fadeMs: 2000, intensity: 1 }
 */

export * from './wsc.packet.js';
export * from './wsc.transport.js';
export * from './wsc.flags.js';
export * from './wsc.error.js';
export * from './wsc.address.js';
export * from './wsc.utils.js';

// ─── Version ──────────────────────────────────────────────────────────────────

export const WSC_VERSION = '1.0.0';

export const WSC_INFO = {
  version: WSC_VERSION,
  name: 'Web Show Control Protocol',
  description: 'Universal protocol for real-time performance system control',
  homepage: 'https://github.com/asls-org/wsc',
};
