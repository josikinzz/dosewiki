import { useSyncExternalStore } from "react";

/**
 * A Map of unsaved wording that tells its owner when it changes. The rows and
 * labels that type into it keep the plain Map API; the workbench subscribes so
 * the shell's unsaved-work registry learns the moment the map fills or empties,
 * without re-rendering the whole tab on every keystroke.
 */
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
    // The constructor's own set calls run before the field initialiser.
    this.listeners?.forEach((listener) => listener());
  }
}

/** Whether the map holds any unsaved entry, re-rendering only when that flips. */
export function useDraftMapHasEntries<K, V>(map: DraftMap<K, V>): boolean {
  return useSyncExternalStore(map.subscribe, () => map.size > 0, () => false);
}

/** The observable form of a plain draft Map type. */
export type DraftMapOf<M> = M extends Map<infer K, infer V> ? DraftMap<K, V> : never;
