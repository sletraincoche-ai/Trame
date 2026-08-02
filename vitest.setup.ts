// Loads .env (ANTHROPIC_API_KEY, etc.) into process.env before any test
// runs. Silently a no-op if .env doesn't exist — most environments running
// this suite have no reason to have one, and the ClaudeEngine live tests
// that need the key skip themselves when it's absent.
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  // no .env file present — fine, live Claude tests will just skip.
}
