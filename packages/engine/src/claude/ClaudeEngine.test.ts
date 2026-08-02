import type Anthropic from "@anthropic-ai/sdk";
import type { FileProfile } from "@trame/core";
import { describe, expect, it, vi } from "vitest";
import type { AnthropicMessagesClient } from "./ClaudeEngine";
import { ClaudeEngine } from "./ClaudeEngine";

function textMessage(text: string): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {} as Anthropic.Usage,
  } as unknown as Anthropic.Message;
}

function toolUseMessage(name: string, input: unknown): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "tool_use", id: "tool_1", name, input, caller: { type: "direct" } }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {} as Anthropic.Usage,
  } as unknown as Anthropic.Message;
}

function stubClient(create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>) {
  const mock = vi.fn(create);
  return { client: { messages: { create: mock } } satisfies AnthropicMessagesClient, create: mock };
}

function cleanProfile(): FileProfile {
  return {
    filePath: "test.xlsx",
    sheetName: "Sheet1",
    rowCount: 3,
    columns: [{ name: "Poste", position: 0, type: "text", missingCount: 0, missingRate: 0 }],
    duplicateRows: [],
    ambiguities: [],
  };
}

function profileWithDateAmbiguity(): FileProfile {
  return {
    ...cleanProfile(),
    ambiguities: [{ kind: "ambiguous-date-columns", columnNames: ["CreatedAt", "UpdatedAt"], message: "x" }],
  };
}

describe("ClaudeEngine.isInScope", () => {
  it("maps a valid label to the matching ScopeResult", async () => {
    const { client } = stubClient(async () => textMessage("file_transformation"));
    const engine = new ClaudeEngine({ client });

    await expect(engine.isInScope("peu importe")).resolves.toEqual({ scope: "file_transformation" });
  });

  it("fails closed (out_of_scope) when the model returns something unparseable", async () => {
    const { client } = stubClient(async () => textMessage("je ne sais pas trop"));
    const engine = new ClaudeEngine({ client });

    await expect(engine.isInScope("peu importe")).resolves.toEqual({ scope: "out_of_scope" });
  });

  it("registers no tools for the pass-1 call", async () => {
    const { client, create } = stubClient(async () => textMessage("conversational"));
    const engine = new ClaudeEngine({ client });

    await engine.isInScope("Explique-moi cette formule");

    const params = create.mock.calls[0]![0];
    expect(params.tools).toBeUndefined();
  });
});

describe("ClaudeEngine.proposeQuestions", () => {
  it("keeps a question grounded in a real ambiguity", async () => {
    const { client } = stubClient(async () =>
      toolUseMessage("propose_questions", {
        questions: [
          { id: "q1", kind: "ambiguous-date-columns", text: "Laquelle dois-je utiliser ?" },
        ],
      })
    );
    const engine = new ClaudeEngine({ client });

    const questions = await engine.proposeQuestions(profileWithDateAmbiguity());
    expect(questions).toEqual([{ id: "q1", kind: "ambiguous-date-columns", text: "Laquelle dois-je utiliser ?" }]);
  });

  it("drops a question whose kind isn't backed by the actual profile (no invented ambiguity)", async () => {
    const { client } = stubClient(async () =>
      toolUseMessage("propose_questions", {
        questions: [{ id: "q1", kind: "duplicate-rows", text: "Des doublons, j'imagine ?" }],
      })
    );
    const engine = new ClaudeEngine({ client });

    // Clean profile: no duplicates, so this claimed question must be dropped.
    const questions = await engine.proposeQuestions(cleanProfile());
    expect(questions).toEqual([]);
  });

  it("returns an empty list when the model doesn't call the tool at all", async () => {
    const { client } = stubClient(async () => textMessage("(no tool call)"));
    const engine = new ClaudeEngine({ client });

    await expect(engine.proposeQuestions(cleanProfile())).resolves.toEqual([]);
  });
});

describe("ClaudeEngine.generateFormula", () => {
  it("rejects an unknown intent without ever calling the API", async () => {
    const { client, create } = stubClient(async () => {
      throw new Error("should not be called");
    });
    const engine = new ClaudeEngine({ client });

    await expect(engine.generateFormula("intent_qui_n_existe_pas", [])).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("always uses the deterministic core formula, never whatever Claude echoes back", async () => {
    const { client } = stubClient(async () =>
      toolUseMessage("generate_formula", {
        formula: "=CECI_EST_INVENTE()",
        explanation: "Une explication à la première personne.",
      })
    );
    const engine = new ClaudeEngine({ client });

    const result = await engine.generateFormula("ecart", [
      { name: "Réalisé", position: 2, role: "value" },
      { name: "Budget", position: 1, role: "reference" },
    ]);

    expect(result.formula).toBe("=C2-B2");
    expect(result.explanation).toBe("Une explication à la première personne.");
  });

  it("falls back to core's explanation if Claude's is empty or missing", async () => {
    const { client } = stubClient(async () => toolUseMessage("generate_formula", { formula: "=X", explanation: "" }));
    const engine = new ClaudeEngine({ client });

    const result = await engine.generateFormula("ecart", [
      { name: "Réalisé", position: 2, role: "value" },
      { name: "Budget", position: 1, role: "reference" },
    ]);

    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.formula).toBe("=C2-B2");
  });
});
