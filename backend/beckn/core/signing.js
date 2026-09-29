// Beckn HTTP Signatures (NFH-007). Every request on the network carries an
// `Authorization` header built here, and every receiver verifies it before
// looking at the body — an unsigned or badly signed request never reaches
// business logic.
//
// The signing string is three lines, and the signature covers a hash of the
// body rather than the body itself, so a receiver can verify without
// re-serialising JSON (key order would differ and the digest would not match):
//
//   (created): {unix seconds}
//   (expires): {unix seconds}
//   digest: BLAKE-512={base64 hash of the raw body bytes}
//
// Two details that are easy to get wrong, both settled upstream mid-2026:
//
//   - The digest label is the literal string `BLAKE-512`, standardised in
//     beckn/protocol-specifications-v2#183 (PR #186). The algorithm it names
//     is BLAKE2b-512 — Node calls that `blake2b512`. The label and the
//     algorithm name genuinely differ; this is not a typo.
//   - `keyId` is pipe-separated, `{subscriberId}|{keyId}|ed25519`, reverted to
//     the v1 format in issue #185 (PR #184) after a brief v2 alternative.
//
// Clock skew tolerance defaults to 60s, raised from 5s in issue #182 (PR #187).

import crypto from "crypto";
import { privateKeyFromBase64, publicKeyFromBase64 } from "./keys.js";

export const DIGEST_LABEL = "BLAKE-512";
export const DIGEST_ALGORITHM = "blake2b512";
export const DEFAULT_TTL_SECONDS = 30;
export const DEFAULT_CLOCK_SKEW_SECONDS = 60;

export const digestOf = (body) =>
  crypto.createHash(DIGEST_ALGORITHM).update(Buffer.from(body)).digest("base64");

export const buildSigningString = ({ created, expires, digest }) =>
  `(created): ${created}\n(expires): ${expires}\ndigest: ${DIGEST_LABEL}=${digest}`;

export const buildKeyId = ({ subscriberId, keyId }) => `${subscriberId}|${keyId}|ed25519`;

// A keyId is split from the right: subscriber ids are hostnames and key ids are
// opaque, so neither may contain "|", but splitting from the left would break
// the moment either did.
export const parseKeyId = (value) => {
  const parts = String(value || "").split("|");
  if (parts.length !== 3 || parts.some((p) => p === "")) return null;
  const [subscriberId, keyId, algorithm] = parts;
  if (algorithm !== "ed25519") return null;
  return { subscriberId, keyId, algorithm };
};

/**
 * @param body the exact bytes that will be sent — sign what goes on the wire,
 *   not an object that gets re-serialised afterwards.
 */
export const sign = ({ body, subscriberId, keyId, privateKey, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now }) => {
  const created = Math.floor(now() / 1000);
  const expires = created + ttlSeconds;
  const digest = digestOf(body);
  const signingString = buildSigningString({ created, expires, digest });
  const signature = crypto
    .sign(null, Buffer.from(signingString), privateKeyFromBase64(privateKey))
    .toString("base64");

  return (
    `Signature keyId="${buildKeyId({ subscriberId, keyId })}",algorithm="ed25519",` +
    `created="${created}",expires="${expires}",headers="(created) (expires) digest",` +
    `signature="${signature}"`
  );
};

// Tolerant of ordering and whitespace, strict about the scheme: anything that
// isn't a `Signature ...` header is rejected rather than half-parsed.
export const parseAuthorizationHeader = (header) => {
  const raw = String(header || "").trim();
  if (!/^Signature\s/i.test(raw)) return null;

  const params = {};
  for (const match of raw.slice("Signature".length).matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) {
    params[match[1]] = match[2];
  }
  if (!params.keyId || !params.signature || !params.created || !params.expires) return null;
  return params;
};

export class SignatureError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SignatureError";
    this.reason = reason;
  }
}

/**
 * @param lookupKey async (parsedKeyId) => base64 public key, or null when the
 *   participant or key is unknown. Injected rather than imported so this stays
 *   usable against a registry, a cache, or a test double.
 * @returns the parsed keyId on success; throws SignatureError otherwise.
 */
export const verify = async ({
  body,
  authorization,
  lookupKey,
  clockSkewSeconds = DEFAULT_CLOCK_SKEW_SECONDS,
  now = Date.now,
}) => {
  const params = parseAuthorizationHeader(authorization);
  if (!params) throw new SignatureError("missing or malformed Authorization header");

  const parsedKeyId = parseKeyId(params.keyId);
  if (!parsedKeyId) throw new SignatureError("malformed keyId");

  const created = Number(params.created);
  const expires = Number(params.expires);
  if (!Number.isFinite(created) || !Number.isFinite(expires)) throw new SignatureError("malformed created/expires");

  const nowSeconds = Math.floor(now() / 1000);
  if (nowSeconds > expires + clockSkewSeconds) throw new SignatureError("signature expired");
  if (created > nowSeconds + clockSkewSeconds) throw new SignatureError("signature created in the future");

  const publicKey = await lookupKey(parsedKeyId);
  if (!publicKey) throw new SignatureError("unknown subscriber or key");

  // The digest is recomputed from the received bytes: a tampered body produces
  // a different digest, a different signing string, and a failed verify.
  const signingString = buildSigningString({ created, expires, digest: digestOf(body) });

  let ok = false;
  try {
    ok = crypto.verify(
      null,
      Buffer.from(signingString),
      publicKeyFromBase64(publicKey),
      Buffer.from(params.signature, "base64")
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new SignatureError("signature verification failed");

  return parsedKeyId;
};
