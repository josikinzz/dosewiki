/**
 * The records each tool offers the Cmd+K palette, keyed by the tool that
 * opens them. A tool without an entry offers only itself.
 *
 * Every read is one small list the tool already serves, fetched only when the
 * palette opens and kept for a few minutes, so a second Cmd+K costs nothing.
 * The substance lookup backs both Substances and Banners and is read once.
 * A failed read is dropped from the cache so the next open retries.
 */

import { approvedGlossaryLocales, type AppRole } from "@/lib/auth/roles";
import { devHref } from "@/utils/devHref";
import { languageLabel } from "../tools/glossary/glossaryModel";
import { BANNER_PRESET_SLUG_PREFIX } from "../tools/warning-banners/warningBannerTargets";
import type { WritingListEntry } from "../tools/writing/writingEditorModel";
import { recordTerms, type PaletteRecord } from "./devCommandPaletteModel";
import type { DevModeTab } from "./devTabRegistry";

export type RecordSourceContext = {
  role: AppRole | null;
  /** The session's glossary grant; the Glossary lists only these languages. */
  glossaryLocales?: readonly string[];
};

export type DevRecordSource = {
  tab: DevModeTab;
  load: (context: RecordSourceContext) => Promise<PaletteRecord[]>;
};

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

/** One shared, briefly cached read per `key`; a failure is never cached. */
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

/** Tests start each case cold. */
export function clearDevRecordSourceCache() {
  cache.clear();
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

type LookupRow = { slug: string; name: string };
type LookupPage = { page: LookupRow[]; continueCursor: string | null; isDone: boolean };

/** The editor substance lookup (slug and title), drained a page at a time. */
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

/** The Writing tool's pinned entry, which the list read does not return. */
const ABOUT_SLUG = "about";

const SOURCES: readonly DevRecordSource[] = [
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
    tab: "members",
    load: async () => {
      const payload = await cached("members", () =>
        readJson<{ members?: { email: string; username?: string; name?: string }[] }>("/api/dev/members"));
      return (payload.members ?? []).map((member): PaletteRecord => ({
        key: `members:${member.email}`,
        tab: "members",
        title: member.username ?? member.name ?? member.email,
        detail: member.name ? `${member.name} · ${member.email}` : member.email,
        href: devHref({ type: "dev", tab: "members", slug: member.email }),
        terms: recordTerms(member.username, member.name, member.email),
      }));
    },
  },
  {
    tab: "glossary",
    // No read: the session already names the languages this member may open.
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

/** The record sources for the tools in `tabs`, the tools a role may open. */
export function devRecordSourcesFor(tabs: ReadonlySet<DevModeTab>): readonly DevRecordSource[] {
  return SOURCES.filter((source) => tabs.has(source.tab));
}
