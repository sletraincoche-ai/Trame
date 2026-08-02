import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { AggregationType, FileProfile } from "@trame/core";
import { computePivot, PivotCardinalityLimitError, profileWorkbook } from "@trame/core";
import { ClaudeEngine, RuleBasedEngine } from "@trame/engine";
import type { ClarificationEngine } from "@trame/engine";
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

/**
 * ENGINE=rule|claude (default: rule) — ClaudeEngine is never active unless
 * explicitly requested. This is the only place apps/api decides which
 * ClarificationEngine implementation to use.
 */
function createEngine(): ClarificationEngine {
  const engineChoice = process.env.ENGINE ?? "rule";
  if (engineChoice === "claude") {
    return new ClaudeEngine();
  }
  if (engineChoice !== "rule") {
    throw new Error(`Unknown ENGINE "${engineChoice}": expected "rule" or "claude".`);
  }
  return new RuleBasedEngine();
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Local-dev CORS: allow any origin, including static pages opened directly
  // via file:// (whose Origin header is the literal string "null" — origin:
  // true would reflect that back, which some browsers handle inconsistently;
  // a literal "*" avoids the ambiguity entirely). @fastify/cors also
  // registers its own wildcard OPTIONS route automatically, so every route
  // below — JSON or multipart — gets preflight handling for free.
  await app.register(cors, { origin: "*" });
  await app.register(multipart);

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

  app.get("/engine", async (_request, reply) => {
    return reply.send({ engine: process.env.ENGINE === "claude" ? "claude" : "rule" });
  });

  app.post<{ Body: QuestionsRequestBody }>("/questions", async (request, reply) => {
    const { profile } = request.body;
    if (!profile) {
      return reply.status(400).send({ error: "Le champ 'profile' est requis." });
    }

    // Built per request, not once at server startup: a missing/invalid key
    // must never prevent the server itself from starting (ENGINE=claude can
    // be requested without a key configured yet) — only requests that
    // actually need the engine fail, cleanly, with the real error message.
    let engine: ClarificationEngine;
    try {
      engine = createEngine();
    } catch (error) {
      return reply
        .status(500)
        .send({ error: error instanceof Error ? error.message : "Erreur de configuration du moteur." });
    }

    try {
      const questions = await engine.proposeQuestions(profile);
      return reply.send({ questions });
    } catch (error) {
      return reply
        .status(502)
        .send({ error: error instanceof Error ? error.message : "Le moteur de clarification a échoué." });
    }
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
