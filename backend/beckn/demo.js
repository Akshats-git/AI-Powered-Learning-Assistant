// Runs the whole network end to end and narrates it: `npm run beckn:demo`.
//
// The scenario is the one the learning assistant actually motivates. The app's
// knowledge tracing has decided this learner is weak on a concept; instead of
// only offering its own generated material, it searches an open network for
// anything that teaches it, then enrols the learner with one provider.

import { startNetwork } from "./network.js";
import { buildResource, buildOffer, conceptFilter, priceOf } from "./bpp/catalog.js";

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
      resources: [
        buildResource({
          id: "course-graphs-advanced",
          name: "Advanced graph theory",
          shortDesc: "Flow networks, matchings and planarity",
          kind: "course",
          concepts: ["graphs", "dijkstra", "max-flow"],
          level: "advanced",
          durationMinutes: 300,
        }),
      ],
      offers: [
        buildOffer({
          id: "offer-graphs-advanced",
          resourceIds: ["course-graphs-advanced"],
          name: "Course enrolment",
          value: 999,
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
    intent: { filters: conceptFilter(WEAK_CONCEPT) },
  });
  console.log(`   transactionId  ${discovered.transactionId}`);
  console.log(`   jsonpath       ${conceptFilter(WEAK_CONCEPT).expression}`);
  console.log(`   ${discovered.catalogs.length} catalog(s) returned:`);
  for (const catalog of discovered.catalogs) {
    for (const resource of catalog.resources) {
      const offer = catalog.offers.find((candidate) => candidate.resourceIds.includes(resource.id));
      const { value } = offer ? priceOf(offer) : { value: 0 };
      console.log(`     - [${catalog.provider.descriptor.name}] ${resource.descriptor.name} (${value === 0 ? "free" : `₹${value}`})`);
    }
  }

  const chosen = { providerSubscriberId: "open-university.local", transactionId: discovered.transactionId };
  const commitments = [
    {
      status: { descriptor: { code: "DRAFT" } },
      resources: [{ id: "course-graphs-advanced", quantity: 1 }],
      offer: { id: "offer-graphs-advanced", resourceIds: ["course-graphs-advanced"] },
    },
  ];
  const participants = [{ id: "learner-1", descriptor: { name: "Akshat" } }];

  step(3, "select — asking that provider to quote");
  const selected = await post(`${network.consumer.url}/api/network/select`, {
    ...chosen,
    message: { contract: { commitments } },
  });
  console.log(`   consideration  ₹${selected.contract.consideration[0].considerationAttributes.price}`);
  console.log(`   status         ${selected.contract.status.code}`);

  step(4, "init — adding the learner as a participant");
  const initialised = await post(`${network.consumer.url}/api/network/init`, {
    ...chosen,
    message: { contract: { commitments, participants } },
  });
  console.log(`   performance    ${initialised.contract.performance[0].status.code}`);

  step(5, "confirm — agreeing the contract");
  const confirmed = await post(`${network.consumer.url}/api/network/confirm`, {
    ...chosen,
    message: { contract: { commitments, participants } },
  });
  console.log(`   contract id    ${confirmed.contract.id}`);
  console.log(`   status         ${confirmed.contract.status.code} / ${confirmed.contract.performance[0].status.code}`);

  step(6, "status — reading it back from the provider");
  const status = await post(`${network.consumer.url}/api/network/status`, {
    ...chosen,
    message: { contract: { id: confirmed.contract.id, commitments: confirmed.contract.commitments } },
  });
  const enrolled = status.contract.commitments[0].resources[0].descriptor.name;
  console.log(`   contract is ${status.contract.status.code} — enrolled in "${enrolled}"`);

  console.log(
    "\n\x1b[32mEvery request above was ed25519-signed, verified against a registry lookup,\n" +
      "and validated against the pinned v2.0.0 schemas in beckn/spec/beckn.yaml.\x1b[0m\n"
  );
} finally {
  await network.stop();
}
