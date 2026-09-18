import type { WarningBannerPreset } from "@/data/substanceWarningBanners";

/** Private editor projection; public warning DTOs carry no revision token. */
export type EditableWarningPreset = WarningBannerPreset & { baseHash?: string };

export type WarningRevision = {
  revisionId: string; key: string; actorEmail: string; actorRole: string; createdAt: string;
  scope: "assignment" | "preset"; slug?: string; operation: "publish" | "remove" | "restore";
  before: WarningBannerPreset | null; after: WarningBannerPreset | null;
  baseHash: string; resultHash: string; changeId: string; affectedSlugs: string[];
  allSubstances: boolean; publications: string[];
};
export type WarningResult = {
  key: string; changeId: string; baseHash: string; preset: WarningBannerPreset | null;
  affectedSlugs: string[]; allSubstances: boolean; enabledSlugs: string[];
};
export type WarningEditorState = {
  preset: WarningBannerPreset | null; baseHash: string; history: WarningRevision[];
  operation: WarningResult | null;
};
export class WarningRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const API = "/api/dev/warning-banner";
export async function readWarningState(key: string, changeId?: string): Promise<WarningEditorState> {
  return readWarningJson<WarningEditorState>(`${API}?${new URLSearchParams({ key, ...(changeId ? { changeId } : {}) })}`);
}
export async function readWarningJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new WarningRequestError(payload.error ?? "Unable to load warnings. Try again.", response.status);
  return payload as T;
}

// An uncertain write keeps its operation identity, including across panel reopens.
// Retrying reconciles first and can only repeat that exact idempotent request.
type PendingWarning = {
  fingerprint: string; changeId: string; method: "POST" | "DELETE";
  body: Record<string, unknown> & { key: string };
};
const pending = new Map<string, PendingWarning>();

export function pendingWarning(key: string) {
  return pending.get(key) ?? null;
}

export function pendingArticleWarning(slug: string) {
  for (const operation of pending.values()) {
    if (operation.body.slug === slug) return operation;
  }
  return null;
}

/** Only an explicit user retry calls this; it never reconstructs a changed draft. */
export async function retryPendingWarning(key: string) {
  const operation = pending.get(key);
  if (!operation) throw new Error("No unresolved warning operation remains. Reload its current version.");
  return writeWarning(operation.method, operation.body);
}
export async function writeWarning(method: "POST" | "DELETE", body: Record<string, unknown> & { key: string }): Promise<WarningResult> {
  const fingerprint = JSON.stringify({ method, body });
  const previous = pending.get(body.key);
  let changeId = previous?.changeId;
  if (changeId) {
    const state = await readWarningState(body.key, changeId);
    if (state.operation) {
      pending.delete(body.key);
      if (previous?.fingerprint !== fingerprint) throw new Error("The previous warning publication committed. Reload its current version before publishing different edits.");
      return state.operation;
    }
    if (previous?.fingerprint !== fingerprint) throw new Error("The previous warning publication remains unconfirmed. Retry the original edits to reconcile that operation before making another change.");
  } else {
    changeId = crypto.randomUUID();
    pending.set(body.key, { fingerprint, changeId, method, body: JSON.parse(JSON.stringify(body)) });
  }
  try {
    const response = await fetch(API, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, changeId }) });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status < 500 && !(previous && (response.status === 401 || response.status === 403))) pending.delete(body.key);
      throw new WarningRequestError(payload.error ?? "Warning publication was rejected. Your local changes remain.", response.status);
    }
    if (payload.changeId !== changeId || typeof payload.baseHash !== "string") throw new Error("The warning response could not be confirmed.");
    pending.delete(body.key);
    return payload as WarningResult;
  } catch (error) {
    if (error instanceof WarningRequestError && error.status < 500) throw error;
    const state = await readWarningState(body.key, changeId);
    if (state.operation) { pending.delete(body.key); return state.operation; }
    throw new Error("Publication is not yet confirmed. Keep these edits and retry; the same change will be reconciled before any repeat write.");
  }
}

export async function publishWarning(preset: EditableWarningPreset, scope: "assignment" | "preset" = "preset", slug?: string) {
  let baseHash = preset.baseHash;
  if (!baseHash) {
    const state = await readWarningState(preset.key);
    if (state.preset) throw new Error("This preset already exists. Open its current version before publishing.");
    baseHash = state.baseHash;
  }
  const result = await writeWarning("POST", {
    action: "publish", key: preset.key.trim(), tone: preset.tone, icon: preset.icon.trim(),
    severityLabel: preset.severityLabel.trim(), headline: preset.headline.trim(),
    points: preset.points.map((point) => point.trim()).filter(Boolean), enabled: preset.enabled,
    allSubstances: Boolean(preset.allSubstances), enabledSlugs: preset.enabledSlugs,
    baseHash, scope, ...(slug ? { slug } : {}),
  });
  return result;
}
