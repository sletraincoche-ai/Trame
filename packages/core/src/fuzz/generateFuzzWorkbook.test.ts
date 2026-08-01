import { describe, expect, it } from "vitest";
import { buildFuzzWorkbookSpec } from "./generateFuzzWorkbook";
import { generateFuzzParams } from "./generateFuzzParams";

const MASTER_SEED = 20260801;

describe("fuzz generator", () => {
  it("produces the requested number of cases, deterministically for a given seed", () => {
    const first = generateFuzzParams(MASTER_SEED, 100);
    const second = generateFuzzParams(MASTER_SEED, 100);

    expect(first).toHaveLength(100);
    expect(second).toEqual(first);
  });

  it("builds a valid, in-range spec for every one of the 100 generated cases", () => {
    const paramsList = generateFuzzParams(MASTER_SEED, 100);

    for (const params of paramsList) {
      expect(params.columnCount).toBeGreaterThanOrEqual(1);
      expect(params.columnCount).toBeLessThanOrEqual(15);
      expect(params.rowCount).toBeGreaterThanOrEqual(0);
      expect(params.rowCount).toBeLessThanOrEqual(5000);
      expect(params.duplicateRate).toBeGreaterThanOrEqual(0);
      expect(params.duplicateRate).toBeLessThanOrEqual(0.4);
      expect(params.missingRate).toBeGreaterThanOrEqual(0);
      expect(params.missingRate).toBeLessThanOrEqual(0.3);
      expect(params.ambiguousDateColumnCount).toBeGreaterThanOrEqual(0);
      expect(params.ambiguousDateColumnCount).toBeLessThanOrEqual(5);

      const spec = buildFuzzWorkbookSpec(params);
      expect(spec.headers).toHaveLength(params.columnCount);
      expect(spec.columnTypes).toHaveLength(params.columnCount);
      expect(spec.rows).toHaveLength(params.rowCount);
      for (const row of spec.rows) {
        expect(row).toHaveLength(params.columnCount);
      }
      // At least one measure-shaped column always exists, whatever the mix.
      expect(spec.columnTypes).toContain("number");
    }
  });

  it("builds the exact same spec twice for the same params (reproducible, not just seeded)", () => {
    const params = generateFuzzParams(MASTER_SEED, 20)[10]!;

    const specA = buildFuzzWorkbookSpec(params);
    const specB = buildFuzzWorkbookSpec(params);

    expect(specB).toEqual(specA);
  });
});
