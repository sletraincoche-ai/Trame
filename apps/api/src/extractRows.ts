import ExcelJS from "exceljs";

/**
 * Reads the same .xlsx file profileWorkbook profiles, as plain row objects
 * keyed by header name. profileWorkbook only returns aggregate stats (no raw
 * rows), and computePivot/buildPivotWorkbook need the actual data — this is
 * the bridge, kept out of packages/core so profileWorkbook's return shape
 * (and its golden-set tests) stay untouched.
 */
export async function extractRows(filePath: string): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim() || `Column${colNumber}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row.getCell(index + 1).value ?? null;
    });
    rows.push(record);
  }

  return rows;
}
