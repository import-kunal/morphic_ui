import { TokenType } from "../types";
import type { Token } from "../types";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const start = i;
    const ch = source[i]!;

    // Whitespace (non-newline)
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    // Newline
    if (ch === "\n") {
      tokens.push({ type: TokenType.Newline, value: "\n", pos: start });
      i++;
      continue;
    }

    // Comments
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // String literals
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i++;
          const esc = source[i];
          if (esc === "n")       str += "\n";
          else if (esc === "t")  str += "\t";
          else if (esc === "\\") str += "\\";
          else if (esc === '"')  str += '"';
          else if (esc === "'")  str += "'";
          else                   str += esc ?? "";
        } else {
          str += source[i];
        }
        i++;
      }
      if (i < source.length) i++; // consume closing quote
      tokens.push({ type: TokenType.Str, value: str, pos: start });
      continue;
    }

    // Numbers
    if (isDigit(ch) || (ch === "-" && isDigit(source[i + 1] ?? "") && isUnaryMinus(tokens))) {
      let numStr = ch;
      i++;
      while (i < source.length && (isDigit(source[i]!) || source[i] === ".")) {
        numStr += source[i];
        i++;
      }
      tokens.push({ type: TokenType.Num, value: numStr, pos: start });
      continue;
    }

    // Identifiers, keywords, PascalCase types, $statevar, @builtins
    if (ch === "$") {
      i++;
      let name = "";
      while (i < source.length && isIdentChar(source[i]!)) {
        name += source[i];
        i++;
      }
      tokens.push({ type: TokenType.StateVar, value: name, pos: start });
      continue;
    }

    if (ch === "@") {
      i++;
      let name = "";
      while (i < source.length && isIdentChar(source[i]!)) {
        name += source[i];
        i++;
      }
      tokens.push({ type: TokenType.BuiltinCall, value: name, pos: start });
      continue;
    }

    if (isLetter(ch) || ch === "_") {
      let word = "";
      while (i < source.length && isIdentChar(source[i]!)) {
        word += source[i];
        i++;
      }
      const type = keywordOrIdent(word);
      tokens.push({ type, value: word, pos: start });
      continue;
    }

    // Two-char operators
    const two = source.slice(i, i + 2);
    if (two === "==") { tokens.push({ type: TokenType.EqEq,   value: "==", pos: start }); i += 2; continue; }
    if (two === "!=") { tokens.push({ type: TokenType.BangEq, value: "!=", pos: start }); i += 2; continue; }
    if (two === ">=") { tokens.push({ type: TokenType.GtEq,   value: ">=", pos: start }); i += 2; continue; }
    if (two === "<=") { tokens.push({ type: TokenType.LtEq,   value: "<=", pos: start }); i += 2; continue; }
    if (two === "&&") { tokens.push({ type: TokenType.And,    value: "&&", pos: start }); i += 2; continue; }
    if (two === "||") { tokens.push({ type: TokenType.Or,     value: "||", pos: start }); i += 2; continue; }
    if (two === "??") { tokens.push({ type: TokenType.Coalesce, value: "??", pos: start }); i += 2; continue; }

    // Single-char tokens
    switch (ch) {
      case "(": tokens.push({ type: TokenType.LParen,  value: "(", pos: start }); i++; break;
      case ")": tokens.push({ type: TokenType.RParen,  value: ")", pos: start }); i++; break;
      case "[": tokens.push({ type: TokenType.LBrack,  value: "[", pos: start }); i++; break;
      case "]": tokens.push({ type: TokenType.RBrack,  value: "]", pos: start }); i++; break;
      case "{": tokens.push({ type: TokenType.LBrace,  value: "{", pos: start }); i++; break;
      case "}": tokens.push({ type: TokenType.RBrace,  value: "}", pos: start }); i++; break;
      case ",": tokens.push({ type: TokenType.Comma,   value: ",", pos: start }); i++; break;
      case ":": tokens.push({ type: TokenType.Colon,   value: ":", pos: start }); i++; break;
      case "=": tokens.push({ type: TokenType.Equals,  value: "=", pos: start }); i++; break;
      case ".": tokens.push({ type: TokenType.Dot,     value: ".", pos: start }); i++; break;
      case "?": tokens.push({ type: TokenType.Question, value: "?", pos: start }); i++; break;
      case "+": tokens.push({ type: TokenType.Plus,    value: "+", pos: start }); i++; break;
      case "-": tokens.push({ type: TokenType.Minus,   value: "-", pos: start }); i++; break;
      case "*": tokens.push({ type: TokenType.Star,    value: "*", pos: start }); i++; break;
      case "/": tokens.push({ type: TokenType.Slash,   value: "/", pos: start }); i++; break;
      case "%": tokens.push({ type: TokenType.Percent, value: "%", pos: start }); i++; break;
      case "!": tokens.push({ type: TokenType.Not,     value: "!", pos: start }); i++; break;
      case ">": tokens.push({ type: TokenType.Gt,      value: ">", pos: start }); i++; break;
      case "<": tokens.push({ type: TokenType.Lt,      value: "<", pos: start }); i++; break;
      default: i++; // skip unknown chars
    }
  }

  tokens.push({ type: TokenType.EOF, value: "", pos: i });
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isIdentChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === "_";
}

function isPascalCase(word: string): boolean {
  return word.length > 0 && word[0]! >= "A" && word[0]! <= "Z";
}

function keywordOrIdent(word: string): TokenType {
  if (word === "true")  return TokenType.True;
  if (word === "false") return TokenType.False;
  if (word === "null")  return TokenType.Null;
  if (isPascalCase(word)) return TokenType.Type;
  return TokenType.Ident;
}

// Unary minus: minus is unary if the previous meaningful token is an operator or open bracket
function isUnaryMinus(tokens: Token[]): boolean {
  for (let j = tokens.length - 1; j >= 0; j--) {
    const t = tokens[j]!;
    if (t.type === TokenType.Newline) continue;
    return (
      t.type === TokenType.LParen ||
      t.type === TokenType.LBrack ||
      t.type === TokenType.Comma  ||
      t.type === TokenType.Equals ||
      t.type === TokenType.Colon  ||
      t.type === TokenType.Plus   ||
      t.type === TokenType.Minus  ||
      t.type === TokenType.Star   ||
      t.type === TokenType.Slash  ||
      t.type === TokenType.Percent
    );
  }
  return true;
}
