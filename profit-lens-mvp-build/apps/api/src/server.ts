import { createContainer } from "./container.js";
import { buildApp } from "./http/app.js";

async function main(): Promise<void> {
  const container = createContainer();
  const app = await buildApp(container);

  const shutdown = async (signal: string): Promise<void> => {
    container.logger.info({ signal }, "Shutting down API server");
    await app.close();
    await container.dispose();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: container.env.PORT, host: container.env.HOST });
  container.logger.info(
    { port: container.env.PORT },
    "ProfitLens API listening",
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during startup:", error);
  process.exit(1);
});
