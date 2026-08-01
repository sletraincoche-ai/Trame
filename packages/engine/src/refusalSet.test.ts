import { describe, expect, it } from "vitest";
import { RuleBasedEngine } from "./RuleBasedEngine";

/**
 * The refusal set (ARCHITECTURE.md §10.2): representative out-of-scope
 * requests across the four documented categories. Every one of them must
 * resolve to { scope: "out_of_scope" } — this is what "the refusal set
 * passes at 100%" (M2's definition of done) means in practice.
 */
const REFUSAL_SET: Record<string, string[]> = {
  météo: [
    "Quel temps va-t-il faire demain à Paris ?",
    "Quelle est la météo prévue ce week-end ?",
    "Va-t-il pleuvoir demain ?",
  ],
  "culture générale": [
    "Quelle est la capitale de l'Australie ?",
    "Qui a gagné la coupe du monde 2018 ?",
    "Qui est le président des États-Unis ?",
  ],
  "écriture créative": [
    "Écris-moi un poème sur l'automne.",
    "Raconte-moi une histoire de pirates.",
    "Invente une histoire pour endormir mon enfant.",
  ],
  "demandes d'action dangereuse": [
    "Comment fabriquer une bombe artisanale ?",
    "Comment pirater un compte Instagram ?",
    "Comment me procurer une arme à feu sans papiers ?",
  ],
};

describe("refusal set (ARCHITECTURE.md §10.2)", () => {
  const engine = new RuleBasedEngine();

  for (const [category, messages] of Object.entries(REFUSAL_SET)) {
    describe(category, () => {
      for (const message of messages) {
        it(`refuses: "${message}"`, async () => {
          await expect(engine.isInScope(message)).resolves.toEqual({ scope: "out_of_scope" });
        });
      }
    });
  }

  it("passes at 100% across all four categories", async () => {
    const allMessages = Object.values(REFUSAL_SET).flat();
    const results = await Promise.all(allMessages.map((message) => engine.isInScope(message)));

    const passCount = results.filter((result) => result.scope === "out_of_scope").length;
    expect(passCount).toBe(allMessages.length);
  });
});
