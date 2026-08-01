import { describe, expect, it } from "vitest";
import { generateFormula } from "./generateFormula";
import type { FormulaColumns } from "./types";

// Same column names as the dashboard mock: Poste (A), Budget (B), Réalisé (C).
const poste = { name: "Poste", position: 0 };
const budget = { name: "Budget", position: 1 };
const realise = { name: "Réalisé", position: 2 };

describe("generateFormula", () => {
  it("total_par_categorie: SOMME.SI.ENS over the value range, filtered by category", () => {
    const columns: FormulaColumns = { category: poste, value: realise, row: 2, lastDataRow: 50 };

    const result = generateFormula("total_par_categorie", columns);

    expect(result.formula).toBe("=SOMME.SI.ENS(C2:C50;A2:A50;A2)");
    expect(result.explanation).toContain("Réalisé");
    expect(result.explanation).toContain("Poste");
  });

  it("ecart: plain subtraction between the value and the reference", () => {
    const columns: FormulaColumns = { value: realise, reference: budget, row: 2 };

    const result = generateFormula("ecart", columns);

    expect(result.formula).toBe("=C2-B2");
  });

  it("ecart_pourcentage: variance expressed as a ratio of the reference", () => {
    const columns: FormulaColumns = { value: realise, reference: budget, row: 2 };

    const result = generateFormula("ecart_pourcentage", columns);

    expect(result.formula).toBe("=(C2-B2)/B2");
  });

  it("alerte_seuil: SI + ABS flags rows whose variance exceeds the threshold", () => {
    const columns: FormulaColumns = { value: realise, reference: budget, row: 2, threshold: 0.1 };

    const result = generateFormula("alerte_seuil", columns);

    expect(result.formula).toBe('=SI(ABS(C2-B2)/B2>0.1;"Alerte";"OK")');
  });

  it("does not hardcode column references: different columns/rows change the formula", () => {
    const original = generateFormula("ecart", { value: realise, reference: budget, row: 2 });
    const shifted = generateFormula("ecart", {
      value: { name: "Réalisé N+1", position: 4 }, // column E
      reference: { name: "Budget N+1", position: 3 }, // column D
      row: 5,
    });

    expect(shifted.formula).toBe("=E5-D5");
    expect(shifted.formula).not.toBe(original.formula);

    const originalTotal = generateFormula("total_par_categorie", {
      category: poste,
      value: realise,
      row: 2,
      lastDataRow: 50,
    });
    const shiftedTotal = generateFormula("total_par_categorie", {
      category: { name: "Région", position: 5 }, // column F
      value: { name: "Marge", position: 6 }, // column G
      row: 3,
      lastDataRow: 20,
    });

    expect(shiftedTotal.formula).toBe("=SOMME.SI.ENS(G2:G20;F2:F20;F3)");
    expect(shiftedTotal.formula).not.toBe(originalTotal.formula);
  });
});
