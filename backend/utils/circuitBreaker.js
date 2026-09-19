// Fails fast when the LLM provider is down. Without it, an outage means every
// request (and every retry) waits out the SDK's own timeouts and backoff —
// hundreds of doomed calls queued up behind a provider that isn't answering —
// and the moment it recovers they all land at once.
//
// closed    -> normal; consecutive failures are counted
// open      -> after `failureThreshold` in a row, reject immediately for `resetMs`
// half-open -> after `resetMs`, let ONE probe through; success closes, failure re-opens
//
// In-process (one breaker per server instance), like utils/inFlightGuard.js.

export class CircuitOpenError extends Error {
  constructor(retryAfterSeconds) {
    super(`The AI provider is temporarily unavailable. Please try again in ${retryAfterSeconds}s.`);
    this.name = "CircuitOpenError";
    this.code = "CIRCUIT_OPEN";
    this.statusCode = 503;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const createCircuitBreaker = ({ failureThreshold = 5, resetMs = 30000, now = Date.now } = {}) => {
  let state = "closed";
  let consecutiveFailures = 0;
  let openedAt = 0;
  let probeInFlight = false;

  const onSuccess = () => {
    consecutiveFailures = 0;
    state = "closed";
    probeInFlight = false;
  };

  const onFailure = () => {
    probeInFlight = false;
    consecutiveFailures += 1;
    if (state === "half-open" || consecutiveFailures >= failureThreshold) {
      state = "open";
      openedAt = now();
    }
  };

  return {
    getState: () => (state === "open" && now() - openedAt >= resetMs ? "half-open" : state),

    /**
     * @param fn the provider call.
     * @param isFailure decides whether a thrown error counts against the provider.
     *   A user's own mistake (a bad key, a malformed request) must not — one
     *   person's typo would otherwise switch AI off for everyone.
     */
    run: async (fn, { isFailure = () => true } = {}) => {
      if (state === "open") {
        const elapsed = now() - openedAt;
        if (elapsed < resetMs) throw new CircuitOpenError(Math.ceil((resetMs - elapsed) / 1000));
        state = "half-open";
      }
      if (state === "half-open") {
        // Only one probe at a time; everyone else keeps failing fast until it reports back.
        if (probeInFlight) throw new CircuitOpenError(1);
        probeInFlight = true;
      }

      try {
        const result = await fn();
        onSuccess();
        return result;
      } catch (err) {
        if (isFailure(err)) onFailure();
        else if (state === "half-open") {
          // The probe reached the provider and got a client-side answer: the provider is up.
          onSuccess();
        }
        throw err;
      }
    },
  };
};

/** Network errors, timeouts, 5xx and 429 are the provider's problem; other 4xx are the caller's. */
export const isProviderFailure = (err) => {
  const status = err?.status ?? err?.response?.status;
  if (status === undefined || status === null) return true;
  return status >= 500 || status === 429;
};

export const providerBreaker = createCircuitBreaker({
  failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD) || 5,
  resetMs: Number(process.env.CIRCUIT_RESET_MS) || 30000,
});
