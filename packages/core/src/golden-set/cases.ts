import type { Ambiguity, ColumnDataType, DuplicateRowGroup } from "../types";

/**
 * The golden set (ARCHITECTURE.md §10.1): ten cases built by hand, not
 * collected from real user files, each with its expected result written
 * down before any code runs on it. See ./cases.md for the human-readable
 * version of the same expectations.
 */

// Mirrors engine's ScopeResult["scope"] / QuestionKind, duplicated on purpose
// rather than imported: packages/core must never depend on packages/engine.
export type GoldenScope = "file_transformation" | "conversational" | "out_of_scope";
export type GoldenQuestionKind = "ambiguous-date-columns" | "duplicate-rows";

export interface GoldenColumnExpectation {
  name: string;
  position: number;
  type: ColumnDataType;
  missingCount: number;
  missingRate: number;
}

export interface GoldenCaseExpectation {
  rowCount: number;
  columns: GoldenColumnExpectation[];
  ambiguities: Ambiguity[];
  duplicateRows: DuplicateRowGroup[];
  message: string;
  scope: GoldenScope;
  questionKinds: GoldenQuestionKind[];
}

export interface GoldenCase {
  id: string;
  description: string;
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  expected: GoldenCaseExpectation;
}

function dateAmbiguityMessage(columnNames: string[]): string {
  return (
    `${columnNames.length} colonnes ressemblent à des dates (${columnNames.join(", ")}) : ` +
    "leur rôle métier respectif n'est pas déterminable automatiquement."
  );
}

export const goldenCases: GoldenCase[] = [
  // --- 3 cas "profil propre" ---------------------------------------------
  {
    id: "budget_clean",
    description: "Suivi budgétaire simple, aucune ambiguïté ni doublon.",
    sheetName: "Sheet1",
    headers: ["Poste", "Budget", "Réalisé"],
    rows: [
      ["Marketing", 1000, 980],
      ["R&D", 1500, 1470],
      ["Ventes", 2000, 2100],
      ["Support", 800, 790],
      ["Direction", 1200, 1150],
    ],
    expected: {
      rowCount: 5,
      columns: [
        { name: "Poste", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Budget", position: 1, type: "number", missingCount: 0, missingRate: 0 },
        { name: "Réalisé", position: 2, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [],
      duplicateRows: [],
      message: "Peux-tu calculer le total par catégorie dans ce fichier de budget ?",
      scope: "file_transformation",
      questionKinds: [],
    },
  },
  {
    id: "ventes_clean",
    description: "Export des ventes par vendeur et région, aucune ambiguïté ni doublon.",
    sheetName: "Sheet1",
    headers: ["Vendeur", "Region", "MontantVente"],
    rows: [
      ["Alice", "Nord", 5000],
      ["Bob", "Sud", 3200],
      ["Carla", "Est", 4100],
      ["David", "Ouest", 2800],
      ["Emma", "Nord", 6100],
    ],
    expected: {
      rowCount: 5,
      columns: [
        { name: "Vendeur", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Region", position: 1, type: "text", missingCount: 0, missingRate: 0 },
        { name: "MontantVente", position: 2, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [],
      duplicateRows: [],
      message: "Fais-moi un tableau croisé des ventes par région dans ce fichier.",
      scope: "file_transformation",
      questionKinds: [],
    },
  },
  {
    id: "rh_clean",
    description: "Effectif RH avec poste et salaire, aucune ambiguïté ni doublon.",
    sheetName: "Sheet1",
    headers: ["Employe", "Poste", "Salaire"],
    rows: [
      ["Nadia", "Ingénieure", 52000],
      ["Omar", "Analyste", 41000],
      ["Priya", "Manager", 61000],
      ["Quentin", "Ingénieur", 53000],
      ["Rania", "Analyste", 42000],
    ],
    expected: {
      rowCount: 5,
      columns: [
        { name: "Employe", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Poste", position: 1, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Salaire", position: 2, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [],
      duplicateRows: [],
      message: "Vérifie les doublons dans ce fichier RH.",
      scope: "file_transformation",
      questionKinds: [],
    },
  },

  // --- 3 cas ambiguïté de colonnes de dates -------------------------------
  {
    id: "taches_dates_3cols",
    description: "Suivi de tâches avec trois colonnes candidates à être LA date (2 réelles + 1 texte).",
    sheetName: "Sheet1",
    headers: ["CreatedAt", "UpdatedAt", "DueDateText", "Task"],
    rows: [
      [new Date(2023, 0, 1), new Date(2023, 0, 2), "2023-01-10", "Task A"],
      [new Date(2023, 1, 1), new Date(2023, 1, 5), "2023-02-15", "Task B"],
      [new Date(2023, 2, 1), new Date(2023, 2, 10), "2023-03-20", "Task C"],
    ],
    expected: {
      rowCount: 3,
      columns: [
        { name: "CreatedAt", position: 0, type: "date", missingCount: 0, missingRate: 0 },
        { name: "UpdatedAt", position: 1, type: "date", missingCount: 0, missingRate: 0 },
        { name: "DueDateText", position: 2, type: "date", missingCount: 0, missingRate: 0 },
        { name: "Task", position: 3, type: "text", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [
        {
          kind: "ambiguous-date-columns",
          columnNames: ["CreatedAt", "UpdatedAt", "DueDateText"],
          message: dateAmbiguityMessage(["CreatedAt", "UpdatedAt", "DueDateText"]),
        },
      ],
      duplicateRows: [],
      message: "Peux-tu m'aider à choisir la bonne colonne de date dans ce fichier de suivi des tâches ?",
      scope: "file_transformation",
      questionKinds: ["ambiguous-date-columns"],
    },
  },
  {
    id: "rh_dates_2cols",
    description: "Dossier RH avec date d'embauche et de départ : exactement 2 colonnes candidates.",
    sheetName: "Sheet1",
    headers: ["Employe", "DateEmbauche", "DateDepart", "Salaire"],
    rows: [
      ["Sami", new Date(2019, 3, 15), new Date(2023, 7, 1), 47000],
      ["Tia", new Date(2020, 8, 1), new Date(2022, 11, 30), 39000],
      ["Umar", new Date(2018, 0, 10), new Date(2021, 5, 20), 55000],
    ],
    expected: {
      rowCount: 3,
      columns: [
        { name: "Employe", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "DateEmbauche", position: 1, type: "date", missingCount: 0, missingRate: 0 },
        { name: "DateDepart", position: 2, type: "date", missingCount: 0, missingRate: 0 },
        { name: "Salaire", position: 3, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [
        {
          kind: "ambiguous-date-columns",
          columnNames: ["DateEmbauche", "DateDepart"],
          message: dateAmbiguityMessage(["DateEmbauche", "DateDepart"]),
        },
      ],
      duplicateRows: [],
      message: "Quelle date dois-je utiliser dans mon fichier RH ?",
      scope: "file_transformation",
      questionKinds: ["ambiguous-date-columns"],
    },
  },
  {
    id: "crm_dates_3cols",
    description: "Export CRM avec création, modification et relance : 3 colonnes candidates.",
    sheetName: "Sheet1",
    headers: ["Client", "DateCreation", "DateModification", "DateRelance", "Montant"],
    rows: [
      ["Client A", new Date(2022, 0, 5), new Date(2022, 5, 1), "2022-06-15", 12000],
      ["Client B", new Date(2022, 2, 10), new Date(2022, 7, 20), "2022-08-01", 8500],
      ["Client C", new Date(2022, 4, 1), new Date(2022, 9, 15), "2022-10-05", 15300],
    ],
    expected: {
      rowCount: 3,
      columns: [
        { name: "Client", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "DateCreation", position: 1, type: "date", missingCount: 0, missingRate: 0 },
        { name: "DateModification", position: 2, type: "date", missingCount: 0, missingRate: 0 },
        { name: "DateRelance", position: 3, type: "date", missingCount: 0, missingRate: 0 },
        { name: "Montant", position: 4, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [
        {
          kind: "ambiguous-date-columns",
          columnNames: ["DateCreation", "DateModification", "DateRelance"],
          message: dateAmbiguityMessage(["DateCreation", "DateModification", "DateRelance"]),
        },
      ],
      duplicateRows: [],
      message: "Aide-moi à analyser les dates dans ce fichier CRM.",
      scope: "file_transformation",
      questionKinds: ["ambiguous-date-columns"],
    },
  },

  // --- 2 cas doublons évidents --------------------------------------------
  {
    id: "depenses_duplicates_1group",
    description: "Suivi de dépenses avec une ligne intégralement dupliquée.",
    sheetName: "Sheet1",
    headers: ["Poste", "Budget", "Réalisé"],
    rows: [
      ["Marketing", 1000, 980],
      ["Marketing", 1000, 980],
      ["R&D", 1500, 1470],
      ["Ventes", 2000, 2100],
      ["Support", 800, 790],
    ],
    expected: {
      rowCount: 5,
      columns: [
        { name: "Poste", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Budget", position: 1, type: "number", missingCount: 0, missingRate: 0 },
        { name: "Réalisé", position: 2, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [],
      duplicateRows: [{ rowNumbers: [2, 3], occurrences: 2 }],
      message: "Peux-tu vérifier les doublons dans ce fichier de dépenses ?",
      scope: "file_transformation",
      questionKinds: ["duplicate-rows"],
    },
  },
  {
    id: "export_crm_duplicates_2groups",
    description: "Export CRM avec deux paires de lignes intégralement dupliquées.",
    sheetName: "Sheet1",
    headers: ["Vendeur", "Region", "Montant"],
    rows: [
      ["Alice", "Nord", 5000],
      ["Bob", "Sud", 3200],
      ["Alice", "Nord", 5000],
      ["Carla", "Est", 4100],
      ["Carla", "Est", 4100],
      ["David", "Ouest", 2800],
    ],
    expected: {
      rowCount: 6,
      columns: [
        { name: "Vendeur", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Region", position: 1, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Montant", position: 2, type: "number", missingCount: 0, missingRate: 0 },
      ],
      ambiguities: [],
      duplicateRows: [
        { rowNumbers: [2, 4], occurrences: 2 },
        { rowNumbers: [5, 6], occurrences: 2 },
      ],
      message: "Ce fichier d'export CRM contient-il des doublons ?",
      scope: "file_transformation",
      questionKinds: ["duplicate-rows"],
    },
  },

  // --- 2 cas valeurs manquantes significatives -----------------------------
  {
    id: "rh_missing_values",
    description: "Effectif RH avec la moitié des salaires manquants.",
    sheetName: "Sheet1",
    headers: ["Employe", "Poste", "Salaire"],
    rows: [
      ["Nadia", "Ingénieure", 52000],
      ["Omar", "Analyste", null],
      ["Priya", "Manager", 61000],
      ["Quentin", "Ingénieur", null],
      ["Rania", "Analyste", 42000],
      ["Sami", "Technicien", null],
    ],
    expected: {
      rowCount: 6,
      columns: [
        { name: "Employe", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Poste", position: 1, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Salaire", position: 2, type: "number", missingCount: 3, missingRate: 0.5 },
      ],
      ambiguities: [],
      duplicateRows: [],
      message: "Ce fichier RH est-il complet ?",
      scope: "file_transformation",
      questionKinds: [],
    },
  },
  {
    id: "budget_missing_values",
    description: "Suivi budgétaire avec la majorité des montants réalisés manquants.",
    sheetName: "Sheet1",
    headers: ["Poste", "Budget", "Réalisé"],
    rows: [
      ["Marketing", 1000, 980],
      ["R&D", 1500, null],
      ["Ventes", 2000, 2100],
      ["Support", 800, null],
      ["Direction", 1200, null],
      ["Logistique", 900, 850],
      ["IT", 1100, null],
    ],
    expected: {
      rowCount: 7,
      columns: [
        { name: "Poste", position: 0, type: "text", missingCount: 0, missingRate: 0 },
        { name: "Budget", position: 1, type: "number", missingCount: 0, missingRate: 0 },
        { name: "Réalisé", position: 2, type: "number", missingCount: 4, missingRate: 4 / 7 },
      ],
      ambiguities: [],
      duplicateRows: [],
      message: "Mon fichier de budget a-t-il des valeurs manquantes ?",
      scope: "file_transformation",
      questionKinds: [],
    },
  },
];
