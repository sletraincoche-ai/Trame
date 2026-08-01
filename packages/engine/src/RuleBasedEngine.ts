import { generateFormula as coreGenerateFormula } from "@trame/core";
import type { FileProfile, FormulaColumns, FormulaIntent } from "@trame/core";
import type { ClarificationEngine, ColumnSpec, Formula, Question, ScopeResult } from "./types";

const FORMULA_INTENTS: readonly FormulaIntent[] = [
  "total_par_categorie",
  "ecart",
  "ecart_pourcentage",
  "alerte_seuil",
];

function isFormulaIntent(intent: string): intent is FormulaIntent {
  return (FORMULA_INTENTS as readonly string[]).includes(intent);
}

// A handful of examples per refusal category (ARCHITECTURE.md §10.2), not an
// exhaustive list. This will be replaced by the documented refusal policy
// rather than grown ad hoc.
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  // météo
  /m[ée]t[ée]o/i,
  /quel temps( qu'il)? fait/i,
  // culture générale
  /capitale de/i,
  /qui a gagn[ée]/i,
  /pr[ée]sident de/i,
  // écriture créative
  /[ée]cris(?:-moi)? (?:un po[èe]me|une histoire|une chanson)/i,
  /raconte(?:-moi)? une histoire/i,
  /invente une histoire/i,
  // demandes d'action dangereuse
  /fabriquer (?:une bombe|une arme|des explosifs|de la drogue)/i,
  /comment (?:pirater|hacker) (?:un compte|un syst[èe]me|un ordinateur)/i,
  /me procurer une arme/i,
  /aide-moi [àa] (?:blesser|faire du mal [àa])/i,
];

// Domain keywords: presence signals the message is at least about Excel/data,
// whether or not an actual file is in play.
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

// Deictic reference to an actual, existing file — the best proxy `isInScope`
// can use from a bare message string to tell "there is a file in play" apart
// from a purely conceptual question (ARCHITECTURE.md §3's "cas limite").
const FILE_REFERENCE_PATTERNS: RegExp[] = [
  /\b(?:ce|mon|notre|le) fichier\b/i,
  /\bce (?:tableau|classeur)\b/i,
  /\bcette feuille\b/i,
  /\.xlsx\b/i,
  /\.xlsm\b/i,
  /\.csv\b/i,
];

// Explanatory framing ("explain", "what is") rather than a request to act on
// data — the other half of the "cas limite" distinction.
const EXPLANATORY_PATTERNS: RegExp[] = [
  /explique(?:-moi)?/i,
  /qu'est-ce (?:que|qu')/i,
  /comment fonctionne/i,
  /[àa] quoi sert/i,
  /c'est quoi/i,
  /quelle est la diff[ée]rence entre/i,
];

// The fixed refusal response (ARCHITECTURE.md §3): shown whenever isInScope
// resolves to "out_of_scope", first person and direct, no attempt to be
// helpful outside the product's actual scope.
const REFUSAL_MESSAGE =
  "Je ne suis pas conçu pour ça — je transforme des fichiers. Déposez-en un pour que je puisse vous aider.";

function isInScopeRule(message: string): ScopeResult {
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { scope: "out_of_scope" };
  }

  const mentionsDomain = BUSINESS_KEYWORDS.some((pattern) => pattern.test(message));
  if (!mentionsDomain) {
    return { scope: "out_of_scope" };
  }

  const referencesFile = FILE_REFERENCE_PATTERNS.some((pattern) => pattern.test(message));
  const isExplanatory = EXPLANATORY_PATTERNS.some((pattern) => pattern.test(message));

  if (isExplanatory && !referencesFile) {
    return { scope: "conversational" };
  }

  return { scope: "file_transformation" };
}

export class RuleBasedEngine implements ClarificationEngine {
  async isInScope(message: string): Promise<ScopeResult> {
    return isInScopeRule(message);
  }

  /** Fixed refusal response to show when isInScope resolves to "out_of_scope". */
  refusalMessage(): string {
    return REFUSAL_MESSAGE;
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
          "J'ai trouvé plusieurs colonnes qui ressemblent à des dates " +
          `(${dateAmbiguity.columnNames.join(", ")}) : laquelle dois-je utiliser comme référence pour l'analyse ?`,
      });
    }

    if (profile.duplicateRows.length > 0) {
      const totalRows = profile.duplicateRows.reduce((total, group) => total + group.occurrences, 0);
      questions.push({
        id: "duplicate-rows",
        kind: "duplicate-rows",
        text:
          `J'ai trouvé ${profile.duplicateRows.length} groupe(s) de lignes en double ` +
          `(${totalRows} lignes au total) : dois-je les garder, les fusionner, ou les supprimer ?`,
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
