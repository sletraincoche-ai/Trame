import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AggregationType, FileProfile, FuzzParams } from "@trame/core";
import {
  buildFuzzWorkbookSpec,
  computePivot,
  generateFuzzParams,
  PivotCardinalityLimitError,
  profileWorkbook,
  writeFuzzWorkbook,
} from "@trame/core";
import { RuleBasedEngine } from "@trame/engine";
import { buildPivotWorkbook } from "@trame/ooxml";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractRows } from "../extractRows";

/**
 * Fuzz suite over the full pipeline: profileWorkbook -> RuleBasedEngine ->
 * computePivot/buildPivotWorkbook, across the 4 aggregations (the previous
 * "Total" mislabeling bug only showed up outside "sum", which is exactly why
 * every aggregation is exercised here, not just sum).
 *
 * Fully reproducible: MASTER_SEED drives both which 100 parameter
 * combinations are generated and each case's actual data, so a failure here
 * can always be replayed by re-running with the same seed printed below.
 */
const MASTER_SEED = 20260801;
const CASE_COUNT = 100;
const AGGREGATIONS: readonly AggregationType[] = ["sum", "avg", "min", "max"];

// Independent of packages/ooxml's internal label map on purpose: re-deriving
// the expectation here is what makes this a real check, not a tautology.
const EXPECTED_SUMMARY_LABEL: Record<AggregationType, string> = {
  sum: "Total",
  count: "Total",
  avg: "Moyenne",
  min: "Minimum",
  max: "Maximum",
};

const VALID_SCOPES = new Set(["file_transformation", "conversational", "out_of_scope"]);

interface FuzzFailure {
  seed: number;
  caseIndex: number;
  aggregation?: AggregationType | undefined;
  invariant: string;
  detail: string;
  params: FuzzParams;
}

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-fuzz-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("fuzz: full pipeline invariants", () => {
  it(
    `holds across ${CASE_COUNT} generated files x ${AGGREGATIONS.length} aggregations`,
    async () => {
      const paramsList = generateFuzzParams(MASTER_SEED, CASE_COUNT);
      const failures: FuzzFailure[] = [];
      const engine = new RuleBasedEngine();

      for (const [caseIndex, params] of paramsList.entries()) {
        const record = (invariant: string, detail: string, aggregation?: AggregationType): void => {
          failures.push({ seed: params.seed, caseIndex, aggregation, invariant, detail, params });
        };


        const spec = buildFuzzWorkbookSpec(params);
        const filePath = join(workDir, `fuzz-${caseIndex}.xlsx`);

        let profile: FileProfile;
        try {
          await writeFuzzWorkbook(spec, filePath);
          profile = await profileWorkbook(filePath);
        } catch (error) {
          record(
            "profileWorkbook ne lève jamais d'exception, même sur fichier vide",
            error instanceof Error ? error.message : String(error)
          );
          continue;
        }

        const columnNames = new Set(profile.columns.map((column) => column.name));

        if (profile.rowCount !== params.rowCount) {
          record(
            "rowCount correspond au vrai nombre de lignes",
            `profile.rowCount=${profile.rowCount}, attendu ${params.rowCount}`
          );
        }

        for (const ambiguity of profile.ambiguities) {
          if (ambiguity.kind !== "ambiguous-date-columns") continue;
          for (const name of ambiguity.columnNames) {
            if (!columnNames.has(name)) {
              record(
                "toute colonne ambiguous-date-columns existe dans les colonnes détectées",
                `colonne "${name}" absente de profile.columns`
              );
            }
          }
        }

        const message = `Vérifie ce fichier : ${profile.columns[0]?.name ?? "(aucune colonne)"} (${profile.rowCount} lignes)`;
        try {
          const scopeResult = await engine.isInScope(message);
          if (!VALID_SCOPES.has(scopeResult.scope)) {
            record("isInScope ne renvoie jamais un scope invalide", `reçu: ${JSON.stringify(scopeResult)}`);
          }
        } catch (error) {
          record("isInScope ne lève jamais d'exception", error instanceof Error ? error.message : String(error));
        }

        let questions: Awaited<ReturnType<typeof engine.proposeQuestions>> = [];
        try {
          questions = await engine.proposeQuestions(profile);
        } catch (error) {
          record(
            "proposeQuestions ne lève jamais d'exception",
            error instanceof Error ? error.message : String(error)
          );
        }
        for (const question of questions) {
          if (question.kind !== "ambiguous-date-columns") continue;
          const relatedAmbiguity = profile.ambiguities.find((a) => a.kind === "ambiguous-date-columns");
          for (const name of relatedAmbiguity?.columnNames ?? []) {
            if (!columnNames.has(name)) {
              record(
                "aucune question ne référence une colonne absente du profil",
                `question "${question.id}" référence "${name}", absente du profil`
              );
            }
          }
        }

        // rowField/colField follow apps/web's real dropdown restriction:
        // text or date columns only (never number). Fuzzed date columns can
        // still carry up to ~2700 distinct values, which is exactly what
        // first drove this suite into an OOM crash — that finding became the
        // separate PivotCardinalityLimitError guard in computePivot, which
        // the try/catch below treats as an expected outcome, not a failure.
        const categoricalColumns = profile.columns.filter(
          (column) => column.type === "text" || column.type === "date"
        );
        const numberColumns = profile.columns.filter((column) => column.type === "number");
        const measureField = numberColumns[numberColumns.length - 1]?.name;

        if (categoricalColumns.length === 0 || !measureField) {
          // No categorical column at all (possible when columnCount is small
          // and consumed entirely by number columns): apps/web's Dimension
          // dropdown would be empty here too, so there's nothing to check.
          continue;
        }

        const rowField = categoricalColumns[0]!.name;
        const colField = categoricalColumns.find((column) => column.name !== rowField)?.name ?? null;

        let rows: Record<string, unknown>[];
        try {
          rows = await extractRows(filePath);
        } catch (error) {
          record("extractRows ne lève jamais d'exception", error instanceof Error ? error.message : String(error));
          continue;
        }

        for (const aggregation of AGGREGATIONS) {
          try {
            const pivot = computePivot(rows, rowField, colField, measureField, aggregation);
            const buffer = await buildPivotWorkbook(pivot);

            const outputWorkbook = new ExcelJS.Workbook();
            await outputWorkbook.xlsx.load(
              buffer as unknown as Parameters<typeof outputWorkbook.xlsx.load>[0]
            );
            const sheet = outputWorkbook.worksheets[0]!;
            const summaryLabel = sheet.getRow(sheet.rowCount).getCell(1).value;

            if (summaryLabel !== EXPECTED_SUMMARY_LABEL[aggregation]) {
              record(
                "l'étiquette de synthèse correspond à l'agrégation réellement utilisée",
                `étiquette="${String(summaryLabel)}", attendu="${EXPECTED_SUMMARY_LABEL[aggregation]}"`,
                aggregation
              );
            }
          } catch (error) {
            // A high-cardinality dimension throwing PivotCardinalityLimitError
            // is the intended, documented behavior (see computePivot.ts) —
            // not a pipeline invariant violation, so it's not recorded here.
            if (!(error instanceof PivotCardinalityLimitError)) {
              record(
                "computePivot/buildPivotWorkbook ne lèvent jamais d'exception (hors dépassement de cardinalité documenté)",
                error instanceof Error ? error.message : String(error),
                aggregation
              );
            }
          }
        }
      }

      console.log(
        `Fuzz: ${paramsList.length} cas testés (seed maître ${MASTER_SEED}), ${failures.length} échec(s).`
      );
      if (failures.length > 0) {
        console.log(JSON.stringify(failures, null, 2));
      }

      expect(failures).toEqual([]);
    },
    300_000
  );
});
