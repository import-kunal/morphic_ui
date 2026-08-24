"use client";

import { useMorphicContext } from "../MorphicProvider";
import type { MorphicEngine } from "../../engine/engine";
import type { Library } from "../../engine/schema/library";
import type { MorphicError } from "../../engine/types";

export interface UseMorphicResult {
  engine: MorphicEngine;
  library: Library;
  isStreaming: boolean;
  errors: MorphicError[];
}

export function useMorphic(): UseMorphicResult {
  const { engine, library, isStreaming, errors } = useMorphicContext();
  return { engine, library, isStreaming, errors };
}
