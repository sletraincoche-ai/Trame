import { buildServer } from "./server";

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
