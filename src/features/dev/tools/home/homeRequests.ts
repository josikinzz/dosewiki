import type { ProposalSummary } from "@/features/dev/tools/queue/queueModel";

export type MyDraft = { slug: string; title: string; updatedAt: string };

export type MyWork = { drafts: MyDraft[]; proposals: ProposalSummary[] };

export type HomeProfile = {
  displayName: string;
  bio: string;
  links: readonly unknown[];
  avatarUrl: string | null;
  storedAvatarUrl: string | null;
  avatarR2Key?: string | null;
};

async function requestRecord(url: string, fallback: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error(`Network error. ${fallback}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  const record = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  if (!response.ok) {
    throw new Error(typeof record?.error === "string" ? record.error : fallback);
  }
  if (!record) {
    throw new Error("The server returned an unreadable response.");
  }
  return record;
}

export async function fetchMyWork(): Promise<MyWork> {
  const payload = await requestRecord("/api/dev/my-work", "Unable to load your drafts and proposals.");
  if (!Array.isArray(payload.drafts) || !Array.isArray(payload.proposals)) {
    throw new Error("The server returned an unreadable response.");
  }
  return { drafts: payload.drafts as MyDraft[], proposals: payload.proposals as ProposalSummary[] };
}

export async function fetchLocaleInboxTotal(locale: string): Promise<number> {
  const payload = await requestRecord(
    `/api/dev/translation-inbox?locale=${encodeURIComponent(locale)}`,
    "Unable to load this language's inbox.",
  );
  if (typeof payload.total !== "number") {
    throw new Error("The server returned an unreadable response.");
  }
  return payload.total;
}

export async function fetchOwnProfile(profileKey: string): Promise<HomeProfile> {
  const payload = await requestRecord(
    `/api/dev/contributor-profile?key=${encodeURIComponent(profileKey)}`,
    "Unable to load your profile.",
  );
  const profile = payload.profile;
  if (!profile || typeof profile !== "object") {
    throw new Error("The server returned an unreadable response.");
  }
  return profile as HomeProfile;
}
