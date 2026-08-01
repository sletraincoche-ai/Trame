import type { FormulaColumnRef, FormulaColumns, FormulaIntent, GeneratedFormula } from "./types";

const FIRST_DATA_ROW = 2;
const DEFAULT_ROW = 2;
const DEFAULT_THRESHOLD = 0.1;

function columnLetter(position: number): string {
  let n = position + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellRef(column: FormulaColumnRef, row: number): string {
  return `${columnLetter(column.position)}${row}`;
}

function rangeRef(column: FormulaColumnRef, fromRow: number, toRow: number): string {
  return `${columnLetter(column.position)}${fromRow}:${columnLetter(column.position)}${toRow}`;
}

function requireColumn(
  columns: FormulaColumns,
  key: "category" | "value" | "reference"
): FormulaColumnRef {
  const column = columns[key];
  if (!column) {
    throw new Error(`generateFormula: missing "${key}" column reference.`);
  }
  return column;
}

function buildTotalParCategorie(columns: FormulaColumns): GeneratedFormula {
  const category = requireColumn(columns, "category");
  const value = requireColumn(columns, "value");
  const row = columns.row ?? DEFAULT_ROW;
  const lastDataRow = columns.lastDataRow ?? row;

  const formula =
    `=SOMME.SI.ENS(${rangeRef(value, FIRST_DATA_ROW, lastDataRow)};` +
    `${rangeRef(category, FIRST_DATA_ROW, lastDataRow)};${cellRef(category, row)})`;

  const explanation =
    `Additionne les valeurs de "${value.name}" pour toutes les lignes dont "${category.name}" ` +
    `correspond à la catégorie de la ligne ${row}.`;

  return { intent: "total_par_categorie", formula, explanation };
}

function buildEcart(columns: FormulaColumns): GeneratedFormula {
  const value = requireColumn(columns, "value");
  const reference = requireColumn(columns, "reference");
  const row = columns.row ?? DEFAULT_ROW;

  const formula = `=${cellRef(value, row)}-${cellRef(reference, row)}`;
  const explanation =
    `Calcule la différence entre "${value.name}" et "${reference.name}" pour la ligne ${row} : ` +
    `un résultat positif signifie que "${value.name}" dépasse "${reference.name}".`;

  return { intent: "ecart", formula, explanation };
}

function buildEcartPourcentage(columns: FormulaColumns): GeneratedFormula {
  const value = requireColumn(columns, "value");
  const reference = requireColumn(columns, "reference");
  const row = columns.row ?? DEFAULT_ROW;

  const formula = `=(${cellRef(value, row)}-${cellRef(reference, row)})/${cellRef(reference, row)}`;
  const explanation =
    `Exprime l'écart entre "${value.name}" et "${reference.name}" en pourcentage de ` +
    `"${reference.name}", pour la ligne ${row}.`;

  return { intent: "ecart_pourcentage", formula, explanation };
}

function buildAlerteSeuil(columns: FormulaColumns): GeneratedFormula {
  const value = requireColumn(columns, "value");
  const reference = requireColumn(columns, "reference");
  const row = columns.row ?? DEFAULT_ROW;
  const threshold = columns.threshold ?? DEFAULT_THRESHOLD;

  const formula =
    `=SI(ABS(${cellRef(value, row)}-${cellRef(reference, row)})/${cellRef(reference, row)}>` +
    `${threshold};"Alerte";"OK")`;
  const explanation =
    `Signale "Alerte" pour la ligne ${row} si l'écart entre "${value.name}" et "${reference.name}" ` +
    `dépasse ${Math.round(threshold * 100)}% de "${reference.name}", sinon "OK".`;

  return { intent: "alerte_seuil", formula, explanation };
}

export function generateFormula(intent: FormulaIntent, columns: FormulaColumns): GeneratedFormula {
  switch (intent) {
    case "total_par_categorie":
      return buildTotalParCategorie(columns);
    case "ecart":
      return buildEcart(columns);
    case "ecart_pourcentage":
      return buildEcartPourcentage(columns);
    case "alerte_seuil":
      return buildAlerteSeuil(columns);
  }
}
