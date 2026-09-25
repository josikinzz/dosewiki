import { contentHash } from "../../../../lib/proposals/contentHash";

/**
 * The draft recovery contract: what a /dev tool may keep in this browser so an
 * editor can get unsaved work back after a crash, a forced reload or a lost
 * tab, and what it may never do with it.
 *
 * A checkpoint is a recovery aid, never a record. Postgres stays the source of
 * truth (AGENTS rule 1): nothing here is read by a server, nothing here is
 * ever written anywhere on its own, and a restore only puts the work back in
 * front of the editor, who still saves, submits or publishes it through the
 * tool's own explicit action with its role and revision checks intact.
 *
 * Every checkpoint is scoped four ways:
 *
 * - **Actor.** The key carries a hash of the signed-in account, never the
 *   address itself, and the stored value repeats it. A read under another
 *   account finds nothing. Signing out clears every checkpoint, and a
 *   different account signing in clears the previous account's.
 * - **Tool** and **record.** One checkpoint per open record per tool.
 * - **Baseline revision.** The revision the draft was edited against. A
 *   checkpoint whose baseline is older than what the tool just loaded is a
 *   conflict to review, never a draft to drop over the newer version.
 *
 * A checkpoint may also hold the identity of a write whose outcome is unknown
 * (the request left, no answer came back). Recovering it replays that exact
 * request with the same operation id, so the server answers with the outcome
 * it already recorded instead of applying the write twice.
 *
 * Only the tools named in {@link RECOVERABLE_TOOLS} may keep checkpoints.
 * Intake queues (trip report submissions, article feedback and its reader
 * contact details) are deliberately absent: their retention and access rules
 * are not defined, so a generic browser cache must not hold them.
 */

/** The tools that may keep a checkpoint in this browser. Extend deliberately. */
export const RECOVERABLE_TOOLS = ["writing", "staged-articles"] as const;
export type RecoverableTool = (typeof RECOVERABLE_TOOLS)[number];

/** Named beside the site's other `dosewiki-` keys; `v1` is the value shape below. */
export const DRAFT_RECOVERY_PREFIX = "dosewiki-recovery:v1:";

/** A checkpoint older than this is dropped unread: a two-week-old draft is not recovery. */
export const DRAFT_RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** A write that left and never came back with an answer. */
export interface PendingOperation {
  id: string;
  /** The exact request body, replayed verbatim to reconcile. */
  body: string;
}

export interface DraftCheckpoint<T> {
  v: 1;
  actor: string;
  tool: RecoverableTool;
  record: string;
  /** The revision the draft was edited against. */
  baseline: string;
  savedAt: number;
  draft: T;
  /**
   * The saved version the draft was edited from, when the tool keeps it. A
   * restore against a newer version merges from it, so only fields both
   * sides changed need the editor's choice. Copies without it still restore;
   * every differing field is then the editor's to choose.
   */
  base?: T;
  pending?: PendingOperation;
}

/** The part of the account that names a checkpoint. Stable, lower-cased, never stored raw. */
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

/**
 * One account's checkpoints in one browser. Built only for a signed-in actor;
 * without one there is nothing to read or write.
 */
export interface DraftRecoveryStore {
  actor: string;
  read: <T>(tool: RecoverableTool, record: string) => DraftCheckpoint<T> | null;
  /** Answers when the copy was kept, or `null` when the browser refused it. */
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
      // A value that does not name this actor, tool and record is not this
      // checkpoint, whatever key it sits under.
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
        try { storage.removeItem(key); } catch { /* nothing to recover either way */ }
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
        // A full quota or private mode costs the recovery copy, never the edit.
        return null;
      }
    },
    clear(tool: RecoverableTool, record: string) {
      if (!storage) return;
      try { storage.removeItem(checkpointKey(actor, tool, record)); } catch { /* as above */ }
    },
  };
}

/**
 * Removes checkpoints: every one when `keepActor` is absent (sign-out), or
 * every one but that account's (another account signed in on this browser),
 * plus any of its own past {@link DRAFT_RECOVERY_MAX_AGE_MS}.
 */
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
    try { storage.removeItem(key); } catch { /* as above */ }
  }
}

/** A checkpoint time as editors read it beside a save: "2:14 PM". */
export function formatCheckpointTime(savedAt: number): string {
  return new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
