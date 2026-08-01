import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { profileWorkbook } from "../profileWorkbook";
import { goldenCases } from "./cases";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-golden-set-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("golden set (profileWorkbook)", () => {
  for (const goldenCase of goldenCases) {
    it(`${goldenCase.id}: profile matches what's documented in cases.md`, async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(goldenCase.sheetName);
      sheet.addRow(goldenCase.headers);
      for (const row of goldenCase.rows) {
        sheet.addRow(row);
      }
      const filePath = join(workDir, `${goldenCase.id}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      const profile = await profileWorkbook(filePath);

      expect(profile.sheetName).toBe(goldenCase.sheetName);
      expect(profile.rowCount).toBe(goldenCase.expected.rowCount);
      expect(profile.columns).toEqual(goldenCase.expected.columns);
      expect(profile.ambiguities).toEqual(goldenCase.expected.ambiguities);
      expect(profile.duplicateRows).toEqual(goldenCase.expected.duplicateRows);
    });
  }
});
