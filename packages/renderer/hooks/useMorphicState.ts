"use client";

import {
  useMemo,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { Store } from "../../engine/runtime/state";
import type { MorphicEngine } from "../../engine/engine";
import type { ElementNode, ParseResult, MorphicError } from "../../engine/types";

export interface UseMorphicStateResult {
  evaluatedRoot: ElementNode | null;
  parseResult: ParseResult;
  store: Store;
  errors: MorphicError[];
}

export function useMorphicState({
  engine,
  response,
  onError,
}: {
  engine: MorphicEngine;
  response: string;
  onError?: (errors: MorphicError[]) => void;
}): UseMorphicStateResult {
  // Stable store instance — lives as long as the engine reference is stable.
  const store = useMemo(() => new Store(), [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable StreamParser — recreated only when the engine changes.
  const sp = useMemo(() => engine.createStreamParser(), [engine]);

  // Parse the full response text on every change.
  // sp.set() scans for completed statements (cached) and re-parses only the pending tail.
  const parseResult = useMemo(() => sp.set(response), [sp, response]);

  // Load $var initial values declared in the program into the store.
  useEffect(() => {
    if (Object.keys(parseResult.initialState).length > 0) {
      store.loadInitialState(parseResult.initialState);
    }
  }, [parseResult.initialState, store]);

  // Subscribe to store changes — re-renders when any $variable is updated.
  const subscribe  = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  const getSnap    = useCallback(() => store.getSnapshot(), [store]);
  const storeSnapshot = useSyncExternalStore(subscribe, getSnap, getSnap);

  // Evaluate dynamic props (StateRef, BinOp, Ternary…) against the current snapshot.
  const evaluatedRoot = useMemo(
    () => engine.evaluate(parseResult, storeSnapshot),
    [engine, parseResult, storeSnapshot]
  );

  // Report errors to the consumer after render.
  useEffect(() => {
    if (parseResult.errors.length > 0) onError?.(parseResult.errors);
  }, [parseResult.errors, onError]);

  return {
    evaluatedRoot,
    parseResult,
    store,
    errors: parseResult.errors,
  };
}
