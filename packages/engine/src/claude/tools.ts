import type Anthropic from "@anthropic-ai/sdk";
import type { AggregationType, QualityCheckRules } from "@trame/core";
import { computePivot, profileWorkbook, qualityCheck } from "@trame/core";
import { buildPivotWorkbook } from "@trame/ooxml";

/**
 * The six tools from ARCHITECTURE.md §5.2, as real Anthropic tool schemas.
 * Every handler below delegates to a function already built and tested in
 * packages/core (or packages/ooxml for assemble_workbook) — Claude decides
 * which tool to call and with what parameters; it never computes a result
 * itself.
 */
export const CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: "profile_file",
    description:
      "Lit un fichier .xlsx déposé et renvoie son profil réel : colonnes détectées, types, taux de valeurs manquantes, doublons potentiels, colonnes de dates ambiguës.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Chemin du fichier .xlsx à profiler." },
      },
      required: ["filePath"],
    },
  },
  {
    name: "propose_questions",
    description:
      "Renvoie la liste finale des questions de clarification à poser, à partir du profil réel d'un fichier. N'invente pas une ambiguïté qui n'est pas dans le profil fourni ; si le fichier est propre, renvoie un tableau vide.",
    input_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              kind: {
                type: "string",
                enum: ["ambiguous-date-columns", "duplicate-rows"],
                description: "Doit correspondre à une ambiguïté ou un doublon réellement présent dans le profil.",
              },
              text: {
                type: "string",
                description: "Question à poser, à la première personne, directe.",
              },
            },
            required: ["id", "kind", "text"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "compute_pivot",
    description: "Calcule un vrai tableau croisé (somme, moyenne, nombre, minimum ou maximum) sur des lignes de données.",
    input_schema: {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object" } },
        rowField: { type: "string" },
        colField: { type: ["string", "null"] },
        measureField: { type: "string" },
        aggregation: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
      },
      required: ["rows", "rowField", "measureField", "aggregation"],
    },
  },
  {
    name: "generate_formula",
    description:
      "Renvoie la formule Excel réelle déjà calculée et une explication en langage courant pour l'intent donné (total_par_categorie, ecart, ecart_pourcentage, alerte_seuil).",
    input_schema: {
      type: "object",
      properties: {
        formula: { type: "string" },
        explanation: {
          type: "string",
          description: "Explication à la première personne, sans jargon inutile.",
        },
      },
      required: ["formula", "explanation"],
    },
  },
  {
    name: "quality_check",
    description:
      "Exécute les six contrôles qualité réels (lignes analysées, cellules vides, cohérence des totaux, doublons, dépassements de seuil, montants arrondis) sur des lignes de données.",
    input_schema: {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object" } },
        rules: { type: "object", description: "QualityCheckRules : voir packages/core/src/types.ts." },
      },
      required: ["rows", "rules"],
    },
  },
  {
    name: "assemble_workbook",
    description:
      "Construit le classeur .xlsx final à partir d'un tableau croisé et renvoie un résumé (dimensions, agrégation) du fichier généré — le fichier binaire lui-même est produit séparément par l'appelant, pas transmis dans la conversation.",
    input_schema: {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object" } },
        rowField: { type: "string" },
        colField: { type: ["string", "null"] },
        measureField: { type: "string" },
        aggregation: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
      },
      required: ["rows", "rowField", "measureField", "aggregation"],
    },
  },
];

export interface PivotToolInput {
  rows: Record<string, unknown>[];
  rowField: string;
  colField?: string | null;
  measureField: string;
  aggregation: AggregationType;
}

/** Delegates profile_file to packages/core's profileWorkbook. */
export async function runProfileFile(input: { filePath: string }): Promise<unknown> {
  return profileWorkbook(input.filePath);
}

/** Delegates compute_pivot to packages/core's computePivot. */
export function runComputePivot(input: PivotToolInput): unknown {
  return computePivot(input.rows, input.rowField, input.colField ?? null, input.measureField, input.aggregation);
}

/** Delegates quality_check to packages/core's qualityCheck. */
export function runQualityCheck(input: { rows: Record<string, unknown>[]; rules: QualityCheckRules }): unknown {
  return qualityCheck(input.rows, input.rules);
}

/**
 * Delegates assemble_workbook to computePivot + packages/ooxml's
 * buildPivotWorkbook, returning a summary rather than the raw binary — a
 * workbook's bytes don't belong in a model's context window.
 */
export async function runAssembleWorkbook(input: PivotToolInput): Promise<{
  sheetName: string;
  rowCount: number;
  columnCount: number;
  byteLength: number;
}> {
  const pivot = runComputePivot(input) as ReturnType<typeof computePivot>;
  const buffer = await buildPivotWorkbook(pivot);
  const columnCount = (pivot.colKeys.length > 0 ? pivot.colKeys.length + 2 : 2);
  return {
    sheetName: "Résultat",
    rowCount: pivot.rowKeys.length + 2, // header + summary row
    columnCount,
    byteLength: buffer.byteLength,
  };
}
