import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { AggregationType, FileProfile } from "@trame/core";
import { computePivot, PivotCardinalityLimitError, profileWorkbook } from "@trame/core";
import { RuleBasedEngine } from "@trame/engine";
import { buildPivotWorkbook } from "@trame/ooxml";
import Fastify, { type FastifyInstance } from "fastify";
import { extractRows } from "./extractRows";

const AGGREGATIONS: readonly AggregationType[] = ["sum", "avg", "count", "min", "max"];

function isAggregationType(value: unknown): value is AggregationType {
  return typeof value === "string" && (AGGREGATIONS as readonly string[]).includes(value);
}

interface QuestionsRequestBody {
  profile?: FileProfile;
}

interface WorkbookRequestBody {
  rows?: Record<string, unknown>[];
  rowField?: string;
  colField?: string | null;
  measureField?: string;
  aggregation?: string;
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(multipart);

  const engine = new RuleBasedEngine();

  app.post("/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: "Aucun fichier reçu." });
    }

    const buffer = await file.toBuffer();
    const workDir = await mkdtemp(join(tmpdir(), "trame-upload-"));
    try {
      const filePath = join(workDir, file.filename || "upload.xlsx");
      await writeFile(filePath, buffer);

      const profile = await profileWorkbook(filePath);
      const rows = await extractRows(filePath);

      return reply.send({ profile, rows });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  app.post<{ Body: QuestionsRequestBody }>("/questions", async (request, reply) => {
    const { profile } = request.body;
    if (!profile) {
      return reply.status(400).send({ error: "Le champ 'profile' est requis." });
    }

    const questions = await engine.proposeQuestions(profile);
    return reply.send({ questions });
  });

  app.post<{ Body: WorkbookRequestBody }>("/workbook", async (request, reply) => {
    const { rows, rowField, colField, measureField, aggregation } = request.body;

    if (!rows || !rowField || !measureField || !isAggregationType(aggregation)) {
      return reply
        .status(400)
        .send({ error: "rows, rowField, measureField et aggregation (valide) sont requis." });
    }

    let pivot;
    try {
      pivot = computePivot(rows, rowField, colField ?? null, measureField, aggregation);
    } catch (error) {
      if (error instanceof PivotCardinalityLimitError) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }
    const buffer = await buildPivotWorkbook(pivot);

    reply.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    reply.header("Content-Disposition", 'attachment; filename="classeur.xlsx"');
    return reply.send(buffer);
  });

  return app;
}
