import ExcelJS from "exceljs";
import type { FuzzWorkbookSpec } from "./types";

/** Writes a fuzz spec to a real .xlsx file on disk, via exceljs — the same path every other test in this repo uses. */
export async function writeFuzzWorkbook(spec: FuzzWorkbookSpec, filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(spec.headers);
  for (const row of spec.rows) {
    sheet.addRow(row);
  }
  await workbook.xlsx.writeFile(filePath);
}
