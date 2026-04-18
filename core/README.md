# WSC — Protocol Specification

This directory contains the normative specification for the **Web Show Control (WSC)** protocol. It is language-agnostic and binding-agnostic. It defines the wire format, addressing scheme, message types, session model, and compatibility rules that all implementations must conform to.

---

## Specification Documents

| # | Document | Contents |
|---|---|---|
| 01 | [Architecture](spec/01-architecture.md) | System components, data flow, deployment topology, design decisions |
| 02 | [Packet Format](spec/02-packet-format.md) | Wire layout, header fields, flags bitmask, annotated hex example |
| 03 | [Address System](spec/03-address-system.md) | Hierarchical token addressing, wire encoding, full token registry |
| 04 | [Message Types](spec/04-message-types.md) | All 8 message types — payload schemas, constraints, address conventions |
| 05 | [Transport Descriptor](spec/05-transport-descriptor.md) | Downstream protocols, interfaces, address encoding, compatibility matrices |
| 06 | [Session](spec/06-session.md) | Connection lifecycle, reference transport, keepalive, sequencing |
| 07 | [Error Handling](spec/07-error-handling.md) | Error classes, protocol error codes, receiver obligations |
| 08 | [Versioning](spec/08-versioning.md) | Semver rules, breaking vs. additive changes, reserved ranges |
| — | [CHANGELOG](spec/CHANGELOG.md) | Protocol version history |

---

## Quick Reference

### Protocol identity

| Field | Value |
|---|---|
| Magic | `WSC!` (`0x57 0x53 0x43 0x21`) |
| Protocol version | `1.1.0` |
| Header size | 19 bytes (fixed) |
| Byte order | Big-endian |
| Max payload | 65 535 bytes |
| Max transport descriptor | 65 535 bytes |

### Message types at a glance

| Type | Code | One-line description |
|---|---|---|
| `STREAM_CHANNELS` | `0x1000` | Bulk channel values (DMX, kinetics, indexed arrays) |
| `STREAM_TIMECODE` | `0x1003` | Linear timecode (SMPTE / MTC) |
| `CONTROL_CUE` | `0x2000` | Lifecycle action (GO, STOP, PAUSE…) on an addressed target |
| `CONTROL_PARAM` | `0x2001` | Typed named-parameter write |
| `TUNNEL_RAW` | `0xE000` | Opaque binary passthrough |
| `STATE_QUERY` | `0xF000` | Request state from remote peer |
| `STATE_ANSWER` | `0xF001` | Response to a `STATE_QUERY` |
| `STATE_ERROR` | `0xF004` | Protocol or routing error |

---

## Conformance

An implementation conforms to this specification if it:

1. Produces and accepts packets with the header layout defined in [§02](spec/02-packet-format.md).
2. Enforces the flag invariants defined in [§02 — Flags](spec/02-packet-format.md#flags).
3. Encodes and decodes addresses according to [§03](spec/03-address-system.md).
4. Implements the payload schemas for all message types it claims to support, as defined in [§04](spec/04-message-types.md).
5. Enforces the protocol–interface and message-type–protocol compatibility matrices defined in [§05](spec/05-transport-descriptor.md).
6. Implements the receiver obligations defined in [§07](spec/07-error-handling.md).
7. Enforces the version compatibility rule defined in [§08](spec/08-versioning.md).
8. Treats unknown message types and reserved bits gracefully (ignore, do not error).

Partial implementations — bindings or clients that support a subset of message types — MUST clearly document which types they implement.

---

## Relation to Bindings and Implementations

```
core/spec/         ← normative — defines what is correct
bindings/<lang>/   ← exposes the spec as idiomatic types and functions
implementations/   ← uses a binding to connect, send, and receive
```

See the [bindings README](../bindings/README.md) and [implementations README](../implementations/README.md) for available language bindings and higher-level client / gateway implementations.
