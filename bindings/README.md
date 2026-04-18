# WSC — Bindings

A **binding** is a language-specific, I/O-free implementation of the WSC wire format. It exposes the protocol as idiomatic types, functions, and constants in a target language — with no opinion on how packets are transported.

---

## What a Binding Provides

| Responsibility | Description |
|---|---|
| **Packet construction** | Build a typed packet from structured inputs via a factory method |
| **Serialization** | Encode a packet to a byte buffer |
| **Deserialization** | Decode a byte buffer into a typed packet |
| **Payload codecs** | Per-message-type encode / decode of the payload region |
| **Address construction** | Build and parse WSC addresses from token sequences or dot-notation strings |
| **Transport Descriptor construction** | Assemble a TD from protocol, interface, and address inputs via factory methods |
| **Validation** | Enforce flag invariants and compatibility matrices before send |

## What a Binding Does NOT Provide

- Network I/O of any kind
- Connection management or session state
- Downstream protocol translation (gateway logic)

---

## Available Bindings

| Language | Path | Protocol version | SDK version | Status |
|---|---|---|---|---|
| JavaScript / TypeScript | [`js/`](js/) | 1.1.0 | 3.0.0 | Stable |

---

## JavaScript Binding — Overview

The JS binding lives at `bindings/js/sdk/` and is published as `@asls-org/wsc-sdk`. It exposes the full WSC surface as ES module classes.

### Public API

All domain constants live as static members of their owning class:

| Class | Responsibility |
|---|---|
| `WscPacket` | Packet construction, serialization, deserialization, payload codecs, validation |
| `WscTransport` | Transport Descriptor construction, serialization, compatibility matrices |
| `WscAddress` | Address token encoding, dot-notation parsing, serialization |
| `WscFlags` | Flags field serialization and validation |
| `WscError` | Typed protocol error with class and error code |
| `BinaryReader` / `BinaryWriter` | Low-level byte-level read/write helpers |

### Constants

| Expression | Values |
|---|---|
| `WscPacket.Type` | `STREAM_CHANNELS`, `STREAM_TIMECODE`, `CONTROL_CUE`, `CONTROL_PARAM`, `TUNNEL_RAW`, `STATE_QUERY`, `STATE_ANSWER`, `STATE_ERROR` |
| `WscPacket.CueAction` | `LOAD`, `START`, `STOP`, `PAUSE`, `RESUME`, `RELEASE` |
| `WscPacket.ValueType` | `U8`, `U16`, `U32`, `U64`, `I8`, `I16`, `I32`, `I64`, `F32`, `F64`, `STRING`, `BOOL` |
| `WscPacket.StateQuery` | `KEEPALIVE` |
| `WscPacket.Status` | `SUCCESS`, `PARTIAL`, `ERROR`, `NOT_FOUND`, `NOT_SUPPORTED`, `BUSY` |
| `WscPacket.ErrorCode` | `PROTOCOL_VERSION` … `CONFIG_ERROR` |
| `WscTransport.Protocol` | `DMX512`, `ARTNET`, `SACN`, `OSC`, `MIDI`, `MODBUS`, `RAW`, … |
| `WscTransport.Iface` | `UDP`, `TCP`, `SERIAL`, `USB`, `WEBSOCKET`, `HTTP` |
| `WscTransport.Addr` | `NONE`, `IPV4`, `IPV6`, `SERIAL`, `USB`, `HOSTNAME`, `URL` |
| `WscTransport.Param` | `PRIORITY`, `TTL`, `BAUD_RATE`, `SEQUENCE`, `IFACE_IDX` |
| `WscFlags.Bit` | `TR`, `GW`, `ACK`, `MC`, `TS` |

### Packet factory

```js
// Construct a typed packet
WscPacket.create(type, data, opts?)
// opts: { id?, flags?: WscFlags, transport?: WscTransport }

// Serialize
packet.serialize()              // → Uint8Array

// Deserialize
WscPacket.deserialize(buffer)   // → WscPacket

// Decode payload
WscPacket.decode(packet)        // → plain object | null

// Validate before send
WscPacket.validate(packet)      // → { valid, errors[], warnings[] }
```

### Transport factory methods

```js
WscTransport.udp(protocol, ip, port)
WscTransport.tcp(protocol, ip, port)
WscTransport.serial(protocol, portIndex, baudRate)
WscTransport.usb(protocol, vendorId, productId)
WscTransport.http(protocol, url)
WscTransport.websocket(protocol, url)
WscTransport.raw()
```

### Address parsing

```js
// From dot-notation string
WscAddress.parse('lighting.layer.2.intensity')   // → WscAddress

// From token array
WscAddress.build([WscToken.AUDIO, WscToken.TRACK, 3, WscToken.LEVEL])

// Round-trip
addr.serialize()                 // → Uint8Array
WscAddress.deserialize(bytes)    // → WscAddress
addr.toString()                  // → 'lighting.layer.2.intensity'
```

---

## Adding a New Binding

1. Create a directory `bindings/<language>/`.
2. Add a `README.md` documenting:
   - Which protocol version is targeted
   - How to install / include the binding
   - The public API surface (types, constructors, key functions)
   - Any deviations from the specification, with justification
3. Implement the binding against the normative specification in [`core/spec/`](../core/spec/).
4. Reference the spec section in comments for non-obvious decisions.

### Minimum required API surface

Every conformant binding MUST expose, in idiomatic form for the target language:

| Concept | Spec section |
|---|---|
| Packet type — construct, serialize, deserialize | [§02](../core/spec/02-packet-format.md), [§04](../core/spec/04-message-types.md) |
| Flags — serialize, deserialize, validate | [§02 — Flags](../core/spec/02-packet-format.md#flags) |
| Address — build, parse, serialize, deserialize | [§03](../core/spec/03-address-system.md) |
| Transport Descriptor — construct, serialize, deserialize | [§05](../core/spec/05-transport-descriptor.md) |
| Validation — returns errors and warnings | [§07](../core/spec/07-error-handling.md) |
| All enumerated constants | [§04](../core/spec/04-message-types.md), [§05](../core/spec/05-transport-descriptor.md) |

### Conformance

Binding authors MUST read the [conformance section](../core/README.md#conformance) of the core spec before publishing a binding.
