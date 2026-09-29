// Runs the whole network end to end and narrates it: `npm run beckn:demo`.
//
// The scenario is the one the learning assistant actually motivates. The app's
// knowledge tracing has decided this learner is weak on a concept; instead of
// only offering its own generated material, it searches an open network for
// anything that teaches it, then enrols the learner with one provider.

import { startNetwork } from "./network.js";
import { buildItem } from "./bpp/catalog.js";

const silent = { warn: () => {}, info: () => {}, error: () => {} };
const WEAK_CONCEPT = "dijkstra";

const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
};

const step = (n, title) => console.log(`\n\x1b[1m${n}. ${title}\x1b[0m`);

const network = await startNetwork({
  logger: silent,
  providers: [
    { subscriberId: "learning-assistant.local" },
    {
      subscriberId: "open-university.local",
      provider: { id: "open-university", descriptor: { name: "Open University" } },
      items: [
        buildItem({
          id: "course-graphs-advanced",
          name: "Advanced graph theory",
          shortDesc: "Flow networks, matchings and planarity",
          kind: "course",
          concepts: ["graphs", "dijkstra", "max-flow"],
          level: "advanced",
          durationMinutes: 300,
          price: 999,
        }),
      ],
    },
  ],
});

try {
  step(1, "Network up");
  console.log(`   registry       ${network.registry.url}`);
  console.log(`   consumer node  ${network.consumer.url}  (${network.consumer.identity.subscriberId})`);
  for (const provider of network.providers) {
    console.log(`   provider node  ${provider.url}  (${provider.subscriberId})`);
  }

  const subscribers = await network.registry.client.subscribers();
  console.log(`\n   ${subscribers.length} subscriber records, all SUBSCRIBED, each publishing a 32-byte ed25519 key.`);

  step(2, `Learner is weak on "${WEAK_CONCEPT}" — searching the network`);
  const discovered = await post(`${network.consumer.url}/api/network/discover`, {
    intent: { tags: [{ descriptor: { code: "concept" }, value: WEAK_CONCEPT }] },
  });
  console.log(`   transactionId  ${discovered.transactionId}`);
  console.log(`   ${discovered.providers.length} provider node(s) answered:`);
  for (const provider of discovered.providers) {
    for (const item of provider.items) {
      const price = Number(item.price.value) === 0 ? "free" : `₹${item.price.value}`;
      console.log(`     - [${provider.descriptor.name}] ${item.descriptor.name} (${price})`);
    }
  }

  const chosen = { providerSubscriberId: "open-university.local", transactionId: discovered.transactionId };
  const order = { items: [{ id: "course-graphs-advanced" }] };
  const billing = { name: "Akshat", email: "learner@example.com" };

  step(3, "select — asking that provider to quote");
  const selected = await post(`${network.consumer.url}/api/network/select`, { ...chosen, message: { order } });
  console.log(`   quote          ₹${selected.order.quote.price.value}`);

  step(4, "init — adding billing details");
  const initialised = await post(`${network.consumer.url}/api/network/init`, {
    ...chosen,
    message: { order: { ...order, billing } },
  });
  console.log(`   fulfillment    ${initialised.order.fulfillment.state.descriptor.code}`);

  step(5, "confirm — placing the order");
  const confirmed = await post(`${network.consumer.url}/api/network/confirm`, {
    ...chosen,
    message: { order: { ...order, billing } },
  });
  console.log(`   order id       ${confirmed.order.id}`);
  console.log(`   state          ${confirmed.order.state} / ${confirmed.order.fulfillment.state.descriptor.code}`);

  step(6, "status — reading it back from the provider");
  const status = await post(`${network.consumer.url}/api/network/status`, {
    ...chosen,
    message: { orderId: confirmed.order.id },
  });
  console.log(`   ${status.order.id} is ${status.order.state}, enrolled in "${status.order.items[0].descriptor.name}"`);

  console.log("\n\x1b[32mEvery request above was ed25519-signed and verified against a registry lookup.\x1b[0m\n");
} finally {
  await network.stop();
}
