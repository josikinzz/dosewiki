"use client";

/**
 * Home: bare `/dev`. Each member's own work, by role, as rows that open the
 * exact item they name.
 *
 * - An admin sees everything waiting on an admin (the Inbox total leads, then
 *   each queue's count) and the invites nobody has redeemed yet, then their
 *   own drafts and proposals.
 * - An editor sees their saved article drafts and their open proposals.
 * - A translator sees the review inbox count per language they hold; each
 *   row continues into that language's Inbox.
 * - A contributor sees a checklist for their own public profile and their
 *   trip reports.
 *
 * Read-only. Counts come from the rail's badge reads, with their freshness: a
 * count that failed to load reads Unknown, never zero. The member's drafts and
 * proposals come from `/api/dev/my-work`, which Postgres scopes to the session.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { EditorSection, EditorStatusPill, LoadErrorState } from "@/features/dev/components";
import { findDevTab } from "@/features/dev/pages/devTabRegistry";
import {
  INBOX_BADGE_PARTS,
  invalidateDevRailBadge,
  useDevRailBadgeReadings,
} from "@/features/dev/pages/useDevRailBadges";
import { languageLabel } from "@/features/dev/tools/glossary/glossaryModel";
import { fetchInviteCodes, type InviteCodeSummary } from "@/features/dev/tools/members/inviteCodeRequests";
import {
  fetchMySubmissions,
  fetchOwnedReports,
  type MemberSubmission,
  type OwnedReportRow,
} from "@/features/dev/tools/my-reports/myReportsModel";
import { STATUS_LABELS, STATUS_PILL_TONE, type ProposalSummary } from "@/features/dev/tools/queue/queueModel";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import { approvedGlossaryLocales, getRoleDisplayName, type AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";

import {
  ADMIN_WAITING_ROWS,
  INVITE_CLOSING_DAYS,
  countNoun,
  describeDay,
  glossaryInboxHref,
  homeCardSetsFor,
  homeSummaryFor,
  readHomeCount,
  sumHomeCounts,
  type HomeTotal,
} from "./homeModel";
import {
  CappedList,
  CountFailureLine,
  CountValue,
  HeadingCount,
  LINK_LIST_CLASS,
  LinkRow,
  OnwardLink,
  RelativeDay,
  RowSkeletons,
  SectionNote,
} from "./homeParts";
import { fetchLocaleInboxTotal, fetchMyWork, fetchOwnProfile, type HomeProfile, type MyWork } from "./homeRequests";

type HomeTabProps = {
  role: AppRole | null;
  /** The signed-in member's own contributor profile key. */
  profileKey: string;
};

/** Entrance stagger step between sections, in reading order. */
const STAGGER = 0.05;

/** A tool's rail label for this role ("My submissions" for an editor's Change Review). */
function toolLabel(id: string, role: AppRole | null): string {
  const tab = findDevTab(id);
  if (!tab) return id;
  return tab.labelFor?.(role) ?? tab.label;
}

/** Load one read, with its error, and reload on demand. */
function useHomeRead<T>(read: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await read());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : fallback);
    }
  }, [read, fallback]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, load };
}

// ---------------------------------------------------------------------------
// Admin

function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The Inbox leads the section: the one place to claim and triage all of it. */
function InboxLead({ total }: { total: HomeTotal }) {
  const allClear = total.kind === "known" && total.count === 0 && !total.stale;
  return (
    <a
      href={devHref({ type: "dev", tab: "inbox" })}
      className="theme-dev-link-row theme-dev-link-lead group flex min-h-16 items-center gap-3 rounded-card px-3.5 py-3 transition-colors motion-reduce:transition-none"
    >
      <span className="min-w-0 flex-1">
        <span className="theme-text-primary block text-base font-semibold">Inbox</span>
        <span className="theme-text-muted block text-xs">All queues in one list</span>
      </span>
      {allClear ? (
        <span className="theme-text-secondary inline-flex items-center gap-1.5 text-sm font-medium">
          <Icon icon="lucide:circle-check" size={16} className="theme-success-text-strong" />
          All clear
          <span className="sr-only">, nothing waiting</span>
        </span>
      ) : (
        <span className="text-xl">
          <CountValue count={total} />
          {total.kind === "known" || total.kind === "at-least" ? (
            <span aria-hidden className="theme-text-muted ml-1.5 text-xs">waiting</span>
          ) : null}
        </span>
      )}
      <Icon icon="lucide:chevron-right" size={18} className="theme-dev-link-row-chevron shrink-0" />
    </a>
  );
}

function AdminWaitingCard({ delay }: { delay: number }) {
  const readings = useDevRailBadgeReadings();
  const total = sumHomeCounts(INBOX_BADGE_PARTS.map((badge) => readHomeCount(readings[badge])));
  const failed = INBOX_BADGE_PARTS.filter((badge) => readings[badge].failed);
  const times = INBOX_BADGE_PARTS.map((badge) => readings[badge].updatedAt).filter((time): time is number => time !== null);
  const oldest = times.length === INBOX_BADGE_PARTS.length ? Math.min(...times) : null;

  return (
    <EditorSection
      icon="lucide:inbox"
      title="Waiting on admins"
      description="Open the Inbox to work through everything, or one queue for its full review."
      delay={delay}
    >
      <InboxLead total={total} />
      {failed.length > 0 ? (
        <CountFailureLine failed={failed.length} onRetry={() => failed.forEach(invalidateDevRailBadge)} />
      ) : null}
      <ul aria-label="Queues" className={LINK_LIST_CLASS}>
        {ADMIN_WAITING_ROWS.map((row) => (
          <li key={row.label}>
            <LinkRow href={row.href} trailing={<CountValue count={readHomeCount(readings[row.badge], row.part)} />}>
              {row.label}
            </LinkRow>
          </li>
        ))}
      </ul>
      {oldest !== null && failed.length === 0 ? (
        <p className="theme-text-faint text-xs">{`Counted at ${formatClock(oldest)}. The rail keeps these fresh as you work.`}</p>
      ) : null}
    </EditorSection>
  );
}

function InviteRow({ invite }: { invite: InviteCodeSummary }) {
  const closes = describeDay(invite.expiresAt);
  const closingSoon = closes !== null && closes.days >= 0 && closes.days <= INVITE_CLOSING_DAYS;
  return (
    <LinkRow
      href={`${devHref({ type: "dev", tab: "people" })}#invites`}
      meta={invite.note ? <span className="line-clamp-2">{invite.note}</span> : undefined}
      trailing={
        closes ? (
          <span className={cn("text-xs", closingSoon ? "theme-warning-text-strong font-medium" : "theme-text-muted")}>
            <time dateTime={invite.expiresAt} title={`Open until ${closes.full}`}>
              {closes.days < 0 ? `Closed ${closes.relative}` : `Closes ${closes.relative}`}
            </time>
          </span>
        ) : null
      }
    >
      <span className="theme-text-primary font-medium">{getRoleDisplayName(invite.role)}</span>
      <span className="sr-only"> invite</span>
    </LinkRow>
  );
}

function PendingInvitesCard({ delay }: { delay: number }) {
  const read = useCallback(async () => {
    const page = await fetchInviteCodes();
    return page.invites.filter((invite) => invite.status === "active");
  }, []);
  const { data: invites, error, load } = useHomeRead(read, "Unable to load invite codes.");

  return (
    <EditorSection
      icon="lucide:ticket"
      title="Pending invites"
      description="Invite codes nobody has redeemed yet."
      actions={invites && invites.length > 0 ? <HeadingCount>{`${invites.length} open`}</HeadingCount> : null}
      delay={delay}
    >
      {error ? (
        <LoadErrorState what="pending invites" message={error} onRetry={() => void load()} />
      ) : invites === null ? (
        <RowSkeletons label="pending invites" />
      ) : invites.length === 0 ? (
        <SectionNote icon="lucide:ticket-check">No invite is waiting to be redeemed.</SectionNote>
      ) : (
        <CappedList
          items={invites}
          getKey={(invite) => invite.id}
          label="Open invites"
          noun="invites"
          renderItem={(invite) => <InviteRow invite={invite} />}
        />
      )}
      <OnwardLink href={`${devHref({ type: "dev", tab: "people" })}#invites`}>Open People</OnwardLink>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Editor

/** Changes requested first: those wait on the member, the rest wait on a reviewer. */
function openProposalsInOrder(proposals: readonly ProposalSummary[]): ProposalSummary[] {
  return [...proposals].sort(
    (a, b) => Number(b.status === "changes_requested") - Number(a.status === "changes_requested"),
  );
}

function ProposalRow({ proposal }: { proposal: ProposalSummary }) {
  const comments = proposal.commentCount > 0 ? countNoun(proposal.commentCount, "comment") : null;
  return (
    <LinkRow
      href={devHref({ type: "dev", tab: "queue", slug: proposal._id })}
      stackOnPhone
      meta={
        <>
          <RelativeDay iso={proposal.updatedAt} prefix="Updated" />
          {comments ? ` · ${comments}` : null}
        </>
      }
      trailing={<EditorStatusPill tone={STATUS_PILL_TONE[proposal.status]}>{STATUS_LABELS[proposal.status]}</EditorStatusPill>}
    >
      <span className="theme-text-primary font-medium">{proposal.summary}</span>
    </LinkRow>
  );
}

function EditorWorkCards({ role, delay }: { role: AppRole | null; delay: number }) {
  const { data: work, error, load } = useHomeRead<MyWork>(fetchMyWork, "Unable to load your drafts and proposals.");
  const articlesLabel = toolLabel("articles", role);
  const queueLabel = toolLabel("queue", role);

  if (error) {
    // One read feeds both lists, so one failure and one retry.
    return (
      <EditorSection icon="lucide:file-pen-line" title="My drafts and proposals" delay={delay}>
        <LoadErrorState what="your drafts and proposals" message={error} onRetry={() => void load()} />
      </EditorSection>
    );
  }

  const proposals = work ? openProposalsInOrder(work.proposals) : [];
  const returned = proposals.filter((proposal) => proposal.status === "changes_requested").length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-2">
      <EditorSection
        icon="lucide:file-pen-line"
        title="My drafts"
        description="Article drafts you saved and have not submitted or published."
        actions={work && work.drafts.length > 0 ? <HeadingCount>{countNoun(work.drafts.length, "draft")}</HeadingCount> : null}
        delay={delay}
      >
        {work === null ? (
          <RowSkeletons label="your drafts" />
        ) : work.drafts.length === 0 ? (
          <div className="space-y-1">
            <SectionNote icon="lucide:file-plus">No saved drafts. A draft you save while editing an article waits here.</SectionNote>
            <OnwardLink href={devHref({ type: "dev", tab: "articles" })}>{`Open ${articlesLabel}`}</OnwardLink>
          </div>
        ) : (
          <CappedList
            items={work.drafts}
            getKey={(draft) => draft.slug}
            label="Saved drafts"
            noun="drafts"
            renderItem={(draft) => (
              <LinkRow
                href={devHref({ type: "dev", tab: "articles", slug: draft.slug })}
                trailing={
                  <span className="theme-text-muted text-xs">
                    <RelativeDay iso={draft.updatedAt} prefix="Saved" />
                  </span>
                }
              >
                <span className="theme-text-primary font-medium">{draft.title}</span>
              </LinkRow>
            )}
          />
        )}
      </EditorSection>
      <EditorSection
        icon="lucide:send"
        title="My open proposals"
        description="Waiting for a reviewer, or returned to you for changes."
        actions={
          returned > 0 ? (
            <HeadingCount>{`${returned} returned`}</HeadingCount>
          ) : proposals.length > 0 ? (
            <HeadingCount>{`${proposals.length} open`}</HeadingCount>
          ) : null
        }
        delay={delay + STAGGER}
      >
        {work === null ? (
          <RowSkeletons label="your open proposals" />
        ) : proposals.length === 0 ? (
          <div className="space-y-1">
            <SectionNote icon="lucide:send">No open proposals.</SectionNote>
            <OnwardLink href={devHref({ type: "dev", tab: "queue" })}>{`Open ${queueLabel}`}</OnwardLink>
          </div>
        ) : (
          <CappedList
            items={proposals}
            getKey={(proposal) => proposal._id}
            label="Open proposals"
            noun="proposals"
            renderItem={(proposal) => <ProposalRow proposal={proposal} />}
          />
        )}
      </EditorSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Translator

type LocaleCount = { kind: "loading" } | { kind: "unknown" } | { kind: "known"; count: number };

/** "Deutsch (German)" as its native name, marked with its language, and the English one. */
function LanguageName({ locale }: { locale: string }) {
  const label = languageLabel(locale);
  const match = /^(.*) \((.*)\)$/.exec(label);
  if (!match) return <span lang={locale}>{label}</span>;
  return (
    <>
      <span lang={locale}>{match[1]}</span>
      <span className="theme-text-muted font-normal">{` (${match[2]})`}</span>
    </>
  );
}

function spokenLocaleCount(count: LocaleCount): string {
  if (count.kind === "loading") return "loading";
  if (count.kind === "unknown") return "count did not load";
  return count.count === 0 ? "nothing waiting" : `${count.count} waiting`;
}

function TranslatorInboxCard({ locales, delay }: { locales: readonly string[]; delay: number }) {
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

  const values = Object.values(counts);
  const unknown = values.filter((count) => count.kind === "unknown").length;
  const waiting = values.every((count) => count.kind === "known")
    ? values.reduce((sum, count) => sum + (count.kind === "known" ? count.count : 0), 0)
    : null;

  return (
    <EditorSection
      icon="lucide:languages"
      title="Translation inbox"
      description="Items waiting for review in each language you hold."
      actions={waiting !== null && locales.length > 0 ? <HeadingCount>{waiting === 0 ? "All clear" : `${waiting} waiting`}</HeadingCount> : null}
      delay={delay}
    >
      {locales.length === 0 ? (
        <SectionNote icon="lucide:languages">No language is assigned to you yet. Ask an admin to grant one.</SectionNote>
      ) : (
        <>
          {unknown > 0 ? <CountFailureLine failed={unknown} onRetry={load} /> : null}
          <ul aria-label="Languages" className={LINK_LIST_CLASS}>
            {locales.map((locale) => {
              const count = counts[locale] ?? { kind: "loading" };
              const name = languageLabel(locale);
              const empty = count.kind === "known" && count.count === 0;
              return (
                <li key={locale}>
                  <LinkRow
                    href={glossaryInboxHref(locale)}
                    label={`${name}, ${spokenLocaleCount(count)}. ${empty ? "Open" : "Continue"} in ${name}`}
                    trailing={
                      <>
                        {empty ? (
                          <span className="theme-text-faint text-xs">Nothing waiting</span>
                        ) : (
                          <CountValue count={count.kind === "known" ? { ...count, stale: false } : count} />
                        )}
                        <span className={cn("text-xs font-medium", empty ? "theme-text-faint" : "text-dose-accent-strong")}>
                          {empty ? "Open" : "Continue"}
                        </span>
                      </>
                    }
                  >
                    <span className="theme-text-primary font-medium">
                      <LanguageName locale={locale} />
                    </span>
                  </LinkRow>
                </li>
              );
            })}
          </ul>
        </>
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

function ContributorProfileCard({ profileKey, delay }: { profileKey: string; delay: number }) {
  const read = useCallback(async () => {
    if (!profileKey) throw new Error("Your profile key is not known yet. Sign out and back in.");
    return fetchOwnProfile(profileKey);
  }, [profileKey]);
  const { data: profile, error, load } = useHomeRead(read, "Unable to load your profile.");

  const profileHref = devHref({ type: "dev", tab: "contributors", filter: "me" });
  const done = profile ? PROFILE_CHECKS.filter((check) => check.done(profile)).length : 0;

  return (
    <EditorSection
      icon="lucide:user-round-pen"
      title="Your profile"
      description="Your public contributor page. Your name and picture appear on what you write."
      actions={profile ? <HeadingCount>{`${done} of ${PROFILE_CHECKS.length} done`}</HeadingCount> : null}
      delay={delay}
    >
      {error ? (
        <LoadErrorState what="your profile" message={error} onRetry={() => void load()} />
      ) : profile === null ? (
        <RowSkeletons rows={4} label="your profile" />
      ) : (
        <>
          {done === PROFILE_CHECKS.length ? (
            <SectionNote icon="lucide:circle-check" tone="success">Your profile is complete.</SectionNote>
          ) : null}
          <ul aria-label="Profile checklist" className={LINK_LIST_CLASS}>
            {PROFILE_CHECKS.map((check) => {
              const complete = check.done(profile);
              return (
                <li key={check.label}>
                  <LinkRow
                    href={profileHref}
                    leading={
                      <Icon
                        icon={complete ? "lucide:circle-check" : "lucide:circle-dashed"}
                        size={18}
                        className={complete ? "theme-success-text-strong" : "theme-text-faint"}
                      />
                    }
                    trailing={
                      <span className={complete ? "theme-text-faint text-xs" : "text-xs font-semibold text-dose-accent-strong"}>
                        {complete ? "Done" : "To do"}
                      </span>
                    }
                  >
                    <span className={complete ? "theme-text-muted" : "theme-text-primary font-medium"}>{check.label}</span>
                  </LinkRow>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </EditorSection>
  );
}

/** A submission still with the editors: not yet published or turned down. */
const IN_REVIEW: ReadonlySet<MemberSubmission["status"]> = new Set(["new", "reviewing", "accepted"]);

type MyReports = { inReview: MemberSubmission[]; published: OwnedReportRow[] };

async function readMyReports(): Promise<MyReports> {
  const [submissions, published] = await Promise.all([fetchMySubmissions(), fetchOwnedReports()]);
  return { inReview: submissions.filter((submission) => IN_REVIEW.has(submission.status)), published };
}

function ContributorReportsCard({ role, delay }: { role: AppRole | null; delay: number }) {
  const { data: reports, error, load } = useHomeRead(readMyReports, "Unable to load your trip reports.");
  const href = devHref({ type: "dev", tab: "my-reports" });
  const label = toolLabel("my-reports", role);

  return (
    <EditorSection
      icon="lucide:book-open-text"
      title="Your trip reports"
      description="Reports you submitted that editors are still reviewing, and the ones that are live."
      delay={delay}
    >
      {error ? (
        <LoadErrorState what="your trip reports" message={error} onRetry={() => void load()} />
      ) : reports === null ? (
        <RowSkeletons label="your trip reports" />
      ) : reports.inReview.length === 0 && reports.published.length === 0 ? (
        <SectionNote icon="lucide:book-open-text">No trip reports yet. A report you submit waits here while editors review it.</SectionNote>
      ) : (
        <ul aria-label="Your trip reports" className={LINK_LIST_CLASS}>
          {reports.inReview.map((submission) => (
            <li key={submission.id}>
              <LinkRow
                href={href}
                stackOnPhone
                meta={<RelativeDay iso={submission.submitted_at} prefix="Submitted" />}
                trailing={
                  <EditorStatusPill tone={INTAKE_STATUS_TONE[submission.status]}>{INTAKE_STATUS_LABEL[submission.status]}</EditorStatusPill>
                }
              >
                <span className="theme-text-primary font-medium">{submission.title}</span>
              </LinkRow>
            </li>
          ))}
          <li>
            <LinkRow href={href} trailing={<CountValue count={{ kind: "known", count: reports.published.length, stale: false }} noun="published" />}>
              Published reports
            </LinkRow>
          </li>
        </ul>
      )}
      <OnwardLink href={href}>{`Open ${label}`}</OnwardLink>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------

function HomeIntro({ name, role, summary }: { name: string | null; role: AppRole | null; summary: string }) {
  const first = name?.trim().split(/\s+/)[0];
  return (
    <header className="space-y-1">
      <p className="theme-text-primary text-lg font-semibold">{first ? `Welcome back, ${first}` : "Welcome back"}</p>
      <p className="theme-text-muted text-sm">
        {role ? (
          <>
            Signed in as <span className="theme-text-secondary font-medium">{getRoleDisplayName(role)}</span>.{" "}
          </>
        ) : null}
        {summary}
      </p>
    </header>
  );
}

/** A row of one or two sections; a lone section keeps a readable measure instead of stretching. */
function HomeRow({ children, split }: { children: ReactNode; split?: "even" | "lead" }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10",
        split === "lead" && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        split === "even" && "lg:grid-cols-2",
        !split && "max-w-3xl",
      )}
    >
      {children}
    </div>
  );
}

export function HomeTab({ role, profileKey }: HomeTabProps) {
  const session = useSession();
  const sets = homeCardSetsFor(role);
  const locales = approvedGlossaryLocales({ role, glossaryLocales: session.data?.user?.glossaryLocales });
  // Sections enter in reading order: each takes the next stagger step.
  let order = 0;
  const next = (steps = 1) => {
    const delay = STAGGER * order;
    order += steps;
    return delay;
  };

  return (
    <section aria-label="Your work" className="mt-6 space-y-10 sm:space-y-12">
      <HomeIntro name={session.data?.user?.name ?? null} role={sets.length > 0 ? role : null} summary={homeSummaryFor(sets)} />
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
        <HomeRow split="lead">
          <AdminWaitingCard delay={next()} />
          <PendingInvitesCard delay={next()} />
        </HomeRow>
      ) : null}
      {sets.includes("editor") ? <EditorWorkCards role={role} delay={next(2)} /> : null}
      {sets.includes("translator") ? (
        <HomeRow>
          <TranslatorInboxCard locales={locales} delay={next()} />
        </HomeRow>
      ) : null}
      {sets.includes("contributor") ? (
        <HomeRow split="even">
          <ContributorProfileCard profileKey={profileKey} delay={next()} />
          <ContributorReportsCard role={role} delay={next()} />
        </HomeRow>
      ) : null}
    </section>
  );
}
