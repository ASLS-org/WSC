# 04 — Message Types

[← Address System](03-address-system.md) · [Next: Transport Descriptor →](05-transport-descriptor.md)

---

## Type Ranges

| Range | Category | Purpose |
|---|---|---|
| `0x1000 – 0x1FFF` | **Streaming** | Continuous high-frequency data feeds |
| `0x2000 – 0x2FFF` | **Control** | Cue execution, parameter writes, and discrete show-control actions |
| `0x3000 – 0xDFFF` | *(reserved)* | Future categories |
| `0xE000 – 0xEFFF` | **Tunnel** | Opaque binary passthrough |
| `0xF000 – 0xFFFF` | **State** | Protocol housekeeping |

---

## Summary

| Type | Code | Key payload fields | Typical flags |
|---|---|---|---|
| `STREAM_CHANNELS` | `0x1000` | universe, start_channel, count, values[] | TR + GW |
| `STREAM_TIMECODE` | `0x1003` | hours, minutes, seconds, frames, rate | — or TR + GW |
| `CONTROL_CUE` | `0x2000` | address, action | — or TR + GW |
| `CONTROL_PARAM` | `0x2001` | address, value_type, value | — or TR + GW |
| `TUNNEL_RAW` | `0xE000` | raw bytes | TR + GW (protocol = RAW) |
| `STATE_QUERY` | `0xF000` | query_type, target_id | — |
| `STATE_ANSWER` | `0xF001` | query_id, status, format, data | — |
| `STATE_ERROR` | `0xF004` | error_code, message, context | — |

---

## Streaming

### STREAM_CHANNELS — `0x1000`

Bulk channel values for a contiguous slice of a universe. Primary message type for DMX512, sACN, Art-Net, and any indexed channel array.

**Flags:** `TR = 1, GW = 1` required when forwarding to a downstream protocol.  
**ACK:** SHOULD NOT be set on high-frequency streams — acknowledgment degrades throughput.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 2 B | `universe` | Universe / port index, 0-based |
| 2 | 2 B | `start_channel` | First channel in `values`, 1-based (per DMX convention) |
| 4 | 2 B | `count` | Number of values; MUST equal `len(values)` |
| 6 | N B | `values` | One byte per channel, range 0–255 |

#### Constraints

- `count` MUST equal the actual byte length of `values`.
- When targeting DMX-family downstream protocols, `count` SHOULD NOT exceed 512.
- For Art-Net: `universe` = Art-Net universe number; `start_channel` = 1 for a full frame.
- For sACN: `universe` = E1.31 universe (1-based).

---

### STREAM_TIMECODE — `0x1003`

Linear timecode for SMPTE / MTC synchronisation.

**Flags:** No TD required for internal routing; `TR = 1, GW = 1` when forwarding to MTC or Art-Net timecode.  
**Frequency:** One packet per frame for sample-accurate sync.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 1 B | `hours` | 0–23 |
| 1 | 1 B | `minutes` | 0–59 |
| 2 | 1 B | `seconds` | 0–59 |
| 3 | 1 B | `frames` | 0 – (rate − 1) |
| 4 | 1 B | `rate` | Nominal frame rate — standard values: `24`, `25`, `30`, `60` |

#### Constraints

- Receivers MUST NOT extrapolate timecode between packets. On packet loss, freeze on the last received value.
- Drop-frame timecode is not encoded in this version.

---

## Control

The Control range (`0x2000 – 0x2FFF`) carries all discrete show-control actions and typed parameter writes. Both types share this range because they target named WSC Addresses and route through the same gateway path.

### CONTROL_CUE — `0x2000`

Trigger a lifecycle action on a cue, scene, transport, or any discrete target identified by a WSC Address. This is the **universal command primitive** for cue execution, scene recall, transport control, and sync pulses.

**Flags:** No TD required for internal routing; `TR = 1, GW = 1` for downstream forwarding.  
**ACK:** SHOULD be set for safety-critical or irreversible actions.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 2 B | `addr_len` | Byte length of the serialized address |
| 2 | N B | `address` | WSC Address — see [Address System](03-address-system.md) |
| 2+N | 1 B | `action` | Action code — see table below |

#### Action Codes

| Code | Name | Description |
|---|---|---|
| `0x00` | `LOAD` | Pre-load without executing; prepare resources |
| `0x01` | `START` | Execute — GO |
| `0x02` | `STOP` | Hard stop; cancel any running fade |
| `0x03` | `PAUSE` | Suspend in current state |
| `0x04` | `RESUME` | Continue from paused state |
| `0x05` | `RELEASE` | Release and return to default |

#### Address Conventions

Software-specific routing details (QLab cue numbers, OSC paths, etc.) belong in the Transport Descriptor. The address carries semantic intent only.

| Intent | Address |
|---|---|
| Fire lighting cue 42 | `lighting.cue.42` |
| Recall audio scene 3 | `audio.scene.3` |
| Target video layer 1, clip 4 | `video.layer.1.clip.4` |
| Trigger motion axis 2 | `motion.axis.2` |
| Named macro | `lighting.custom.house_lights_on` |
| Transport play | `audio.custom.transport` |
| Sync pulse | `lighting.custom.sync` |

---

### CONTROL_PARAM — `0x2001`

Set a named parameter to an exact typed value. The value type is declared on the wire; receivers can parse without a prior schema.

**Flags:** No TD required for internal writes; `TR = 1, GW = 1` when writing to a downstream system.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 2 B | `addr_len` | Byte length of the serialized address |
| 2 | N B | `address` | WSC Address — see [Address System](03-address-system.md) |
| 2+N | 1 B | `value_type` | Value type code — see table below |
| 3+N | V B | `value` | Encoded value; size determined by `value_type` |

#### Value Types

| Code | Name | Wire size | Description |
|---|---|---|---|
| `0x01` | `U8` | 1 B | Unsigned 8-bit integer |
| `0x02` | `U16` | 2 B | Unsigned 16-bit integer |
| `0x03` | `U32` | 4 B | Unsigned 32-bit integer |
| `0x04` | `U64` | 8 B | Unsigned 64-bit integer |
| `0x05` | `I8` | 1 B | Signed 8-bit integer |
| `0x06` | `I16` | 2 B | Signed 16-bit integer |
| `0x07` | `I32` | 4 B | Signed 32-bit integer |
| `0x08` | `I64` | 8 B | Signed 64-bit integer |
| `0x09` | `F32` | 4 B | IEEE 754 single-precision float |
| `0x0A` | `F64` | 8 B | IEEE 754 double-precision float |
| `0x0B` | `STRING` | `u16` + N B | Length-prefixed UTF-8 string |
| `0x0C` | `BOOL` | 1 B | `0x00` = false, any non-zero = true |

All multi-byte numeric values are big-endian.

---

## Tunnel

### TUNNEL_RAW — `0xE000`

Opaque binary passthrough. Payload bytes are forwarded verbatim to the downstream system.

**Flags:** `TR = 1, GW = 1` required. The Transport Descriptor **MUST** declare `protocol = RAW (0xFF)`. This constraint is enforced by validation.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | N B | `raw` | Arbitrary bytes, forwarded without interpretation |

#### Constraints

- `TUNNEL_RAW` paired with any protocol other than `RAW` **MUST** be rejected with `STATE_ERROR(INVALID_TUNNEL)`.
- Typical use: proprietary serial command strings, unsupported downstream protocols, binary passthrough during gateway development.

---

## State

State messages carry protocol housekeeping. They require no Transport Descriptor.

---

### STATE_QUERY — `0xF000`

Request state information from the remote peer.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 1 B | `query_type` | Sub-type code — see table below |
| 1 | 2+N B | `target_id` | Length-prefixed UTF-8 string; empty = global / all targets |

#### Query Types

| Code | Name | Expected response |
|---|---|---|
| `0x00` | `KEEPALIVE` | `STATE_ANSWER(SUCCESS)` — gateway MAY include system information in the data field |

---

### STATE_ANSWER — `0xF001`

Response to a `STATE_QUERY`.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 4 B | `query_id` | `id` of the originating `STATE_QUERY` |
| 4 | 1 B | `status` | Status code — see table below |
| 5 | 1 B | `format` | `0x00` = raw bytes · `0x01` = JSON-encoded UTF-8 |
| 6 | 2 B | `data_len` | Byte length of the data field |
| 8 | N B | `data` | Response payload |

#### Status Codes

| Code | Name | Description |
|---|---|---|
| `0x00` | `SUCCESS` | Completed successfully |
| `0x01` | `PARTIAL` | Partially completed |
| `0x02` | `ERROR` | General error |
| `0x03` | `NOT_FOUND` | Target not found |
| `0x04` | `NOT_SUPPORTED` | Operation not supported by this implementation |
| `0x05` | `BUSY` | Resource temporarily unavailable |

---

### STATE_ERROR — `0xF004`

Signals a protocol-level or gateway routing error. Receivers SHOULD emit `STATE_ERROR` rather than silently dropping unprocessable packets.

#### Payload

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 2 B | `error_code` | Numeric error code — see [Error Handling](07-error-handling.md) |
| 2 | 2+N B | `message` | Length-prefixed UTF-8 human-readable description |
| 4+N | 2+M B | `context` | Length-prefixed UTF-8 JSON object with optional diagnostic fields |
