import { computePivot } from "@trame/core";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildPivotWorkbook } from "./buildPivotWorkbook";

type SaleRow = {
  region: "North" | "South";
  product: "Widget" | "Gadget";
  amount: number;
};

const sales: SaleRow[] = [
  { region: "North", product: "Widget", amount: 100 },
  { region: "North", product: "Gadget", amount: 200 },
  { region: "South", product: "Widget", amount: 80 },
  { region: "South", product: "Gadget", amount: 300 },
];

async function readBack(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own .d.ts declares a local, non-exported `Buffer extends
  // ArrayBuffer` type for this exact parameter, incompatible with modern
  // @types/node's Buffer at the type level only (this is a real Node
  // Buffer at runtime, accepted by exceljs just fine). Parameters<> sidesteps
  // needing to name that inaccessible type.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets[0]!;
}

describe("buildPivotWorkbook", () => {
  it("writes a real, readable .xlsx with header, totals, freeze and autofilter (2D pivot)", async () => {
    const pivot = computePivot(sales, "region", "product", "amount", "sum");

    const buffer = await buildPivotWorkbook(pivot);
    const sheet = await readBack(buffer);

    expect(sheet.getRow(1).values).toEqual([undefined, "region", "Widget", "Gadget", "Total"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "North", 100, 200, 300]);
    expect(sheet.getRow(3).values).toEqual([undefined, "South", 80, 300, 380]);
    expect(sheet.getRow(4).values).toEqual([undefined, "Total", 180, 500, 680]);

    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views?.[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBe("A1:D1");
  });

  it("writes a single-dimension workbook when colField is absent", async () => {
    const pivot = computePivot(sales, "region", null, "amount", "sum");

    const buffer = await buildPivotWorkbook(pivot);
    const sheet = await readBack(buffer);

    expect(sheet.getRow(1).values).toEqual([undefined, "region", "amount"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "North", 300]);
    expect(sheet.getRow(3).values).toEqual([undefined, "South", 380]);
    expect(sheet.getRow(4).values).toEqual([undefined, "Total", 680]);
  });

  it("never labels a non-additive aggregation's summary row 'Total' (reported bug)", async () => {
    // Reproduces the exact reported case: seven groups whose per-group
    // minimums are 412000, 128500, 64200, 28000, 96000, 47300, 776000
    // (sum = 1 552 000), while the true dataset-wide minimum is 28000 (group
    // D's only row, also the smallest value overall).
    type Row = { region: string; amount: number };
    const rows: Row[] = [
      { region: "A", amount: 412000 },
      { region: "A", amount: 500000 },
      { region: "B", amount: 128500 },
      { region: "B", amount: 200000 },
      { region: "C", amount: 64200 },
      { region: "C", amount: 100000 },
      { region: "D", amount: 28000 },
      { region: "E", amount: 96000 },
      { region: "E", amount: 150000 },
      { region: "F", amount: 47300 },
      { region: "F", amount: 90000 },
      { region: "G", amount: 776000 },
      { region: "G", amount: 900000 },
    ];

    const pivot = computePivot(rows, "region", null, "amount", "min");

    // computePivot itself is correct: 28000 really is the minimum of the
    // whole dataset. The bug is not here.
    expect(pivot.rowTotals).toEqual({
      A: 412000,
      B: 128500,
      C: 64200,
      D: 28000,
      E: 96000,
      F: 47300,
      G: 776000,
    });
    expect(pivot.grandTotal).toBe(28000);
    const sumOfRowTotals = Object.values(pivot.rowTotals).reduce((total, value) => total + value, 0);
    expect(sumOfRowTotals).toBe(1552000);
    // This mismatch (1 552 000 vs 28000) is expected and correct for "min" —
    // it is not what needs fixing.

    const buffer = await buildPivotWorkbook(pivot);
    const sheet = await readBack(buffer);

    // The actual bug: the summary row is unconditionally labeled "Total",
    // which implies the sum-of-rows-above semantics that only hold for
    // sum/count. For "min" it must be labeled accordingly instead.
    const summaryLabel = sheet.getRow(9).getCell(1).value;
    expect(summaryLabel).not.toBe("Total");
    expect(summaryLabel).toBe("Minimum");
  });
});
