# 02 — Packet Format

[← Architecture](01-architecture.md) · [Next: Address System →](03-address-system.md)

---

## Structure

Every WSC packet consists of three consecutive regions. All multi-byte integer fields are **big-endian**.

```
 ┌───────────────────────────────────────────────────────────────────┐
 │                        HEADER  (19 bytes, fixed)                  │
 ├───────────────────────────────────────────────────────────────────┤
 │                   PAYLOAD  (0 – 65 535 bytes)                     │
 ├───────────────────────────────────────────────────────────────────┤
 │            TRANSPORT DESCRIPTOR  (0 – 65 535 bytes)               │
 └───────────────────────────────────────────────────────────────────┘
```

---

## Header

```
 Offset  Size  Field
 ──────  ────  ─────────────────────────────────────────────────────
    0     4 B  magic
    4     3 B  version
    7     2 B  type
    9     2 B  flags
   11     4 B  id
   15     2 B  payload_len
   17     2 B  transport_len
                                                          total: 19 B
```

| Offset | Size | Field | Description |
|---|---|---|---|
| 0 | 4 B | `magic` | `0x57 0x53 0x43 0x21` — ASCII `WSC!` |
| 4 | 3 B | `version` | `[u8 major, u8 minor, u8 patch]` — currently `[1, 0, 0]` |
| 7 | 2 B | `type` | Message type identifier (see [Message Types](04-message-types.md)) |
| 9 | 2 B | `flags` | Bitmask controlling routing and delivery (see §Flags) |
| 11 | 4 B | `id` | Packet sequence ID, range `[0x00000001, 0xFFFFFFFF]`, wraps to `1` on overflow |
| 15 | 2 B | `payload_len` | Byte length of the payload region |
| 17 | 2 B | `transport_len` | Byte length of the Transport Descriptor; `0` when absent |

### Receiver constraints

- A receiver **MUST** discard any buffer shorter than 19 bytes.
- `magic` **MUST** equal `WSC!`. Mismatches **MUST** be silently dropped.
- The `version` major byte **MUST** match the receiver's own. A mismatch **MUST** produce `STATE_ERROR(PROTOCOL_VERSION)`.
- `id` **MUST NOT** be `0`. The sequence wraps from `0xFFFFFFFF` to `1`.

---

## Flags

The 16-bit flags field is a bitmask. Bits 10–0 are reserved: **MUST** be `0` on send and **MUST** be ignored on receive.

```
 Bit  15  14  13  12  11  10   9   8   7   6   5   4   3   2   1   0
      ────────────────────────────────────────────────────────────────
      TR   GW  ACK  MC  TS   [──────────────── reserved ────────────]
```

| Bit | Mask | Name | Meaning |
|---|---|---|---|
| 15 | `0x8000` | **TR** | Transport Descriptor is present |
| 14 | `0x4000` | **GW** | Gateway forwarding requested |
| 13 | `0x2000` | **ACK** | Sender requests a `STATE_ANSWER` acknowledgment |
| 12 | `0x1000` | **MC** | Multicast delivery requested |
| 11 | `0x0800` | **TS** | Timestamp prefix attached |
| 10–0 | `0x07FF` | *(reserved)* | MUST be `0` |

### Flag invariants

These rules **MUST** be enforced by all implementations:

| Rule | Error on violation |
|---|---|
| `GW = 1` requires `TR = 1` | `MISSING_TRANSPORT_FLAG` |
| `TR = 1` requires `transport_len > 0` and a valid Transport Descriptor | `MISSING_TRANSPORT` |
| `TR = 0` requires `GW = 0` | `MISSING_TRANSPORT_FLAG` |

### Typical combinations

| Scenario | TR | GW | ACK |
|---|---|---|---|
| Internal command, no forwarding | 0 | 0 | 0 |
| Gateway forward, best-effort | 1 | 1 | 0 |
| Gateway forward, acknowledged | 1 | 1 | 1 |
| State housekeeping | 0 | 0 | 0 |

---

## Payload

The payload immediately follows the header. Its byte length is given by `payload_len`. A zero-length payload is valid for message types with no data (e.g. `TUNNEL_RAW` acting as a sync pulse). Payload encoding is message-type-specific — see [Message Types](04-message-types.md).

---

## Transport Descriptor

The Transport Descriptor (TD) immediately follows the payload. Its byte length is given by `transport_len`. When `TR = 0`, `transport_len` **MUST** be `0` and no TD bytes are present. Full TD encoding is specified in [Transport Descriptor](05-transport-descriptor.md).

---

## Annotated Wire Example

**Packet:** `STREAM_CHANNELS` — universe 0, channels 1–4, values `[255, 128, 64, 0]`, forwarded over Art-Net to `192.168.1.100:6454`.

```
── Header (19 B) ─────────────────────────────────────────────────
57 53 43 21        magic            "WSC!"
01 00 00           version          1.0.0
10 00              type             STREAM_CHANNELS (0x1000)
C0 00              flags            TR=1, GW=1 (0xC000)
00 00 00 01        id               1
00 0A              payload_len      10
00 09              transport_len    9

── Payload (10 B) ────────────────────────────────────────────────
00 00              universe         0
00 01              start_channel    1
00 04              count            4
FF 80 40 00        values           [255, 128, 64, 0]

── Transport Descriptor (9 B) ────────────────────────────────────
02                 protocol         ARTNET (0x02)
01                 iface            UDP (0x01)
01                 addr_type        IPV4 (0x01)
C0 A8 01 64        addr             192.168.1.100
19 36              port             6454
00                 param_count      0
```
