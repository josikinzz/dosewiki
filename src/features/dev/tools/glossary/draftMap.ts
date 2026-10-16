import { useSyncExternalStore } from "react";

export class DraftMap<K, V> extends Map<K, V> {
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  override set(key: K, value: V): this {
    super.set(key, value);
    this.emit();
    return this;
  }

  override delete(key: K): boolean {
    const removed = super.delete(key);
    if (removed) this.emit();
    return removed;
  }

  override clear(): void {
    if (this.size === 0) return;
    super.clear();
    this.emit();
  }

  private emit() {
    this.listeners?.forEach((listener) => listener());
  }
}

export function useDraftMapHasEntries<K, V>(map: DraftMap<K, V>): boolean {
  return useSyncExternalStore(map.subscribe, () => map.size > 0, () => false);
}

export type DraftMapOf<M> = M extends Map<infer K, infer V> ? DraftMap<K, V> : never;
