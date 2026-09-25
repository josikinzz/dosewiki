"use client";

/**
 * People: `/dev/people` (and the retired `/dev/members`). Each account beside
 * its public contributor profile, so a person is managed in one place: roles,
 * languages, ban and password reset on the left, the profile editor on the
 * right, and the link between them chosen from a picker.
 *
 * The list pairs accounts with the profiles whose membership email is theirs
 * and flags what does not pair: an account with no profile, a profile nobody
 * signs in to, a link to an email with no account. Every write is immediate,
 * so account actions and link changes confirm first. Picking another person
 * replaces the loaded profile and any staged permissions, so it asks the
 * shell's unsaved-work dialog first, the same one the rail uses.
 *
 * Contributors keeps the profile directory for editors and each member's own
 * profile; this tab is admin-only because accounts are.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorField,
  EditorList,
  EditorListItem,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  useScrollToDetail,
  useUnsavedWorkRegistry,
  type EditorNavOption,
} from "@/features/dev/components";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { getRoleDisplayName } from "@/lib/auth/roles";

import { useContributorUnsavedWork } from "../contributors/useContributorUnsavedWork";
import { useContributorsController } from "../contributors/useContributorsController";
import InviteCodesPanel from "../members/InviteCodesPanel";
import { RoleGuide } from "../members/RoleGuide";
import { useMemberActions } from "../members/useMemberActions";
import { PersonView } from "./PersonView";
import {
  PERSON_FLAG_LABEL,
  accountPersonId,
  fetchPeople,
  filterPeople,
  findPersonBySlug,
  pairPeople,
  personLabel,
  profilePersonId,
  setProfileAccount,
  type PeopleData,
  type PeopleView,
  type Person,
} from "./peopleModel";

const VIEW_OPTIONS: EditorNavOption[] = [
  { value: "accounts", label: "Accounts" },
  { value: "unlinked", label: "Needs a link" },
  { value: "all", label: "Everyone" },
];

export type PeopleTabProps = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
  /** The signed-in admin's own contributor key. */
  sessionProfileKey: string;
  /** `/dev/people/<email or profile key>`: the person the tab opens on. */
  initialPerson?: string;
};

function personSubtitle(person: Person): string {
  if (person.account) {
    const role = getRoleDisplayName(person.account.role);
    return person.profileName ? `${role} · profile ${person.profileName}` : `${role} · ${person.account.email}`;
  }
  return person.profileKey ?? "";
}

export function PeopleTab({ profiles, isDirectoryLoading, sessionProfileKey, initialPerson }: PeopleTabProps) {
  const [data, setData] = useState<PeopleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<PeopleView>("accounts");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const registry = useUnsavedWorkRegistry();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchPeople());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load people.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => (data ? pairPeople(data, profiles) : []), [data, profiles]);
  const visible = useMemo(() => filterPeople(people, view, search), [people, view, search]);
  const selected = people.find((person) => person.id === selectedId) ?? null;

  // The first person lands once, on the first list that holds them: the
  // linked one for `/dev/people/<slug>`, otherwise the first account.
  const landedRef = useRef(false);
  useEffect(() => {
    if (landedRef.current || !data || (isDirectoryLoading && profiles.length === 0)) return;
    landedRef.current = true;
    const linked = initialPerson ? findPersonBySlug(people, initialPerson) : undefined;
    if (linked && !linked.account) setView("all");
    setSelectedId((linked ?? people[0])?.id ?? null);
  }, [data, initialPerson, isDirectoryLoading, people, profiles.length]);

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

  const detailRef = useRef<HTMLDivElement | null>(null);
  const [tappedId, setTappedId] = useState<string | null>(null);
  useScrollToDetail(detailRef, tappedId);

  const pick = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      registry.confirmExit(() => {
        setSelectedId(id);
        setTappedId(id);
      }, "tab", { tab: "people" });
    },
    [registry, selectedId],
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
      actions.setNotice(null);
      try {
        await setProfileAccount(key, email);
        await load();
        // Linking moves the profile under its account; unlinking leaves the
        // account where it was, or the profile on its own.
        setSelectedId(email ? accountPersonId(email) : person.account ? person.id : profilePersonId(key));
        retryDetail();
        actions.setNotice({
          tone: "success",
          message: email
            ? `${profileName} is linked to ${accountLabel}. They can edit it when signed in.`
            : `${profileName} is unlinked. Its public page stays as it was.`,
        });
      } catch (error) {
        actions.setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The link did not change." });
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

  const counts = useMemo(
    () => ({
      accounts: people.filter((person) => person.account).length,
      flagged: people.filter((person) => person.flag !== null).length,
    }),
    [people],
  );

  return (
    <div className="mt-6 space-y-10 md:mt-8">
      <EditorSection
        icon="lucide:users"
        title="People"
        description="Each account beside its public contributor profile. Account changes take effect on the member's next request; profile saves go live at once."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EditorStatusPill tone="neutral">{`${counts.accounts} accounts · ${counts.flagged} need a link`}</EditorStatusPill>
            <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={data === null && !loadError}>
              <Icon icon="lucide:refresh-cw" size={14} />
              Refresh
            </Button>
          </div>
        }
      >
        {actions.notices}
        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void load()} />
        ) : data === null || (isDirectoryLoading && profiles.length === 0) ? (
          <StateCard loading compact title="Loading people" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <EditorSegmentedControl label="Show" value={view} onChange={(value) => setView(value as PeopleView)} options={VIEW_OPTIONS} />
              <EditorField label="Search" description="Matches a sign-in email, username, name or profile key.">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Email, name, or key"
                  />
                )}
              </EditorField>
              <EditorList
                label="People"
                items={visible}
                getKey={(person) => person.id}
                selectedKey={selectedId}
                onSelect={pick}
                emptyText={view === "unlinked" ? "Everyone is linked." : "Nobody matches that search."}
                renderItem={(person, { selected: active }) => (
                  <EditorListItem
                    active={active}
                    tabIndex={-1}
                    title={personLabel(person)}
                    subtitle={personSubtitle(person)}
                    badge={
                      person.flag ? (
                        <EditorStatusPill tone="caution" icon="lucide:unlink">{PERSON_FLAG_LABEL[person.flag]}</EditorStatusPill>
                      ) : null
                    }
                  />
                )}
              />
            </div>

            <div ref={detailRef} className="scroll-mt-6">
              {selected ? (
                <PersonView
                  // A new person starts with a clean picker and permission draft.
                  key={selected.id}
                  person={selected}
                  people={people}
                  self={data.self}
                  pending={actions.pending?.email === selected.account?.email ? actions.pending?.kind ?? null : null}
                  onChangeRole={actions.changeRole}
                  onToggleBan={actions.toggleBan}
                  onIssueReset={actions.issueReset}
                  controller={controller}
                  onLink={link}
                  linkBusy={linkBusy}
                />
              ) : (
                <p className="theme-text-faint text-sm">Select a person to see their account and public profile.</p>
              )}
            </div>
          </div>
        )}
      </EditorSection>

      <EditorSection
        icon="lucide:shield-check"
        title="What each role can do"
        description="The same words an invitee reads on the invite page. Enforced server-side, not just hidden in the UI."
      >
        <RoleGuide
          roles={[
            ROLE_DESCRIPTIONS.admin,
            ROLE_DESCRIPTIONS.editor,
            ROLE_DESCRIPTIONS.translator,
            ROLE_DESCRIPTIONS.editor_translator,
            ROLE_DESCRIPTIONS.contributor,
          ]}
        />
      </EditorSection>

      <EditorSection
        icon="lucide:ticket"
        title="Invite codes"
        description="The only way an account is created. Each code grants one role; the plaintext is shown once."
      >
        <InviteCodesPanel />
      </EditorSection>

      {actions.dialog}
    </div>
  );
}
