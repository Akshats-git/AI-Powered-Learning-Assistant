// Runs one network node as its own process: `node beckn/serve.js <role>`.
//
// The demo starts a whole network inside one process, which is right for a
// walkthrough and wrong for everything else — nodes on a real subnet are
// separate deployments that only reach each other over HTTP. This entrypoint
// is what docker-compose uses to run the registry, the gateway and the
// provider nodes as genuinely separate services.
//
// The consumer node is not here: this app *is* the consumer node, served by
// the main API at /api/network (see utils/becknNode.js).

import { createRegistryApp } from "./registry/app.js";
import { createRegistryClient } from "./registry/client.js";
import { createGatewayApp } from "./gateway/app.js";
import { createBppApp } from "./bpp/app.js";
import { generateKeyPair } from "./core/keys.js";

const role = process.argv[2] || process.env.BECKN_ROLE;
const port = Number(process.env.PORT || 9000);
const subscriberId = process.env.BECKN_SUBSCRIBER_ID || `${role}.learn.local`;
const publicUrl = process.env.BECKN_PUBLIC_URL || `http://localhost:${port}`;
const registryUrl = process.env.BECKN_REGISTRY_URL;
const keyId = process.env.BECKN_KEY_ID || "key-1";

const log = (message) => console.log(`[beckn:${role}] ${message}`);

/**
 * Publishes this node's record, retrying while the registry comes up.
 *
 * Compose starts everything at once, so a node can be ready before the
 * registry is. Exiting would make the container flap; retrying is what a real
 * participant does when the fabric is briefly unreachable.
 */
const subscribe = async ({ type, signingPublicKey }) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${registryUrl}/registry/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId, url: publicUrl, type, keyId, signingPublicKey, countries: ["IND"] }),
      });
      if (response.ok) return log(`subscribed to ${registryUrl} as ${type}`);
    } catch {
      // registry not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  log(`WARNING: could not subscribe to ${registryUrl} — this node is unreachable by peers`);
};

const start = (app) =>
  app.listen(port, () => log(`${subscriberId} listening on ${port} (public: ${publicUrl})`));

if (role === "registry") {
  start(createRegistryApp());
} else if (role === "gateway" || role === "provider") {
  if (!registryUrl) {
    console.error(`[beckn:${role}] BECKN_REGISTRY_URL is required`);
    process.exit(1);
  }

  // Keys are generated at boot and published immediately. Fine for a demo
  // subnet; a real participant holds a long-lived key whose public half is in
  // its DeDi record, and rotates it deliberately (see registry/store.js).
  const { publicKey, privateKey } = generateKeyPair();
  const identity = { subscriberId, keyId, privateKey, uri: publicUrl };
  const registry = createRegistryClient({ baseUrl: registryUrl });

  const app =
    role === "gateway"
      ? createGatewayApp({ identity, lookupKey: registry.lookupKey, registry })
      : createBppApp({ identity, lookupKey: registry.lookupKey });

  start(app);
  await subscribe({ type: role === "gateway" ? "BG" : "PN", signingPublicKey: publicKey });
} else {
  console.error("usage: node beckn/serve.js <registry|gateway|provider>");
  process.exit(1);
}
