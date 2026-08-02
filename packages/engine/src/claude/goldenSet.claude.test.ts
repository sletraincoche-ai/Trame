import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenCases, profileWorkbook } from "@trame/core";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeEngine } from "./ClaudeEngine";

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

interface CaseResult {
  id: string;
  scopeMatch: boolean;
  claudeScope: string;
  expectedScope: string;
  questionsMatch: boolean;
  claudeQuestionKinds: string[];
  expectedQuestionKinds: string[];
}

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-claude-golden-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/**
 * Measures ClaudeEngine against the M1 golden set (real API calls, skipped
 * without a key). Not a strict text-equality test against RuleBasedEngine —
 * Claude's phrasing legitimately varies — it scores structural agreement
 * (same scope classification, same question *kinds* triggered) and prints
 * the real, measured numbers per ROADMAP.md M3's "mesuré et documenté"
 * requirement. Never asserts a fabricated pass rate.
 */
describe.skipIf(!hasApiKey)("ClaudeEngine vs. golden set (live API, measured)", () => {
  it(
    `scores ClaudeEngine against all ${goldenCases.length} golden-set cases`,
    async () => {
      const engine = new ClaudeEngine();
      const results: CaseResult[] = [];

      for (const goldenCase of goldenCases) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(goldenCase.sheetName);
        sheet.addRow(goldenCase.headers);
        for (const row of goldenCase.rows) {
          sheet.addRow(row);
        }
        const filePath = join(workDir, `${goldenCase.id}.xlsx`);
        await workbook.xlsx.writeFile(filePath);

        const profile = await profileWorkbook(filePath);

        const [scopeResult, questions] = await Promise.all([
          engine.isInScope(goldenCase.expected.message),
          engine.proposeQuestions(profile),
        ]);

        const claudeQuestionKinds = [...new Set(questions.map((q) => q.kind))].sort();
        const expectedQuestionKinds = [...new Set(goldenCase.expected.questionKinds)].sort();

        results.push({
          id: goldenCase.id,
          claudeScope: scopeResult.scope,
          expectedScope: goldenCase.expected.scope,
          scopeMatch: scopeResult.scope === goldenCase.expected.scope,
          claudeQuestionKinds,
          expectedQuestionKinds,
          questionsMatch: JSON.stringify(claudeQuestionKinds) === JSON.stringify(expectedQuestionKinds),
        });
      }

      const scopeMatches = results.filter((r) => r.scopeMatch).length;
      const questionMatches = results.filter((r) => r.questionsMatch).length;

      console.log(
        `\nClaudeEngine vs. golden set (${results.length} cas) :\n` +
          `  scope   : ${scopeMatches}/${results.length}\n` +
          `  questions: ${questionMatches}/${results.length}\n` +
          results
            .map(
              (r) =>
                `  - ${r.id}: scope ${r.scopeMatch ? "OK" : `MISMATCH (claude=${r.claudeScope}, attendu=${r.expectedScope})`}, ` +
                `questions ${r.questionsMatch ? "OK" : `MISMATCH (claude=${JSON.stringify(r.claudeQuestionKinds)}, attendu=${JSON.stringify(r.expectedQuestionKinds)})`}`
            )
            .join("\n")
      );

      // Real assertion, not a rubber stamp: ClaudeEngine must at least run
      // without crashing on every case. The score above is reported, not
      // gated — deciding "equals or beats RuleBasedEngine" is a judgment
      // call for a human, per ROADMAP.md M3.
      expect(results).toHaveLength(goldenCases.length);
    },
    120_000
  );
});
