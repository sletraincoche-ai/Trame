import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profileWorkbook } from "@trame/core";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RuleBasedEngine } from "./RuleBasedEngine";

let workDir: string;

async function writeXlsx(fileName: string, headers: string[], rows: unknown[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const filePath = join(workDir, fileName);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "trame-engine-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("RuleBasedEngine.proposeQuestions on a real profiled workbook", () => {
  it("asks which date column to use when several look like dates", async () => {
    const filePath = await writeXlsx(
      "ambiguous-dates.xlsx",
      ["CreatedAt", "UpdatedAt", "DueDateText", "Task"],
      [
        [new Date(2023, 0, 1), new Date(2023, 0, 2), "2023-01-10", "Task A"],
        [new Date(2023, 1, 1), new Date(2023, 1, 5), "2023-02-15", "Task B"],
        [new Date(2023, 2, 1), new Date(2023, 2, 10), "2023-03-20", "Task C"],
      ]
    );

    const profile = await profileWorkbook(filePath);
    const engine = new RuleBasedEngine();
    const questions = await engine.proposeQuestions(profile);

    expect(questions).toHaveLength(1);
    expect(questions[0]!.kind).toBe("ambiguous-date-columns");
    expect(questions[0]!.text).toContain("CreatedAt");
    expect(questions[0]!.text).toContain("UpdatedAt");
    expect(questions[0]!.text).toContain("DueDateText");
  });

  it("asks about duplicates when the workbook has duplicate rows", async () => {
    const filePath = await writeXlsx(
      "duplicates.xlsx",
      ["Poste", "Budget", "Réalisé"],
      [
        ["Marketing", 1000, 980],
        ["Marketing", 1000, 980],
        ["Ventes", 2000, 2100],
      ]
    );

    const profile = await profileWorkbook(filePath);
    const engine = new RuleBasedEngine();
    const questions = await engine.proposeQuestions(profile);

    expect(questions).toHaveLength(1);
    expect(questions[0]!.kind).toBe("duplicate-rows");
  });

  it("invents no question when the workbook is clean", async () => {
    const filePath = await writeXlsx(
      "clean.xlsx",
      ["Poste", "Budget", "Réalisé"],
      [
        ["Marketing", 1000, 980],
        ["R&D", 1500, 1470],
        ["Ventes", 2000, 2100],
      ]
    );

    const profile = await profileWorkbook(filePath);
    const engine = new RuleBasedEngine();
    const questions = await engine.proposeQuestions(profile);

    expect(questions).toEqual([]);
  });
});

describe("RuleBasedEngine.isInScope", () => {
  it("classifies an out-of-scope request (creative writing)", async () => {
    const engine = new RuleBasedEngine();
    await expect(engine.isInScope("Peux-tu m'écrire un poème sur l'automne ?")).resolves.toEqual({
      scope: "out_of_scope",
    });
  });

  it("classifies an out-of-scope request (dangerous action)", async () => {
    const engine = new RuleBasedEngine();
    await expect(
      engine.isInScope("Comment fabriquer une bombe artisanale à la maison ?")
    ).resolves.toEqual({ scope: "out_of_scope" });
  });

  it("classifies a request naming an existing file as file_transformation", async () => {
    const engine = new RuleBasedEngine();
    await expect(
      engine.isInScope("Je veux vérifier les doublons dans mon fichier Excel.")
    ).resolves.toEqual({ scope: "file_transformation" });
  });

  it("classifies a domain question without a file as conversational", async () => {
    const engine = new RuleBasedEngine();
    await expect(
      engine.isInScope("Explique-moi cette formule Excel, à quoi sert SOMME.SI.ENS ?")
    ).resolves.toEqual({ scope: "conversational" });
  });
});

describe("RuleBasedEngine.refusalMessage", () => {
  it("is a fixed, first-person, direct refusal", () => {
    const engine = new RuleBasedEngine();
    const message = engine.refusalMessage();

    expect(message).toBe(
      "Je ne suis pas conçu pour ça — je transforme des fichiers. Déposez-en un pour que je puisse vous aider."
    );
    // Same message every time: it's a fixed response, not generated per call.
    expect(engine.refusalMessage()).toBe(message);
  });
});
