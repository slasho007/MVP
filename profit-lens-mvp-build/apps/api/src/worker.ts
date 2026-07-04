import { createContainer } from "./container.js";
import { closeWorkers, createWorkers } from "./queue/workers.js";

async function main(): Promise<void> {
  const container = createContainer();
  const workers = createWorkers(container);

  container.logger.info("ProfitLens worker started");

  const shutdown = async (signal: string): Promise<void> => {
    container.logger.info({ signal }, "Shutting down worker");
    await closeWorkers(workers);
    await container.dispose();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during worker startup:", error);
  process.exit(1);
});
