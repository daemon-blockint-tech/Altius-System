/**
 * Data Connection Agent entrypoint — the process a customer runs on an
 * isolated server/VM inside their network.
 *
 * Deliberately opens NO listening socket: the agent's entire network
 * surface is outbound HTTPS to the platform gateway. Health is observable
 * from the platform (GET /api/v1/data-connection/status) — which is where
 * an operator watches every agent anyway — not from a local port.
 *
 * Environment:
 *   ALTIUS_PLATFORM_URL                 — gateway base URL (https://…), required
 *   DATA_CONNECTION_ENROLLMENT_SECRET   — shared enrollment secret, required
 *   AGENT_NAME                          — stable agent name (default: host name)
 *   AGENT_ALLOW_INSECURE_HTTP           — 'true' permits http:// (dev/test only)
 *   plus whatever ${ENV_VAR}s the leased datasources' connection URLs reference.
 */

import { createLogger } from "@altius/observability";
import { createDefaultRegistry } from "../connectors/default-registry.js";
import { DataConnectionAgent } from "./agent-runtime.js";

const logger = createLogger("data-connection-agent-main");

async function main(): Promise<void> {
  const platformUrl = process.env["ALTIUS_PLATFORM_URL"];
  const enrollmentSecret = process.env["DATA_CONNECTION_ENROLLMENT_SECRET"];
  if (!platformUrl || !enrollmentSecret) {
    logger.fatal(
      "ALTIUS_PLATFORM_URL and DATA_CONNECTION_ENROLLMENT_SECRET are required",
    );
    process.exit(1);
  }

  const agent = new DataConnectionAgent({
    platformUrl,
    enrollmentSecret,
    registry: createDefaultRegistry(),
    ...(process.env["AGENT_NAME"] ? { agentName: process.env["AGENT_NAME"] } : {}),
    ...(process.env["AGENT_ALLOW_INSECURE_HTTP"] === "true" ? { allowInsecureHttp: true } : {}),
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    agent
      .stop()
      .then(() => process.exit(0))
      .catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, "Shutdown error");
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await agent.start();
  logger.info("Data Connection Agent running (egress-only; no listening socket)");
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "Agent failed to start");
  process.exit(1);
});
