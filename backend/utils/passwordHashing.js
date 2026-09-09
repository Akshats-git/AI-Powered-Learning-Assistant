import argon2 from "argon2";
import bcrypt from "bcryptjs";

// argon2id over bcrypt: bcrypt's fixed ~4KB memory footprint is exactly what
// makes it crackable at scale on GPUs/ASICs; argon2's cost scales with
// memory too, which is what makes that kind of parallel brute-forcing
// expensive. It's also OWASP's Password Storage Cheat Sheet's first
// recommendation. Parameters follow OWASP's documented argon2id baseline —
// 19 MiB memory, 2 iterations, 1 degree of parallelism, the minimum they
// consider acceptable — chosen over the `argon2` package's own heavier
// built-in defaults (64 MiB / 3 iterations / 4 threads) to keep login
// latency predictable on typical hosting; raise these if the deployment
// target has memory and CPU to spare.
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const BCRYPT_HASH_PATTERN = /^\$2[aby]?\$/;

export const isBcryptHash = (hash) => BCRYPT_HASH_PATTERN.test(hash || "");
export const isArgon2Hash = (hash) => (hash || "").startsWith("$argon2");

export const hashPassword = (plaintext) => argon2.hash(plaintext, ARGON2_OPTIONS);

/**
 * Verifies a plaintext password against a stored hash, whichever algorithm
 * produced it. A mixed population of bcrypt (pre-migration) and argon2id
 * (post-migration) hashes is the expected steady state during the
 * transition — every existing user's password was hashed with bcrypt before
 * this shipped, and there's no way to re-hash it without their plaintext
 * password in hand, which only exists at the moment they log in.
 */
export const verifyPassword = (hash, plaintext) => (isBcryptHash(hash) ? bcrypt.compare(plaintext, hash) : argon2.verify(hash, plaintext));

/** True for any hash that isn't already argon2id — i.e. still needs migrating on next successful login. */
export const needsRehash = (hash) => !isArgon2Hash(hash);
