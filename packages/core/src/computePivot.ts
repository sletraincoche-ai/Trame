import type { AggregationType, PivotResult } from "./types";

// Guards against a caller picking a near-unique column (e.g. a raw date or
// amount) as rowField/colField: cells is built as an O(rowKeys x colKeys)
// grid, so an uncapped high-cardinality dimension can reach millions of
// entries and exhaust memory well before any of the six-package pipeline's
// other invariants even get checked. 500 keeps the worst case (500 x 500 =
// 250 000 cells) comfortably bounded while still allowing rich, real
// categorical breakdowns.
const MAX_DISTINCT_KEYS = 500;

export class PivotCardinalityLimitError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly distinctCount: number,
    public readonly limit: number = MAX_DISTINCT_KEYS
  ) {
    super(
      `computePivot: "${fieldName}" a ${distinctCount} valeurs distinctes, au-delà de la limite de ${limit}. ` +
        "Choisissez une colonne à cardinalité plus faible (une catégorie, pas une valeur quasi unique par ligne)."
    );
    this.name = "PivotCardinalityLimitError";
  }
}

function pushToBucket(map: Map<string, unknown[]>, key: string, value: unknown): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(value);
  } else {
    map.set(key, [value]);
  }
}

function collectKey(orderedKeys: string[], seen: Set<string>, key: string): void {
  if (!seen.has(key)) {
    seen.add(key);
    orderedKeys.push(key);
  }
}

function cellKeyOf(rowKey: string, colKey: string): string {
  return JSON.stringify([rowKey, colKey]);
}

function aggregate(rawValues: unknown[], aggregation: AggregationType): number {
  if (aggregation === "count") {
    return rawValues.filter((value) => value !== null && value !== undefined).length;
  }

  const numericValues = rawValues.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  if (numericValues.length === 0) {
    return 0;
  }

  switch (aggregation) {
    case "sum":
      return numericValues.reduce((total, value) => total + value, 0);
    case "avg":
      return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
    case "min":
      return Math.min(...numericValues);
    case "max":
      return Math.max(...numericValues);
  }
}

export function computePivot<T extends Record<string, unknown>>(
  rows: T[],
  rowField: keyof T,
  colField: keyof T | null | undefined,
  measureField: keyof T,
  aggregation: AggregationType
): PivotResult {
  const hasColField = colField !== null && colField !== undefined;

  const rowKeys: string[] = [];
  const seenRowKeys = new Set<string>();
  const colKeys: string[] = [];
  const seenColKeys = new Set<string>();

  const rowBuckets = new Map<string, unknown[]>();
  const colBuckets = new Map<string, unknown[]>();
  const cellBuckets = new Map<string, unknown[]>();

  for (const row of rows) {
    const rowKey = String(row[rowField]);
    collectKey(rowKeys, seenRowKeys, rowKey);
    pushToBucket(rowBuckets, rowKey, row[measureField]);

    if (hasColField) {
      const colKey = String(row[colField]);
      collectKey(colKeys, seenColKeys, colKey);
      pushToBucket(colBuckets, colKey, row[measureField]);
      pushToBucket(cellBuckets, cellKeyOf(rowKey, colKey), row[measureField]);
    }
  }

  if (rowKeys.length > MAX_DISTINCT_KEYS) {
    throw new PivotCardinalityLimitError(String(rowField), rowKeys.length);
  }
  if (hasColField && colKeys.length > MAX_DISTINCT_KEYS) {
    throw new PivotCardinalityLimitError(String(colField), colKeys.length);
  }

  const rowTotals: Record<string, number> = {};
  for (const key of rowKeys) {
    rowTotals[key] = aggregate(rowBuckets.get(key) ?? [], aggregation);
  }

  const colTotals: Record<string, number> = {};
  const cells: Record<string, Record<string, number>> = {};
  if (hasColField) {
    for (const key of colKeys) {
      colTotals[key] = aggregate(colBuckets.get(key) ?? [], aggregation);
    }
    for (const rKey of rowKeys) {
      const rowCells: Record<string, number> = {};
      for (const cKey of colKeys) {
        rowCells[cKey] = aggregate(cellBuckets.get(cellKeyOf(rKey, cKey)) ?? [], aggregation);
      }
      cells[rKey] = rowCells;
    }
  }

  const grandTotal = aggregate(
    rows.map((row) => row[measureField]),
    aggregation
  );

  return {
    rowField: String(rowField),
    colField: hasColField ? String(colField) : null,
    measureField: String(measureField),
    aggregation,
    rowKeys,
    colKeys: hasColField ? colKeys : [],
    cells,
    rowTotals,
    colTotals,
    grandTotal,
  };
}
