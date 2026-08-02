import type { ColumnDataType, FileProfile } from "@trame/core";
import type { Question } from "@trame/engine";

const API_BASE_URL = "http://localhost:3001";

let currentRows: Record<string, unknown>[] = [];
const answers = new Map<string, string>();

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element as T;
}

const engineIndicator = byId<HTMLElement>("engine-indicator");

const fileInput = byId<HTMLInputElement>("file-input");
const uploadButton = byId<HTMLButtonElement>("upload-button");
const uploadStatus = byId<HTMLParagraphElement>("upload-status");

const profileSection = byId<HTMLElement>("profile-section");
const profileTableBody = byId<HTMLTableElement>("profile-table").querySelector("tbody")!;
const ambiguitiesEl = byId<HTMLParagraphElement>("ambiguities");
const duplicatesEl = byId<HTMLParagraphElement>("duplicates");

const questionsSection = byId<HTMLElement>("questions-section");
const questionsList = byId<HTMLDivElement>("questions-list");
const noQuestionsEl = byId<HTMLParagraphElement>("no-questions");

const workbookSection = byId<HTMLElement>("workbook-section");
const rowFieldSelect = byId<HTMLSelectElement>("row-field-select");
const colFieldSelect = byId<HTMLSelectElement>("col-field-select");
const measureFieldSelect = byId<HTMLSelectElement>("measure-field-select");
const aggregationSelect = byId<HTMLSelectElement>("aggregation-select");
const generateButton = byId<HTMLButtonElement>("generate-button");
const workbookStatus = byId<HTMLParagraphElement>("workbook-status");

uploadButton.addEventListener("click", () => {
  void handleUpload();
});
generateButton.addEventListener("click", () => {
  void handleGenerateWorkbook();
});
void loadEngineIndicator();

/** Shows which ClarificationEngine apps/api is actually using — no ambiguity about what's being tested. */
async function loadEngineIndicator(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/engine`);
    const body = (await response.json()) as { engine: "rule" | "claude" };
    engineIndicator.textContent = body.engine === "claude" ? "Moteur : Claude" : "Moteur : règles";
  } catch {
    engineIndicator.textContent = "Moteur : inconnu (apps/api est-il lancé ?)";
  }
}

async function handleUpload(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) {
    uploadStatus.textContent = "Choisissez un fichier .xlsx d'abord.";
    return;
  }

  uploadStatus.textContent = "Analyse en cours...";

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload`, { method: "POST", body: formData });
  if (!response.ok) {
    uploadStatus.textContent = `Erreur lors de l'analyse (HTTP ${response.status}).`;
    return;
  }

  const body = (await response.json()) as { profile: FileProfile; rows: Record<string, unknown>[] };
  currentRows = body.rows;
  uploadStatus.textContent = `Profil obtenu : ${body.profile.rowCount} ligne(s), ${body.profile.columns.length} colonne(s).`;

  renderProfile(body.profile);
  await loadQuestions(body.profile);
  populateWorkbookForm(body.profile);
}

function renderProfile(profile: FileProfile): void {
  profileTableBody.innerHTML = "";
  for (const column of profile.columns) {
    const row = document.createElement("tr");
    const missingPercent = (column.missingRate * 100).toFixed(1);
    row.innerHTML = `<td>${column.name}</td><td>${column.type}</td><td>${missingPercent} %</td>`;
    profileTableBody.appendChild(row);
  }

  ambiguitiesEl.textContent =
    profile.ambiguities.length === 0
      ? "Aucune ambiguïté détectée."
      : profile.ambiguities.map((ambiguity) => ambiguity.message).join(" ");

  duplicatesEl.textContent =
    profile.duplicateRows.length === 0
      ? "Aucun doublon détecté."
      : `${profile.duplicateRows.length} groupe(s) de lignes en double détecté(s).`;

  profileSection.hidden = false;
}

async function loadQuestions(profile: FileProfile): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const body = (await response.json()) as { questions: Question[] };

  questionsList.innerHTML = "";
  answers.clear();

  const hasQuestions = body.questions.length > 0;
  noQuestionsEl.hidden = hasQuestions;
  if (hasQuestions) {
    for (const question of body.questions) {
      questionsList.appendChild(renderQuestion(question, profile));
    }
  }

  questionsSection.hidden = false;
}

function renderQuestion(question: Question, profile: FileProfile): HTMLElement {
  const container = document.createElement("div");
  const text = document.createElement("p");
  text.textContent = question.text;
  container.appendChild(text);

  const answerStatus = document.createElement("small");
  const showAnswer = (value: string): void => {
    answers.set(question.id, value);
    answerStatus.textContent = `Réponse enregistrée : ${value}`;
  };

  if (question.kind === "ambiguous-date-columns") {
    const ambiguity = profile.ambiguities.find(
      (candidate) => candidate.kind === "ambiguous-date-columns"
    );
    const select = document.createElement("select");
    for (const columnName of ambiguity?.columnNames ?? []) {
      select.appendChild(new Option(columnName, columnName));
    }
    select.addEventListener("change", () => showAnswer(select.value));
    if (select.value) {
      showAnswer(select.value);
    }
    container.appendChild(select);
  } else if (question.kind === "duplicate-rows") {
    const keepButton = document.createElement("button");
    keepButton.textContent = "Garder les deux";
    keepButton.addEventListener("click", () => showAnswer("garder"));

    const mergeButton = document.createElement("button");
    mergeButton.textContent = "Fusionner";
    mergeButton.addEventListener("click", () => showAnswer("fusionner"));

    container.appendChild(keepButton);
    container.appendChild(mergeButton);
  }

  container.appendChild(answerStatus);
  return container;
}

// A number column can't sensibly be a grouping dimension (each distinct
// amount becomes its own "category"), and a text/date column can't be
// summed/averaged — restricting the dropdowns to columns that actually make
// sense in each role prevents building a meaningless cross-tab like the one
// that surfaced the grand-total bug.
const CATEGORY_TYPES = new Set<ColumnDataType>(["text", "date"]);
const MEASURE_TYPES = new Set<ColumnDataType>(["number"]);

function populateWorkbookForm(profile: FileProfile): void {
  rowFieldSelect.innerHTML = "";
  measureFieldSelect.innerHTML = "";
  colFieldSelect.innerHTML = "";
  colFieldSelect.appendChild(new Option("Aucune", ""));

  const categoryColumns = profile.columns.filter((column) => CATEGORY_TYPES.has(column.type));
  const measureColumns = profile.columns.filter((column) => MEASURE_TYPES.has(column.type));

  for (const column of categoryColumns) {
    rowFieldSelect.appendChild(new Option(column.name, column.name));
    colFieldSelect.appendChild(new Option(column.name, column.name));
  }
  for (const column of measureColumns) {
    measureFieldSelect.appendChild(new Option(column.name, column.name));
  }

  workbookSection.hidden = false;
}

async function handleGenerateWorkbook(): Promise<void> {
  if (currentRows.length === 0) {
    workbookStatus.textContent = "Déposez d'abord un fichier.";
    return;
  }

  workbookStatus.textContent = "Génération en cours...";

  const response = await fetch(`${API_BASE_URL}/workbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: currentRows,
      rowField: rowFieldSelect.value,
      colField: colFieldSelect.value || null,
      measureField: measureFieldSelect.value,
      aggregation: aggregationSelect.value,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    workbookStatus.textContent = body?.error ?? `Erreur lors de la génération (HTTP ${response.status}).`;
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "classeur.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  workbookStatus.textContent = "Classeur généré et téléchargé.";
}
