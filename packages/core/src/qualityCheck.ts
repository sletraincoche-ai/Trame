import { computePivot } from "./computePivot";
import type { QualityCheckResult, QualityCheckRules } from "./types";

const TOTALS_EPSILON = 1e-9;
const DECIMALS_EPSILON = 1e-9;

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === "string" && value.trim() === "";
}

function sumOf(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function checkRowsAnalyzed<T>(rows: T[]): QualityCheckResult {
  const total = rows.length;
  return {
    check: "rows_analyzed",
    label: "Lignes analysées",
    status: total > 0 ? "ok" : "attention",
    value: total,
    message:
      total > 0
        ? `${total} ligne(s) ont été analysées, aucune n'a été ignorée en silence.`
        : "Aucune ligne à analyser : le jeu de données est vide.",
  };
}

function checkEmptyCells<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[] | undefined
): QualityCheckResult {
  const resolvedColumns = columns ?? (rows.length > 0 ? Object.keys(rows[0]!) : []);

  let emptyCount = 0;
  const columnsWithEmpty = new Set<string>();
  for (const row of rows) {
    for (const column of resolvedColumns) {
      if (isEmptyValue(row[column])) {
        emptyCount += 1;
        columnsWithEmpty.add(column);
      }
    }
  }

  return {
    check: "empty_cells",
    label: "Cellules vides",
    status: emptyCount === 0 ? "ok" : "attention",
    value: emptyCount,
    message:
      emptyCount === 0
        ? "Aucune cellule vide détectée sur les colonnes vérifiées."
        : `${emptyCount} cellule(s) vide(s) détectée(s), dans : ${[...columnsWithEmpty].join(", ")}.`,
  };
}

function checkTotalsConsistency<T extends Record<string, unknown>>(
  rows: T[],
  rule: QualityCheckRules["totalsConsistency"]
): QualityCheckResult {
  const aggregation = rule.aggregation ?? "sum";
  const pivot = computePivot(rows, rule.rowField, rule.colField ?? null, rule.measureField, aggregation);

  const rowDelta = Math.abs(sumOf(Object.values(pivot.rowTotals)) - pivot.grandTotal);
  const colDelta = pivot.colField ? Math.abs(sumOf(Object.values(pivot.colTotals)) - pivot.grandTotal) : 0;
  const maxDelta = Math.max(rowDelta, colDelta);

  return {
    check: "totals_consistency",
    label: "Cohérence des totaux",
    status: maxDelta <= TOTALS_EPSILON ? "ok" : "attention",
    value: maxDelta,
    message:
      maxDelta <= TOTALS_EPSILON
        ? `La somme des sous-totaux correspond bien au total général (${pivot.grandTotal}).`
        : `Écart de ${maxDelta} entre la somme des sous-totaux et le total général (${pivot.grandTotal}) : ` +
          `l'agrégation "${aggregation}" choisie ne permet pas de recomposer le total à partir des sous-totaux.`,
  };
}

function checkDuplicateRows<T extends Record<string, unknown>>(
  rows: T[],
  keyColumns: string[]
): QualityCheckResult {
  const occurrences = new Map<string, number>();
  let duplicateRowCount = 0;

  for (const row of rows) {
    const key = JSON.stringify(keyColumns.map((column) => row[column] ?? null));
    const count = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, count);
    if (count > 1) {
      duplicateRowCount += 1;
    }
  }

  return {
    check: "duplicate_rows",
    label: "Lignes en doublon",
    status: duplicateRowCount === 0 ? "ok" : "attention",
    value: duplicateRowCount,
    message:
      duplicateRowCount === 0
        ? `Aucun doublon sur la combinaison ${keyColumns.join(" + ")}.`
        : `${duplicateRowCount} ligne(s) partagent la même combinaison ${keyColumns.join(" + ")} qu'une autre ligne.`,
  };
}

function checkThresholdBreach<T extends Record<string, unknown>>(
  rows: T[],
  rule: QualityCheckRules["threshold"]
): QualityCheckResult {
  const breaches = rows.filter((row) => {
    const value = row[rule.field];
    return typeof value === "number" && Number.isFinite(value) && Math.abs(value) > rule.max;
  }).length;

  return {
    check: "threshold_breach",
    label: "Dépassements de seuil",
    status: breaches === 0 ? "ok" : "attention",
    value: breaches,
    message:
      breaches === 0
        ? `Aucune ligne ne dépasse le seuil de ${Math.round(rule.max * 100)}% sur "${rule.field}".`
        : `${breaches} ligne(s) dépassent le seuil de ${Math.round(rule.max * 100)}% sur "${rule.field}".`,
  };
}

function hasHiddenDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) > DECIMALS_EPSILON;
}

function checkRoundedAmounts<T extends Record<string, unknown>>(
  rows: T[],
  rule: QualityCheckRules["roundedAmounts"]
): QualityCheckResult {
  if (!rule.enabled) {
    return {
      check: "rounded_amounts",
      label: "Montants arrondis",
      status: "ok",
      value: 0,
      message: "Contrôle désactivé.",
    };
  }

  const decimals = rule.decimals ?? 0;
  const hiddenDecimalsCount = rows.filter((row) => {
    const value = row[rule.field];
    return typeof value === "number" && Number.isFinite(value) && hasHiddenDecimals(value, decimals);
  }).length;

  return {
    check: "rounded_amounts",
    label: "Montants arrondis",
    status: hiddenDecimalsCount === 0 ? "ok" : "attention",
    value: hiddenDecimalsCount,
    message:
      hiddenDecimalsCount === 0
        ? `Aucune décimale cachée sur "${rule.field}" au-delà de ${decimals} décimale(s).`
        : `${hiddenDecimalsCount} valeur(s) de "${rule.field}" ont des décimales cachées au-delà de ${decimals} décimale(s).`,
  };
}

export function qualityCheck<T extends Record<string, unknown>>(
  rows: T[],
  rules: QualityCheckRules
): QualityCheckResult[] {
  return [
    checkRowsAnalyzed(rows),
    checkEmptyCells(rows, rules.emptyCellColumns),
    checkTotalsConsistency(rows, rules.totalsConsistency),
    checkDuplicateRows(rows, rules.duplicateKeyColumns),
    checkThresholdBreach(rows, rules.threshold),
    checkRoundedAmounts(rows, rules.roundedAmounts),
  ];
}
