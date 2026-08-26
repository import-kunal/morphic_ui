"use client";

import { useState } from "react";
import { ChatWindow } from "@/app/components/chat/ChatWindow";
import { ChatInput } from "@/app/components/chat/ChatInput";
import { useChat } from "@/app/hooks/useChat";

export default function ChatPage() {
  const [mode, setMode] = useState<"ui" | "text">("ui");
  const { messages, isLoading, send } = useChat(
    mode === "ui" ? "/api/chat/ui" : "/api/chat/text"
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatWindow messages={messages} onSuggestion={send} />
      <ChatInput
        onSend={send}
        isLoading={isLoading}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  );
}
