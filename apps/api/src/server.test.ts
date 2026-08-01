import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./server";

async function buildTestWorkbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["Poste", "Trimestre", "Budget", "Réalisé"]);
  sheet.addRow(["Marketing", "T1", 1000, 980]);
  sheet.addRow(["Marketing", "T2", 1000, 1020]);
  sheet.addRow(["R&D", "T1", 1500, 1470]);
  sheet.addRow(["R&D", "T2", 1500, 1530]);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("apps/api integration: upload -> questions -> workbook", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs the full journey on a real generated .xlsx, no mocks", async () => {
    const fileBuffer = await buildTestWorkbookBuffer();

    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), "budget.xlsx");

    const uploadResponse = await app.inject({ method: "POST", url: "/upload", payload: form });
    expect(uploadResponse.statusCode).toBe(200);

    const uploadBody = uploadResponse.json() as {
      profile: { columns: { name: string }[]; ambiguities: unknown[]; duplicateRows: unknown[] };
      rows: Record<string, unknown>[];
    };
    expect(uploadBody.profile.columns.map((column) => column.name)).toEqual([
      "Poste",
      "Trimestre",
      "Budget",
      "Réalisé",
    ]);
    expect(uploadBody.rows).toHaveLength(4);
    expect(uploadBody.profile.ambiguities).toEqual([]);
    expect(uploadBody.profile.duplicateRows).toEqual([]);

    const questionsResponse = await app.inject({
      method: "POST",
      url: "/questions",
      payload: { profile: uploadBody.profile },
    });
    expect(questionsResponse.statusCode).toBe(200);
    const questionsBody = questionsResponse.json() as { questions: unknown[] };
    expect(questionsBody.questions).toEqual([]);

    const workbookResponse = await app.inject({
      method: "POST",
      url: "/workbook",
      payload: {
        rows: uploadBody.rows,
        rowField: "Poste",
        measureField: "Réalisé",
        aggregation: "sum",
      },
    });
    expect(workbookResponse.statusCode).toBe(200);
    expect(workbookResponse.headers["content-type"]).toContain("spreadsheetml");

    const outputWorkbook = new ExcelJS.Workbook();
    // See packages/ooxml/src/buildPivotWorkbook.test.ts for why this cast is
    // needed (exceljs's .d.ts vs. modern @types/node's Buffer type only).
    await outputWorkbook.xlsx.load(
      workbookResponse.rawPayload as unknown as Parameters<typeof outputWorkbook.xlsx.load>[0]
    );
    const outputSheet = outputWorkbook.worksheets[0]!;
    expect(outputSheet.getRow(1).values).toEqual([undefined, "Poste", "Réalisé"]);
    expect(outputSheet.getRow(2).values).toEqual([undefined, "Marketing", 2000]);
    expect(outputSheet.getRow(3).values).toEqual([undefined, "R&D", 3000]);
    expect(outputSheet.getRow(4).values).toEqual([undefined, "Total", 5000]);
  });

  it("rejects /workbook when required fields are missing", async () => {
    const response = await app.inject({ method: "POST", url: "/workbook", payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it("rejects /workbook with a clean 400 when rowField has too many distinct values", async () => {
    // Simulates a client choosing a near-unique column (e.g. a raw date) as
    // the dimension — this used to crash the process (see PivotCardinalityLimitError).
    const rows = Array.from({ length: 501 }, (_, i) => ({ key: `k${i}`, amount: i }));

    const response = await app.inject({
      method: "POST",
      url: "/workbook",
      payload: { rows, rowField: "key", measureField: "amount", aggregation: "sum" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining("501") });
  });
});
