import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenCases, profileWorkbook } from "@trame/core";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RuleBasedEngine } from "../RuleBasedEngine";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-golden-set-engine-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("golden set (profileWorkbook + RuleBasedEngine)", () => {
  for (const goldenCase of goldenCases) {
    it(`${goldenCase.id}: profile, questions and scope match cases.md`, async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(goldenCase.sheetName);
      sheet.addRow(goldenCase.headers);
      for (const row of goldenCase.rows) {
        sheet.addRow(row);
      }
      const filePath = join(workDir, `${goldenCase.id}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      const profile = await profileWorkbook(filePath);
      expect(profile.rowCount).toBe(goldenCase.expected.rowCount);
      expect(profile.columns).toEqual(goldenCase.expected.columns);
      expect(profile.ambiguities).toEqual(goldenCase.expected.ambiguities);
      expect(profile.duplicateRows).toEqual(goldenCase.expected.duplicateRows);

      const engine = new RuleBasedEngine();

      const questions = await engine.proposeQuestions(profile);
      expect(questions.map((question) => question.kind)).toEqual(goldenCase.expected.questionKinds);

      const scopeResult = await engine.isInScope(goldenCase.expected.message);
      expect(scopeResult).toEqual({ scope: goldenCase.expected.scope });
    });
  }
});
