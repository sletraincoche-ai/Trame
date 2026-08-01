import type { FileProfile } from "@trame/core";
import { describe, expect, it } from "vitest";
import type { ClarificationEngine } from "../types";

// These fixtures are plain FileProfile objects (not real profiled workbooks):
// the contract only cares about how an engine reacts to a given profile shape,
// not about how that profile was produced.
function cleanProfile(): FileProfile {
  return {
    filePath: "clean.xlsx",
    sheetName: "Sheet1",
    rowCount: 3,
    columns: [
      { name: "Poste", position: 0, type: "text", missingCount: 0, missingRate: 0 },
      { name: "Montant", position: 1, type: "number", missingCount: 0, missingRate: 0 },
    ],
    duplicateRows: [],
    ambiguities: [],
  };
}

function profileWithDateAmbiguity(): FileProfile {
  return {
    ...cleanProfile(),
    ambiguities: [
      {
        kind: "ambiguous-date-columns",
        columnNames: ["CreatedAt", "UpdatedAt", "DueDate"],
        message: "placeholder",
      },
    ],
  };
}

function profileWithDuplicates(): FileProfile {
  return {
    ...cleanProfile(),
    duplicateRows: [{ rowNumbers: [2, 5], occurrences: 2 }],
  };
}

/**
 * Behavioral contract every ClarificationEngine implementation must satisfy.
 * Written against `ClarificationEngine`'s public methods only: it must keep
 * passing unchanged when RuleBasedEngine is later replaced/complemented by
 * ClaudeEngine, so it never asserts on exact wording or formula syntax.
 */
export function defineClarificationEngineContractTests(createEngine: () => ClarificationEngine): void {
  describe("ClarificationEngine contract", () => {
    describe("isInScope", () => {
      it("accepts a clearly in-scope spreadsheet request", async () => {
        const engine = createEngine();
        await expect(
          engine.isInScope("Peux-tu calculer le total par catégorie dans ce fichier Excel ?")
        ).resolves.toBe(true);
      });

      it("rejects a clearly out-of-scope request", async () => {
        const engine = createEngine();
        await expect(engine.isInScope("Quel temps fait-il à Paris demain ?")).resolves.toBe(false);
      });
    });

    describe("proposeQuestions", () => {
      it("asks about ambiguous date columns when the profile has that ambiguity", async () => {
        const engine = createEngine();
        const questions = await engine.proposeQuestions(profileWithDateAmbiguity());

        expect(questions.length).toBeGreaterThan(0);
        expect(questions.some((question) => question.kind === "ambiguous-date-columns")).toBe(true);
        for (const question of questions) {
          expect(question.text.length).toBeGreaterThan(0);
        }
      });

      it("asks about duplicate rows when the profile has duplicates", async () => {
        const engine = createEngine();
        const questions = await engine.proposeQuestions(profileWithDuplicates());

        expect(questions.some((question) => question.kind === "duplicate-rows")).toBe(true);
      });

      it("asks nothing when the profile is clean", async () => {
        const engine = createEngine();
        const questions = await engine.proposeQuestions(cleanProfile());

        expect(questions).toEqual([]);
      });
    });

    describe("generateFormula", () => {
      it("produces a non-empty formula and explanation for every known intent", async () => {
        const engine = createEngine();
        const columns: Parameters<ClarificationEngine["generateFormula"]>[1] = [
          { name: "Poste", position: 0, role: "category" },
          { name: "Budget", position: 1, role: "reference" },
          { name: "Réalisé", position: 2, role: "value" },
        ];

        for (const intent of ["total_par_categorie", "ecart", "ecart_pourcentage", "alerte_seuil"]) {
          const result = await engine.generateFormula(intent, columns);
          expect(result.formula.length).toBeGreaterThan(0);
          expect(result.explanation.length).toBeGreaterThan(0);
        }
      });

      it("reflects the columns given rather than hardcoding a formula", async () => {
        const engine = createEngine();
        const first = await engine.generateFormula("ecart", [
          { name: "Réalisé", position: 2, role: "value" },
          { name: "Budget", position: 1, role: "reference" },
        ]);
        const second = await engine.generateFormula("ecart", [
          { name: "Réalisé N+1", position: 4, role: "value" },
          { name: "Budget N+1", position: 3, role: "reference" },
        ]);

        expect(second.formula).not.toBe(first.formula);
      });

      it("rejects an unknown intent", async () => {
        const engine = createEngine();
        await expect(engine.generateFormula("intent_qui_n_existe_pas", [])).rejects.toThrow();
      });
    });
  });
}
