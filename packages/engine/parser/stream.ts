import { tokenize } from "./tokenizer";
import { continuesExpression, splitStatements } from "./splitter";
import { parseStatement } from "./grammar";
import { autoclose } from "./autoclose";
import { resolveFromASTMap } from "./resolver";
import type { ASTNode, ParseResult, LibrarySchema } from "../types";

export class StreamParser {
  private buffer = "";
  // Index into buffer where completed statements end (pending starts here)
  private completedEnd = 0;
  // Grammar cache for completed statements: name → ASTNode
  private cachedASTs = new Map<string, ASTNode>();
  private library: LibrarySchema | null;

  constructor(library?: LibrarySchema | null) {
    this.library = library ?? null;
  }

  /** Append a streaming chunk and return an updated ParseResult. */
  push(chunk: string): ParseResult {
    this.buffer += chunk;
    this.promotePendingToCompleted();
    return this.buildResult();
  }

  /** Replace the full text (non-streaming use). Resets all state. */
  set(fullText: string): ParseResult {
    this.buffer = fullText;
    this.completedEnd = 0;
    this.cachedASTs.clear();
    this.promotePendingToCompleted();
    return this.buildResult();
  }

  /** Apply a full snapshot efficiently, appending only its unseen suffix when possible. */
  update(fullText: string): ParseResult {
    return fullText.startsWith(this.buffer)
      ? this.push(fullText.slice(this.buffer.length))
      : this.set(fullText);
  }

  /** Reset to empty state. */
  reset(): void {
    this.buffer = "";
    this.completedEnd = 0;
    this.cachedASTs.clear();
  }

  // Scan forward from completedEnd for newlines at bracket-depth 0.
  // Each such newline terminates a statement — parse it, cache it, advance completedEnd.
  private promotePendingToCompleted(): void {
    let i = this.completedEnd;
    let depth = 0;
    let inString = false;
    let stringChar = '"';
    let stmtStart = i;

    while (i < this.buffer.length) {
      const ch = this.buffer[i]!;

      if (inString) {
        if (ch === "\\") i++; // skip escaped char
        else if (ch === stringChar) inString = false;
        i++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
      } else if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth > 0) depth--;
      } else if (ch === "\n" && depth === 0) {
        const text = this.buffer.slice(stmtStart, i).trim();
        if (text.length === 0) {
          this.completedEnd = i + 1;
          stmtStart = i + 1;
        } else if (!continuesExpression(tokenize(text))) {
          this.parseAndCache(text);
          this.completedEnd = i + 1;
          stmtStart = i + 1;
        }
      }

      i++;
    }
  }

  private parseAndCache(text: string): void {
    const tokens = tokenize(text);
    const stmts = splitStatements(tokens);
    for (const stmt of stmts) {
      const parsed = parseStatement(stmt);
      if (parsed.name && parsed.expr) {
        this.cachedASTs.set(parsed.name, parsed.expr);
      }
    }
  }

  private buildResult(): ParseResult {
    const pendingText = this.buffer.slice(this.completedEnd).trim();

    // Start with all cached completed ASTs
    const astMap: Record<string, ASTNode> = {};
    for (const [name, ast] of this.cachedASTs) {
      astMap[name] = ast;
    }

    let pendingName: string | undefined;

    if (pendingText.length > 0) {
      const { closed } = autoclose(pendingText);
      const tokens = tokenize(closed);
      const stmts = splitStatements(tokens);
      for (const stmt of stmts) {
        const parsed = parseStatement(stmt);
        if (parsed.name && parsed.expr) {
          // Pending can override a same-named completed entry (e.g. re-streamed correction)
          astMap[parsed.name] = parsed.expr;
          pendingName = parsed.name;
        }
      }
    }

    return resolveFromASTMap(astMap, {
      library: this.library,
      pendingStatements: pendingName ? new Set([pendingName]) : undefined,
    });
  }
}
