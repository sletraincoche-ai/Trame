import { buildServer } from "./server";

// Loads ANTHROPIC_API_KEY (needed only when ENGINE=claude) and any other
// local config from the repo-root .env. Resolved relative to this file
// (not process.cwd()): pnpm runs this script with apps/api/ as the working
// directory, so a bare process.loadEnvFile() would silently look for
// apps/api/.env, never find it, and leave ANTHROPIC_API_KEY unset even
// though .env exists at the repo root. Silently a no-op if .env doesn't
// exist at all — real deployments inject env vars directly instead.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
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
