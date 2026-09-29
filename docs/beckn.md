# Beckn Protocol v2.0 — open network integration

This app is a network participant on both sides. It runs a **consumer node**
that searches other providers for material on whatever concept the learner is
weak on, and a **provider node** that publishes its own generated decks,
quizzes and micro-courses for other applications to find.

Both sides speak [Beckn Protocol v2.0.0 LTS](https://github.com/beckn/protocol-specifications-v2),
validated against the specification vendored at
[`backend/beckn/spec/beckn.yaml`](../backend/beckn/spec/beckn.yaml).

```bash
cd backend
npm run beckn:demo      # start a whole subnet and walk discover -> confirm
npm run beckn:conform   # the protocol conformance suite
docker compose up       # the app plus a registry, gateway and two providers
```

---

## Why v2.0, and what actually changed from v1

Most Beckn implementations in the wild are v1.1/v1.2, and most v1-era material
describes v2 incorrectly. These are the differences as the pinned specification
defines them, not as summaries of it report them:

| | v1.x | v2.0.0 LTS |
|---|---|---|
| Endpoints | one universal endpoint | one named endpoint per action — `/discover`, `/on_discover`, `/select`, `/init`, `/confirm`, `/status` … |
| Participant names | BAP / BPP | Consumer Node (CN) / Provider Node (PN); BAP and BPP are the legacy names |
| Discovery verb | `search` / `on_search` | `discover` / `on_discover` |
| Discovery result | `catalog` | `catalogs`, an array |
| What you order | an Order with items | a **Contract** with commitments, consideration and participants |
| Catalog contents | items | **Resources** (what is on offer) and **Offers** (packaging and price) |
| Domain modelling | tag arrays | JSON-LD `Attributes` — `{ "@context", "@type", … }` |
| Registry | Beckn registry | DeDi-compliant directory records on the NFH fabric |

Two corrections to what is widely written about v2, including in an earlier
draft of this document:

- **`bapId`/`bppId` were not renamed to `senderId`/`receiverId`.** All four
  exist in the v2 `Context` and mean different things. `bapId`/`bppId` are
  verified namespace identifiers on dedi.global, used to resolve a peer's
  address and key material; `senderId`/`receiverId` are DIDs used for
  message-level verification. `bapUri` is where callbacks are delivered and
  `bppUri` is where requests are sent, both required to match the
  `subscriber_url` from a registry lookup.
- **There is no `context.domain`.** A transaction is scoped by `networkId`
  (which subnet it happens on) and `schemaContext` (which JSON-LD schemas its
  payloads use). Domain lives in the data, not the envelope.

## Architecture

```
backend/beckn/
├── spec/beckn.yaml    the pinned v2.0.0 LTS OpenAPI document
├── core/              the protocol itself, shared by every node
│   ├── keys.js            ed25519 keypairs <-> the raw base64 a registry publishes
│   ├── signing.js         NFH-007 HTTP signatures: sign and verify
│   ├── context.js         the context envelope and its callback mirror
│   ├── ack.js             Ack / Nack envelopes and spec error codes
│   ├── client.js          signed outbound POST with transport retry
│   ├── validate.js        Ajv compiled from spec/beckn.yaml
│   └── middleware.js      raw-body capture, signature check, schema check
├── registry/          DeDi-style subscriber records, lookup, key rotation
├── gateway/           broadcast fan-out for discovery
├── bpp/               the provider node — catalog and five forward actions
├── bap/               the consumer node — callbacks, correlation, app API
├── network.js         starts a whole subnet on loopback over real HTTP
├── serve.js           runs one node by role, for docker-compose
└── demo.js            the narrated end-to-end run
```

The app's own consumer node is built in
[`backend/utils/becknNode.js`](../backend/utils/becknNode.js) and exposed at
`/api/network` by [`backend/routes/networkRoutes.js`](../backend/routes/networkRoutes.js).

`network.js` exists because the failures worth catching — signing the bytes
that actually go on the wire, headers surviving the round trip, callbacks
arriving on a second connection — only happen over a real socket. The tests and
the demo both start a genuine multi-process subnet on loopback rather than
calling handlers in process.

### The asynchronous shape

Beckn is not request/response. A forward action gets an immediate ACK meaning
*accepted, I will call you back*; the business result arrives later on the
caller's own `/on_*` endpoint, over a different connection.

```
consumer node                          provider node
      │  POST /discover  ───────────────────►  │  verify signature
      │                                        │  validate against beckn.yaml
      │  ◄───────────────────  200 ACK         │
      │                                        │  match catalog
      │  ◄──────────────  POST /on_discover    │  (new connection, signed)
      │  200 ACK  ───────────────────────────► │
```

A NACK is the opposite: the request was rejected and **no callback is ever
coming**. A consumer that treats a NACK as "wait for the callback" hangs until
it times out, so `bap/app.js` fails the call the moment it sees one.

With a gateway, discovery fans out one hop further, and every provider answers
the consumer directly:

```
consumer ──/discover──► gateway ──/discover──► provider A ──/on_discover──┐
                            │                                            │
                            └────/discover──► provider B ──/on_discover──┤
                                                                         ▼
                                                                     consumer
```

The gateway only ever touches discovery. Once the consumer knows which provider
it wants, `select`/`init`/`confirm`/`status` go straight to that provider, so
the gateway never sees the contract, the participants or the money — which is
the privacy property that makes the topology worth having.

Correlation is by `context.messageId`, which the specification is explicit
about: it "persists across a single request and its corresponding callback",
and the consumer "MUST use this value to correlate incoming callbacks with the
originating request". `context.transactionId` groups everything the learner did
in one sitting, from the first search to the confirmed contract.

Discovery is the awkward case: there is no way to know how many providers will
answer, so the consumer waits a fixed collection window (2s by default) and
returns whatever arrived.

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
  [#183](https://github.com/beckn/protocol-specifications-v2/issues/183)
  (PR #186). The algorithm it names is BLAKE2b-512, which Node calls
  `blake2b512`. The label and the algorithm name genuinely differ — this is not
  a typo, and it is the sort of thing that silently breaks interop.
- **`keyId` is pipe-separated**, `{subscriberId}|{keyId}|ed25519`, reverted to
  the v1 format in [#185](https://github.com/beckn/protocol-specifications-v2/issues/185)
  (PR #184) after a brief v2 alternative.
- **Clock skew tolerance defaults to 60s**, raised from 5s in
  [#182](https://github.com/beckn/protocol-specifications-v2/issues/182)
  (PR #187) — 5s is inside normal drift for an unsynchronised VM.

An unverifiable request is answered 401 with the matching code from the spec's
`ErrorCode` enum (`AUT_SIGNATURE_MISSING`, `AUT_SIGNATURE_INVALID`,
`AUT_SUBSCRIBER_NOT_FOUND`) and never reaches a handler.

### Key rotation

Registry records are keyed by subscriber **and** key id, so a participant can
hold several keys at once. Rotation is: publish the new key, wait for peers'
lookup caches to pick it up, then revoke the old one. Revoking first would fail
every message already in flight. A revoked key stops resolving entirely rather
than resolving with a status a caller might ignore.

Keying on the subscriber alone is the cache-collision bug reported against
beckn-onix ([#929](https://github.com/beckn/beckn-onix/issues/929)), where one
subscriber's signing key can be served for another.

## The education domain

Beckn has **no v2 domain schema for education or skilling**. DSEP, the v1
adaptation, was last pushed in July 2024 and its repositories are unmaintained;
the domain repositories carrying v2 work cover agriculture, energy, mobility,
tourism, retail, logistics, finance and health.

So the mapping below is this implementation's own convention, expressed through
the JSON-LD `Attributes` extension point that exists for exactly this. It is
the part most likely to change if an education domain schema is standardised.

| Beckn v2 concept | Here |
|---|---|
| Provider | An institution, or this app publishing its own material |
| Resource | A course, micro-course, flashcard deck or quiz |
| `resourceAttributes` | `@type: LearningResource` plus `kind`, `level`, `durationMinutes`, `concepts[]` |
| Offer | What a resource costs, with price as a `PriceSpecification` consideration |
| Contract | An enrolment |
| Commitment | One resource at one quantity under one offer |
| Performance | Delivery state — `PAYMENT_PENDING`, then `ENROLLED` |

Discovery uses v2's two intent fields. Free text goes in `textSearch`; a
concept search becomes a JSONPath filter:

```
$[?('dijkstra' in @.resourceAttributes.concepts)]
```

Only a small JSONPath subset is evaluated — equality and membership against a
dotted path — which covers every query the consumer node sends. Anything else
is reported as unsupported rather than silently matching nothing, because a
filter that quietly returns an empty catalog is far worse to debug than one
that says it was not understood.

### The use case this exists for

The dashboard already ranks a learner's weak concepts with Bayesian knowledge
tracing ([`backend/utils/bkt.js`](../backend/utils/bkt.js)). Previously the only
answer to a weak concept was to generate more material from documents the
learner had already uploaded. Now the same ranking drives a network search:

> *weak on `dijkstra` → `/discover` across the subnet → results from several
> institutions → `select` → `init` → `confirm` → enrolled*

The **Open network** page puts the learner's weakest concepts up as one-click
searches, and enrolling walks the three contracting actions with each step
visible as it happens. In the other direction, everything the app generates is
itself discoverable by other consumer nodes.

## What is implemented

Actions: `discover`, `select`, `init`, `confirm`, `status` and their five
callbacks. Registry: subscribe, DeDi-style lookup, key rotation and revocation,
filtered subscriber listing. Topologies: gateway broadcast, or direct fan-out
from the registry when no gateway is on the subnet.

Not implemented: `track`, `update`, `cancel`, `rate`, `support`, the
`/catalog/*` publishing family, and message-level encryption. Those are
protocol surface this use case does not exercise; everything enrolment needs is
present.

### Deliberate MVP limits

- **In-memory state.** Subscriber records, contracts and pending transactions
  live in process, so a restart loses in-flight journeys. Moving them to Mongo
  alongside the app's other collections is the obvious next step.
- **Callback retry is bounded and in-process.** A failed callback is retried
  with backoff and then dropped. Production wants a durable queue; the app's
  roadmap already has BullMQ pencilled in for exactly this kind of work.
- **Replay protection is a growing in-memory set** of seen `messageId`s, never
  evicted. It needs a TTL keyed to signature expiry.
- **`serve.js` generates keys at boot.** Fine for a demo subnet. A real
  participant holds a long-lived key whose public half is in its DeDi record.

## Running against the real network

The local registry stands in for the NFH fabric. Going live means onboarding as
a network participant and pointing `BECKN_REGISTRY_URL` at it:

1. Create an account at [dedi.global](https://dedi.global/).
2. Create a namespace, submit the domain-whitelisting request, add the
   generated TXT record to DNS and verify. Propagation takes 15 minutes to
   48 hours — this is the long pole, so start it first.
3. Create a registry under the namespace using the NFH fabric subscriber
   schema.
4. Publish a subscriber record: subscriber ID (your domain), subscriber URL,
   type (CN or PN), the base64 ed25519 signing public key, countries.
5. Verify the key resolves:
   `https://fabric.nfh.global/registry/dedi/lookup/<subscriber_id>/subscribers.beckn.one/<record_id>`

Generate a keypair in the format step 4 wants with:

```bash
cd backend
node -e "import('./beckn/core/keys.js').then(k=>console.log(k.generateKeyPair()))"
```

Then set `BECKN_SUBSCRIBER_ID`, `BECKN_PRIVATE_KEY`, `BECKN_CALLBACK_URL` and
`BECKN_REGISTRY_URL` — see [`backend/.env.example`](../backend/.env.example).
Without them the app runs exactly as before and the Network page reports itself
unconfigured.

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
`beckn/registry/app.js` serves both forms and the client uses the second.

## Testing

| Suite | Covers |
|---|---|
| `tests/becknSigning.test.js` | key round-trips, signing string, keyId parsing, verification, tampering, expiry, clock skew |
| `tests/becknFlow.test.js` | end-to-end over real sockets: registration, fan-out discovery, select → init → confirm → status, with results validated against the pinned Catalog and Contract schemas |
| `tests/becknConformance.test.js` | the negative paths — unsigned, tampered, unknown subscriber, wrong scheme, missing context, action mismatch, unsupported version, v1-shaped payloads, unsupported action, replayed messageId |
| `tests/becknTopology.test.js` | gateway broadcast vs. direct fan-out, and key rotation through to revocation |
| `tests/networkRoutes.test.js` | the app-facing API: auth, graceful degradation when unconfigured, weak-concept suggestions |
| `src/pages/Network/NetworkPage.test.jsx` | the UI: concept chips, search, the enrolment walk, failure states |

The conformance suite is the interesting one. A happy-path demo proves a node
can talk; it does not prove the node rejects what it must reject, or that its
rejections are themselves well-formed. Every case there goes over a real socket
against a real provider node, signed or deliberately mis-signed exactly as a
hostile peer would, and the responses are validated against the spec's own
`Ack` and `Nack*` schemas.

```
npm run beckn:conform
```
