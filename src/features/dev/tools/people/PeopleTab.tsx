"use client";

/**
 * People: `/dev/people` (and the retired `/dev/members`). Each account beside
 * its public contributor profile, so a person is managed in one place, plus
 * the invite codes that create accounts and the guide to what each role can
 * do. Three views under one heading: Members (a list and the open person's
 * pane), Invites, and Roles. All three stay mounted, so switching views never
 * drops a staged permission change or a half-filled invite.
 *
 * The list pairs accounts with the profiles whose membership email is theirs
 * and flags what does not pair: an account with no profile, a profile nobody
 * signs in to, a link to an email with no account. Every account write and
 * every link change confirms first. Picking another person replaces the
 * loaded profile and any staged permissions, so it asks the shell's
 * unsaved-work dialog first, the same one the rail uses.
 *
 * Contributors keeps the profile directory for editors and each member's own
 * profile; this tab is admin-only because accounts are.
 */

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y, TOUCH_ICON } from "@/components/ui/touchTargets";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorList,
  EditorListRow,
  EditorNavTabs,
  EditorPanel,
  LoadErrorState,
  useDevShortcuts,
  useScrollToDetail,
  useUnsavedWorkRegistry,
  type NoticeMessage,
} from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { getRoleDisplayName } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";

import { useContributorUnsavedWork } from "../contributors/useContributorUnsavedWork";
import { useContributorsController } from "../contributors/useContributorsController";
import { RowSkeletons } from "../home/homeParts";
import InviteCodesPanel from "../members/InviteCodesPanel";
import { RoleGuide } from "../members/RoleGuide";
import { memberRowLock } from "../members/membersModel";
import { useMemberActions } from "../members/useMemberActions";
import { Monogram, PersonPane } from "./PersonPane";
import {
  PERSON_FLAG_ICON,
  PERSON_FLAG_LABEL,
  PEOPLE_VIEW_EMPTY,
  PEOPLE_VIEW_LABEL,
  accountPersonId,
  countPeople,
  fetchPeople,
  filterPeople,
  findPersonBySlug,
  isFrozenWriteMessage,
  pairPeople,
  personLabel,
  personRowDetail,
  profilePersonId,
  setProfileAccount,
  type PeopleData,
  type PeopleView,
  type Person,
} from "./peopleModel";

type PeopleSection = "members" | "invites" | "roles";
const SECTIONS: readonly PeopleSection[] = ["members", "invites", "roles"];

const SHORTCUTS = [
  { keys: "j / k", label: "Next or previous person" },
  { keys: "/", label: "Search people" },
];

const FROZEN_LINK = "Writes are paused, so the link did not change.";

export type PeopleTabProps = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
  /** The signed-in admin's own contributor key. */
  sessionProfileKey: string;
  /** `/dev/people/<email or profile key>`: the person the tab opens on. */
  initialPerson?: string;
};

/** `#invites` and `#roles` open those views; anything else opens Members. */
function sectionFromHash(): PeopleSection {
  if (typeof window === "undefined") return "members";
  const hash = window.location.hash.replace(/^#/, "");
  return (SECTIONS as readonly string[]).includes(hash) ? (hash as PeopleSection) : "members";
}

export function PeopleTab({ profiles, isDirectoryLoading, sessionProfileKey, initialPerson }: PeopleTabProps) {
  const [data, setData] = useState<PeopleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<PeopleSection>("members");
  const [view, setView] = useState<PeopleView>("accounts");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNotice, setLinkNotice] = useState<NoticeMessage | null>(null);
  const [openInvites, setOpenInvites] = useState<number | null>(null);
  const [inviteNote, setInviteNote] = useState<{ text: string; token: number } | null>(null);
  const registry = useUnsavedWorkRegistry();
  const { frozen } = useWriteFreeze();

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setData(await fetchPeople());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load people.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The view in the address: `#invites` from Home lands on the codes.
  useEffect(() => {
    setSection(sectionFromHash());
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const changeSection = useCallback((next: PeopleSection) => {
    setSection(next);
    const { pathname, search: query } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${query}${next === "members" ? "" : `#${next}`}`);
  }, []);

  const directoryReady = !(isDirectoryLoading && profiles.length === 0);
  const people = useMemo(() => (data ? pairPeople(data, profiles) : []), [data, profiles]);
  const visible = useMemo(() => filterPeople(people, view, search), [people, view, search]);
  const selected = people.find((person) => person.id === selectedId) ?? null;
  const counts = useMemo(() => countPeople(people), [people]);
  const known = data !== null && directoryReady && !loadError;

  // The first person lands once, on the first list that holds them: the
  // linked one for `/dev/people/<slug>`, otherwise the first account.
  const landedRef = useRef(false);
  useEffect(() => {
    if (landedRef.current || !data || !directoryReady) return;
    landedRef.current = true;
    const linked = initialPerson ? findPersonBySlug(people, initialPerson) : undefined;
    if (linked && !linked.account) setView("all");
    // Phones show the list as the whole view until a person is picked; a wide
    // screen opens the first account that has something to manage.
    const wide = typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches;
    const first = people.find((person) => person.account && !memberRowLock(person.account, data.self)) ?? people[0];
    setSelectedId((linked ?? (wide ? first : undefined))?.id ?? null);
    // A deep link on a phone scrolls the person in, as a tap would.
    if (linked) setTappedId(linked.id);
  }, [data, directoryReady, initialPerson, people]);

  // The address follows the open person, so a reload or a pasted link opens them again.
  useEffect(() => {
    if (!landedRef.current) return;
    const slug = selected ? (selected.account?.email ?? selected.profileKey ?? "") : "";
    const path = devHref({ type: "dev", tab: "people", slug: slug || undefined });
    const next = `${path}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.hash}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [selected]);

  const actions = useMemberActions(load);
  const controller = useContributorsController({
    profiles,
    canEdit: true,
    canApprove: true,
    sessionProfileKey,
    explicitSelection: true,
  });
  useContributorUnsavedWork(controller, "people", "People");
  const { selectProfile, retryDetail } = controller;
  const selectedProfileKey = selected?.profileKey ?? "";
  useEffect(() => {
    selectProfile(selectedProfileKey);
  }, [selectProfile, selectedProfileKey]);

  const listRef = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [tappedId, setTappedId] = useState<string | null>(null);
  useScrollToDetail(paneRef, tappedId);

  const pick = useCallback(
    (id: string | null) => {
      if (id === selectedId) return;
      registry.confirmExit(() => {
        setSelectedId(id);
        setTappedId(id);
        setLinkNotice(null);
      }, "tab", { tab: "people" });
    },
    [registry, selectedId],
  );

  const selectedIndex = selected ? visible.findIndex((person) => person.id === selected.id) : -1;
  const move = useCallback(
    (step: 1 | -1) => {
      if (visible.length === 0) return;
      const next = selectedIndex < 0 ? (step === 1 ? 0 : visible.length - 1) : selectedIndex + step;
      const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
      pick(target.id);
    },
    [pick, selectedIndex, visible],
  );

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  // `j` and `k` walk the list, `/` goes to the search; never while typing or with a dialog open.
  useDevShortcuts(SHORTCUTS, section === "members" && known);
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    if (section !== "members") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        moveRef.current(event.key === "j" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section]);

  const nameOf = useCallback(
    (email: string) => {
      const normalized = email.trim().toLowerCase();
      if (data && normalized === data.self.trim().toLowerCase()) return "you";
      return data?.members.find((member) => member.email.toLowerCase() === normalized)?.username ?? email;
    },
    [data],
  );

  const link = (key: string, email: string | null) => {
    const person = selected;
    if (!person) return;
    const profileName = person.profileName ?? people.find((entry) => entry.profileKey === key)?.profileName ?? key;
    const accountLabel = email
      ? people.find((entry) => entry.account?.email === email)?.account?.username ?? email
      : person.account?.username ?? person.linkedEmail ?? "";
    const apply = async () => {
      setLinkBusy(true);
      setLinkNotice(null);
      try {
        await setProfileAccount(key, email);
        await load();
        // Linking moves the profile under its account; unlinking leaves the
        // account where it was, or the profile on its own.
        setSelectedId(email ? accountPersonId(email) : person.account ? person.id : profilePersonId(key));
        retryDetail();
        setLinkNotice({
          tone: "success",
          message: email
            ? `${profileName} is linked to ${accountLabel}. They can edit it when signed in.`
            : `${profileName} is unlinked. Its public page stays as it was.`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The link did not change.";
        setLinkNotice({ tone: "danger", message: frozen || isFrozenWriteMessage(message) ? FROZEN_LINK : message });
      } finally {
        setLinkBusy(false);
      }
    };
    actions.confirm(
      email
        ? {
            title: `Link ${profileName} to ${accountLabel}?`,
            description: `${accountLabel} can then edit this public profile themselves when signed in. The link is live at once.`,
            confirmLabel: "Link",
            onConfirm: () => void apply(),
          }
        : {
            title: `Unlink ${profileName} from ${accountLabel}?`,
            description: `${accountLabel} can no longer edit this public profile. The profile stays public as it is.`,
            confirmLabel: "Unlink",
            destructive: true,
            onConfirm: () => void apply(),
          },
    );
  };

  // Counts ride on the tabs as numbers; the sr-only words say what they count.
  const tabOptions = [
    {
      value: "members",
      label: known ? <>Members<span className="sr-only">{`, ${counts.accounts} accounts`}</span></> : "Members",
      controls: "people-members",
      ...(known ? { badge: <span aria-hidden>{counts.accounts}</span> } : {}),
    },
    {
      value: "invites",
      label: openInvites ? <>Invites<span className="sr-only">{`, ${openInvites} open`}</span></> : "Invites",
      controls: "people-invites",
      ...(openInvites ? { badge: <span aria-hidden>{openInvites}</span> } : {}),
    },
    { value: "roles", label: "Roles", controls: "people-roles" },
  ];
  const searching = search.trim().length > 0;

  return (
    <div className="space-y-6">
      <DevToolSection
        tool="people"
        description="Accounts, their public contributor profiles, and the invite codes that create them."
      >
        <EditorNavTabs label="People views" value={section} onChange={(value) => changeSection(value as PeopleSection)} options={tabOptions} />
      </DevToolSection>

      <div id="people-members" role="tabpanel" aria-label="Members" hidden={section !== "members"}>
        {loadError ? (
          <LoadErrorState what="people" message={loadError} onRetry={() => void load()} busy={loading} />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
            <section ref={listRef} aria-labelledby="people-list-heading" className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
              <div className="flex items-center justify-between gap-3">
                <h3 id="people-list-heading" className="type-meta-label theme-text-muted">
                  Members
                </h3>
                <div className="flex items-center gap-1">
                  <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
                    {!known ? "Loading" : searching || view !== "all" ? `${visible.length} of ${counts.all} shown` : `${counts.all} people`}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", TOUCH_ICON)}
                    onClick={() => void load()}
                    disabled={loading}
                    aria-busy={loading || undefined}
                    aria-label={loading ? "Refreshing people" : "Refresh people"}
                    title="Refresh"
                  >
                    <Icon icon="lucide:refresh-cw" size={14} className={cn(loading && "motion-safe:animate-spin")} />
                  </Button>
                </div>
              </div>
              <ViewChoices value={view} onChange={setView} counts={known ? counts : null} />
              <div className="relative">
                <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  ref={searchRef}
                  type="search"
                  aria-label="Search"
                  aria-description="Matches a sign-in email, username, name or profile key."
                  aria-keyshortcuts="/"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && search) {
                      event.preventDefault();
                      setSearch("");
                    }
                  }}
                  placeholder="Email, name or profile key"
                  className="peer pl-9 pr-9 text-[16px] md:text-sm"
                />
                {search ? null : (
                  <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
                    <kbd className="theme-dev-kbd">/</kbd>
                  </span>
                )}
              </div>
              {!known ? (
                <RowSkeletons rows={6} label="people" />
              ) : (
                <EditorList
                  label="People"
                  items={visible}
                  getKey={(person) => person.id}
                  selectedKey={selectedId}
                  onSelect={pick}
                  estimateRowHeight={64}
                  maxHeight="min(calc(100dvh - 19rem), 680px)"
                  emptyText={searching ? "Nobody matches that search." : PEOPLE_VIEW_EMPTY[view]}
                  renderItem={(person, { selected: active }) => (
                    <PersonRow person={person} active={active} self={data?.self ?? ""} dirty={active && registry.isDirty("people")} />
                  )}
                />
              )}
              {known && visible.length === 0 && (searching || view !== "all") && counts.all > 0 ? (
                <p className="theme-text-muted text-sm">
                  {searching ? `No match for "${search.trim()}" in ${PEOPLE_VIEW_LABEL[view]}. ` : null}
                  <Button
                    type="button"
                    variant="link"
                    size="auto"
                    className="text-sm"
                    onClick={() => {
                      setSearch("");
                      setView("all");
                    }}
                  >
                    Show everyone
                  </Button>
                </p>
              ) : null}
              {known ? (
                <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
                  <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move,{" "}
                  <kbd className="theme-dev-kbd">/</kbd> search, <kbd className="theme-dev-kbd">?</kbd> every key
                </p>
              ) : null}
            </section>

            <section
              ref={paneRef}
              aria-label={selected ? `Person: ${personLabel(selected)}` : "Person"}
              className={cn("scroll-mt-24", !selected && "hidden lg:block")}
            >
              {selected && data ? (
                <PersonPane
                  // A new person starts with a clean picker and permission draft.
                  key={selected.id}
                  person={selected}
                  people={people}
                  self={data.self}
                  position={{ index: selectedIndex, total: visible.length }}
                  onMove={move}
                  onClose={() => pick(null)}
                  onBackToList={backToList}
                  onShowRoles={() => changeSection("roles")}
                  nameOf={nameOf}
                  onOpenPerson={(id) => pick(id)}
                  onInvite={(note) => {
                    setInviteNote((current) => ({ text: note, token: (current?.token ?? 0) + 1 }));
                    changeSection("invites");
                  }}
                  titleRef={titleRef}
                  accountNotices={actions.noticesFor(selected.account?.email ?? null)}
                  pending={actions.pending?.email === selected.account?.email ? actions.pending?.kind ?? null : null}
                  onChangeRole={actions.changeRole}
                  onToggleBan={actions.toggleBan}
                  onIssueReset={actions.issueReset}
                  controller={controller}
                  onLink={link}
                  linkBusy={linkBusy}
                  linkNotice={linkNotice}
                  onDismissLinkNotice={() => setLinkNotice(null)}
                />
              ) : (
                <IdlePane loading={!known} />
              )}
            </section>
          </div>
        )}
      </div>

      <div id="people-invites" role="tabpanel" aria-label="Invites" hidden={section !== "invites"}>
        <InviteCodesPanel
          nameOf={nameOf}
          onActiveCountChange={setOpenInvites}
          prefillNote={inviteNote}
          onOpenMember={
            known
              ? (email) => {
                  const person = people.find((entry) => entry.account?.email === email.trim().toLowerCase());
                  if (!person) return false;
                  changeSection("members");
                  // A person the current view or search hides comes back into the list with them.
                  if (!visible.some((entry) => entry.id === person.id)) {
                    setSearch("");
                    setView("all");
                  }
                  pick(person.id);
                  return true;
                }
              : undefined
          }
        />
      </div>

      <div id="people-roles" role="tabpanel" aria-label="Roles" hidden={section !== "roles"} className="space-y-4">
        <div className="space-y-1">
          <h3 className="theme-text-primary text-base font-semibold">What each role can do</h3>
          <p className="theme-text-muted max-w-[75ch] text-sm">
            The same words an invitee reads on the invite page. The server enforces every one of them, not just the interface.
          </p>
        </div>
        <RoleGuide
          roles={[
            ROLE_DESCRIPTIONS.admin,
            ROLE_DESCRIPTIONS.editor,
            ROLE_DESCRIPTIONS.translator,
            ROLE_DESCRIPTIONS.editor_translator,
            ROLE_DESCRIPTIONS.contributor,
          ]}
        />
      </div>

      {actions.dialog}
    </div>
  );
}

/**
 * Two lines at one pitch for the windowed list: the name (and "you") with the
 * role, then what the person needs, or where their profile or sign-in is.
 */
function PersonRow({ person, active, self, dirty }: { person: Person; active: boolean; self: string; dirty: boolean }) {
  const isSelf = person.account !== null && person.account.email === self.trim().toLowerCase();
  return (
    <EditorListRow active={active} className="min-h-[3.5rem] py-2">
      <Monogram person={person} />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("min-w-0 truncate text-sm font-semibold", active ? "theme-accent-heading" : "theme-text-primary")}>
            {personLabel(person)}
            {isSelf ? <span className="theme-text-muted font-normal"> (you)</span> : null}
          </span>
          <span className="theme-text-muted flex shrink-0 items-center gap-1.5 text-xs">
            <span className="sr-only">, </span>
            {dirty ? (
              <>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
                <span className="sr-only">unsaved changes, </span>
              </>
            ) : null}
            {person.account ? getRoleDisplayName(person.account.role) : "No account"}
          </span>
        </span>
        <span className="block truncate text-xs">
          <span className="sr-only">, </span>
          {person.account?.bannedAt ? (
            <span className="theme-danger-text-strong mr-1.5 inline-flex items-center gap-1 font-medium">
              <Icon icon="lucide:ban" size={11} />
              Banned
            </span>
          ) : null}
          {person.flag ? (
            <span className="theme-text-muted inline-flex items-center gap-1">
              <Icon icon={PERSON_FLAG_ICON[person.flag]} size={12} className="theme-warning-text-strong shrink-0" />
              {PERSON_FLAG_LABEL[person.flag]}
            </span>
          ) : (
            <span className="theme-text-faint">{personRowDetail(person)}</span>
          )}
        </span>
      </span>
    </EditorListRow>
  );
}

/**
 * Accounts, Needs a link, Everyone: three pressed-state choices in one
 * capsule that always fits the list column, each with its count (omitted while
 * unknown, never shown as zero).
 */
function ViewChoices({
  value,
  onChange,
  counts,
}: {
  value: PeopleView;
  onChange: (view: PeopleView) => void;
  counts: Record<PeopleView, number> | null;
}) {
  return (
    <div
      role="group"
      aria-label="Show"
      className="grid grid-cols-3 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {(["accounts", "unlinked", "all"] as const).map((option) => {
        const selected = option === value;
        return (
          <Button
            key={option}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn("h-auto min-h-9 w-full flex-col gap-0 rounded-control px-1.5 py-1 leading-tight [@media(pointer:coarse)]:min-h-11", TOUCH_HALO_Y)}
          >
            <span className="text-xs font-medium">{PEOPLE_VIEW_LABEL[option]}</span>
            {counts ? (
              <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
                <span className="sr-only">, </span>
                {counts[option]}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

/** What the pane says on desktop before anyone is open (or while the list loads). Hidden on phones. */
function IdlePane({ loading }: { loading: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6" aria-busy={loading || undefined}>
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon={loading ? "lucide:loader-circle" : "lucide:user-cog"} size={18} className={cn("theme-icon-accent shrink-0", loading && "motion-safe:animate-spin")} />
        {loading ? "Loading people" : "Pick a person"}
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Their account and public profile open here: roles and languages, a password reset or a ban, the link between the two,
        and the profile the site credits them under.
      </p>
    </EditorPanel>
  );
}
