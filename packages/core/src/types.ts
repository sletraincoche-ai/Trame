export type ColumnDataType = "text" | "number" | "date" | "boolean" | "empty" | "mixed";

export interface ColumnProfile {
  name: string;
  position: number;
  type: ColumnDataType;
  missingCount: number;
  missingRate: number;
}

export interface DuplicateRowGroup {
  /** Excel sheet row numbers (1-based; data starts at row 2 since row 1 is the header). */
  rowNumbers: number[];
  occurrences: number;
}

export interface AmbiguousDateColumnsAmbiguity {
  kind: "ambiguous-date-columns";
  columnNames: string[];
  message: string;
}

export type Ambiguity = AmbiguousDateColumnsAmbiguity;

export interface FileProfile {
  filePath: string;
  sheetName: string;
  /** Number of data rows, excluding the header row. */
  rowCount: number;
  columns: ColumnProfile[];
  duplicateRows: DuplicateRowGroup[];
  ambiguities: Ambiguity[];
}

export type AggregationType = "sum" | "avg" | "count" | "min" | "max";

export interface PivotResult {
  rowField: string;
  /** Null when the pivot has a single dimension (no colField was given). */
  colField: string | null;
  measureField: string;
  aggregation: AggregationType;
  rowKeys: string[];
  /** Empty when colField is absent. */
  colKeys: string[];
  /** cells[rowKey][colKey]; empty when colField is absent. */
  cells: Record<string, Record<string, number>>;
  /** Aggregated measure per row key, across all columns. */
  rowTotals: Record<string, number>;
  /** Aggregated measure per column key, across all rows. Empty when colField is absent. */
  colTotals: Record<string, number>;
  /** Aggregated measure across every row. */
  grandTotal: number;
}
