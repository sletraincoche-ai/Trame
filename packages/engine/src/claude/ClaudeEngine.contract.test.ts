import { describe } from "vitest";
import { defineClarificationEngineContractTests } from "../contract-tests/clarificationEngine.contract";
import { ClaudeEngine } from "./ClaudeEngine";

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

// Same contract RuleBasedEngine is tested against (CLAUDE.md: "deux
// implémentations... testées contre le même jeu de contrats"). Real API
// calls, so this skips itself when no key is available rather than failing
// CI for everyone — it runs for real whenever ANTHROPIC_API_KEY is set.
describe.skipIf(!hasApiKey)("ClaudeEngine (live API) — ClarificationEngine contract", () => {
  defineClarificationEngineContractTests(() => new ClaudeEngine(), { timeoutMs: 30_000 });
});
