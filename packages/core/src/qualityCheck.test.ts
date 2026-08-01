import { describe, expect, it } from "vitest";
import { qualityCheck } from "./qualityCheck";
import type { QualityCheckRules, QualityCheckStatus } from "./types";

type BudgetRow = {
  Poste: string;
  Trimestre: string;
  Budget: number | null;
  Réalisé: number;
  EcartPct: number;
};

// 3 postes x 4 trimestres, each row within +/-5% of budget, whole amounts, no duplicates.
function buildCleanRows(): BudgetRow[] {
  return [
    { Poste: "Marketing", Trimestre: "T1", Budget: 1000, Réalisé: 980, EcartPct: -0.02 },
    { Poste: "Marketing", Trimestre: "T2", Budget: 1000, Réalisé: 1020, EcartPct: 0.02 },
    { Poste: "Marketing", Trimestre: "T3", Budget: 1000, Réalisé: 950, EcartPct: -0.05 },
    { Poste: "Marketing", Trimestre: "T4", Budget: 1000, Réalisé: 1040, EcartPct: 0.04 },
    { Poste: "R&D", Trimestre: "T1", Budget: 1500, Réalisé: 1470, EcartPct: -0.02 },
    { Poste: "R&D", Trimestre: "T2", Budget: 1500, Réalisé: 1530, EcartPct: 0.02 },
    { Poste: "R&D", Trimestre: "T3", Budget: 1500, Réalisé: 1550, EcartPct: 0.0333 },
    { Poste: "R&D", Trimestre: "T4", Budget: 1500, Réalisé: 1480, EcartPct: -0.0133 },
    { Poste: "Ventes", Trimestre: "T1", Budget: 2000, Réalisé: 2100, EcartPct: 0.05 },
    { Poste: "Ventes", Trimestre: "T2", Budget: 2000, Réalisé: 1950, EcartPct: -0.025 },
    { Poste: "Ventes", Trimestre: "T3", Budget: 2000, Réalisé: 2080, EcartPct: 0.04 },
    { Poste: "Ventes", Trimestre: "T4", Budget: 2000, Réalisé: 1960, EcartPct: -0.02 },
  ];
}

function buildCleanRules(): QualityCheckRules {
  return {
    duplicateKeyColumns: ["Poste", "Trimestre"],
    totalsConsistency: { rowField: "Poste", measureField: "Réalisé", aggregation: "sum" },
    threshold: { field: "EcartPct", max: 0.1 },
    roundedAmounts: { enabled: true, field: "Réalisé", decimals: 0 },
  };
}

function statusOf(results: ReturnType<typeof qualityCheck>, check: string): QualityCheckStatus {
  const result = results.find((r) => r.check === check);
  if (!result) throw new Error(`missing check: ${check}`);
  return result.status;
}

describe("qualityCheck", () => {
  it("returns six 'ok' statuses on a clean dataset", () => {
    const results = qualityCheck(buildCleanRows(), buildCleanRules());

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.check)).toEqual([
      "rows_analyzed",
      "empty_cells",
      "totals_consistency",
      "duplicate_rows",
      "threshold_breach",
      "rounded_amounts",
    ]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  it("flags rows_analyzed when there is nothing to analyze", () => {
    const results = qualityCheck([] as BudgetRow[], buildCleanRules());

    expect(statusOf(results, "rows_analyzed")).toBe("attention");
    // every other check is vacuously fine on an empty dataset
    expect(statusOf(results, "empty_cells")).toBe("ok");
    expect(statusOf(results, "duplicate_rows")).toBe("ok");
    expect(statusOf(results, "threshold_breach")).toBe("ok");
  });

  it("flags empty_cells when a required column is blank", () => {
    const rows = buildCleanRows();
    rows[0]!.Budget = null;

    const results = qualityCheck(rows, buildCleanRules());
    const emptyCells = results.find((r) => r.check === "empty_cells")!;

    expect(emptyCells.status).toBe("attention");
    expect(emptyCells.value).toBe(1);
    expect(emptyCells.message).toContain("Budget");
  });

  it("flags totals_consistency when the aggregation can't reconstruct the grand total", () => {
    const rules = buildCleanRules();
    rules.totalsConsistency = { rowField: "Poste", measureField: "Réalisé", aggregation: "avg" };

    const results = qualityCheck(buildCleanRows(), rules);

    expect(statusOf(results, "totals_consistency")).toBe("attention");
  });

  it("flags duplicate_rows when the key combination repeats", () => {
    const rows = buildCleanRows();
    rows.push({ ...rows[0]! });

    const results = qualityCheck(rows, buildCleanRules());
    const duplicates = results.find((r) => r.check === "duplicate_rows")!;

    expect(duplicates.status).toBe("attention");
    expect(duplicates.value).toBe(1);
  });

  it("flags threshold_breach when a variance exceeds the configured max", () => {
    const rows = buildCleanRows();
    rows[0]!.EcartPct = 0.25;

    const results = qualityCheck(rows, buildCleanRules());
    const breach = results.find((r) => r.check === "threshold_breach")!;

    expect(breach.status).toBe("attention");
    expect(breach.value).toBe(1);
  });

  it("flags rounded_amounts when hidden decimals are detected", () => {
    const rows = buildCleanRows();
    rows[0]!.Réalisé = 980.4;

    const results = qualityCheck(rows, buildCleanRules());
    const rounded = results.find((r) => r.check === "rounded_amounts")!;

    expect(rounded.status).toBe("attention");
    expect(rounded.value).toBe(1);
  });

  it("reports rounded_amounts as ok (disabled) when the option is off", () => {
    const rows = buildCleanRows();
    rows[0]!.Réalisé = 980.4;
    const rules = buildCleanRules();
    rules.roundedAmounts = { enabled: false, field: "Réalisé" };

    const results = qualityCheck(rows, rules);

    expect(statusOf(results, "rounded_amounts")).toBe("ok");
  });
});
