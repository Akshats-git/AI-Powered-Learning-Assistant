// Subscriber records, in the shape the NFH fabric publishes them.
//
// On the real network these live in a DeDi registry under a DNS-verified
// namespace (dedi.global -> namespace -> registry -> subscriber record). This
// is the same record shape, held in memory, so the whole network runs offline
// in tests and in `npm run beckn:demo`. Swapping in the hosted fabric means
// changing the lookup URL in beckn/registry/client.js and nothing else.

export const CONSUMER_NODE = "CN";
export const PROVIDER_NODE = "PN";
export const GATEWAY = "BG";

export const createSubscriberStore = () => {
  const records = new Map();

  return {
    /**
     * @param record { subscriberId, url, type, signingPublicKey, keyId, countries }
     *   `type` is CN, PN or BG — v2's names for what v1 called BAP, BPP and
     *   the gateway.
     *
     * A participant may hold several keys at once. Records are keyed by
     * subscriber *and* key id, so publishing a new key adds a record rather
     * than replacing the old one — which is what makes rotation possible at
     * all: messages signed with the outgoing key keep verifying until it is
     * explicitly revoked, instead of failing the moment the new one appears.
     */
    put(record) {
      const recordId = `${record.subscriberId}:${record.keyId}`;
      records.set(recordId, { ...record, recordId, status: "SUBSCRIBED" });
      return recordId;
    },

    /** Revokes one key, leaving the participant's other keys valid. */
    revoke(subscriberId, keyId) {
      const record = records.get(`${subscriberId}:${keyId}`);
      if (!record) return false;
      records.set(record.recordId, { ...record, status: "REVOKED" });
      return true;
    },

    keysFor(subscriberId) {
      return [...records.values()].filter((record) => record.subscriberId === subscriberId);
    },

    // Keyed by subscriber *and* key id together. Keying on either alone is the
    // cache-collision bug reported against beckn-onix (#929), where one
    // subscriber's signing key can be served for another.
    get(subscriberId, keyId) {
      const record = records.get(`${subscriberId}:${keyId}`) || null;
      // A revoked key must stop verifying signatures, so it is absent from a
      // lookup rather than returned with a status the caller might ignore.
      return record?.status === "REVOKED" ? null : record;
    },

    list(filter = {}) {
      return [...records.values()].filter(
        (record) =>
          record.status === "SUBSCRIBED" &&
          Object.entries(filter).every(([field, value]) => record[field] === value)
      );
    },

    clear() {
      records.clear();
    },
  };
};
