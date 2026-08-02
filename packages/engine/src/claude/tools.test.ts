import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAssembleWorkbook, runComputePivot, runProfileFile, runQualityCheck } from "./tools";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-claude-tools-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("Claude tool handlers delegate to packages/core (never compute anything themselves)", () => {
  it("profile_file delegates to profileWorkbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Poste", "Montant"]);
    sheet.addRow(["Marketing", 1000]);
    const filePath = join(workDir, "profile.xlsx");
    await workbook.xlsx.writeFile(filePath);

    const profile = (await runProfileFile({ filePath })) as { columns: { name: string }[]; rowCount: number };

    expect(profile.rowCount).toBe(1);
    expect(profile.columns.map((c) => c.name)).toEqual(["Poste", "Montant"]);
  });

  it("compute_pivot delegates to computePivot", () => {
    const rows = [
      { region: "North", amount: 100 },
      { region: "South", amount: 200 },
    ];

    const pivot = runComputePivot({ rows, rowField: "region", measureField: "amount", aggregation: "sum" }) as {
      grandTotal: number;
    };

    expect(pivot.grandTotal).toBe(300);
  });

  it("quality_check delegates to qualityCheck", () => {
    const rows = [{ Poste: "A", Montant: 100 }];
    const result = runQualityCheck({
      rows,
      rules: {
        duplicateKeyColumns: ["Poste"],
        totalsConsistency: { rowField: "Poste", measureField: "Montant", aggregation: "sum" },
        threshold: { field: "Montant", max: 1 },
        roundedAmounts: { enabled: false, field: "Montant" },
      },
    }) as { check: string }[];

    expect(result).toHaveLength(6);
    expect(result.map((r) => r.check)).toContain("rows_analyzed");
  });

  it("assemble_workbook delegates to computePivot + buildPivotWorkbook and returns a summary, not the raw bytes", async () => {
    const rows = [
      { region: "North", amount: 100 },
      { region: "South", amount: 200 },
    ];

    const summary = await runAssembleWorkbook({
      rows,
      rowField: "region",
      measureField: "amount",
      aggregation: "sum",
    });

    expect(summary.byteLength).toBeGreaterThan(0);
    expect(summary.rowCount).toBe(4); // header + 2 groups + summary row
  });
});
