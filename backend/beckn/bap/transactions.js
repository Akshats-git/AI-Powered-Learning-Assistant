// Correlates asynchronous callbacks back to the request that caused them.
//
// A consumer node sends /discover over one HTTP connection and receives
// /on_discover on a completely different one, possibly seconds later and
// possibly several times (one per provider node). Nothing about the second
// connection identifies the first except context.messageId, so every outbound
// request opens an entry here and every callback resolves against it.
//
// Discovery is the awkward one: there is no way to know how many provider
// nodes will answer, so the node waits a fixed collection window and returns
// whatever arrived. A window too short loses slow providers; too long and the
// user stares at a spinner. 2s is a reasonable default for a local network.
//
// In memory, so a restart loses in-flight transactions — fine for a single
// process, and the obvious thing to move to Mongo alongside the app's other
// collections when this runs on more than one instance.

export const createTransactionStore = ({ collectionWindowMs = 2000, now = Date.now } = {}) => {
  const windowMs = collectionWindowMs ?? 2000;
  const pending = new Map();

  return {
    /** Opens an entry for an outbound request and returns a promise of its results. */
    open({ messageId, transactionId, action, expectOne = false }) {
      const entry = {
        messageId,
        transactionId,
        action,
        results: [],
        openedAt: now(),
        expectOne,
      };

      entry.promise = new Promise((resolve) => {
        entry.resolve = () => {
          if (entry.settled) return;
          entry.settled = true;
          clearTimeout(entry.timer);
          pending.delete(messageId);
          resolve(entry.results);
        };
      });
      entry.timer = setTimeout(entry.resolve, windowMs);
      entry.timer.unref?.();

      pending.set(messageId, entry);
      return entry.promise;
    },

    /**
     * Files a callback against its request.
     * @returns false when nothing is waiting for it — an unsolicited callback,
     *   which is either a late arrival after the window closed or a peer
     *   replying to something this node never sent.
     */
    resolve(messageId, { context, message }) {
      const entry = pending.get(messageId);
      if (!entry) return false;

      entry.results.push({ context, message, receivedAt: now() });
      // Ordering actions have exactly one answer, so waiting out the rest of
      // the window after it arrives would add latency for nothing.
      if (entry.expectOne) entry.resolve();
      return true;
    },

    get size() {
      return pending.size;
    },
  };
};
