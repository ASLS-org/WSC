# 05 — Transport Descriptor

[← Message Types](04-message-types.md) · [Next: Session →](06-session.md)

---

## Overview

The Transport Descriptor (TD) is appended to a packet when `TR = 1`. It tells the gateway:

1. **Which downstream protocol** to use (`protocol`)
2. **Which physical interface** to use (`iface`)
3. **Where to send it** (`addr_type` + `addr_data`)
4. **Additional forwarding parameters** (optional `params` map)

Every packet that requires forwarding carries a complete, self-describing TD. The gateway holds no per-client routing state.

---

## Wire Format

```
[u8  protocol]
[u8  iface]
[u8  addr_type]
[…   addr_data]       variable length — determined by addr_type (see §Address Encoding)
[u8  param_count]
  for each param:
    [u8  key]
    [u8  value_len]
    […   value]
```

The byte length of the TD is given by `transport_len` in the outer packet header.

---

## Downstream Protocols

| Code | Name | Group | Default |
|---|---|---|---|
| `0x01` | `DMX512` | Lighting | Serial, baud 250 000 |
| `0x02` | `ARTNET` | Lighting | UDP 6454 |
| `0x03` | `SACN` | Lighting | UDP 5568 |
| `0x04` | `KINET` | Lighting | UDP 6038 |
| `0x05` | `RDM` | Lighting | Serial / USB |
| `0x10` | `MIDI` | Audio/MIDI | Serial, baud 31 250 |
| `0x11` | `MIDI2` | Audio/MIDI | USB |
| `0x12` | `MSC` | Audio/MIDI | — |
| `0x13` | `MTC` | Audio/MIDI | — |
| `0x14` | `MMC` | Audio/MIDI | Serial / USB |
| `0x15` | `OSC` | Audio/MIDI | UDP 8000 |
| `0x20` | `NDI` | Video | UDP / TCP |
| `0x21` | `VISCA` | Video | Serial baud 9600 / UDP 52381 |
| `0x30` | `MODBUS` | Machine | TCP 502 / Serial baud 9600 |
| `0x31` | `CANOPEN` | Machine | Serial / USB |
| `0x32` | `ETHERCAT` | Machine | UDP |
| `0x33` | `PROFINET` | Machine | UDP |
| `0x40` | `GPI_GPO` | Tally | Serial / USB |
| `0x41` | `TALLY` | Tally | UDP / TCP / Serial |
| `0xF0` | `HTTP` | Generic | TCP 80 / 443 |
| `0xF1` | `WEBSOCKET` | Generic | TCP 80 / 443 |
| `0xF2` | `MQTT` | Generic | TCP 1883 / 8883 |
| `0xFF` | `RAW` | Generic | — |

---

## Physical Interfaces

| Code | Name |
|---|---|
| `0x01` | `UDP` |
| `0x02` | `TCP` |
| `0x03` | `SERIAL` |
| `0x04` | `USB` |
| `0x05` | `WEBSOCKET` |
| `0x06` | `HTTP` |

---

## Address Encoding

`addr_type` selects the layout of `addr_data`.

| Code | Name | `addr_data` layout | Total bytes |
|---|---|---|---|
| `0x00` | `NONE` | Empty | 0 |
| `0x01` | `IPV4` | `[u8 × 4 IP][u16 port]` | 6 |
| `0x02` | `IPV6` | `[u8 × 16 IP][u16 port]` | 18 |
| `0x03` | `SERIAL` | `[u8 port_index]` | 1 |
| `0x04` | `USB` | `[u16 vendor_id][u16 product_id]` | 4 |
| `0x05` | `HOSTNAME` | `[u8 host_len][UTF-8 host][u16 port]` | variable |
| `0x06` | `URL` | `[u8 url_len][UTF-8 url]` | variable |

All multi-byte fields are big-endian.

---

## Optional Parameters

Each entry in the params map: `[u8 key][u8 value_len][… bytes]`.

| Code | Name | Type | Description |
|---|---|---|---|
| `0x01` | `PRIORITY` | `u8` | Forwarding priority (e.g. sACN priority byte, default 100) |
| `0x02` | `TTL` | `u8` | IP time-to-live for multicast |
| `0x03` | `BAUD_RATE` | `u32` big-endian | Baud rate for serial interfaces |
| `0x04` | `SEQUENCE` | `u8` | Downstream protocol sequence counter |
| `0x05` | `IFACE_IDX` | `u8` | Host NIC index when multiple interfaces are present |

---

## Protocol–Interface Compatibility Matrix

A gateway **MUST** reject any `(protocol, iface)` pair not listed here with `STATE_ERROR(INCOMPATIBLE_IFACE)`.

| Protocol | Permitted interfaces |
|---|---|
| `DMX512` | SERIAL, USB |
| `ARTNET` | UDP |
| `SACN` | UDP |
| `KINET` | UDP |
| `RDM` | SERIAL, USB, UDP |
| `MIDI` | SERIAL, USB, UDP |
| `MIDI2` | USB, UDP |
| `MSC` | SERIAL, USB, UDP |
| `MTC` | SERIAL, USB, UDP |
| `MMC` | SERIAL, USB |
| `OSC` | UDP, TCP, WEBSOCKET |
| `NDI` | UDP, TCP |
| `VISCA` | SERIAL, UDP |
| `MODBUS` | SERIAL, TCP, UDP |
| `CANOPEN` | SERIAL, USB |
| `ETHERCAT` | UDP |
| `PROFINET` | UDP |
| `GPI_GPO` | SERIAL, USB |
| `TALLY` | UDP, TCP, SERIAL |
| `HTTP` | HTTP |
| `WEBSOCKET` | WEBSOCKET |
| `MQTT` | TCP, WEBSOCKET |
| `RAW` | UDP, TCP, SERIAL, USB, WEBSOCKET, HTTP |

---

## Message-Type–Protocol Compatibility Matrix

When `GW = 1`, a gateway **MUST** reject any `(message_type, protocol)` pair not listed here with `STATE_ERROR(INCOMPATIBLE_PROTOCOL)`.

| Message type | Permitted downstream protocols |
|---|---|
| `STREAM_CHANNELS` | DMX512, ARTNET, SACN, KINET, MODBUS, OSC, RAW |
| `STREAM_TIMECODE` | MTC, OSC, MIDI, ARTNET, RAW |
| `CONTROL_CUE` | MSC, OSC, MIDI, HTTP, WEBSOCKET, GPI_GPO, RAW |
| `CONTROL_PARAM` | OSC, MIDI, MIDI2, MODBUS, HTTP, WEBSOCKET, CANOPEN, PROFINET, ETHERCAT, RAW |
| `TUNNEL_RAW` | **RAW only** |
| State types (`0xF000 – 0xFFFF`) | All protocols |

---

## Annotated Wire Examples

### Art-Net UDP

```
protocol   02           ARTNET
iface      01           UDP
addr_type  01           IPV4
addr_data  C0 A8 01 64  192.168.1.100
           19 36        port 6454
params     00           0 entries
```

### DMX512 serial, port 0

```
protocol   01           DMX512
iface      03           SERIAL
addr_type  03           SERIAL
addr_data  00           port index 0
params     01           1 entry
  key      03           BAUD_RATE
  len      04
  value    00 03 D0 90  250000 (big-endian u32)
```

### OSC UDP

```
protocol   15           OSC
iface      01           UDP
addr_type  01           IPV4
addr_data  7F 00 00 01  127.0.0.1
           1F 40        port 8000
params     00           0 entries
```

### RAW tunnel (opaque passthrough)

```
protocol   FF           RAW
iface      00           (none)
addr_type  00           NONE
addr_data  (empty)
params     00           0 entries
```
