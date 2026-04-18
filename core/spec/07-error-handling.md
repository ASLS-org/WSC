# 07 — Error Handling

[← Session](06-session.md) · [Next: Versioning →](08-versioning.md)

---

## Error Classes

WSC distinguishes four classes of error:

| Class | Code | Origin |
|---|---|---|
| `SIGNALING` | `0x1000` | Failure during connection setup (signaling exchange, ICE) |
| `TRANSPORT` | `0x2000` | Channel-level fault (DataChannel, socket error) |
| `PACKET` | `0x3000` | Malformed packet, invalid flags, or payload parse failure |
| `GATEWAY` | `0x4000` | Routing, compatibility, or forwarding failure at the gateway |

Protocol errors that cross the network surface as `STATE_ERROR` packets (see [Message Types §STATE_ERROR](04-message-types.md#state_error--0xf004)).

---

## Protocol Error Codes

These codes appear in the `error_code` field of `STATE_ERROR` payloads.

| Code | Name | Class | Cause |
|---|---|---|---|
| `0x0001` | `PROTOCOL_VERSION` | PACKET | Major version mismatch between sender and receiver |
| `0x0002` | `INVALID_MESSAGE_TYPE` | PACKET | The `type` field is not a recognised value |
| `0x0003` | `MALFORMED_PACKET` | PACKET | Header or payload cannot be parsed |
| `0x0004` | `INCOMPATIBLE_PROTOCOL` | GATEWAY | Message type not permitted for the declared downstream protocol |
| `0x0005` | `INCOMPATIBLE_IFACE` | GATEWAY | Downstream protocol not permitted on the declared interface |
| `0x0006` | `MISSING_TRANSPORT` | PACKET | `TR = 1` but Transport Descriptor is absent or zero-length |
| `0x0007` | `MISSING_TRANSPORT_FLAG` | PACKET | TD present but `TR = 0`, or `GW = 1` but `TR = 0` |
| `0x0008` | `INVALID_TUNNEL` | GATEWAY | `TUNNEL_RAW` paired with a protocol other than `RAW` |
| `0x0009` | `NO_ROUTE` | GATEWAY | Gateway cannot resolve a route to the target |
| `0x000A` | `VALIDATION_FAILED` | PACKET | Generic structural validation failure |
| `0x000B` | `CONFIG_ERROR` | GATEWAY | Gateway configuration prevents forwarding |

---

## Receiver Obligations

| Condition | Required action |
|---|---|
| Buffer shorter than 19 bytes | Drop silently |
| `magic` ≠ `WSC!` | Drop silently |
| Major version mismatch | Emit `STATE_ERROR(PROTOCOL_VERSION)` |
| Unknown `type` value | Emit `STATE_ERROR(INVALID_MESSAGE_TYPE)` |
| Payload cannot be parsed | Emit `STATE_ERROR(MALFORMED_PACKET)` |
| `GW = 1`, `TR = 0` | Emit `STATE_ERROR(MISSING_TRANSPORT_FLAG)` |
| `TR = 0`, `transport_len > 0` | Emit `STATE_ERROR(MISSING_TRANSPORT_FLAG)` |
| `TR = 1`, `transport_len = 0` | Emit `STATE_ERROR(MISSING_TRANSPORT)` |
| Incompatible `(type, protocol)` | Emit `STATE_ERROR(INCOMPATIBLE_PROTOCOL)` |
| Incompatible `(protocol, iface)` | Emit `STATE_ERROR(INCOMPATIBLE_IFACE)` |
| `TUNNEL_RAW` + non-`RAW` protocol | Emit `STATE_ERROR(INVALID_TUNNEL)` |
| No route to downstream target | Emit `STATE_ERROR(NO_ROUTE)` |

Where possible, implementations SHOULD set the `STATE_ERROR` packet `id` to the `id` of the offending packet to aid correlation.

---

## Validation

Implementations SHOULD provide a `validate(packet)` function that checks structural and compatibility rules before a packet is sent. Validation MUST produce at minimum:

- **Errors** — hard failures; the packet MUST NOT be sent.
- **Warnings** — advisory; the packet is structurally valid but the configuration may produce unexpected behaviour.

### Standard validation warnings

| Condition | Warning |
|---|---|
| `ACK` set on a streaming packet destined for a UDP-based downstream protocol | ACK on streaming/UDP may impair throughput |
| `MC` set on a protocol with no multicast support | Protocol may not support multicast |
| `ACK` not set for HTTP or Modbus forwarding | Protocol works best with ACK |
