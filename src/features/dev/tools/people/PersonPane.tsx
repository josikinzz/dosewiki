"use client";

import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorPanel,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  type NoticeMessage,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { getRoleDisplayName, type ManagedRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

import { ContributorProfileEditor } from "../contributors/ContributorProfileEditor";
import type { ContributorsController } from "../contributors/useContributorsController";
import { MemberAccountPanel } from "../members/MemberAccountPanel";
import type { MemberRow } from "../members/membersModel";
import type { MemberPendingKind } from "../members/useMemberActions";
import { PERSON_FLAG_LABEL, PERSON_FLAG_ICON, personLabel, type Person } from "./peopleModel";

const DIRTY_LINK_REASON = "Save or discard the profile's changes before changing its link.";

type PersonPaneProps = {
  person: Person;
  people: readonly Person[];
  self: string;
  position: { index: number; total: number };
  onMove: (step: 1 | -1) => void;
  onClose: () => void;
  onBackToList: () => void;
  onShowRoles: () => void;
  nameOf: (email: string) => string;
  onOpenPerson: (id: string) => void;
  onInvite: (note: string) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  accountNotices: ReactNode;
  pending: MemberPendingKind | null;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
  controller: ContributorsController;
  onLink: (key: string, email: string | null) => void;
  linkBusy: boolean;
  linkNotice: NoticeMessage | null;
  onDismissLinkNotice: () => void;
};

export function PersonPane({
  person,
  people,
  self,
  position,
  onMove,
  onClose,
  onBackToList,
  onShowRoles,
  nameOf,
  onOpenPerson,
  onInvite,
  titleRef,
  accountNotices,
  pending,
  onChangeRole,
  onToggleBan,
  onIssueReset,
  controller,
  onLink,
  linkBusy,
  linkNotice,
  onDismissLinkNotice,
}: PersonPaneProps) {
  const headingId = useId();
  const linkLocked = controller.hasUnsavedChanges;
  const name = personLabel(person);
  const isSelf = person.account !== null && person.account.email === self.trim().toLowerCase();

  return (
    <EditorPanel className="overflow-visible" data-testid="person-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label={`Close ${name}`}
          title="Close"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="flex items-center justify-between gap-2 pr-12 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
          <Pager position={position} onMove={onMove} />
        </div>
        <div className="flex min-w-0 items-start gap-3 lg:pr-12">
          <Monogram person={person} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <h3
              id={headingId}
              ref={titleRef}
              tabIndex={-1}
              className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
            >
              {name}
              {isSelf ? <span className="theme-text-muted text-base font-normal"> (you)</span> : null}
            </h3>
            <p className="theme-text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {person.account ? (
                <>
                  <span className="break-all">{person.account.email}</span>
                  <span aria-hidden>·</span>
                  <span>{getRoleDisplayName(person.account.role)}</span>
                </>
              ) : (
                <span>
                  Public profile <span className="font-mono text-xs">{person.profileKey}</span>, no account
                </span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-2 pt-0.5">
              {person.flag ? (
                <EditorStatusPill inline tone="caution" icon={PERSON_FLAG_ICON[person.flag]}>
                  {PERSON_FLAG_LABEL[person.flag]}
                </EditorStatusPill>
              ) : (
                <EditorStatusPill inline tone="success" icon="lucide:link">
                  {`Linked to ${person.profileName ?? person.profileKey}`}
                </EditorStatusPill>
              )}
              {person.account?.bannedAt ? (
                <EditorStatusPill inline tone="danger" icon="lucide:ban">
                  Banned
                </EditorStatusPill>
              ) : null}
            </p>
          </div>
          <div className="hidden shrink-0 lg:block">
            <Pager position={position} onMove={onMove} />
          </div>
        </div>
      </header>

      <div className="divide-y divide-[color:var(--editor-panel-border)]">
        <PaneBlock
          id={`${headingId}-account`}
          icon="lucide:key-round"
          title="Account"
          timing="Each change applies on the member's next request, after you confirm it."
        >
          <div className="space-y-4">
            {person.account ? (
              <MemberAccountPanel
                row={person.account}
                self={self}
                pending={pending}
                onChangeRole={onChangeRole}
                onToggleBan={onToggleBan}
                onIssueReset={onIssueReset}
                onShowRoles={onShowRoles}
                nameOf={nameOf}
              />
            ) : (
              <LinkPicker
                intro={
                  person.flag === "no-account" && person.linkedEmail
                    ? `This profile is linked to ${person.linkedEmail}, but nobody signs in with that email.`
                    : "No account is linked to this profile, so no member edits it themselves."
                }
                label="Link an account"
                placeholder="Search accounts"
                emptyText="No account without a profile matches."
                options={accountOptions(people)}
                noneLeft="Every account already has a profile. Unlink one first, or invite this person."
                actionLabel="Link account"
                disabledReason={linkLocked ? DIRTY_LINK_REASON : null}
                busy={linkBusy}
                onLink={(email) => person.profileKey && onLink(person.profileKey, email)}
                onward={
                  person.flag === "shared-link" ? undefined : <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => onInvite(`For the ${person.profileName ?? person.profileKey} profile`)}>
                    Invite them instead
                  </Button>
                }
              />
            )}
            {accountNotices}
          </div>
        </PaneBlock>

        <PaneBlock
          id={`${headingId}-profile`}
          icon="lucide:id-card"
          title="Public profile"
          timing="What the site credits on the contributor page. Each save goes live at once."
        >
          <div className="space-y-5">
            {linkNotice ? <Notice {...linkNotice} dismiss={onDismissLinkNotice} className="text-sm" /> : null}
            {person.profileKey ? (
              <>
                {person.linkedEmail ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <p className="theme-text-secondary flex min-w-0 items-center gap-2 text-sm">
                        <Icon icon="lucide:link" size={14} className="theme-text-faint shrink-0" />
                        <span className="min-w-0 break-all">
                          Linked to <span className="theme-text-primary font-medium">{person.linkedEmail}</span>
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={linkLocked || linkBusy}
                        aria-busy={linkBusy || undefined}
                        onClick={() => person.profileKey && onLink(person.profileKey, null)}
                      >
                        <Icon icon="lucide:unlink" size={14} />
                        {linkBusy ? "Changing the link" : "Unlink"}
                      </Button>
                    </div>
                    {person.flag === "shared-link" ? (
                      <SharedLinkNote person={person} people={people} onOpenPerson={onOpenPerson} />
                    ) : null}
                    {linkLocked ? <p className="theme-text-faint text-xs">{DIRTY_LINK_REASON}</p> : null}
                  </div>
                ) : null}
                <ProfileEditor controller={controller} />
              </>
            ) : (
              <LinkPicker
                intro="No public profile is linked to this account. Link the profile the site already credits them under."
                label="Link a profile"
                placeholder="Search profiles"
                emptyText="No unlinked profile matches."
                options={profileOptions(people)}
                noneLeft="Every public profile is already linked to an account."
                actionLabel="Link profile"
                disabledReason={null}
                busy={linkBusy}
                onLink={(key) => person.account && onLink(key, person.account.email)}
              />
            )}
          </div>
        </PaneBlock>
      </div>
    </EditorPanel>
  );
}

function PaneBlock({
  id,
  icon,
  title,
  timing,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  timing: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 px-4 py-5 sm:px-5">
      <div className="space-y-1">
        <h4 id={id} className="theme-text-primary flex items-center gap-2 text-base font-semibold">
          <Icon icon={icon} size={16} className="theme-icon-accent shrink-0" />
          {title}
        </h4>
        <p className="theme-text-muted max-w-[65ch] text-sm">{timing}</p>
      </div>
      {children}
    </section>
  );
}

function Pager({ position, onMove }: { position: { index: number; total: number }; onMove: (step: 1 | -1) => void }) {
  if (position.index < 0 || position.total < 2) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">
        {position.index + 1} of {position.total}
      </span>
      <Button
        type="button"
        variant="iconGhost"
        size="icon"
        className={cn("h-8 w-8", TOUCH_ICON)}
        disabled={position.index === 0}
        onClick={() => onMove(-1)}
        aria-label="Previous person"
        aria-keyshortcuts="k"
        title="Previous person (k)"
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="iconGhost"
        size="icon"
        className={cn("h-8 w-8", TOUCH_ICON)}
        disabled={position.index >= position.total - 1}
        onClick={() => onMove(1)}
        aria-label="Next person"
        aria-keyshortcuts="j"
        title="Next person (j)"
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  );
}

function SharedLinkNote({ person, people, onOpenPerson }: { person: Person; people: readonly Person[]; onOpenPerson: (id: string) => void }) {
  const holder = people.find((entry) => entry.account && entry.account.email === person.linkedEmail);
  return (
    <p className="theme-text-muted flex items-start gap-2 text-sm">
      <Icon icon="lucide:info" size={14} className="theme-warning-text-strong mt-0.5 shrink-0" />
      <span>
        {`${holder ? personLabel(holder) : person.linkedEmail} already edits ${holder?.profileName ?? "another profile"}. Unlink one of them so each account holds one profile. `}
        {holder ? (
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => onOpenPerson(holder.id)}>
            {`Open ${personLabel(holder)}`}
          </Button>
        ) : null}
      </span>
    </p>
  );
}

export function Monogram({ person, size = "sm" }: { person: Person; size?: "sm" | "lg" }) {
  const initials = useMemo(() => {
    const basis = personLabel(person).replace(/[^\p{L}\p{N} ]/gu, " ").trim();
    const words = basis.split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : basis.slice(0, 2);
    return letters.toUpperCase() || "?";
  }, [person]);
  return (
    <span
      aria-hidden
      data-kind={person.account ? "account" : "profile"}
      className={cn(
        "theme-dev-avatar inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
        size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs",
      )}
    >
      {initials}
    </span>
  );
}

function ProfileEditor({ controller }: { controller: ContributorsController }) {
  const { notice, detail, detailError, isDetailLoading, retryDetail } = controller;
  return (
    <div className="space-y-6">
      {notice ? <Notice {...notice} /> : null}
      {detailError ? (
        <LoadErrorState what="this profile" message={detailError} onRetry={retryDetail} busy={isDetailLoading} />
      ) : null}
      {isDetailLoading && !detail ? <StateCard loading compact title="Loading profile" /> : null}
      <ContributorProfileEditor controller={controller} linkedAccount={null} headingLevel="h5" />
    </div>
  );
}

function accountOptions(people: readonly Person[]): SearchablePickerOption[] {
  return people
    .filter((person): person is Person & { account: MemberRow } => person.account !== null && person.profileKey === null)
    .map((person) => ({
      value: person.account.email,
      label: person.account.username ?? person.account.name ?? person.account.email,
      hint: `${getRoleDisplayName(person.account.role)} · ${person.account.email}`,
    }));
}

function profileOptions(people: readonly Person[]): SearchablePickerOption[] {
  return people
    .filter((person): person is Person & { profileKey: string } => person.flag === "unlinked-profile" && person.profileKey !== null)
    .map((person) => ({ value: person.profileKey, label: person.profileName ?? person.profileKey, hint: person.profileKey }));
}

function LinkPicker({
  intro,
  label,
  placeholder,
  emptyText,
  options,
  noneLeft,
  actionLabel,
  disabledReason,
  busy,
  onLink,
  onward,
}: {
  intro: string;
  label: string;
  placeholder: string;
  emptyText: string;
  options: readonly SearchablePickerOption[];
  noneLeft: string;
  actionLabel: string;
  disabledReason: string | null;
  busy: boolean;
  onLink: (value: string) => void;
  onward?: ReactNode;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const known = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const value = choice && known.has(choice) ? choice : null;
  const fieldId = useId();
  return (
    <div className="space-y-3">
      <p className="theme-text-secondary flex items-start gap-2 text-sm">
        <Icon icon="lucide:unlink" size={15} className="theme-warning-text-strong mt-0.5 shrink-0" />
        <span>{intro}</span>
      </p>
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="theme-text-secondary block text-sm font-medium">
          {label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <SearchablePicker
              id={fieldId}
              options={options}
              value={value}
              onChange={setChoice}
              placeholder={placeholder}
              emptyText={emptyText}
              ariaLabel={label}
              disabled={disabledReason !== null || busy}
            />
          </div>
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="shrink-0"
            disabled={value === null || disabledReason !== null || busy}
            aria-busy={busy || undefined}
            onClick={() => value && onLink(value)}
          >
            <Icon icon="lucide:link" size={14} />
            {busy ? "Linking" : actionLabel}
          </Button>
        </div>
        {options.length === 0 ? (
          <p className="theme-text-faint text-xs">{noneLeft}</p>
        ) : disabledReason ? (
          <p className="theme-text-faint text-xs">{disabledReason}</p>
        ) : value === null ? (
          <p className="theme-text-faint text-xs">{`Pick one first. ${actionLabel} asks before anything changes.`}</p>
        ) : null}
        {onward ? <p className="theme-text-muted text-sm">{onward}</p> : null}
      </div>
    </div>
  );
}
