// Snapshot-based reactive store.
// State keys from LLM $variables are stored under the "llm." namespace.
// Compatible with React's useSyncExternalStore.

type Subscriber = () => void;

export class Store {
  private state: Record<string, unknown> = {};
  private snapshot: Record<string, unknown> = {};
  private subscribers = new Set<Subscriber>();

  /** Read a value by its full key (e.g. "llm.selectedTab"). */
  get(key: string): unknown {
    return this.state[key];
  }

  /** Write a value. Notifies subscribers only when the snapshot actually changes. */
  set(key: string, value: unknown): void {
    if (this.state[key] === value) return;
    this.state[key] = value;
    const next = { ...this.state };
    if (!shallowEqual(next, this.snapshot)) {
      this.snapshot = next;
      this.subscribers.forEach((fn) => fn());
    }
  }

  /** Returns a stable snapshot object. Same reference if nothing changed. */
  getSnapshot(): Record<string, unknown> {
    return this.snapshot;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Pre-populate from a ParseResult.initialState map (LLM $var declarations). */
  loadInitialState(initialState: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(initialState)) {
      this.state[`llm.${name}`] = value;
    }
    this.snapshot = { ...this.state };
  }
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}
