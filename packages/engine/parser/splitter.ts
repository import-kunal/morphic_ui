import { TokenType } from "../types";
import type { Token, Statement } from "../types";

// Splits a flat token array into Statement[].
// Splits only on Newline tokens at bracket depth 0, except when inside a ternary continuation.
export function splitStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let current: Token[] = [];
  let depth = 0;       // bracket/paren/brace nesting depth
  let ternaryDepth = 0; // tracks unmatched '?' to detect ternary continuation

  for (const token of tokens) {
    if (token.type === TokenType.EOF) break;

    if (token.type === TokenType.Newline) {
      if (depth === 0 && ternaryDepth === 0 && current.length > 0) {
        statements.push(makeStatement(current));
        current = [];
      }
      // else: inside brackets or ternary — swallow the newline
      continue;
    }

    // Track bracket depth
    if (
      token.type === TokenType.LParen ||
      token.type === TokenType.LBrack ||
      token.type === TokenType.LBrace
    ) {
      depth++;
    } else if (
      token.type === TokenType.RParen ||
      token.type === TokenType.RBrack ||
      token.type === TokenType.RBrace
    ) {
      depth = Math.max(0, depth - 1);
    }

    // Track ternary depth at bracket depth 0
    // '?' increments, ':' that closes a ternary decrements
    if (depth === 0) {
      if (token.type === TokenType.Question) {
        ternaryDepth++;
      } else if (token.type === TokenType.Colon && ternaryDepth > 0) {
        ternaryDepth--;
      }
    }

    current.push(token);
  }

  // Flush any remaining tokens as a final (possibly partial) statement
  if (current.length > 0) {
    statements.push(makeStatement(current));
  }

  return statements;
}

let statementCounter = 0;

function makeStatement(tokens: Token[]): Statement {
  // Use first Ident/Type token value as the id for readability; fall back to counter
  const nameToken = tokens.find(
    (t) => t.type === TokenType.Ident || t.type === TokenType.Type
  );
  const id = nameToken ? nameToken.value : `stmt_${statementCounter++}`;
  return { id, tokens };
}
