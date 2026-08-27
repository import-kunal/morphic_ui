"use client";

import { useCallback, useMemo } from "react";
import { MorphicEngine, type MorphicError } from "@/packages/engine";
import type { ActionCallback } from "@/packages/engine/runtime/actions";
import { morphicLibrary } from "@/packages/elements";
import { MorphicRenderer } from "@/packages/renderer";

interface UiResponseProps {
  response: string;
  isStreaming: boolean;
  onError: (errors: MorphicError[]) => void;
  onFirstRenderable: () => void;
  onSendMessage?: (content: string) => void;
}

export function UiResponse({
  response,
  isStreaming,
  onError,
  onFirstRenderable,
  onSendMessage,
}: UiResponseProps) {
  const engine = useMemo(() => new MorphicEngine({ library: morphicLibrary }), []);
  const handleAction = useCallback<ActionCallback>(
    (type, payload) => {
      if (type === "send_message") {
        onSendMessage?.(payload);
        return;
      }

      try {
        const url = new URL(payload);
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        window.open(url.toString(), "_blank", "noopener,noreferrer");
      } catch {
        // The engine rejects malformed URLs; this protects the host boundary too.
      }
    },
    [onSendMessage]
  );

  return (
    <MorphicRenderer
      engine={engine}
      response={response}
      isStreaming={isStreaming}
      onError={onError}
      onAction={handleAction}
      onFirstRenderable={onFirstRenderable}
    />
  );
}
