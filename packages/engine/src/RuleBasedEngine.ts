import { generateFormula as coreGenerateFormula } from "@trame/core";
import type { FileProfile, FormulaColumns, FormulaIntent } from "@trame/core";
import type { ClarificationEngine, ColumnSpec, Formula, Question } from "./types";

const FORMULA_INTENTS: readonly FormulaIntent[] = [
  "total_par_categorie",
  "ecart",
  "ecart_pourcentage",
  "alerte_seuil",
];

function isFormulaIntent(intent: string): intent is FormulaIntent {
  return (FORMULA_INTENTS as readonly string[]).includes(intent);
}

// A handful of examples for M0. This will be replaced by the documented
// refusal policy rather than grown ad hoc.
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /m[ée]t[ée]o/i,
  /quel temps( qu'il)? fait/i,
  /capitale de/i,
  /qui a gagn[ée]/i,
  /pr[ée]sident de/i,
  /[ée]cris(?:-moi)? (?:un po[èe]me|une histoire|une chanson)/i,
  /raconte(?:-moi)? une histoire/i,
  /invente une histoire/i,
];

const BUSINESS_KEYWORDS: RegExp[] = [
  /excel/i,
  /xlsx/i,
  /tableur/i,
  /classeur/i,
  /feuille de calcul/i,
  /colonne/i,
  /cellule/i,
  /formule/i,
  /somme\.si/i,
  /moyenne\.si/i,
  /tableau crois[ée]/i,
  /pivot/i,
  /budget/i,
  /r[ée]alis[ée]/i,
  /[ée]cart/i,
  /doublon/i,
  /\bkpi\b/i,
  /montant/i,
  /\btotal\b/i,
  /fichier/i,
];

function isInScopeRule(message: string): boolean {
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(message))) {
    return false;
  }
  return BUSINESS_KEYWORDS.some((pattern) => pattern.test(message));
}

export class RuleBasedEngine implements ClarificationEngine {
  async isInScope(message: string): Promise<boolean> {
    return isInScopeRule(message);
  }

  async proposeQuestions(profile: FileProfile): Promise<Question[]> {
    const questions: Question[] = [];

    const dateAmbiguity = profile.ambiguities.find(
      (ambiguity) => ambiguity.kind === "ambiguous-date-columns"
    );
    if (dateAmbiguity) {
      questions.push({
        id: "ambiguous-date-columns",
        kind: "ambiguous-date-columns",
        text:
          "Votre fichier contient plusieurs colonnes qui ressemblent à des dates " +
          `(${dateAmbiguity.columnNames.join(", ")}). Laquelle doit servir de référence pour l'analyse ?`,
      });
    }

    if (profile.duplicateRows.length > 0) {
      const totalRows = profile.duplicateRows.reduce((total, group) => total + group.occurrences, 0);
      questions.push({
        id: "duplicate-rows",
        kind: "duplicate-rows",
        text:
          `${profile.duplicateRows.length} groupe(s) de lignes en double ont été détectés ` +
          `(${totalRows} lignes concernées au total). Faut-il les garder, les fusionner ou les supprimer ?`,
      });
    }

    return questions;
  }

  async generateFormula(intent: string, columns: ColumnSpec[]): Promise<Formula> {
    if (!isFormulaIntent(intent)) {
      throw new Error(`RuleBasedEngine.generateFormula: unknown intent "${intent}".`);
    }

    const formulaColumns: FormulaColumns = {};
    for (const column of columns) {
      formulaColumns[column.role] = { name: column.name, position: column.position };
    }

    return coreGenerateFormula(intent, formulaColumns);
  }
}
