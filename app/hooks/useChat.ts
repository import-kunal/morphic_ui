"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMode,
  ReasoningEffort,
  ChatStreamEvent,
  ChatStreamMetrics,
  ToolActivity,
} from "@/lib/chat-protocol";

export type ChatActivityItem =
  | { id: string; type: "reasoning"; text: string }
  | { id: string; type: "tool"; callId: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  mode: ChatMode;
  content: string;
  contentRevision?: number;
  reasoning?: string;
  toolActivity?: ToolActivity[];
  activityTimeline?: ChatActivityItem[];
  reasoningEffort?: ReasoningEffort;
  preparationStartedAt?: number;
  isStreaming: boolean;
  requestId?: string;
  error?: string;
  metrics?: ChatStreamMetrics;
};

type ChatRoute = "/api/chat/ui" | "/api/chat/text";

export function useChat(route: ChatRoute = "/api/chat/ui") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    []
  );

  const send = useCallback(
    async (userContent: string) => {
      const content = userContent.trim();
      if (!content || inFlightRef.current) return;

      inFlightRef.current = true;
      setIsLoading(true);

      const requestMode: ChatMode = route.endsWith("/ui") ? "ui" : "text";
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        mode: requestMode,
        content,
        isStreaming: false,
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        mode: requestMode,
        content: "",
        contentRevision: 0,
        reasoning: "",
        toolActivity: [],
        activityTimeline: [],
        preparationStartedAt: Date.now(),
        isStreaming: true,
      };

      const priorMessages = messagesRef.current;
      const nextMessages = [...priorMessages, userMsg, assistantMsg];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);

      const history = [...priorMessages, userMsg]
        .filter(
          (message) =>
            message.mode === requestMode && message.content.trim().length > 0
        )
        .map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        }));

      const requestController = new AbortController();
      abortControllerRef.current = requestController;
      let pendingText = "";
      let pendingReasoning = "";
      let animationFrame: number | null = null;
      let streamError: string | null = null;
      let reasoningSequence = 0;
      let startNewReasoningSegment = true;

      const updateAssistant = (update: Partial<ChatMessage>) => {
        setMessages((current) => {
          const updated = current.map((message) =>
            message.id === assistantId ? { ...message, ...update } : message
          );
          messagesRef.current = updated;
          return updated;
        });
      };

      const flushPendingContent = () => {
        animationFrame = null;
        if (!pendingText && !pendingReasoning) return;
        const text = pendingText;
        const reasoning = pendingReasoning;
        const reasoningId = `reasoning-${reasoningSequence++}`;
        const forceNewReasoning = startNewReasoningSegment;
        if (reasoning) startNewReasoningSegment = false;
        pendingText = "";
        pendingReasoning = "";
        setMessages((current) => {
          const updated = current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content + text,
                  reasoning: (message.reasoning ?? "") + reasoning,
                  activityTimeline: appendReasoningActivity(
                    message.activityTimeline,
                    reasoning,
                    reasoningId,
                    forceNewReasoning
                  ),
                }
              : message
          );
          messagesRef.current = updated;
          return updated;
        });
      };

      const queueText = (text: string) => {
        pendingText += text;
        if (animationFrame === null) {
          animationFrame = requestAnimationFrame(flushPendingContent);
        }
      };

      const queueReasoning = (text: string) => {
        pendingReasoning += text;
        if (animationFrame === null) {
          animationFrame = requestAnimationFrame(flushPendingContent);
        }
      };

      const flushPendingNow = () => {
        if (animationFrame !== null) {
          cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        flushPendingContent();
      };

      const resetAssistantContent = () => {
        if (animationFrame !== null) {
          cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        const reasoning = pendingReasoning;
        const reasoningId = `reasoning-${reasoningSequence++}`;
        const forceNewReasoning = startNewReasoningSegment;
        pendingText = "";
        pendingReasoning = "";
        setMessages((current) => {
          const updated = current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: "",
                  contentRevision: (message.contentRevision ?? 0) + 1,
                  reasoning: (message.reasoning ?? "") + reasoning,
                  activityTimeline: appendReasoningActivity(
                    message.activityTimeline,
                    reasoning,
                    reasoningId,
                    forceNewReasoning
                  ),
                }
              : message
          );
          messagesRef.current = updated;
          return updated;
        });
        startNewReasoningSegment = true;
      };

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case "start":
            updateAssistant({
              requestId: event.requestId,
              reasoningEffort: event.reasoningEffort,
            });
            break;
          case "reasoning_delta":
            queueReasoning(event.text);
            break;
          case "content_reset":
            resetAssistantContent();
            break;
          case "tool_started":
            flushPendingNow();
            startNewReasoningSegment = true;
            setMessages((current) => {
              const updated = current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      toolActivity: [
                        ...(message.toolActivity ?? []),
                        {
                          callId: event.callId,
                          tool: event.tool,
                          title: event.title,
                          startedAt: event.startedAt,
                          status: "running" as const,
                        },
                      ],
                      activityTimeline: [
                        ...(message.activityTimeline ?? []),
                        {
                          id: `tool-${event.callId}`,
                          type: "tool" as const,
                          callId: event.callId,
                        },
                      ],
                    }
                  : message
              );
              messagesRef.current = updated;
              return updated;
            });
            break;
          case "tool_completed":
            flushPendingNow();
            setMessages((current) => {
              const updated = current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      toolActivity: (message.toolActivity ?? []).map((activity) =>
                        activity.callId === event.callId
                          ? {
                              ...activity,
                              title: event.title,
                              status: event.status,
                              durationMs: event.durationMs,
                              source: event.source,
                              rowCount: event.rowCount,
                            }
                          : activity
                      ),
                    }
                  : message
              );
              messagesRef.current = updated;
              return updated;
            });
            break;
          case "delta":
            queueText(event.text);
            break;
          case "done":
            flushPendingNow();
            updateAssistant({ metrics: event.metrics });
            break;
          case "error":
            flushPendingNow();
            streamError = event.message;
            updateAssistant({ requestId: event.requestId, error: event.message });
            break;
        }
      };

      try {
        const response = await fetch(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: requestController.signal,
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Request failed (HTTP ${response.status})`);
        }
        if (!response.body) throw new Error("The server returned an empty stream.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) handleEvent(JSON.parse(data) as ChatStreamEvent);
            boundary = buffer.indexOf("\n\n");
          }

          if (done) break;
        }

        if (buffer.trim()) {
          throw new Error("The response stream ended with an incomplete event.");
        }
      } catch (error) {
        const wasCancelled = requestController.signal.aborted;
        if (!wasCancelled && !streamError) {
          updateAssistant({
            error: error instanceof Error ? error.message : "Request failed",
          });
        }
      } finally {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        flushPendingContent();
        updateAssistant({ isStreaming: false });
        if (abortControllerRef.current === requestController) {
          abortControllerRef.current = null;
        }
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [route]
  );

  const clear = useCallback(() => {
    const activeRequest = abortControllerRef.current;
    abortControllerRef.current = null;
    activeRequest?.abort();
    inFlightRef.current = false;
    messagesRef.current = [];
    setMessages([]);
    setIsLoading(false);
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { messages, isLoading, send, stop, clear };
}

function appendReasoningActivity(
  timeline: ChatActivityItem[] | undefined,
  text: string,
  id: string,
  forceNew: boolean
): ChatActivityItem[] {
  const current = timeline ?? [];
  if (!text) return current;

  const last = current.at(-1);
  if (last?.type === "reasoning" && !forceNew) {
    return [
      ...current.slice(0, -1),
      { ...last, text: last.text + text },
    ];
  }

  return [...current, { id, type: "reasoning", text }];
}
