// Builds this app's consumer node from the environment, once, lazily.
//
// The node is optional. Without BECKN_SUBSCRIBER_ID, BECKN_PRIVATE_KEY and
// BECKN_REGISTRY_URL the network routes report themselves unconfigured and
// every other feature carries on as before — the same posture the app already
// takes towards OPENAI_API_KEY. Nobody running this locally to read a PDF
// should have to onboard to a Beckn subnet first.
//
// Generate a keypair for BECKN_PRIVATE_KEY / the registry record with:
//   node -e "import('./beckn/core/keys.js').then(k=>console.log(k.generateKeyPair()))"

import { createBapApp } from "../beckn/bap/app.js";
import { createRegistryClient } from "../beckn/registry/client.js";
import { logger } from "./logger.js";

let node = null;
let resolved = false;

export const becknConfig = (env = process.env) => ({
  subscriberId: env.BECKN_SUBSCRIBER_ID,
  keyId: env.BECKN_KEY_ID || "key-1",
  privateKey: env.BECKN_PRIVATE_KEY,
  uri: env.BECKN_CALLBACK_URL,
  registryUrl: env.BECKN_REGISTRY_URL,
  gatewayId: env.BECKN_GATEWAY_ID,
  gatewayUrl: env.BECKN_GATEWAY_URL,
  networkId: env.BECKN_NETWORK_ID || "beckn.local",
});

export const isBecknConfigured = (env = process.env) => {
  const { subscriberId, privateKey, uri, registryUrl } = becknConfig(env);
  return Boolean(subscriberId && privateKey && uri && registryUrl);
};

/** @returns the consumer node, or null when the app is not on a subnet. */
export const getBecknNode = (env = process.env) => {
  if (resolved) return node;
  resolved = true;

  if (!isBecknConfigured(env)) {
    logger.info("beckn: no subscriber configured — network features are off");
    return null;
  }

  const config = becknConfig(env);
  const registry = createRegistryClient({ baseUrl: config.registryUrl });

  node = createBapApp({
    identity: {
      subscriberId: config.subscriberId,
      keyId: config.keyId,
      privateKey: config.privateKey,
      uri: config.uri,
    },
    lookupKey: registry.lookupKey,
    registry,
    gateway: config.gatewayId && config.gatewayUrl
      ? { subscriberId: config.gatewayId, url: config.gatewayUrl }
      : undefined,
    networkId: config.networkId,
    logger,
  });

  logger.info(`beckn: consumer node ${config.subscriberId} on ${config.networkId}`);
  return node;
};

// Tests build their own nodes; this lets them start from a clean slate.
export const resetBecknNode = () => {
  node = null;
  resolved = false;
};
