# WSC — Implementations

An **implementation** is a higher-level package that uses a language binding to provide a complete, runnable client or gateway. It adds I/O, connection lifecycle management, session handling, and — in the case of a gateway — downstream protocol translation.

---

## Structure

Implementations are organized by language, then by role:

```
implementations/
└── <language>/
    ├── README.md     ← getting-started guide for this language
    ├── client/       ← client implementation
    └── server/       ← gateway implementation
```

---

## Client vs. Gateway

| Role | Responsibility |
|---|---|
| **Client** | Initiates the connection; constructs and sends WSC packets; receives and dispatches incoming packets to application code |
| **Gateway** | Accepts client connections; deserializes incoming packets; reads Transport Descriptors; routes to protocol-specific forwarding modules; translates and forwards to downstream systems |

---

## Available Implementations

| Language | Path | Binding | Protocol version | Status |
|---|---|---|---|---|
| JavaScript | [`js/`](js/README.md) | [`bindings/js/`](../bindings/js/) | 1.1.0 | Stable |

---

## Adding a New Implementation

1. Create a directory `implementations/<language>/`.
2. Add a `README.md` covering installation, quick-start for both client and gateway roles, and configuration reference.
3. Reference the binding it depends on under `bindings/<language>/`.
4. Follow the session model defined in [core/spec/06-session.md](../core/spec/06-session.md).

### What a client implementation must provide

| Feature | Spec reference |
|---|---|
| Connection initiation and lifecycle (`IDLE → CONNECTING → CONNECTED`) | [§06](../core/spec/06-session.md) |
| Packet ID sequencing | [§06 — Packet ID Sequencing](../core/spec/06-session.md#packet-id-sequencing) |
| Session keepalive | [§06 — Session Keepalive](../core/spec/06-session.md#session-keepalive) |
| Send-path buffering behaviour | [§06 — Send-Path Behaviour](../core/spec/06-session.md#send-path-behaviour) |
| Graceful disconnection | [§06 — Graceful Disconnection](../core/spec/06-session.md#graceful-disconnection) |

### What a gateway implementation must provide

| Feature | Spec reference |
|---|---|
| All of the above (gateway is also a peer) | [§06](../core/spec/06-session.md) |
| Transport Descriptor routing | [§05](../core/spec/05-transport-descriptor.md) |
| Protocol–interface compatibility enforcement | [§05 — Compat Matrix](../core/spec/05-transport-descriptor.md#protocolinterface-compatibility-matrix) |
| Message-type–protocol compatibility enforcement | [§05 — Compat Matrix](../core/spec/05-transport-descriptor.md#message-typeprotocol-compatibility-matrix) |
| `STATE_ERROR` emission on invalid packets | [§07](../core/spec/07-error-handling.md) |
