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
