"use client";

import { useCallback } from "react";
import { executeActions } from "../../engine/runtime/actions";
import type { ActionCallback } from "../../engine/runtime/actions";
import type { Store } from "../../engine/runtime/state";
import type { ActionPlan, ElementNode } from "../../engine/types";

export function useTriggerAction({
  store,
  resolvedNodes,
  onAction,
}: {
  store: Store;
  resolvedNodes: Record<string, ElementNode>;
  onAction?: ActionCallback;
}): (plan: ActionPlan) => void {
  return useCallback(
    (plan: ActionPlan) => {
      executeActions(plan, store, resolvedNodes, onAction);
    },
    [store, resolvedNodes, onAction]
  );
}
