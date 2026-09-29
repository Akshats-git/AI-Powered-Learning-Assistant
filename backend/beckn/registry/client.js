// Registry lookup with a small TTL cache.
//
// Every inbound request triggers a key lookup, so an uncached client would put
// the registry on the critical path of every single message on the network.
// The cache is keyed by subscriber *and* key id together — see the note in
// store.js about beckn-onix#929.

export const createRegistryClient = ({ baseUrl, ttlMs = 5 * 60 * 1000, fetchImpl = fetch, now = Date.now }) => {
  const cache = new Map();

  const lookup = async ({ subscriberId, keyId }) => {
    const cacheKey = `${subscriberId}:${keyId}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.record;

    const response = await fetchImpl(
      `${baseUrl}/registry/dedi/lookup/${encodeURIComponent(subscriberId)}/subscribers.beckn.one/${encodeURIComponent(cacheKey)}`
    );
    if (!response.ok) return null;

    const record = await response.json();
    cache.set(cacheKey, { record, expiresAt: now() + ttlMs });
    return record;
  };

  return {
    lookup,
    // The shape core/signing.js wants: a parsed keyId in, a public key out.
    lookupKey: async (parsedKeyId) => (await lookup(parsedKeyId))?.signingPublicKey ?? null,

    async subscribers(filter = {}) {
      const query = new URLSearchParams(filter).toString();
      const response = await fetchImpl(`${baseUrl}/registry/subscribers${query ? `?${query}` : ""}`);
      if (!response.ok) return [];
      return (await response.json()).subscribers;
    },

    clearCache: () => cache.clear(),
  };
};
