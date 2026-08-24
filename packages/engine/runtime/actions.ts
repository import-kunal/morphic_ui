import { evalAST } from "./interpreter";
import type { Store } from "./state";
import type { ActionPlan, ActionStep } from "../types";
import type { InterpreterContext } from "./interpreter";

export type ActionCallback = (
  type: "open_url" | "send_message",
  payload: string
) => void;

// Executes an ActionPlan sequentially. Halts on the first error.
export function executeActions(
  plan: ActionPlan,
  store: Store,
  resolvedNodes: Record<string, import("../types").ElementNode>,
  onAction?: ActionCallback
): { ok: boolean; error?: string } {
  for (const step of plan.steps) {
    const result = executeStep(step, store, resolvedNodes, onAction);
    if (!result.ok) return result;
  }
  return { ok: true };
}

function executeStep(
  step: ActionStep,
  store: Store,
  resolvedNodes: Record<string, import("../types").ElementNode>,
  onAction?: ActionCallback
): { ok: boolean; error?: string } {
  const ctx: InterpreterContext = {
    storeSnapshot: store.getSnapshot(),
    resolvedNodes,
  };

  switch (step.type) {
    case "set": {
      const value = evalAST(step.valueAST, ctx);
      store.set(`llm.${step.target}`, value);
      return { ok: true };
    }

    case "reset": {
      for (const name of step.targets) {
        // Reset to undefined — the initial value would need to be re-applied separately
        store.set(`llm.${name}`, undefined);
      }
      return { ok: true };
    }

    case "open_url": {
      if (!isAllowedUrl(step.url)) {
        return { ok: false, error: `Blocked URL: only http/https allowed, got '${step.url}'` };
      }
      onAction?.("open_url", step.url);
      return { ok: true };
    }

    case "send_message": {
      onAction?.("send_message", step.message);
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown action step type` };
  }
}

// Security: only http/https URLs are allowed — blocks javascript: and data: URLs.
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
