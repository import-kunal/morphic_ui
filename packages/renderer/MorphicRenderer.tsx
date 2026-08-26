"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { MorphicProvider } from "./MorphicProvider";
import { RenderNode } from "./RenderNode";
import { useMorphicState } from "./hooks/useMorphicState";
import { useTriggerAction } from "./hooks/useTriggerAction";
import type { MorphicEngine } from "../engine/engine";
import type { MorphicError } from "../engine/types";
import type { ActionCallback } from "../engine/runtime/actions";

interface MorphicRendererProps {
  engine: MorphicEngine;
  response: string;
  isStreaming?: boolean;
  onError?: (errors: MorphicError[]) => void;
  onAction?: ActionCallback;
  onFirstRenderable?: () => void;
}

export function MorphicRenderer({
  engine,
  response,
  isStreaming = false,
  onError,
  onAction,
  onFirstRenderable,
}: MorphicRendererProps): ReactNode {
  const reportedRenderable = useRef(false);
  const { evaluatedRoot, parseResult, store, errors } = useMorphicState({
    engine,
    response,
    onError,
  });

  const triggerAction = useTriggerAction({
    store,
    resolvedNodes: parseResult.resolvedNodes,
    onAction,
  });

  useEffect(() => {
    if (
      reportedRenderable.current ||
      !evaluatedRoot ||
      evaluatedRoot.typeName.startsWith("__")
    ) {
      return;
    }
    reportedRenderable.current = true;
    onFirstRenderable?.();
  }, [evaluatedRoot, onFirstRenderable]);

  // renderNode converts an unknown prop value into a ReactNode.
  // It handles ElementNode (renders via RenderNode), arrays (maps each item),
  // and primitives (returns as-is for the component to deal with).
  // Nested arrays (from dynamic @Each in children) are flattened one level.
  const renderNode = useCallback(
    (value: unknown): ReactNode => {
      if (value === null || value === undefined) return null;

      if (Array.isArray(value)) {
        const items: ReactNode[] = [];
        let idx = 0;
        for (const item of value) {
          if (item === null || item === undefined) { idx++; continue; }
          // Dynamic @Each in children evaluates to a nested array — flatten it
          if (Array.isArray(item)) {
            for (const sub of item) {
              if (!sub || typeof sub !== "object" || (sub as { type?: string }).type !== "element") { idx++; continue; }
              const sid = (sub as { statementId?: string }).statementId;
              items.push(<RenderNode key={sid != null ? `${sid}:${idx}` : idx} node={sub as Parameters<typeof RenderNode>[0]["node"]} />);
              idx++;
            }
            continue;
          }
          if (typeof item !== "object" || (item as { type?: string }).type !== "element") { idx++; continue; }
          // Prefix with index to avoid key collisions when inline siblings share a parent statementId
          const sid = (item as { statementId?: string }).statementId;
          items.push(<RenderNode key={sid != null ? `${sid}:${idx}` : idx} node={item as Parameters<typeof RenderNode>[0]["node"]} />);
          idx++;
        }
        return items;
      }

      if (
        typeof value === "object" &&
        (value as { type?: string }).type === "element"
      ) {
        return <RenderNode node={value as Parameters<typeof RenderNode>[0]["node"]} />;
      }
      return null;
    },
    []
  );

  return (
    <MorphicProvider
      engine={engine}
      library={engine.library}
      renderNode={renderNode}
      triggerAction={triggerAction}
      isStreaming={isStreaming}
      errors={errors}
    >
      {evaluatedRoot ? <RenderNode node={evaluatedRoot} /> : null}
    </MorphicProvider>
  );
}
