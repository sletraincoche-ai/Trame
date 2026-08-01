export interface FuzzParams {
  /** Seeds this specific case's data generation — independent of which seed picked the params themselves. */
  seed: number;
  /** 1-15 */
  columnCount: number;
  /** 0-5000 */
  rowCount: number;
  /** 0-0.4: fraction of rows that are exact duplicates of an earlier row. */
  duplicateRate: number;
  /** 0-0.3: fraction of cells left blank. */
  missingRate: number;
  /** 0-5: number of columns deliberately made date-like, to (in)validate the ambiguous-date-columns detection. */
  ambiguousDateColumnCount: number;
}

export type FuzzColumnType = "text" | "number" | "date";

export interface FuzzWorkbookSpec {
  params: FuzzParams;
  headers: string[];
  columnTypes: FuzzColumnType[];
  rows: unknown[][];
}
