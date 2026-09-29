// Outbound side of the wire: serialise once, sign those exact bytes, POST them.
//
// The single `payload` serialisation matters. Signing a re-serialised copy of
// the object would be a coin flip — any difference in key order or whitespace
// changes the digest and the receiver rejects a request that was never
// tampered with.

import { sign } from "./signing.js";

export class BecknTransportError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "BecknTransportError";
    this.status = status;
    this.body = body;
  }
}

/**
 * @param identity { subscriberId, keyId, privateKey } of the sending node.
 * @param retries transport-level retries only. A NACK is a considered answer,
 *   not a blip — retrying it just repeats a rejection the peer already made.
 */
export const postSigned = async ({ url, payload, identity, retries = 2, fetchImpl = fetch, now = Date.now }) => {
  const body = JSON.stringify(payload);
  const authorization = sign({ body, ...identity, now });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body,
      });

      const text = await response.text();
      const parsed = text ? JSON.parse(text) : null;

      if (response.status >= 500) throw new BecknTransportError(`peer returned ${response.status}`, { status: response.status, body: parsed });
      return { status: response.status, body: parsed, signature: response.headers.get("Signature") };
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2 ** attempt * 100));
    }
  }
  throw lastError;
};
