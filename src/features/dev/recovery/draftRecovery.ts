import { contentHash } from "../../../../lib/proposals/contentHash";

export const RECOVERABLE_TOOLS = ["writing", "staged-articles"] as const;
export type RecoverableTool = (typeof RECOVERABLE_TOOLS)[number];

export const DRAFT_RECOVERY_PREFIX = "dosewiki-recovery:v1:";

export const DRAFT_RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface PendingOperation {
  id: string;
  body: string;
}

export interface DraftCheckpoint<T> {
  v: 1;
  actor: string;
  tool: RecoverableTool;
  record: string;
  baseline: string;
  savedAt: number;
  draft: T;
  base?: T;
  pending?: PendingOperation;
}

export function recoveryActorKey(identity: string | null | undefined): string | null {
  const value = identity?.trim().toLowerCase();
  return value ? contentHash(`dosewiki-recovery-actor:${value}`).slice(0, 32) : null;
}

function isRecoverableTool(tool: string): tool is RecoverableTool {
  return (RECOVERABLE_TOOLS as readonly string[]).includes(tool);
}

function checkpointKey(actor: string, tool: RecoverableTool, record: string): string {
  return `${DRAFT_RECOVERY_PREFIX}${actor}:${tool}:${encodeURIComponent(record)}`;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function storedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DRAFT_RECOVERY_PREFIX)) keys.push(key);
  }
  return keys;
}

export interface DraftRecoveryStore {
  actor: string;
  read: <T>(tool: RecoverableTool, record: string) => DraftCheckpoint<T> | null;
  write: <T>(checkpoint: Omit<DraftCheckpoint<T>, "v" | "actor" | "savedAt">) => number | null;
  clear: (tool: RecoverableTool, record: string) => void;
}

export function createDraftRecoveryStore(
  actor: string,
  { storage = browserStorage(), now = Date.now }: { storage?: Storage | null; now?: () => number } = {},
): DraftRecoveryStore {
  return {
    actor,
    read<T>(tool: RecoverableTool, record: string) {
      if (!storage || !isRecoverableTool(tool)) return null;
      const key = checkpointKey(actor, tool, record);
      let parsed: DraftCheckpoint<T> | null = null;
      try {
        const raw = storage.getItem(key);
        parsed = raw ? (JSON.parse(raw) as DraftCheckpoint<T>) : null;
      } catch {
        parsed = null;
      }
      if (!parsed) return null;
      const age = now() - parsed.savedAt;
      if (
        parsed.v !== 1 ||
        parsed.actor !== actor ||
        parsed.tool !== tool ||
        parsed.record !== record ||
        typeof parsed.baseline !== "string" ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > DRAFT_RECOVERY_MAX_AGE_MS
      ) {
        try { storage.removeItem(key); } catch {   }
        return null;
      }
      return parsed;
    },
    write<T>(checkpoint: Omit<DraftCheckpoint<T>, "v" | "actor" | "savedAt">) {
      if (!storage || !isRecoverableTool(checkpoint.tool)) return null;
      const savedAt = now();
      const value: DraftCheckpoint<T> = { v: 1, actor, savedAt, ...checkpoint };
      try {
        storage.setItem(checkpointKey(actor, checkpoint.tool, checkpoint.record), JSON.stringify(value));
        return savedAt;
      } catch {
        return null;
      }
    },
    clear(tool: RecoverableTool, record: string) {
      if (!storage) return;
      try { storage.removeItem(checkpointKey(actor, tool, record)); } catch {   }
    },
  };
}

export function clearDraftRecovery(
  { keepActor, storage = browserStorage(), now = Date.now }: { keepActor?: string | null; storage?: Storage | null; now?: () => number } = {},
): void {
  if (!storage) return;
  for (const key of storedKeys(storage)) {
    const owner = key.slice(DRAFT_RECOVERY_PREFIX.length).split(":")[0];
    let expired = false;
    if (keepActor && owner === keepActor) {
      try {
        const savedAt = (JSON.parse(storage.getItem(key) ?? "null") as { savedAt?: number } | null)?.savedAt;
        expired = typeof savedAt !== "number" || now() - savedAt > DRAFT_RECOVERY_MAX_AGE_MS;
      } catch {
        expired = true;
      }
      if (!expired) continue;
    }
    try { storage.removeItem(key); } catch {   }
  }
}

export function formatCheckpointTime(savedAt: number): string {
  return new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
