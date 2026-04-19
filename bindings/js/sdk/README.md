
# WSC SDK
A JavaScript implementation of the [WSC](https://github.com/ASLS-org/WSC) wire format that is independent of any I/O or transport layer, exposing the protocol through idiomatic types, functions, and constants without prescribing how packets are sent or received.

>**About WSC:**<br>
[WSC](https://github.com/ASLS-org/WSC) defines a unified wire format that transports DMX data, linear timecode, cue triggers, structured parameter updates, and arbitrary binary payloads. A gateway can then relay this data to downstream protocols such as Art-Net, sACN, OSC, MIDI, Modbus, and others.
## Public API

All domain constants live as static members of their owning class:

| Class | Responsibility |
|---|---|
| `WscPacket` | Packet construction, serialization, deserialization, payload codecs, validation |
| `WscTransport` | Transport Descriptor construction, serialization, compatibility matrices |
| `WscAddress` | Address token encoding, dot-notation parsing, serialization |
| `WscFlags` | Flags field serialization and validation |
| `WscError` | Typed protocol error with class and error code |
| `BinaryReader` / `BinaryWriter` | Low-level byte-level read/write helpers |

## Constants

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

## Packet factory

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

## Transport factory methods

```js
WscTransport.udp(protocol, ip, port)
WscTransport.tcp(protocol, ip, port)
WscTransport.serial(protocol, portIndex, baudRate)
WscTransport.usb(protocol, vendorId, productId)
WscTransport.http(protocol, url)
WscTransport.websocket(protocol, url)
WscTransport.raw()
```

## Address parsing

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
