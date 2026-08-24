"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { MorphicEngine } from "../engine/engine";
import type { Library } from "../engine/schema/library";
import type { ActionPlan, MorphicError } from "../engine/types";

export interface MorphicContextValue {
  engine: MorphicEngine;
  library: Library;
  /** Recursive render function — passed to every element component renderer. */
  renderNode: (value: unknown) => ReactNode;
  triggerAction: (plan: ActionPlan) => void;
  isStreaming: boolean;
  errors: MorphicError[];
}

const MorphicContext = createContext<MorphicContextValue | null>(null);

export function MorphicProvider({
  children,
  ...value
}: MorphicContextValue & { children: ReactNode }) {
  return (
    <MorphicContext.Provider value={value}>
      {children}
    </MorphicContext.Provider>
  );
}

export function useMorphicContext(): MorphicContextValue {
  const ctx = useContext(MorphicContext);
  if (!ctx) throw new Error("Must be used inside <MorphicProvider>");
  return ctx;
}
