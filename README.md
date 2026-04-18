# Web Show Control (WSC)

> A compact, binary, transport-agnostic protocol for real-time control of performance and show systems.

WSC provides a single wire format that carries DMX channel data, linear timecode, discrete cue commands, typed parameter writes, and opaque binary tunnels — all forwardable to industry downstream protocols (Art-Net, sACN, OSC, MIDI, Modbus, and others) by a gateway node.

---

## Repository Structure

```
wsc/
├── README.md                        ← you are here
│
├── core/                            ← normative protocol specification
│   ├── README.md
│   └── spec/
│       ├── 01-architecture.md
│       ├── 02-packet-format.md
│       ├── 03-address-system.md
│       ├── 04-message-types.md
│       ├── 05-transport-descriptor.md
│       ├── 06-session.md
│       ├── 07-error-handling.md
│       ├── 08-versioning.md
│       └── CHANGELOG.md
│
├── bindings/                        ← language bindings (wire format only, no I/O)
│   ├── README.md
│   └── js/
│       └── sdk/                     ← @asls/wsc-sdk
│
└── implementations/                 ← runnable clients and gateways
    ├── README.md
    └── js/
        ├── README.md
        ├── client/                  ← browser / Node.js WebRTC client
        └── server/                  ← Node.js gateway
```

---

## Protocol at a Glance

| Property | Value |
|---|---|
| Protocol version | `1.1.0` |
| Header size | 19 bytes (fixed) |
| Byte order | Big-endian |
| Primary transport | WebRTC DataChannel (reference implementation) |
| Max payload | 65 535 bytes |

### Message types

| Type | Code | Description |
|---|---|---|
| `STREAM_CHANNELS` | `0x1000` | Bulk channel values — DMX universes, kinetics, indexed arrays |
| `STREAM_TIMECODE` | `0x1003` | Linear timecode — SMPTE / MTC |
| `CONTROL_CUE` | `0x2000` | Lifecycle action (GO, STOP, PAUSE…) on an addressed target |
| `CONTROL_PARAM` | `0x2001` | Typed named-parameter write |
| `TUNNEL_RAW` | `0xE000` | Opaque binary passthrough to a downstream system |
| `STATE_QUERY` | `0xF000` | Request state from the remote peer |
| `STATE_ANSWER` | `0xF001` | Response to a query |
| `STATE_ERROR` | `0xF004` | Protocol or routing error |

### Downstream protocols (selection)

Art-Net · sACN · DMX512 · RDM · KiNET · MIDI · MIDI 2.0 · MIDI Show Control · MIDI Timecode · OSC · NDI · VISCA · Modbus · CANopen · EtherCAT · PROFINET · GPI/GPO · Tally · HTTP · WebSocket · MQTT · RAW

---

## Documentation

### Protocol Specification

The normative specification is in [`core/`](core/README.md). Start here to understand the wire format, addressing scheme, and session model before writing a binding or implementation.

| Document | Summary |
|---|---|
| [01 — Architecture](core/spec/01-architecture.md) | Components, data flow, deployment topology |
| [02 — Packet Format](core/spec/02-packet-format.md) | Wire layout, header, flags |
| [03 — Address System](core/spec/03-address-system.md) | Hierarchical token addressing |
| [04 — Message Types](core/spec/04-message-types.md) | All 8 types with payload schemas |
| [05 — Transport Descriptor](core/spec/05-transport-descriptor.md) | Downstream routing, compatibility matrices |
| [06 — Session](core/spec/06-session.md) | Connection lifecycle, keepalive, sequencing |
| [07 — Error Handling](core/spec/07-error-handling.md) | Error codes, receiver obligations |
| [08 — Versioning](core/spec/08-versioning.md) | Semver rules, reserved ranges |
| [CHANGELOG](core/spec/CHANGELOG.md) | Protocol version history |

### Bindings

Bindings implement the WSC wire format in a specific language with no I/O.

| Language | Path | Status |
|---|---|---|
| JavaScript / TypeScript | [`bindings/js/`](bindings/js/) | Stable |

→ [Bindings overview and contribution guide](bindings/README.md)

### Implementations

Implementations provide runnable clients and gateways built on top of a binding.

| Language | Path | Status |
|---|---|---|
| JavaScript | [`implementations/js/`](implementations/js/README.md) | Stable |

→ [Implementations overview and contribution guide](implementations/README.md)

---

## Getting Started

**To run a gateway and connect a client** — go to the JavaScript implementation:

- [JavaScript implementation](implementations/js/README.md)

**To use WSC in your own project** — install the binding and follow the quick-start:

- [Bindings overview](bindings/README.md)

**To port WSC to a new language** — read the spec, then the bindings contribution guide:

- [Protocol spec](core/README.md)
- [Bindings contribution guide](bindings/README.md)

**To understand the wire format** — start with:

- [Packet Format](core/spec/02-packet-format.md)
- [Message Types](core/spec/04-message-types.md)

---

## Design Principles

**Transport-agnostic.** The wire format does not mandate a transport. The reference implementation uses WebRTC DataChannel; others may use TCP, WebSocket, or serial.

**Stateless gateway routing.** Every forwarded packet carries a complete Transport Descriptor. The gateway holds no per-client routing state.

**Compact by design.** The 19-byte fixed header and token-based address encoding keep packets small enough for 44 Hz+ DMX streaming without fragmentation.

**Separation of concerns.** Bindings (wire format) and implementations (transport + session) are separate packages. Porting to a new language requires only implementing the binding.

**Unified control path.** Cue actions and parameter writes share the Control range (`0x2000 – 0x2FFF`) and route through the same gateway module, simplifying dispatcher logic.

---

## License

See `COPYING`.
