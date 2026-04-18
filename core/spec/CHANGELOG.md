# CHANGELOG

All notable changes to the WSC protocol specification are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Protocol versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.1.0] — 2026-04

### Changed

**Message types — renamed and renumbered**

- `CMD_CUE` (`0x2000`) renamed to `CONTROL_CUE` (`0x2000`). Behaviour unchanged; payload simplified — `fade_ms` and `intensity` fields removed. Implementations requiring fade or level control SHOULD use `CONTROL_PARAM`.
- `PARAM_SET` (`0x3000`) renamed to `CONTROL_PARAM` and moved to `0x2001`. Now shares the Control range with `CONTROL_CUE`.
- `TUNNEL_RAW` moved from `0x4000` to `0xE000`.

**Message type ranges revised**

| Range | Category |
|---|---|
| `0x1000 – 0x1FFF` | Streaming (unchanged) |
| `0x2000 – 0x2FFF` | Control — replaces separate Command and Parameter ranges |
| `0x3000 – 0xDFFF` | Reserved (was split between Parameters `0x3000–` and Tunnel `0x4000–`) |
| `0xE000 – 0xEFFF` | Tunnel |
| `0xF000 – 0xFFFF` | State (unchanged) |

### Removed

- `STATE_NOTIFY` (`0xF003`) — removed from the normative type set. Implementations that previously used it SHOULD migrate to `STATE_ANSWER` with `query_id = 0`.
- `STATE_HEARTBEAT` (`0xF005`) — removed. Liveness is maintained via `STATE_QUERY(KEEPALIVE)`.

---

## [1.0.0] — 2025-04

Initial stable protocol specification.

### Added

**Wire format**
- 19-byte fixed header: `WSC!` magic (4 B), version (3 B), type (2 B), flags (2 B), id (4 B), payload_len (2 B), transport_len (2 B)
- Flags field: `TR` (bit 15), `GW` (bit 14), `ACK` (bit 13), `MC` (bit 12), `TS` (bit 11); bits 10–0 reserved

**Message types**
- `STREAM_CHANNELS` (0x1000)
- `STREAM_TIMECODE` (0x1003)
- `CMD_CUE` (0x2000) with action codes: `LOAD`, `START`, `STOP`, `PAUSE`, `RESUME`, `RELEASE`
- `PARAM_SET` (0x3000) with value types: `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64`, `F32`, `F64`, `STRING`, `BOOL`
- `TUNNEL_RAW` (0x4000)
- `STATE_QUERY` (0xF000) with sub-type: `KEEPALIVE` (0x0000)
- `STATE_ANSWER` (0xF001) with status codes: `SUCCESS`, `PARTIAL`, `ERROR`, `NOT_FOUND`, `NOT_SUPPORTED`, `BUSY`
- `STATE_NOTIFY` (0xF003)
- `STATE_ERROR` (0xF004) with error codes: `PROTOCOL_VERSION` through `CONFIG_ERROR`
- `STATE_HEARTBEAT` (0xF005)

**Address system**
- Hierarchical token encoding with self-terminating wire format
- 6 domain tokens: `LIGHTING`, `AUDIO`, `VIDEO`, `MOTION`, `ENV`, `NETWORK`
- 16 structural entity tokens: `LAYER`, `TRACK`, `BUS`, `SEND`, `GROUP`, `UNIVERSE`, `CHANNEL`, `FIXTURE`, `CLIP`, `CUE`, `SCENE`, `DEVICE`, `EFFECT`, `AXIS`, `ZONE`, `PARAM`
- 60+ domain-specific leaf tokens across lighting, video, audio, motion, environment, and generic ranges
- `INDEX` sentinel (0x80), `CUSTOM` escape hatch (0xFE), `RAW` marker (0xFF)

**Transport Descriptor**
- 23 downstream protocol codes across lighting, audio/MIDI, video, machine control, and generic categories
- 6 interface type codes: `UDP`, `TCP`, `SERIAL`, `USB`, `WEBSOCKET`, `HTTP`
- 7 address encoding variants: `NONE`, `IPV4`, `IPV6`, `SERIAL`, `USB`, `HOSTNAME`, `URL`
- 5 optional parameter keys: `PRIORITY`, `TTL`, `BAUD_RATE`, `SEQUENCE`, `IFACE_IDX`
- Protocol–interface compatibility matrix
- Message-type–protocol compatibility matrix

**Session**
- Connection state machine: `IDLE → CONNECTING → CONNECTED → IDLE / ERROR`
- Reference transport: WebRTC DataChannel over WebSocket signaling
- Signaling message schema: offer / answer / ice
- Packet ID sequencing: u32, range [1, 0xFFFFFFFF], wrapping
- Keepalive: `STATE_QUERY(KEEPALIVE)` round-trip

**Error handling**
- 4 error classes: `SIGNALING`, `TRANSPORT`, `PACKET`, `GATEWAY`
- 11 protocol error codes
- Receiver obligation table

---

*For future entries, note the protocol version separately from any binding version when they differ.*
