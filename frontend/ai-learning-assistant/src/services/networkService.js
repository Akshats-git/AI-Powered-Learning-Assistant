import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

// The Beckn consumer node, via the app's own API — see docs/beckn.md. Each
// call here is one protocol action underneath, but the asynchronous ACK and
// callback are handled server-side, so these are ordinary awaited requests.

export const getNetworkStatus = () => axiosInstance.get(API_PATHS.NETWORK.STATUS);

export const getWeakConcepts = () => axiosInstance.get(API_PATHS.NETWORK.SUGGESTIONS);

export const discover = ({ concept, text }) =>
  axiosInstance.post(API_PATHS.NETWORK.DISCOVER, { concept, text });

const contractAction = (path) => (providerSubscriberId, transactionId, message) =>
  axiosInstance.post(path, { providerSubscriberId, transactionId, message });

export const select = contractAction(API_PATHS.NETWORK.SELECT);
export const init = contractAction(API_PATHS.NETWORK.INIT);
export const confirm = contractAction(API_PATHS.NETWORK.CONFIRM);

/** The commitment shape every contracting action takes — one resource, one offer. */
export const commitmentFor = (resource, offer) => [
  {
    status: { descriptor: { code: "DRAFT" } },
    resources: [{ id: resource.id, quantity: 1 }],
    offer: { id: offer.id, resourceIds: offer.resourceIds },
  },
];

export const priceOf = (offer) => {
  const attributes = offer?.considerations?.[0]?.considerationAttributes;
  return { currency: attributes?.priceCurrency ?? "INR", value: Number(attributes?.price ?? 0) };
};

export const offerForResource = (catalog, resourceId) =>
  catalog.offers?.find((offer) => offer.resourceIds?.includes(resourceId));
