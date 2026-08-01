import type { AggregationType, PivotResult } from "@trame/core";
import ExcelJS from "exceljs";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E7EB" },
};
const NUMBER_FORMAT = "#,##0.00";
const COLUMN_WIDTH = 18;

// Only sum/count are additive: summing every group's sum (or count) equals
// the sum (or count) over the whole dataset. avg/min/max are NOT additive —
// the dataset-wide average/min/max is unrelated to summing the per-group
// ones — so the summary row/column must never be labeled "Total" for those,
// or it falsely implies the rows above it should add up to it.
const SUMMARY_LABEL: Record<AggregationType, string> = {
  sum: "Total",
  count: "Total",
  avg: "Moyenne",
  min: "Minimum",
  max: "Maximum",
};

/**
 * Builds a real, minimal .xlsx from a computePivot() result: header row,
 * one row per rowKey, a trailing summary row, with a frozen header, an
 * autofilter, and number formatting on every measure column.
 */
export async function buildPivotWorkbook(pivot: PivotResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Résultat");

  const summaryLabel = SUMMARY_LABEL[pivot.aggregation];
  const hasColumns = pivot.colKeys.length > 0;
  const headerCells = hasColumns
    ? [pivot.rowField, ...pivot.colKeys, summaryLabel]
    : [pivot.rowField, pivot.measureField];

  const headerRow = sheet.addRow(headerCells);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });

  for (const rowKey of pivot.rowKeys) {
    if (hasColumns) {
      const rowCells = pivot.colKeys.map((colKey) => pivot.cells[rowKey]?.[colKey] ?? 0);
      sheet.addRow([rowKey, ...rowCells, pivot.rowTotals[rowKey] ?? 0]);
    } else {
      sheet.addRow([rowKey, pivot.rowTotals[rowKey] ?? 0]);
    }
  }

  const totalRowCells = hasColumns
    ? [summaryLabel, ...pivot.colKeys.map((colKey) => pivot.colTotals[colKey] ?? 0), pivot.grandTotal]
    : [summaryLabel, pivot.grandTotal];
  const totalRow = sheet.addRow(totalRowCells);
  totalRow.font = { bold: true };

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headerCells.length },
  };

  sheet.columns.forEach((column) => {
    column.width = COLUMN_WIDTH;
  });
  for (let col = 2; col <= headerCells.length; col++) {
    sheet.getColumn(col).numFmt = NUMBER_FORMAT;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
