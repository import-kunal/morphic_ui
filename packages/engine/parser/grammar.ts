import { TokenType } from "../types";
import type { Token, ASTNode, Statement } from "../types";

// Precedence levels (lower = looser binding)
const enum Prec {
  None       = 0,
  Ternary    = 1,
  Or         = 2,
  And        = 3,
  Equality   = 4,
  Comparison = 5,
  Addition   = 6,
  Multiply   = 7,
  Unary      = 8,
  Member     = 9,
}

export interface ParseError {
  message: string;
  pos: number;
}

export interface GrammarResult {
  /** The RHS expression of `identifier = expression` */
  expr: ASTNode | null;
  /** The LHS name */
  name: string;
  errors: ParseError[];
}

export function parseStatement(stmt: Statement): GrammarResult {
  const parser = new Parser(stmt.tokens);
  return parser.parseStatement();
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseStatement(): GrammarResult {
    // Expected form: `name = expression`  OR  `$stateVar = expression`
    const nameToken = this.peek();

    if (nameToken.type === TokenType.StateVar) {
      // $var = initialValue declaration
      this.advance();
      if (this.peek().type !== TokenType.Equals) {
        return { name: `$${nameToken.value}`, expr: null, errors: [{ message: "Expected '=' after $var", pos: this.peek().pos }] };
      }
      this.advance();
      const expr = this.parseExpr(Prec.None);
      return { name: `$${nameToken.value}`, expr, errors: this.errors };
    }

    if (
      nameToken.type !== TokenType.Ident &&
      nameToken.type !== TokenType.Type
    ) {
      return { name: "", expr: null, errors: [{ message: "Expected identifier", pos: nameToken.pos }] };
    }

    const name = nameToken.value;
    this.advance();

    if (this.peek().type !== TokenType.Equals) {
      return { name, expr: null, errors: [{ message: "Expected '=' after identifier", pos: this.peek().pos }] };
    }
    this.advance(); // consume '='

    const expr = this.parseExpr(Prec.None);
    return { name, expr, errors: this.errors };
  }

  private parseExpr(minPrec: number): ASTNode {
    let left = this.parsePrefix();

    while (true) {
      const t = this.peek();
      const prec = infixPrec(t.type);
      if (prec <= minPrec) break;
      left = this.parseInfix(left, prec, t);
    }

    return left;
  }

  private parsePrefix(): ASTNode {
    const t = this.peek();

    // Unary minus
    if (t.type === TokenType.Minus) {
      this.advance();
      const operand = this.parseExpr(Prec.Unary);
      return { k: "UnaryOp", op: "-", operand };
    }

    // Unary not
    if (t.type === TokenType.Not) {
      this.advance();
      const operand = this.parseExpr(Prec.Unary);
      return { k: "UnaryOp", op: "!", operand };
    }

    // Grouped expression
    if (t.type === TokenType.LParen) {
      this.advance();
      const inner = this.parseExpr(Prec.None);
      this.expect(TokenType.RParen);
      return inner;
    }

    // Array
    if (t.type === TokenType.LBrack) {
      return this.parseArray();
    }

    // Object
    if (t.type === TokenType.LBrace) {
      return this.parseObject();
    }

    // String
    if (t.type === TokenType.Str) {
      this.advance();
      return { k: "Str", value: t.value };
    }

    // Number
    if (t.type === TokenType.Num) {
      this.advance();
      return { k: "Num", value: parseFloat(t.value) };
    }

    // Boolean / null
    if (t.type === TokenType.True)  { this.advance(); return { k: "Bool", value: true }; }
    if (t.type === TokenType.False) { this.advance(); return { k: "Bool", value: false }; }
    if (t.type === TokenType.Null)  { this.advance(); return { k: "Null" }; }

    // State variable: $name
    if (t.type === TokenType.StateVar) {
      this.advance();
      // Two-way binding: $var = expr (only valid at statement level but we handle here too)
      if (this.peek().type === TokenType.Equals) {
        this.advance();
        const value = this.parseExpr(Prec.None);
        return { k: "Assign", name: t.value, value };
      }
      return { k: "StateRef", name: t.value };
    }

    // Component call: PascalCase(...)
    if (t.type === TokenType.Type) {
      this.advance();
      if (this.peek().type === TokenType.LParen) {
        return this.parseComponentCall(t.value);
      }
      // Bare PascalCase without parens — treat as reference (unusual but handle it)
      return { k: "Ref", name: t.value };
    }

    // Builtin call: @Name(...)
    if (t.type === TokenType.BuiltinCall) {
      this.advance();
      return this.parseBuiltinCall(t.value);
    }

    // Lowercase identifier → reference
    if (t.type === TokenType.Ident) {
      this.advance();
      return { k: "Ref", name: t.value };
    }

    this.errors.push({ message: `Unexpected token: '${t.value}'`, pos: t.pos });
    this.advance();
    return { k: "Null" };
  }

  private parseInfix(left: ASTNode, prec: number, t: Token): ASTNode {
    // Ternary — right-associative: parse the else at Prec.None so a chained
    // `a ? x : b ? y : z` nests as `a ? x : (b ? y : z)`, not `(a ? x : b) ? y : z`.
    if (t.type === TokenType.Question) {
      this.advance();
      const then = this.parseExpr(Prec.None);
      this.expect(TokenType.Colon);
      const els = this.parseExpr(Prec.None);
      return { k: "Ternary", cond: left, then, else: els };
    }

    // Member access
    if (t.type === TokenType.Dot) {
      this.advance();
      const prop = this.peek();
      if (prop.type !== TokenType.Ident && prop.type !== TokenType.Type) {
        this.errors.push({ message: "Expected property name after '.'", pos: prop.pos });
        return left;
      }
      this.advance();
      return { k: "Member", object: left, property: prop.value };
    }

    // Index access
    if (t.type === TokenType.LBrack) {
      this.advance();
      const index = this.parseExpr(Prec.None);
      this.expect(TokenType.RBrack);
      return { k: "Index", object: left, index };
    }

    // Binary operators
    this.advance();
    const right = this.parseExpr(prec); // left-associative
    return { k: "BinOp", op: t.value, left, right };
  }

  private parseComponentCall(name: string): ASTNode {
    this.expect(TokenType.LParen);

    const positional: ASTNode[] = [];
    const named: Record<string, ASTNode> = {};
    let seenNamed = false;

    while (this.peek().type !== TokenType.RParen && this.peek().type !== TokenType.EOF) {
      // Detect `ident =` pattern — named arg
      if (
        this.peek().type === TokenType.Ident &&
        this.peekAt(1).type === TokenType.Equals
      ) {
        seenNamed = true;
        const argName = this.peek().value;
        this.advance(); // consume ident
        this.advance(); // consume '='
        const value = this.parseExpr(Prec.None);
        named[argName] = value;
      } else {
        // Positional arg
        if (seenNamed) {
          this.errors.push({
            message: `Positional arg after named arg in component '${name}'`,
            pos: this.peek().pos,
          });
        }
        positional.push(this.parseExpr(Prec.None));
      }

      if (this.peek().type === TokenType.Comma) {
        this.advance();
      } else {
        break;
      }
    }

    this.expect(TokenType.RParen);
    return { k: "Comp", name, positional, named };
  }

  private parseBuiltinCall(name: string): ASTNode {
    // Builtins use the same syntax as component calls
    this.expect(TokenType.LParen);

    const positional: ASTNode[] = [];
    const named: Record<string, ASTNode> = {};

    while (this.peek().type !== TokenType.RParen && this.peek().type !== TokenType.EOF) {
      if (
        this.peek().type === TokenType.Ident &&
        this.peekAt(1).type === TokenType.Equals
      ) {
        const argName = this.peek().value;
        this.advance();
        this.advance();
        named[argName] = this.parseExpr(Prec.None);
      } else {
        positional.push(this.parseExpr(Prec.None));
      }

      if (this.peek().type === TokenType.Comma) {
        this.advance();
      } else {
        break;
      }
    }

    this.expect(TokenType.RParen);
    // Represent builtins as a Comp node with a special "@" prefix
    return { k: "Comp", name: `@${name}`, positional, named };
  }

  private parseArray(): ASTNode {
    this.expect(TokenType.LBrack);
    const items: ASTNode[] = [];

    while (this.peek().type !== TokenType.RBrack && this.peek().type !== TokenType.EOF) {
      items.push(this.parseExpr(Prec.None));
      if (this.peek().type === TokenType.Comma) {
        this.advance();
      } else {
        break;
      }
    }

    this.expect(TokenType.RBrack);
    return { k: "Arr", items };
  }

  private parseObject(): ASTNode {
    this.expect(TokenType.LBrace);
    const entries: Array<{ key: string; value: ASTNode }> = [];

    while (this.peek().type !== TokenType.RBrace && this.peek().type !== TokenType.EOF) {
      const keyToken = this.peek();
      if (keyToken.type !== TokenType.Ident && keyToken.type !== TokenType.Str) {
        this.errors.push({ message: "Expected object key", pos: keyToken.pos });
        break;
      }
      this.advance();
      this.expect(TokenType.Colon);
      const value = this.parseExpr(Prec.None);
      entries.push({ key: keyToken.value, value });

      if (this.peek().type === TokenType.Comma) {
        this.advance();
      } else {
        break;
      }
    }

    this.expect(TokenType.RBrace);
    return { k: "Obj", entries };
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: "", pos: -1 };
  }

  private peekAt(offset: number): Token {
    return this.tokens[this.pos + offset] ?? { type: TokenType.EOF, value: "", pos: -1 };
  }

  private advance(): Token {
    const t = this.peek();
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      this.errors.push({ message: `Expected token type ${type}, got '${t.value}'`, pos: t.pos });
    } else {
      this.advance();
    }
    return t;
  }
}

function infixPrec(type: TokenType): number {
  switch (type) {
    case TokenType.Question: return Prec.Ternary;
    case TokenType.Or:       return Prec.Or;
    case TokenType.And:      return Prec.And;
    case TokenType.EqEq:
    case TokenType.BangEq:   return Prec.Equality;
    case TokenType.Gt:
    case TokenType.Lt:
    case TokenType.GtEq:
    case TokenType.LtEq:     return Prec.Comparison;
    case TokenType.Plus:
    case TokenType.Minus:    return Prec.Addition;
    case TokenType.Star:
    case TokenType.Slash:
    case TokenType.Percent:  return Prec.Multiply;
    case TokenType.Dot:
    case TokenType.LBrack:   return Prec.Member;
    default:                 return Prec.None;
  }
}
