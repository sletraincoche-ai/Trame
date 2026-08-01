import type { FileProfile, GeneratedFormula } from "@trame/core";

export type QuestionKind = "ambiguous-date-columns" | "duplicate-rows";

export interface Question {
  id: string;
  kind: QuestionKind;
  text: string;
}

export interface ColumnSpec {
  name: string;
  /** 0-based column position in the sheet, consistent with ColumnProfile.position. */
  position: number;
  /** Semantic role this column plays for the requested formula intent. */
  role: "category" | "value" | "reference";
}

export type Formula = GeneratedFormula;

export interface ClarificationEngine {
  isInScope(message: string): Promise<boolean>;
  proposeQuestions(profile: FileProfile): Promise<Question[]>;
  generateFormula(intent: string, columns: ColumnSpec[]): Promise<Formula>;
}
