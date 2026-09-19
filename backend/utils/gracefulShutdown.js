import { logger } from "./logger.js";

let draining = false;

/** True once shutdown has begun — /ready reports 503 so the orchestrator stops routing here. */
export const isDraining = () => draining;

/**
 * SIGTERM/SIGINT: stop accepting connections, let in-flight requests finish,
 * close dependencies, exit. Without this every deploy cuts requests off
 * mid-flight — an AI generation half-paid-for and never saved.
 *
 * @param server the http.Server from app.listen().
 * @param onClose async cleanup run once the server has drained (close Mongo).
 * @param timeoutMs hard cap: requests still running after this are abandoned.
 * @returns the shutdown function (also exported so tests can call it directly).
 */
export const installGracefulShutdown = ({ server, onClose = async () => {}, timeoutMs = 15000, exit = process.exit, signals = ["SIGTERM", "SIGINT"] } = {}) => {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    draining = true;
    logger.info({ signal }, "Shutting down: no longer accepting connections, draining in-flight requests");

    const forceTimer = setTimeout(() => {
      logger.error({ timeoutMs }, "Graceful shutdown timed out — exiting with requests still in flight");
      exit(1);
    }, timeoutMs);
    forceTimer.unref();

    // Idle keep-alive sockets would otherwise hold close() open until they time out.
    server.closeIdleConnections?.();
    await new Promise((resolve) => server.close(resolve));

    try {
      await onClose();
    } catch (err) {
      logger.error({ err: err.message }, "Error while closing dependencies during shutdown");
      clearTimeout(forceTimer);
      exit(1);
      return;
    }

    clearTimeout(forceTimer);
    logger.info("Shutdown complete");
    exit(0);
  };

  for (const signal of signals) process.once(signal, () => shutdown(signal));
  return shutdown;
};

// Test hook: draining is module state.
export const resetDrainingForTests = () => {
  draining = false;
};
