import { buildServer } from "./server";

// Loads ANTHROPIC_API_KEY (needed only when ENGINE=claude) and any other
// local config from .env. Silently a no-op if .env doesn't exist — real
// deployments inject env vars directly instead.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine, ENGINE defaults to "rule" which needs no key.
}

const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`@trame/api listening on http://localhost:${PORT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
