# 08 — Versioning

[← Error Handling](07-error-handling.md) · [CHANGELOG →](CHANGELOG.md)

---

## Version Identifiers

WSC carries two independent version identifiers:

| Identifier | Location | Current value | Governs |
|---|---|---|---|
| **Protocol version** | 3-byte field in every packet header | `1.1.0` | Wire format compatibility |
| **Binding version** | Declared by each language binding | per-binding | Implementation releases |

The binding version tracks implementation releases. The protocol version tracks wire-format changes. They evolve independently.

---

## Protocol Version Semantics

| Component | Increment when | Backwards compatible? |
|---|---|---|
| **Major** | Breaking wire change — header layout, type renumbering, flag semantics | **No** |
| **Minor** | Additive — new message types, new flag bits, new tokens, new protocols | **Yes** — old receivers ignore unknown types and reserved bits |
| **Patch** | Clarification, non-normative correction | **Yes** |

### Compatibility rule

> A receiver **MUST** reject any packet whose `major` version differs from its own, responding with `STATE_ERROR(PROTOCOL_VERSION)`.  
> Differences in `minor` or `patch` **MUST NOT** cause rejection.

A `v1.2.0` receiver accepts packets from a `v1.0.0` sender, and vice versa.  
A `v2.0.0` receiver **MUST** reject `v1.x.x` packets.

---

## Breaking vs. Non-Breaking Changes

### Changes requiring a major version bump

- Renumbering or removing an existing message type code
- Changing the byte layout of the header
- Changing the bit position or semantics of an existing flag
- Removing or redefining an existing token value in the address system
- Changing the byte order of any field
- Removing an existing error code, status code, or query type

### Changes that do NOT require a major bump

- Adding a new message type in a reserved range
- Adding a new flag bit in reserved bits 10–0
- Adding a new domain, entity, or leaf token
- Adding a new downstream protocol or interface code
- Adding a new error code, status code, query type, or param key
- Documentation corrections and non-normative clarifications

---

## Reserved Ranges

The following ranges are reserved for future minor-version additions. Implementations **MUST NOT** use them.

### Message type codes

| Range | Notes |
|---|---|
| `0x1001 – 0x1002` | Reserved |
| `0x1004 – 0x1FFF` | Reserved |
| `0x2002 – 0x2FFF` | Reserved |
| `0x3000 – 0xDFFF` | Reserved — future message categories |
| `0xE001 – 0xEFFF` | Reserved |
| `0xF002` | Reserved |
| `0xF003` | Reserved (was `STATE_NOTIFY` in 1.0.0) |
| `0xF005 – 0xFFFF` | Reserved (0xF005 was `STATE_HEARTBEAT` in 1.0.0) |

### Flags bits

| Bits | Notes |
|---|---|
| `10 – 0` (`0x07FF`) | Reserved — MUST be `0` on send, ignored on receive |

### Address token values

| Range | Notes |
|---|---|
| `0x07 – 0x0F` | Reserved — future domain tokens |
| `0x20 – 0x3F` | Reserved — future structural entity tokens |
| `0x56 – 0x6F` | Reserved — future lighting leaf tokens |
| `0x7E – 0x7F` | Reserved — future video leaf tokens |
| `0x90 – 0x9F` | Reserved — future audio leaf tokens |
| `0xA8 – 0xBF` | Reserved — future motion leaf tokens |
| `0xC5 – 0xCF` | Reserved — future environment leaf tokens |
| `0xD5 – 0xFD` | Reserved — future generic leaf tokens |

---

## Extending Before a Standard Token Exists

Use the `CUSTOM` address token (`0xFE`) for application-specific identifiers with no registered token. This is forward-compatible: if a standard token is later assigned, the custom string migrates without a version bump.

---

## Deprecation Policy

- A message type, token, or feature marked **deprecated** will be removed no earlier than the next **major** version.
- Deprecated items remain fully functional until removal.
- All deprecations are recorded in [CHANGELOG.md](CHANGELOG.md) with the version deprecated and the target removal version.

---

## Implementer Obligations

Binding authors MUST:

- Document which protocol version(s) the binding targets
- Enforce the major-version rejection rule on deserialization
- Treat unknown minor-version message types and reserved bits gracefully (ignore, do not error)
- Document any deviations from this specification
