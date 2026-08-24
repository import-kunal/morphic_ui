import { resolve } from "./parser/resolver";
import { StreamParser } from "./parser/stream";
import { enrichErrors } from "./schema/validate";
import { evaluateTree } from "./runtime/interpreter";
import type { Library } from "./schema/library";
import type { ParseResult, ElementNode } from "./types";

export interface MorphicEngineOptions {
  library: Library;
}

export class MorphicEngine {
  private lib: Library;

  constructor(opts: MorphicEngineOptions) {
    this.lib = opts.library;
  }

  get library(): Library { return this.lib; }

  /** Returns the full MorphicLang system prompt for use in LLM API calls. */
  generatePrompt(): string {
    return this.lib.prompt();
  }

  /** Parses a complete MorphicLang program into a resolved ElementNode tree. */
  parse(text: string): ParseResult {
    const result = resolve(text, { library: this.lib.toSchema() });
    return {
      ...result,
      errors: enrichErrors(result.errors, this.lib),
    };
  }

  /** Creates a StreamParser for incremental chunk-by-chunk parsing. */
  createStreamParser(): StreamParser {
    return new StreamParser(this.lib.toSchema());
  }

  /**
   * Evaluates dynamic props (StateRef, BinOp, Ternary, etc.) against the current store snapshot.
   * Returns a new ElementNode tree with all dynamic props resolved to concrete values.
   */
  evaluate(result: ParseResult, storeSnapshot?: Record<string, unknown>): ElementNode | null {
    if (!result.root) return null;
    // Layer declared $var defaults beneath the live store. Without this, the
    // first render (before the store is hydrated) evaluates StateRefs to null,
    // breaking conditions like `$category == "All"` and silently taking the
    // wrong ternary branch.
    const snapshot: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(result.initialState)) {
      snapshot[`llm.${name}`] = value;
    }
    Object.assign(snapshot, storeSnapshot);
    return evaluateTree(result.root, {
      storeSnapshot: snapshot,
      resolvedNodes: result.resolvedNodes,
      library: this.lib.toSchema(),
    });
  }

  dispose(): void {
    // Phase 4+: clean up store subscriptions, workers, etc.
  }
}
