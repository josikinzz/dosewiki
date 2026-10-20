import { approvedGlossaryLocales, type AppRole } from "@/lib/auth/roles";
import { devHref } from "@/utils/devHref";
import { feedbackTaskHref, type FeedbackSource } from "../tools/feedback/feedbackTaskLink";
import { buildReviewUrl } from "../tools/review-mode/reviewUrl";
import type { ProposalSummary } from "../tools/queue/queueModel";
import { isMyPendingProposal, proposalTaskHref } from "../tools/queue/queueTaskLink";
import { languageLabel } from "../tools/glossary/glossaryModel";
import { BANNER_PRESET_SLUG_PREFIX } from "../tools/warning-banners/warningBannerTargets";
import type { WritingListEntry } from "../tools/writing/writingEditorModel";
import { recordTerms, type PaletteRecord } from "./devCommandPaletteModel";
import type { DevModeTab } from "./devTabRegistry";

export type RecordSourceContext = {
  role: AppRole | null;
  glossaryLocales?: readonly string[];
};

export type DevRecordSource = {
  tab: DevModeTab;
  load: (context: RecordSourceContext) => Promise<PaletteRecord[]>;
};

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise as Promise<T>;
  const promise = read();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

type LookupRow = { slug: string; name: string };
type LookupPage = { page: LookupRow[]; continueCursor: string | null; isDone: boolean };

function substanceLookup(): Promise<LookupRow[]> {
  return cached("substances", async () => {
    const rows: LookupRow[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 50; guard += 1) {
      const page: LookupPage = await readJson<LookupPage>(
        `/api/editor/substances?page=lookup&numItems=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      rows.push(...page.page.filter((row) => row.slug));
      if (page.isDone || !page.continueCursor) break;
      cursor = page.continueCursor;
    }
    return rows;
  });
}

function substanceRecords(tab: DevModeTab, detail: string): Promise<PaletteRecord[]> {
  return substanceLookup().then((rows) =>
    rows.map((row) => ({
      key: `${tab}:${row.slug}`,
      tab,
      title: row.name || row.slug,
      detail: `${detail} · ${row.slug}`,
      href: devHref({ type: "dev", tab, slug: row.slug }),
      terms: recordTerms(row.name, row.slug),
    })),
  );
}

type BannerPreset = { key: string; headline: string; severityLabel: string };

const ABOUT_SLUG = "about";

async function viewCount(read: () => Promise<number>): Promise<number | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

const countLine = (count: number | null, noun: string, rest: string) =>
  count === null ? rest : `${count} ${noun} · ${rest}`;

async function oldestUnresolvedView(source: FeedbackSource): Promise<PaletteRecord> {
  const count = await viewCount(async () => {
    const payload = await readJson<{ total?: unknown }>(`/api/${source}-feedback/queue?status=unresolved&order=oldest&limit=1`);
    if (typeof payload.total !== "number") throw new Error("no total");
    return payload.total;
  });
  const title = `Oldest unresolved ${source} feedback`;
  return {
    key: `view:feedback:${source}:oldest-unresolved`,
    tab: "article-feedback",
    kind: "view",
    title,
    detail: countLine(count, "unresolved", "New and Reviewing, oldest first"),
    href: feedbackTaskHref({ source, status: "unresolved", sort: "oldest" }),
    terms: recordTerms(title, "oldest unresolved pending waiting feedback"),
  };
}

const SOURCES: readonly DevRecordSource[] = [
  {
    tab: "article-feedback",
    load: () => Promise.all([oldestUnresolvedView("article"), oldestUnresolvedView("site")]),
  },
  {
    tab: "queue",
    load: async () => {
      const count = await viewCount(async () => {
        const payload = await readJson<{ proposals?: ProposalSummary[] }>("/api/dev/proposals");
        if (!Array.isArray(payload.proposals)) throw new Error("no proposals");
        return payload.proposals.filter(isMyPendingProposal).length;
      });
      return [{
        key: "view:queue:mine",
        tab: "queue",
        kind: "view",
        title: "My pending proposals",
        detail: countLine(count, "waiting", "Your submissions awaiting a decision or a revision"),
        href: proposalTaskHref(null, "mine"),
        terms: recordTerms("my pending proposals submissions mine"),
      }];
    },
  },
  {
    tab: "review",
    load: async () => [{
      key: "view:review:another-pass",
      tab: "review",
      kind: "view",
      title: "Needs another pass",
      detail: "Signed-off articles published again since their review",
      href: buildReviewUrl({ slug: null, changedSinceReview: true }),
      terms: recordTerms("needs another pass changed since review stale sign off re-review"),
    }],
  },
  { tab: "articles", load: () => substanceRecords("articles", "Substance") },
  {
    tab: "banners",
    load: async () => {
      const [presets, substances] = await Promise.all([
        cached("banner-presets", () => readJson<{ presets?: BannerPreset[] }>("/api/dev/warning-banner"))
          .then((payload) => payload.presets ?? []),
        substanceRecords("banners", "Banners on"),
      ]);
      return [
        ...presets.map((preset): PaletteRecord => ({
          key: `banners:preset:${preset.key}`,
          tab: "banners",
          title: preset.headline || preset.key,
          detail: `Preset · ${preset.severityLabel || preset.key}`,
          href: devHref({ type: "dev", tab: "banners", slug: `${BANNER_PRESET_SLUG_PREFIX}${preset.key}` }),
          terms: recordTerms(preset.headline, preset.key, preset.severityLabel, "preset"),
        })),
        ...substances,
      ];
    },
  },
  {
    tab: "writing",
    load: async () => {
      const about: PaletteRecord = {
        key: `writing:${ABOUT_SLUG}`,
        tab: "writing",
        title: "About",
        detail: "The About page",
        href: devHref({ type: "dev", tab: "writing", slug: ABOUT_SLUG }),
        terms: recordTerms("about page"),
      };
      const payload = await cached("writing", () => readJson<{ articles?: WritingListEntry[] }>("/api/dev/writing-article"));
      return [
        about,
        ...(payload.articles ?? []).map((entry): PaletteRecord => ({
          key: `writing:${entry.slug}`,
          tab: "writing",
          title: entry.title || entry.slug,
          detail: `${entry.kind === "blog" ? "Blog post" : "Article"} · ${entry.slug}`,
          href: devHref({ type: "dev", tab: "writing", slug: entry.slug, filter: entry.kind === "blog" ? "blog" : undefined }),
          terms: recordTerms(entry.title, entry.slug, entry.kind === "blog" ? "blog post" : "article"),
        })),
      ];
    },
  },
  {
    tab: "copy-studio",
    load: async () => {
      const { COPY_BLOCK_DEFAULTS } = await import("@/data/content/copyBlocks");
      return COPY_BLOCK_DEFAULTS.map((block): PaletteRecord => ({
        key: `copy-studio:${block.key}`,
        tab: "copy-studio",
        title: block.label,
        detail: `Copy · ${block.group}${block.flavor ? " · Effect Index" : ""} · ${block.key}`,
        href: devHref({ type: "dev", tab: "copy-studio", slug: block.key }),
        terms: recordTerms(block.label, block.key, block.group, "copy"),
      }));
    },
  },
  {
    tab: "people",
    load: async () => {
      const payload = await cached("people", () =>
        readJson<{ members?: { email: string; username?: string; name?: string }[] }>("/api/dev/members"));
      return (payload.members ?? []).map((member): PaletteRecord => ({
        key: `people:${member.email}`,
        tab: "people",
        title: member.username ?? member.name ?? member.email,
        detail: member.name ? `${member.name} · ${member.email}` : member.email,
        href: devHref({ type: "dev", tab: "people", slug: member.email }),
        terms: recordTerms(member.username, member.name, member.email),
      }));
    },
  },
  {
    tab: "glossary",
    load: async ({ role, glossaryLocales }) =>
      approvedGlossaryLocales({ role, glossaryLocales: glossaryLocales ? [...glossaryLocales] : undefined }).map((code) => ({
        key: `glossary:${code}`,
        tab: "glossary",
        title: languageLabel(code),
        detail: `Glossary · ${code}`,
        href: `${devHref({ type: "dev", tab: "glossary" })}?locale=${encodeURIComponent(code)}`,
        terms: recordTerms(languageLabel(code), code),
      })),
  },
];

export function devRecordSourcesFor(tabs: ReadonlySet<DevModeTab>): readonly DevRecordSource[] {
  return SOURCES.filter((source) => tabs.has(source.tab));
}
