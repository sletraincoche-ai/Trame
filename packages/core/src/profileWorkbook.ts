import ExcelJS from "exceljs";
import type { Ambiguity, ColumnDataType, ColumnProfile, DuplicateRowGroup, FileProfile } from "./types";

const DATE_LIKE_TEXT_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}$/, // 2024-01-31
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 31/01/2024 or 1/31/24
  /^\d{1,2}-\d{1,2}-\d{2,4}$/, // 31-01-2024
];

// Rows beyond this are still used for missing-value and duplicate detection,
// but not sampled for column type inference.
const TYPE_SAMPLE_SIZE = 200;
const DATE_TYPE_MAJORITY_THRESHOLD = 0.8;
const MIXED_TYPE_MAJORITY_THRESHOLD = 0.6;
const MIN_DATE_LIKE_COLUMNS_FOR_AMBIGUITY = 2;

type CellClassification = Exclude<ColumnDataType, "mixed" | "empty">;

function isDateLikeText(text: string): boolean {
  return DATE_LIKE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function classifyCell(cell: ExcelJS.Cell): CellClassification | "empty" {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "empty";
  }
  if (value instanceof Date) {
    return "date";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  const text = (typeof value === "string" ? value : String(cell.text ?? "")).trim();
  if (text === "") {
    return "empty";
  }
  return isDateLikeText(text) ? "date" : "text";
}

function rowKeyOf(cells: ExcelJS.Cell[]): string {
  return JSON.stringify(
    cells.map((cell) => {
      const value = cell.value;
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
        return value ?? null;
      }
      return typeof value === "string" ? value : cell.text;
    })
  );
}

function resolveColumnType(classifications: (CellClassification | "empty")[]): ColumnDataType {
  const nonEmpty = classifications.filter((c): c is CellClassification => c !== "empty");
  if (nonEmpty.length === 0) {
    return "empty";
  }

  const counts = new Map<CellClassification, number>();
  for (const classification of nonEmpty) {
    counts.set(classification, (counts.get(classification) ?? 0) + 1);
  }

  let majorityType: CellClassification = "text";
  let majorityCount = 0;
  for (const [type, count] of counts) {
    if (count > majorityCount) {
      majorityType = type;
      majorityCount = count;
    }
  }

  const ratio = majorityCount / nonEmpty.length;
  const threshold = majorityType === "date" ? DATE_TYPE_MAJORITY_THRESHOLD : MIXED_TYPE_MAJORITY_THRESHOLD;
  return ratio >= threshold ? majorityType : "mixed";
}

export async function profileWorkbook(filePath: string): Promise<FileProfile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in workbook: ${filePath}`);
  }

  const columnNames: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    columnNames[colNumber - 1] = String(cell.value ?? "").trim() || `Column${colNumber}`;
  });
  const columnCount = columnNames.length;
  const dataRowCount = Math.max(0, worksheet.rowCount - 1);

  const classificationsByColumn: (CellClassification | "empty")[][] = Array.from(
    { length: columnCount },
    () => []
  );
  const missingCountByColumn = new Array<number>(columnCount).fill(0);
  const rowsByKey = new Map<string, number[]>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const cells: ExcelJS.Cell[] = [];
    const isWithinTypeSample = rowNumber - 2 < TYPE_SAMPLE_SIZE;

    for (let colIndex = 0; colIndex < columnCount; colIndex++) {
      const cell = row.getCell(colIndex + 1);
      cells.push(cell);

      const classification = classifyCell(cell);
      if (classification === "empty") {
        missingCountByColumn[colIndex]! += 1;
      }
      if (isWithinTypeSample) {
        classificationsByColumn[colIndex]!.push(classification);
      }
    }

    const key = rowKeyOf(cells);
    const existingRows = rowsByKey.get(key);
    if (existingRows) {
      existingRows.push(rowNumber);
    } else {
      rowsByKey.set(key, [rowNumber]);
    }
  }

  const columns: ColumnProfile[] = columnNames.map((name, index) => {
    const missingCount = missingCountByColumn[index]!;
    return {
      name,
      position: index,
      type: resolveColumnType(classificationsByColumn[index]!),
      missingCount,
      missingRate: dataRowCount === 0 ? 0 : missingCount / dataRowCount,
    };
  });

  const duplicateRows: DuplicateRowGroup[] = [];
  for (const rowNumbers of rowsByKey.values()) {
    if (rowNumbers.length > 1) {
      duplicateRows.push({ rowNumbers, occurrences: rowNumbers.length });
    }
  }

  const dateLikeColumnNames = columns.filter((column) => column.type === "date").map((column) => column.name);
  const ambiguities: Ambiguity[] = [];
  if (dateLikeColumnNames.length >= MIN_DATE_LIKE_COLUMNS_FOR_AMBIGUITY) {
    ambiguities.push({
      kind: "ambiguous-date-columns",
      columnNames: dateLikeColumnNames,
      message:
        `${dateLikeColumnNames.length} colonnes ressemblent à des dates ` +
        `(${dateLikeColumnNames.join(", ")}) : leur rôle métier respectif ` +
        "n'est pas déterminable automatiquement.",
    });
  }

  return {
    filePath,
    sheetName: worksheet.name,
    rowCount: dataRowCount,
    columns,
    duplicateRows,
    ambiguities,
  };
}
