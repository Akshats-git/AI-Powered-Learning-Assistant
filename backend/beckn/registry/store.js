// Subscriber records, in the shape the NFH fabric publishes them.
//
// On the real network these live in a DeDi registry under a DNS-verified
// namespace (dedi.global -> namespace -> registry -> subscriber record). This
// is the same record shape, held in memory, so the whole network runs offline
// in tests and in `npm run beckn:demo`. Swapping in the hosted fabric means
// changing the lookup URL in beckn/registry/client.js and nothing else.

export const CONSUMER_NODE = "CN";
export const PROVIDER_NODE = "PN";

export const createSubscriberStore = () => {
  const records = new Map();

  return {
    /**
     * @param record { subscriberId, url, type, signingPublicKey, keyId, countries }
     *   `type` is CN or PN — v2's names for what v1 called BAP and BPP.
     */
    put(record) {
      const recordId = `${record.subscriberId}:${record.keyId}`;
      records.set(recordId, { ...record, recordId, status: "SUBSCRIBED" });
      return recordId;
    },

    // Keyed by subscriber *and* key id together. Keying on either alone is the
    // cache-collision bug reported against beckn-onix (#929), where one
    // subscriber's signing key can be served for another.
    get(subscriberId, keyId) {
      return records.get(`${subscriberId}:${keyId}`) || null;
    },

    list(filter = {}) {
      return [...records.values()].filter((record) =>
        Object.entries(filter).every(([field, value]) => record[field] === value)
      );
    },

    clear() {
      records.clear();
    },
  };
};
