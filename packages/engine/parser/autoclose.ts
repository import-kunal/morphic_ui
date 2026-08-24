// Patches incomplete MorphicLang source for streaming.
// Scans for unclosed brackets/strings and appends the minimum closing characters.

export interface AutocloseResult {
  closed: string;
  wasIncomplete: boolean;
}

export function autoclose(source: string): AutocloseResult {
  const stack: Array<"(" | "[" | "{"> = [];
  let inString = false;
  let stringChar = '"';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;

    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped character
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch as "(" | "[" | "{");
    } else if (ch === ")") {
      if (stack.length > 0 && stack[stack.length - 1] === "(") stack.pop();
    } else if (ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === "[") stack.pop();
    } else if (ch === "}") {
      if (stack.length > 0 && stack[stack.length - 1] === "{") stack.pop();
    }
  }

  const wasIncomplete = inString || stack.length > 0;

  if (!wasIncomplete) return { closed: source, wasIncomplete: false };

  let suffix = "";
  if (inString) suffix += stringChar;
  for (let i = stack.length - 1; i >= 0; i--) {
    const open = stack[i]!;
    suffix += open === "(" ? ")" : open === "[" ? "]" : "}";
  }

  return { closed: source + suffix, wasIncomplete: true };
}
