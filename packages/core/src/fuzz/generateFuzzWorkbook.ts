import { createRng, pick, randFloat, randInt, shuffle } from "./rng";
import type { FuzzColumnType, FuzzParams, FuzzWorkbookSpec } from "./types";

const TEXT_CATEGORIES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"] as const;

function randomDate(rng: ReturnType<typeof createRng>): Date {
  const year = randInt(rng, 2018, 2025);
  const month = randInt(rng, 0, 11);
  const day = randInt(rng, 1, 28);
  return new Date(year, month, day);
}

/** Matches profileWorkbook's DATE_LIKE_TEXT_PATTERNS (`^\d{4}-\d{1,2}-\d{1,2}$`). */
function formatDateAsText(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Decides how many columns are date-like (clamped so at least one column
 * remains free for a plain text/number role, unless there's only one column
 * total, in which case ambiguity is impossible by definition and is dropped).
 */
function planColumnTypes(
  rng: ReturnType<typeof createRng>,
  columnCount: number,
  ambiguousDateColumnCount: number
): FuzzColumnType[] {
  const effectiveDateColumnCount =
    columnCount <= 1 ? 0 : Math.min(ambiguousDateColumnCount, columnCount - 1);

  const types: FuzzColumnType[] = [];
  for (let i = 0; i < effectiveDateColumnCount; i++) {
    types.push("date");
  }

  const remaining = columnCount - effectiveDateColumnCount;
  if (remaining === 1) {
    types.push("number");
  } else if (remaining >= 2) {
    types.push("number", "text");
    for (let i = 2; i < remaining; i++) {
      types.push(pick(rng, ["text", "number"] as const));
    }
  }

  return shuffle(rng, types);
}

function generateCellValue(rng: ReturnType<typeof createRng>, type: FuzzColumnType): unknown {
  switch (type) {
    case "text":
      return pick(rng, TEXT_CATEGORIES);
    case "number":
      return Math.round(randFloat(rng, 0, 100000) * 100) / 100;
    case "date": {
      const date = randomDate(rng);
      return rng() < 0.5 ? date : formatDateAsText(date);
    }
  }
}

/** Builds a fully deterministic (params.seed-driven) fuzz case, as plain data — no file I/O here. */
export function buildFuzzWorkbookSpec(params: FuzzParams): FuzzWorkbookSpec {
  const rng = createRng(params.seed);
  const columnTypes = planColumnTypes(rng, params.columnCount, params.ambiguousDateColumnCount);
  const headers = columnTypes.map((type, index) => `${type}_${index}`);

  const rows: unknown[][] = [];
  for (let i = 0; i < params.rowCount; i++) {
    if (i > 0 && rng() < params.duplicateRate) {
      const sourceIndex = randInt(rng, 0, rows.length - 1);
      rows.push([...rows[sourceIndex]!]);
      continue;
    }

    const row = columnTypes.map((type) => (rng() < params.missingRate ? null : generateCellValue(rng, type)));
    rows.push(row);
  }

  return { params, headers, columnTypes, rows };
}
