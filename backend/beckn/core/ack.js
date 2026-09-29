// Acknowledgement envelopes.
//
// Beckn is asynchronous: a node answers a forward action immediately with an
// ACK meaning "accepted, I'll call you back", not with the business result.
// The result arrives later on the caller's own `/on_*` endpoint. A NACK means
// the request was rejected outright and no callback will ever come — so a
// caller that treats NACK as "wait for the callback" hangs forever.
//
// The three rejection shapes are the ones named in beckn.yaml.

export const ACK = () => ({ message: { ack: { status: "ACK" } } });

const nack = (code, message) => ({
  message: { ack: { status: "NACK" } },
  error: { code, message },
});

export const NACK_BAD_REQUEST = (message = "Bad request") => nack("BAD_REQUEST", message);
export const NACK_UNAUTHORIZED = (message = "Unauthorized") => nack("UNAUTHORIZED", message);
export const SERVER_ERROR = (message = "Internal server error") => nack("INTERNAL_SERVER_ERROR", message);

export const NACK_STATUS = { BAD_REQUEST: 400, UNAUTHORIZED: 401, INTERNAL_SERVER_ERROR: 500 };
