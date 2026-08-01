import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { profileWorkbook } from "./profileWorkbook";

let workDir: string;

async function writeXlsx(fileName: string, headers: string[], rows: unknown[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const filePath = join(workDir, fileName);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-profile-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("profileWorkbook", () => {
  it("detects columns, their types and the missing-value rate", async () => {
    const filePath = await writeXlsx(
      "basic.xlsx",
      ["Name", "Age", "JoinDate"],
      [
        ["Alice", 30, new Date(2020, 0, 15)],
        ["Bob", null, new Date(2021, 5, 1)],
        ["Carol", 25, new Date(2019, 11, 31)],
        ["Dave", 40, null],
      ]
    );

    const profile = await profileWorkbook(filePath);

    expect(profile.sheetName).toBe("Sheet1");
    expect(profile.rowCount).toBe(4);
    expect(profile.columns).toEqual([
      { name: "Name", position: 0, type: "text", missingCount: 0, missingRate: 0 },
      { name: "Age", position: 1, type: "number", missingCount: 1, missingRate: 0.25 },
      { name: "JoinDate", position: 2, type: "date", missingCount: 1, missingRate: 0.25 },
    ]);
    expect(profile.duplicateRows).toEqual([]);
    // Only one date-like column here, so it shouldn't be flagged as ambiguous.
    expect(profile.ambiguities).toEqual([]);
  });

  it("flags rows that are exact duplicates across every column", async () => {
    const filePath = await writeXlsx(
      "duplicates.xlsx",
      ["Name", "Email"],
      [
        ["Alice", "alice@example.com"],
        ["Bob", "bob@example.com"],
        ["Alice", "alice@example.com"],
      ]
    );

    const profile = await profileWorkbook(filePath);

    expect(profile.duplicateRows).toEqual([{ rowNumbers: [2, 4], occurrences: 2 }]);
  });

  it("flags several date-like columns as an ambiguity (mixed real dates and date-like text)", async () => {
    const filePath = await writeXlsx(
      "ambiguous-dates.xlsx",
      ["CreatedAt", "UpdatedAt", "DueDateText", "Task"],
      [
        [new Date(2023, 0, 1), new Date(2023, 0, 2), "2023-01-10", "Task A"],
        [new Date(2023, 1, 1), new Date(2023, 1, 5), "2023-02-15", "Task B"],
        [new Date(2023, 2, 1), new Date(2023, 2, 10), "2023-03-20", "Task C"],
      ]
    );

    const profile = await profileWorkbook(filePath);

    const typeByName = Object.fromEntries(profile.columns.map((c) => [c.name, c.type]));
    expect(typeByName).toEqual({
      CreatedAt: "date",
      UpdatedAt: "date",
      DueDateText: "date",
      Task: "text",
    });

    expect(profile.ambiguities).toEqual([
      {
        kind: "ambiguous-date-columns",
        columnNames: ["CreatedAt", "UpdatedAt", "DueDateText"],
        message: expect.stringContaining("3 colonnes ressemblent à des dates"),
      },
    ]);
  });
});
