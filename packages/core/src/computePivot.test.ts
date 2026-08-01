import { describe, expect, it } from "vitest";
import { computePivot, PivotCardinalityLimitError } from "./computePivot";

type SaleRecord = {
  region: "North" | "South" | "East";
  product: "Widget" | "Gadget";
  amount: number;
};

// 3 regions x 2 products x 2 rows each = 12 rows.
const sales: SaleRecord[] = [
  { region: "North", product: "Widget", amount: 100 },
  { region: "North", product: "Widget", amount: 50 },
  { region: "North", product: "Gadget", amount: 200 },
  { region: "North", product: "Gadget", amount: 100 },
  { region: "South", product: "Widget", amount: 80 },
  { region: "South", product: "Widget", amount: 20 },
  { region: "South", product: "Gadget", amount: 150 },
  { region: "South", product: "Gadget", amount: 150 },
  { region: "East", product: "Widget", amount: 60 },
  { region: "East", product: "Widget", amount: 40 },
  { region: "East", product: "Gadget", amount: 90 },
  { region: "East", product: "Gadget", amount: 10 },
];

describe("computePivot", () => {
  it("cross-tabulates sums and keeps row/col/grand totals consistent", () => {
    const result = computePivot(sales, "region", "product", "amount", "sum");

    expect(result.rowKeys).toEqual(["North", "South", "East"]);
    expect(result.colKeys).toEqual(["Widget", "Gadget"]);

    expect(result.cells).toEqual({
      North: { Widget: 150, Gadget: 300 },
      South: { Widget: 100, Gadget: 300 },
      East: { Widget: 100, Gadget: 100 },
    });

    expect(result.rowTotals).toEqual({ North: 450, South: 400, East: 200 });
    expect(result.colTotals).toEqual({ Widget: 350, Gadget: 700 });
    expect(result.grandTotal).toBe(1050);

    // The whole point of a coherent pivot: partitioning by row or by column
    // must both reconstruct the same grand total.
    const sumOfRowTotals = Object.values(result.rowTotals).reduce((a, b) => a + b, 0);
    const sumOfColTotals = Object.values(result.colTotals).reduce((a, b) => a + b, 0);
    expect(sumOfRowTotals).toBe(result.grandTotal);
    expect(sumOfColTotals).toBe(result.grandTotal);
  });

  it("counts rows per group", () => {
    const result = computePivot(sales, "region", "product", "amount", "count");

    expect(result.cells.North).toEqual({ Widget: 2, Gadget: 2 });
    expect(result.rowTotals).toEqual({ North: 4, South: 4, East: 4 });
    expect(result.colTotals).toEqual({ Widget: 6, Gadget: 6 });
    expect(result.grandTotal).toBe(12);
  });

  it("averages the measure per group", () => {
    const result = computePivot(sales, "region", "product", "amount", "avg");

    expect(result.cells.North).toEqual({ Widget: 75, Gadget: 150 });
    expect(result.rowTotals.North).toBe(112.5);
    expect(result.colTotals.Widget).toBeCloseTo(58.333, 2);
    expect(result.grandTotal).toBe(87.5);
  });

  it("takes the min of the measure per group", () => {
    const result = computePivot(sales, "region", "product", "amount", "min");

    expect(result.cells.South).toEqual({ Widget: 20, Gadget: 150 });
    expect(result.rowTotals).toEqual({ North: 50, South: 20, East: 10 });
    expect(result.colTotals).toEqual({ Widget: 20, Gadget: 10 });
    expect(result.grandTotal).toBe(10);
  });

  it("takes the max of the measure per group", () => {
    const result = computePivot(sales, "region", "product", "amount", "max");

    expect(result.cells.East).toEqual({ Widget: 60, Gadget: 90 });
    expect(result.rowTotals).toEqual({ North: 200, South: 150, East: 90 });
    expect(result.colTotals).toEqual({ Widget: 100, Gadget: 200 });
    expect(result.grandTotal).toBe(200);
  });

  it("collapses to a single dimension when colField is absent", () => {
    const result = computePivot(sales, "region", null, "amount", "sum");

    expect(result.colField).toBeNull();
    expect(result.colKeys).toEqual([]);
    expect(result.colTotals).toEqual({});
    expect(result.cells).toEqual({});

    expect(result.rowTotals).toEqual({ North: 450, South: 400, East: 200 });
    expect(result.grandTotal).toBe(1050);
    expect(Object.values(result.rowTotals).reduce((a, b) => a + b, 0)).toBe(result.grandTotal);
  });
});

describe("computePivot cardinality guard", () => {
  // Simulates picking a near-unique column (e.g. a raw date or amount) as
  // rowField/colField — exactly what caused the fuzz suite to OOM before
  // this guard existed, by building an O(rowKeys x colKeys) grid unbounded.
  function rowsWithDistinctValues(count: number): { key: string; category: string; amount: number }[] {
    return Array.from({ length: count }, (_, i) => ({
      key: `k${i}`,
      category: i % 2 === 0 ? "A" : "B",
      amount: i,
    }));
  }

  it("throws a clear, typed error when rowField has too many distinct values", () => {
    const rows = rowsWithDistinctValues(501);

    expect(() => computePivot(rows, "key", null, "amount", "sum")).toThrow(PivotCardinalityLimitError);
    try {
      computePivot(rows, "key", null, "amount", "sum");
      throw new Error("expected computePivot to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PivotCardinalityLimitError);
      const cardinalityError = error as PivotCardinalityLimitError;
      expect(cardinalityError.fieldName).toBe("key");
      expect(cardinalityError.distinctCount).toBe(501);
      expect(cardinalityError.limit).toBe(500);
      expect(cardinalityError.message).toContain("key");
      expect(cardinalityError.message).toContain("501");
    }
  });

  it("throws when colField (not rowField) is the high-cardinality one", () => {
    const rows = rowsWithDistinctValues(501);

    expect(() => computePivot(rows, "category", "key", "amount", "sum")).toThrow(
      PivotCardinalityLimitError
    );
  });

  it("does not throw at exactly the limit", () => {
    const rows = rowsWithDistinctValues(500);

    expect(() => computePivot(rows, "key", null, "amount", "sum")).not.toThrow();
  });
});
