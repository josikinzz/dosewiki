"use client";

/**
 * Home: bare `/dev`. Each member's own work, by role, as cards that open the
 * exact item they name.
 *
 * - An admin sees everything waiting on an admin (the Inbox total and each
 *   queue's count) and the invites nobody has redeemed yet.
 * - An editor sees their saved article drafts and their open proposals.
 * - A translator sees the review inbox count per language they hold, with
 *   Continue into that language's Inbox.
 * - A contributor sees a checklist for their own public profile.
 *
 * Read-only. Counts come from the rail's badge reads, with their freshness: a
 * count that failed to load reads Unknown, never zero. The member's drafts and
 * proposals come from `/api/dev/my-work`, which Postgres scopes to the session.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { EditorSection, EditorStatusPill, LoadErrorState } from "@/features/dev/components";
import {
  INBOX_BADGE_PARTS,
  invalidateDevRailBadge,
  useDevRailBadgeReadings,
} from "@/features/dev/pages/useDevRailBadges";
import { languageLabel } from "@/features/dev/tools/glossary/glossaryModel";
import { fetchInviteCodes, type InviteCodeSummary } from "@/features/dev/tools/members/inviteCodeRequests";
import { STATUS_LABELS, STATUS_PILL_TONE } from "@/features/dev/tools/queue/queueModel";
import { approvedGlossaryLocales, getRoleDisplayName, type AppRole } from "@/lib/auth/roles";
import { devHref } from "@/utils/devHref";

import {
  ADMIN_WAITING_ROWS,
  glossaryInboxHref,
  homeCardSetsFor,
  readHomeCount,
  sumHomeCounts,
  type HomeTotal,
} from "./homeModel";
import { fetchLocaleInboxTotal, fetchMyWork, fetchOwnProfile, type HomeProfile, type MyWork } from "./homeRequests";

type HomeTabProps = {
  role: AppRole | null;
  /** The signed-in member's own contributor profile key. */
  profileKey: string;
};

const ROW_LINK_CLASS =
  "theme-dev-rail-tab flex min-h-11 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm transition-colors duration-200 motion-reduce:transition-none";

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** A count in words. Unknown is its own word so a failed read never looks like an empty queue. */
function CountText({ count, noun = "waiting" }: { count: HomeTotal; noun?: string }) {
  switch (count.kind) {
    case "loading":
      return <span className="theme-text-muted">Loading</span>;
    case "unknown":
      return <span className="theme-text-muted">Unknown</span>;
    case "at-least":
      return <span className="font-mono font-semibold">At least {count.count}</span>;
    case "known":
      return (
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono font-semibold">{count.count}</span>
          <span className="theme-text-muted text-xs">{count.stale ? "last known" : noun}</span>
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Admin

function AdminWaitingCard() {
  const readings = useDevRailBadgeReadings();
  const total = sumHomeCounts(INBOX_BADGE_PARTS.map((badge) => readHomeCount(readings[badge])));
  const failed = INBOX_BADGE_PARTS.filter((badge) => readings[badge].failed);

  return (
    <EditorSection
      icon="lucide:inbox"
      title="Waiting on admins"
      description="Every queue the Inbox gathers. Open the Inbox to claim and triage, or a queue for its full review."
      actions={
        failed.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => failed.forEach(invalidateDevRailBadge)}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Retry counts
          </Button>
        ) : null
      }
    >
      <a href={devHref({ type: "dev", tab: "inbox" })} className={`${ROW_LINK_CLASS} font-semibold`}>
        <span>Inbox</span>
        <CountText count={total} />
      </a>
      <ul aria-label="Queues" className="space-y-0.5">
        {ADMIN_WAITING_ROWS.map((row) => (
          <li key={row.label}>
            <a href={row.href} className={ROW_LINK_CLASS}>
              <span>{row.label}</span>
              <CountText count={readHomeCount(readings[row.badge], row.part)} />
            </a>
          </li>
        ))}
      </ul>
    </EditorSection>
  );
}

function PendingInvitesCard() {
  const [invites, setInvites] = useState<InviteCodeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchInviteCodes();
      setInvites(page.invites.filter((invite) => invite.status === "active"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invite codes.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <EditorSection
      icon="lucide:ticket"
      title="Pending invites"
      description="Invite codes still open for someone to redeem."
      delay={0.05}
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : invites === null ? (
        <p className="theme-text-muted text-sm">Loading</p>
      ) : invites.length === 0 ? (
        <p className="theme-text-muted text-sm">No invite is waiting to be redeemed.</p>
      ) : (
        <ul aria-label="Open invites" className="space-y-1.5 text-sm">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                {getRoleDisplayName(invite.role)}
                {invite.note ? <span className="theme-text-muted">{`: ${invite.note}`}</span> : null}
              </span>
              <span className="theme-text-muted text-xs">{`Open until ${formatDay(invite.expiresAt)}`}</span>
            </li>
          ))}
        </ul>
      )}
      <a href={devHref({ type: "dev", tab: "members" })} className="theme-accent-link inline-flex min-h-11 items-center gap-1.5 text-sm">
        Open Members
        <Icon icon="lucide:arrow-right" size={14} />
      </a>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Editor

function EditorWorkCards() {
  const [work, setWork] = useState<MyWork | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWork(await fetchMyWork());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your drafts and proposals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const body = (content: (work: MyWork) => ReactNode) =>
    error ? (
      <LoadErrorState message={error} onRetry={() => void load()} />
    ) : work === null ? (
      <p className="theme-text-muted text-sm">Loading</p>
    ) : (
      content(work)
    );

  return (
    <>
      <EditorSection
        icon="lucide:file-pen-line"
        title="My drafts"
        description="Article drafts you saved and have not submitted or published."
      >
        {body(({ drafts }) =>
          drafts.length === 0 ? (
            <p className="theme-text-muted text-sm">No saved drafts. A draft you save while editing an article waits here.</p>
          ) : (
            <ul aria-label="Saved drafts" className="space-y-0.5">
              {drafts.map((draft) => (
                <li key={draft.slug}>
                  <a href={devHref({ type: "dev", tab: "articles", slug: draft.slug })} className={ROW_LINK_CLASS}>
                    <span className="font-medium">{draft.title}</span>
                    <span className="theme-text-muted text-xs">{`Saved ${formatDay(draft.updatedAt)}`}</span>
                  </a>
                </li>
              ))}
            </ul>
          ),
        )}
      </EditorSection>
      <EditorSection
        icon="lucide:send"
        title="My open proposals"
        description="Proposals awaiting review, or returned to you for changes."
        delay={0.05}
      >
        {body(({ proposals }) =>
          proposals.length === 0 ? (
            <p className="theme-text-muted text-sm">No open proposals.</p>
          ) : (
            <ul aria-label="Open proposals" className="space-y-0.5">
              {proposals.map((proposal) => (
                <li key={proposal._id}>
                  <a href={devHref({ type: "dev", tab: "queue", slug: proposal._id })} className={ROW_LINK_CLASS}>
                    <span className="min-w-0 truncate font-medium">{proposal.summary}</span>
                    <EditorStatusPill tone={STATUS_PILL_TONE[proposal.status]}>{STATUS_LABELS[proposal.status]}</EditorStatusPill>
                  </a>
                </li>
              ))}
            </ul>
          ),
        )}
      </EditorSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Translator

type LocaleCount = { kind: "loading" } | { kind: "unknown" } | { kind: "known"; count: number };

function TranslatorInboxCard({ locales }: { locales: readonly string[] }) {
  const [counts, setCounts] = useState<Record<string, LocaleCount>>({});
  const localeKey = locales.join(",");

  const load = useCallback(() => {
    const codes = localeKey ? localeKey.split(",") : [];
    setCounts(Object.fromEntries(codes.map((code) => [code, { kind: "loading" }])));
    for (const code of codes) {
      fetchLocaleInboxTotal(code).then(
        (count) => setCounts((current) => ({ ...current, [code]: { kind: "known", count } })),
        () => setCounts((current) => ({ ...current, [code]: { kind: "unknown" } })),
      );
    }
  }, [localeKey]);

  useEffect(() => {
    load();
  }, [load]);

  const anyUnknown = Object.values(counts).some((count) => count.kind === "unknown");

  return (
    <EditorSection
      icon="lucide:languages"
      title="Translation inbox"
      description="What waits for a person in each language you review."
      actions={
        anyUnknown ? (
          <Button type="button" variant="ghost" size="sm" onClick={load}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Retry counts
          </Button>
        ) : null
      }
    >
      {locales.length === 0 ? (
        <p className="theme-text-muted text-sm">No language is assigned to you yet. Ask an admin to grant one.</p>
      ) : (
        <ul aria-label="Languages" className="space-y-1">
          {locales.map((locale) => {
            const name = languageLabel(locale);
            const count = counts[locale] ?? { kind: "loading" };
            return (
              <li key={locale} aria-label={name} className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-2.5">
                <span className="font-medium">{name}</span>
                <span className="flex items-center gap-3 text-sm">
                  {count.kind === "known" && count.count === 0 ? (
                    <span className="theme-text-muted">Nothing waiting</span>
                  ) : (
                    <CountText count={count.kind === "known" ? { ...count, stale: false } : count} />
                  )}
                  <a href={glossaryInboxHref(locale)} className="theme-accent-link inline-flex min-h-11 items-center gap-1.5">
                    Continue
                    <span className="sr-only">{` in ${name}`}</span>
                    <Icon icon="lucide:arrow-right" size={14} />
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Contributor

const PROFILE_CHECKS: readonly { label: string; done: (profile: HomeProfile) => boolean }[] = [
  { label: "Display name", done: (profile) => profile.displayName.trim() !== "" },
  { label: "Short bio", done: (profile) => profile.bio.trim() !== "" },
  { label: "Profile picture", done: (profile) => Boolean(profile.avatarUrl || profile.storedAvatarUrl || profile.avatarR2Key) },
  { label: "At least one link", done: (profile) => profile.links.length > 0 },
];

function ContributorProfileCard({ profileKey }: { profileKey: string }) {
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!profileKey) {
      setError("Your profile key is not known yet. Sign out and back in.");
      return;
    }
    try {
      setProfile(await fetchOwnProfile(profileKey));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load your profile.");
    }
  }, [profileKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileHref = devHref({ type: "dev", tab: "contributors", filter: "me" });

  return (
    <EditorSection
      icon="lucide:user-round-pen"
      title="Your profile"
      description="Your public contributor page. Each item opens your profile to fill it in."
    >
      {error ? (
        <LoadErrorState message={error} onRetry={() => void load()} />
      ) : profile === null ? (
        <p className="theme-text-muted text-sm">Loading</p>
      ) : (
        <ul aria-label="Profile checklist" className="space-y-0.5">
          {PROFILE_CHECKS.map((check) => {
            const done = check.done(profile);
            return (
              <li key={check.label} aria-label={check.label}>
                <a href={profileHref} className={ROW_LINK_CLASS}>
                  <span className="flex items-center gap-2">
                    <Icon icon={done ? "lucide:circle-check" : "lucide:circle"} size={16} className={done ? "theme-accent-emphasis" : "theme-text-muted"} />
                    {check.label}
                  </span>
                  <span className={done ? "theme-text-muted text-xs" : "text-xs font-semibold"}>{done ? "Done" : "To do"}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------

export function HomeTab({ role, profileKey }: HomeTabProps) {
  const session = useSession();
  const sets = homeCardSetsFor(role);
  const locales = approvedGlossaryLocales({ role, glossaryLocales: session.data?.user?.glossaryLocales });

  return (
    <section aria-label="Your work" className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2">
      {sets.length === 0 ? (
        <StateCard
          tone="neutral"
          icon="lucide:house"
          title="Nothing to show yet"
          description="Your account has no editing role. Ask an admin if you need one."
          compact
        />
      ) : null}
      {sets.includes("admin") ? (
        <>
          <AdminWaitingCard />
          <PendingInvitesCard />
        </>
      ) : null}
      {sets.includes("editor") ? <EditorWorkCards /> : null}
      {sets.includes("translator") ? <TranslatorInboxCard locales={locales} /> : null}
      {sets.includes("contributor") ? <ContributorProfileCard profileKey={profileKey} /> : null}
    </section>
  );
}
