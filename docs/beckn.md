# Beckn Protocol v2.0 — open network integration

This app talks to an open network. It runs a **consumer node** that searches
other providers for material on whatever concept the learner is weak on, and a
**provider node** that publishes its own generated decks, quizzes and
micro-courses for other applications to find.

Both sides speak [Beckn Protocol v2.0.0 LTS](https://github.com/beckn/protocol-specifications-v2).

```
npm run beckn:demo      # start a whole network and walk discover -> confirm
npm run beckn:conform   # the protocol conformance suite
```

---

## Why v2.0, and what changed from v1

Most Beckn implementations in the wild are v1.1/v1.2. This one targets the
v2.0.0 LTS line, which differs in ways that are not cosmetic:

| | v1.x | v2.0.0 LTS |
|---|---|---|
| Endpoints | one universal endpoint | one named endpoint per action — `/discover`, `/on_discover`, `/select`, `/init`, `/confirm`, `/status` … |
| Participant names | BAP / BPP | Consumer Node (CN) / Provider Node (PN); BAP and BPP are the legacy names |
| Identity fields | `bapId` / `bppId` | `senderId` / `receiverId` ([PR #168](https://github.com/beckn/protocol-specifications-v2/pull/168)) |
| Registry | Beckn registry | DeDi-compliant directory records on the NFH fabric |
| Discovery verb | `search` / `on_search` | `discover` / `on_discover` |

The transport contract is `api/v2.0.0/beckn.yaml` in that repository — an
OpenAPI 3.1.1 document describing request framing, callback patterns,
acknowledgement behaviour and authentication, deliberately separate from
domain semantics.

## Architecture

```
backend/beckn/
├── core/          the protocol itself, shared by both nodes
│   ├── keys.js        ed25519 keypairs <-> the raw base64 the registry publishes
│   ├── signing.js     NFH-007 HTTP signatures: sign and verify
│   ├── context.js     the v2 context envelope and its callback mirror
│   ├── ack.js         ACK / NackBadRequest / NackUnauthorized / ServerError
│   ├── client.js      signed outbound POST with transport retry
│   └── middleware.js  raw-body capture, signature verification, context validation
├── registry/      a DeDi-style subscriber registry plus a cached lookup client
├── bpp/           the provider node — catalog and the five forward actions
├── bap/           the consumer node — callbacks, correlation, app-facing API
├── network.js     starts registry + nodes on loopback over real HTTP
└── demo.js        the narrated end-to-end run
```

`network.js` exists because the failures worth catching — signing the bytes
that actually go on the wire, headers surviving the round trip, callbacks
arriving on a second connection — only happen over a real socket. The tests and
the demo both start a genuine three-process network on loopback rather than
calling handlers in process.

### The asynchronous shape

Beckn is not request/response. A forward action gets an immediate ACK meaning
*accepted, I will call you back*; the business result arrives later on the
caller's own `/on_*` endpoint, over a different connection.

```
consumer node                         provider node
      │  POST /discover  ───────────────────►  │   verify signature
      │  ◄───────────────────  200 ACK         │
      │                                        │   match catalog
      │  ◄──────────────  POST /on_discover    │   (new connection, signed)
      │  200 ACK  ───────────────────────────► │
```

A NACK is the opposite: the request was rejected and **no callback is ever
coming**. A consumer that treats NACK as "wait for the callback" hangs until
its timeout, so `bap/app.js` fails the call the moment it sees one.

Correlation is by `context.messageId` — one request/callback pair — while
`context.transactionId` groups everything the learner did in one sitting, from
the first search through to the confirmed order. `bap/transactions.js` opens an
entry per outbound request and resolves it when the matching callback lands.

Discovery is the awkward case: there is no way to know how many provider nodes
will answer, so the consumer waits a fixed collection window (2s by default)
and returns whatever arrived.

### Authentication

Every request carries an `Authorization` header built in `core/signing.js`. The
signing string is three lines and covers a *hash* of the body rather than the
body itself, so a receiver verifies without re-serialising JSON — key ordering
would differ and the digest would never match.

```
(created): 1700000000
(expires): 1700000030
digest: BLAKE-512=<base64 hash of the raw body bytes>
```

Three details that are easy to get wrong, all settled upstream during 2026:

- **The digest label is the literal string `BLAKE-512`**, standardised in
  [#183](https://github.com/beckn/protocol-specifications-v2/issues/183) (PR
  #186). The algorithm it names is BLAKE2b-512, which Node calls `blake2b512`.
  The label and the algorithm name genuinely differ — this is not a typo, and
  it is the sort of thing that silently fails interop.
- **`keyId` is pipe-separated**, `{subscriberId}|{keyId}|ed25519`, reverted to
  the v1 format in [#185](https://github.com/beckn/protocol-specifications-v2/issues/185)
  (PR #184) after a brief v2 alternative.
- **Clock skew tolerance defaults to 60s**, raised from 5s in
  [#182](https://github.com/beckn/protocol-specifications-v2/issues/182) (PR
  #187) — 5s is inside normal drift for an unsynchronised VM.

An unverifiable request is answered 401 `NackUnauthorized` and never reaches a
handler.

## The education domain

Beckn has **no v2 domain schema for education or skilling**. DSEP, the v1
adaptation, was last touched in July 2024 and its repositories are
unmaintained; the domain repositories that do carry v2 work cover agriculture,
energy, mobility, tourism, retail, logistics, finance and health. So the
mapping below is this implementation's own convention, and it is the part most
likely to change if an education domain schema is ever standardised.

| Beckn concept | Here |
|---|---|
| Provider | An institution, or this app instance publishing its own material |
| Item | A course, micro-course, flashcard deck or quiz |
| Item tags | `kind`, `level`, `durationMinutes`, and one `concept` tag per concept taught |
| Fulfillment | `ONLINE`, self-paced |
| Order | An enrolment |
| Quote | Course price, or free for app-generated material |

A `concept` tag is matched exactly rather than fuzzily: the consumer node gets
it from the app's knowledge-tracing model ([`backend/utils/bkt.js`](../backend/utils/bkt.js)),
not from a person typing, so loose matching would only add noise. Free-text
intents fall back to a substring match over the item descriptor.

### The use case this exists for

The dashboard already ranks a learner's weak concepts. Previously the only
answer was to generate more material from documents the learner had already
uploaded. Now the same ranking drives a network search:

> *weak on `dijkstra` → `/discover` across every provider node → results from
> several institutions → `select` → `init` → `confirm` → enrolled*

and in the other direction, everything the app generates is itself discoverable
by other consumer nodes.

## What is implemented

Actions: `discover`, `select`, `init`, `confirm`, `status`, and their five
callbacks. Registry: subscribe, DeDi-style lookup, filtered subscriber listing.

Not implemented: `track`, `update`, `cancel`, `rate`, `support`, the
`/catalog/*` publishing family, and message-level encryption. Those are
protocol surface this use case does not exercise yet; the ones that matter for
enrolment are all present.

### Deliberate MVP limits

- **In-memory state.** Subscriber records, orders and pending transactions
  live in process, so a restart loses in-flight journeys. Moving them to Mongo
  alongside the app's other collections is the obvious next step and touches
  one file each.
- **Callbacks are fire-and-forget.** A failed callback is logged and dropped
  rather than retried. Production wants a durable queue here — the app's
  roadmap already has BullMQ pencilled in for exactly this kind of work.
- **Replay protection is a growing in-memory set** of seen `messageId`s, never
  evicted. It needs a TTL keyed to signature expiry.
- **The registry is local.** See below.

## Running against the real network

The local registry stands in for the NFH fabric. Going live means onboarding as
a network participant and changing the lookup base URL:

1. Create an account at [dedi.global](https://dedi.global/).
2. Create a namespace, submit the domain-whitelisting request, add the
   generated TXT record to DNS and verify. Propagation takes 15 minutes to
   48 hours — this is the long pole.
3. Create a registry under the namespace using the NFH fabric subscriber
   schema.
4. Publish a subscriber record: subscriber ID (your domain), subscriber URL,
   type (CN or PN), the base64 ed25519 signing public key, countries.
5. Verify the key resolves:
   `https://fabric.nfh.global/registry/dedi/lookup/<subscriber_id>/subscribers.beckn.one/<record_id>`

Keys in the format step 4 wants come from `generateKeyPair()` in
[`backend/beckn/core/keys.js`](../backend/beckn/core/keys.js).

### An upstream divergence found while building this

NFH-007 documents the key lookup URL as

```
/registry/dedi/lookup/{subscriberId}/keys/{keyId}|ed25519
```

while docs.nfh.global and current ONIX implementations use

```
/registry/dedi/lookup/{subscriberId}/subscribers.beckn.one/{recordId}
```

An implementation that follows the specification literally does not resolve
keys against the deployed fabric. This is open upstream as
[protocol-specifications-v2#196](https://github.com/beckn/protocol-specifications-v2/issues/196);
`beckn/registry/app.js` serves both forms, and the client uses the second.

## Testing

| Suite | Covers |
|---|---|
| `tests/becknSigning.test.js` | key round-trips, signing string, keyId parsing, signature verification, tampering, expiry, clock skew |
| `tests/becknFlow.test.js` | end-to-end over real sockets: registration, fan-out discovery, select → init → confirm → status |
| `tests/becknConformance.test.js` | the negative paths — unsigned, tampered, unknown subscriber, wrong scheme, missing context, action/endpoint mismatch, unsupported action, replayed messageId |

The conformance suite is the interesting one. A happy-path demo proves a node
can talk; it does not prove the node rejects what it must reject. Every case
there goes over a real socket against a real provider node, signed or
deliberately mis-signed exactly as a hostile peer would.

```
npm run beckn:conform
```
