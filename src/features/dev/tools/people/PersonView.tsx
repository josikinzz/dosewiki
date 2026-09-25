"use client";

import { useMemo, useState } from "react";

import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  Notice,
  EditorSection,
  EditorStatusPill,
  LoadErrorState,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import type { ManagedRole } from "@/lib/auth/roles";

import { ContributorProfileEditor } from "../contributors/ContributorProfileEditor";
import type { ContributorsController } from "../contributors/useContributorsController";
import { MemberAccountPanel } from "../members/MemberAccountPanel";
import type { MemberRow } from "../members/membersModel";
import type { MemberPendingKind } from "../members/useMemberActions";
import { PERSON_FLAG_LABEL, personLabel, type Person } from "./peopleModel";

/** Why the link controls are off while the profile holds unsaved edits. */
const DIRTY_LINK_REASON = "Save or discard the profile's changes before changing its link.";

type PersonViewProps = {
  person: Person;
  /** Everyone, for the link pickers: accounts without a profile, profiles without an account. */
  people: readonly Person[];
  self: string;
  pending: MemberPendingKind | null;
  onChangeRole: (row: MemberRow, role: ManagedRole, glossaryLocales: string[]) => void;
  onToggleBan: (row: MemberRow) => void;
  onIssueReset: (row: MemberRow) => void;
  controller: ContributorsController;
  /** Asks, then links `key` to `email` (or unlinks with `null`). */
  onLink: (key: string, email: string | null) => void;
  linkBusy: boolean;
};

/**
 * One person: the account on the left, the public profile on the right. A
 * side with nothing linked says so and offers a picker of what could fill
 * it, so the link is chosen from real accounts and profiles, never typed.
 */
export function PersonView({ person, people, self, pending, onChangeRole, onToggleBan, onIssueReset, controller, onLink, linkBusy }: PersonViewProps) {
  const linkLocked = controller.hasUnsavedChanges;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="theme-text-primary text-lg font-semibold">{personLabel(person)}</h3>
        {person.flag ? (
          <EditorStatusPill tone="caution" icon="lucide:unlink">{PERSON_FLAG_LABEL[person.flag]}</EditorStatusPill>
        ) : (
          <EditorStatusPill tone="success" icon="lucide:link">Linked</EditorStatusPill>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <EditorSection headingLevel="h3" icon="lucide:key-round" title="Account" description="Sign-in, roles and languages. Changes take effect on the member's next request.">
          <div aria-label="Account" role="region">
            {person.account ? (
              <MemberAccountPanel
                row={person.account}
                self={self}
                pending={pending}
                onChangeRole={onChangeRole}
                onToggleBan={onToggleBan}
                onIssueReset={onIssueReset}
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
                actionLabel="Link account"
                disabledReason={linkLocked ? DIRTY_LINK_REASON : null}
                busy={linkBusy}
                onLink={(email) => person.profileKey && onLink(person.profileKey, email)}
              />
            )}
          </div>
        </EditorSection>

        <EditorSection headingLevel="h3" icon="lucide:id-card" title="Public profile" description="What the site credits on the public contributor page. Each save goes live at once.">
          <div aria-label="Public profile" role="region" className="space-y-6">
            {person.profileKey ? (
              <>
                {person.linkedEmail ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="theme-text-secondary text-sm">
                      Linked to <span className="font-mono">{person.linkedEmail}</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={linkLocked || linkBusy}
                      onClick={() => person.profileKey && onLink(person.profileKey, null)}
                    >
                      Unlink
                    </Button>
                  </div>
                ) : null}
                {person.flag === "shared-link" ? (
                  <p className="theme-text-faint text-xs">
                    {`${person.linkedEmail} already edits another profile. Unlink one of them so each account holds one profile.`}
                  </p>
                ) : null}
                {linkLocked && person.linkedEmail ? <p className="theme-text-faint text-xs">{DIRTY_LINK_REASON}</p> : null}
                <ProfilePane controller={controller} />
              </>
            ) : (
              <LinkPicker
                intro="No public profile is linked to this account. Link the profile the site already credits them under."
                label="Link a profile"
                placeholder="Search profiles"
                emptyText="No unlinked profile matches."
                options={profileOptions(people)}
                actionLabel="Link profile"
                disabledReason={null}
                busy={linkBusy}
                onLink={(key) => person.account && onLink(key, person.account.email)}
              />
            )}
          </div>
        </EditorSection>
      </div>
    </div>
  );
}

/** The loaded profile's editor, with its load and save states. */
function ProfilePane({ controller }: { controller: ContributorsController }) {
  const { notice, detail, detailError, isDetailLoading, retryDetail } = controller;
  return (
    <div className="space-y-6">
      {notice ? <Notice {...notice} /> : null}
      {detailError ? <LoadErrorState message={detailError} onRetry={retryDetail} busy={isDetailLoading} /> : null}
      {isDetailLoading && !detail ? <StateCard loading compact title="Loading profile" /> : null}
      <ContributorProfileEditor controller={controller} linkedAccount={null} />
    </div>
  );
}

function accountOptions(people: readonly Person[]): SearchablePickerOption[] {
  return people
    .filter((person): person is Person & { account: MemberRow } => person.account !== null && person.profileKey === null)
    .map((person) => ({
      value: person.account.email,
      label: person.account.username ?? person.account.name ?? person.account.email,
      hint: person.account.email,
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
  actionLabel,
  disabledReason,
  busy,
  onLink,
}: {
  intro: string;
  label: string;
  placeholder: string;
  emptyText: string;
  options: readonly SearchablePickerOption[];
  actionLabel: string;
  disabledReason: string | null;
  busy: boolean;
  onLink: (value: string) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const known = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const value = choice && known.has(choice) ? choice : null;
  return (
    <div className="space-y-3">
      <p className="theme-text-secondary text-sm">{intro}</p>
      <SearchablePicker
        options={options}
        value={value}
        onChange={setChoice}
        placeholder={placeholder}
        emptyText={emptyText}
        ariaLabel={label}
        disabled={disabledReason !== null || busy}
      />
      <Button
        type="button"
        variant="accent"
        size="sm"
        disabled={value === null || disabledReason !== null || busy}
        onClick={() => value && onLink(value)}
      >
        {actionLabel}
      </Button>
      {disabledReason ? <p className="theme-text-faint text-xs">{disabledReason}</p> : null}
    </div>
  );
}
