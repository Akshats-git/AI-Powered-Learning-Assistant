// Ed25519 keypairs for Beckn network participants.
//
// Beckn publishes and exchanges keys as raw 32-byte base64 — that's what goes
// into the DeDi subscriber record and what comes back from a registry lookup.
// Node's crypto only hands out (and only accepts) DER-wrapped keys, so every
// boundary between "our code" and "the network" needs the conversion below.
//
// An Ed25519 SPKI DER blob is a fixed 12-byte prefix followed by the 32 raw
// public-key bytes; PKCS8 is a fixed 16-byte prefix followed by the 32 raw
// seed bytes. Both prefixes are constant for Ed25519, so slicing and
// re-concatenating is exact, not a heuristic.

import crypto from "crypto";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKeyToBase64(publicKey),
    privateKey: privateKeyToBase64(privateKey),
  };
};

export const publicKeyToBase64 = (key) =>
  key.export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length).toString("base64");

export const privateKeyToBase64 = (key) =>
  key.export({ type: "pkcs8", format: "der" }).subarray(PKCS8_PREFIX.length).toString("base64");

export const publicKeyFromBase64 = (base64) => {
  const raw = Buffer.from(base64, "base64");
  if (raw.length !== 32) throw new Error(`Ed25519 public key must be 32 bytes, got ${raw.length}`);
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
};

export const privateKeyFromBase64 = (base64) => {
  const raw = Buffer.from(base64, "base64");
  if (raw.length !== 32) throw new Error(`Ed25519 private key seed must be 32 bytes, got ${raw.length}`);
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, raw]),
    format: "der",
    type: "pkcs8",
  });
};
