/**
 * Exact Anthropic API model ID. Per the current model roster, Sonnet 5's
 * API id is "claude-sonnet-5". If the API ever rejects this with an
 * "unknown model" error (roster changes over time — see ARCHITECTURE.md
 * §5.1: "ne pas figer un nom de modèle... le principe à retenir est la
 * séparation, pas le nom"), only this constant needs to change — nothing
 * else in ClaudeEngine depends on the literal string.
 */
export const CLAUDE_MODEL = "claude-sonnet-5";

/**
 * Pass-1 scope classification (ARCHITECTURE.md §5.1/§3) is meant to be a
 * short, cheap, frequent call — architecturally it should use a smaller/
 * faster model than the composition pass. Until a second model is actually
 * chosen, it points at the same model as CLAUDE_MODEL; only this constant
 * would need to change to introduce that split.
 */
export const CLAUDE_SCOPE_MODEL = CLAUDE_MODEL;
