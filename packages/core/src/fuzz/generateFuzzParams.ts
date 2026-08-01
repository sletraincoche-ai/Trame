import { createRng, randFloat, randInt } from "./rng";
import type { FuzzParams } from "./types";

export const DEFAULT_FUZZ_CASE_COUNT = 100;

// Hand-picked boundary combinations, always included first so they're never
// left out to random chance: empty files, the extremes of every parameter,
// and a couple of "everything at once" stress cases.
const SYSTEMATIC_CASES: Omit<FuzzParams, "seed">[] = [
  { columnCount: 1, rowCount: 0, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 0 },
  { columnCount: 1, rowCount: 1, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 0 },
  { columnCount: 1, rowCount: 5000, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 0 },
  { columnCount: 15, rowCount: 0, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 5 },
  { columnCount: 15, rowCount: 1, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 5 },
  { columnCount: 15, rowCount: 5000, duplicateRate: 0.4, missingRate: 0.3, ambiguousDateColumnCount: 5 },
  { columnCount: 2, rowCount: 20, duplicateRate: 0.4, missingRate: 0, ambiguousDateColumnCount: 0 },
  { columnCount: 2, rowCount: 20, duplicateRate: 0, missingRate: 0.3, ambiguousDateColumnCount: 0 },
  { columnCount: 3, rowCount: 50, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 2 },
  { columnCount: 3, rowCount: 50, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 3 },
  { columnCount: 4, rowCount: 50, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 5 },
  { columnCount: 8, rowCount: 300, duplicateRate: 0.2, missingRate: 0.15, ambiguousDateColumnCount: 1 },
  { columnCount: 15, rowCount: 1000, duplicateRate: 0, missingRate: 0, ambiguousDateColumnCount: 0 },
  { columnCount: 5, rowCount: 3, duplicateRate: 0.4, missingRate: 0.3, ambiguousDateColumnCount: 5 },
  { columnCount: 2, rowCount: 2, duplicateRate: 0.4, missingRate: 0.3, ambiguousDateColumnCount: 0 },
];

/**
 * The full fuzz case list: the systematic boundary cases above, then random
 * combinations filling the rest, all derived from `masterSeed` so the exact
 * same `count` cases come out every run (reproducible fuzzing, not flaky).
 */
export function generateFuzzParams(
  masterSeed: number,
  count: number = DEFAULT_FUZZ_CASE_COUNT
): FuzzParams[] {
  const params: FuzzParams[] = SYSTEMATIC_CASES.slice(0, count).map((systematic, index) => ({
    ...systematic,
    seed: masterSeed + 1000 + index,
  }));

  const rng = createRng(masterSeed);
  let index = 0;
  while (params.length < count) {
    // Row count biased toward smaller values (squared) so the suite stays
    // fast, while still occasionally exercising the full 0-5000 range.
    const rowCount = Math.round(randFloat(rng, 0, 1) ** 2 * 5000);
    params.push({
      seed: masterSeed + 2000 + index,
      columnCount: randInt(rng, 1, 15),
      rowCount,
      duplicateRate: randFloat(rng, 0, 0.4),
      missingRate: randFloat(rng, 0, 0.3),
      ambiguousDateColumnCount: randInt(rng, 0, 5),
    });
    index++;
  }

  return params;
}
