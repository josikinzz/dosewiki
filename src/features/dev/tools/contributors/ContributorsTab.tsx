"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorActionStatus,
  EditorCheckbox,
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { AvatarUpload } from "@/features/dev/profile/AvatarUpload";
import { BioEditor } from "@/features/dev/profile/BioEditor";
import { LinkManager } from "@/features/dev/profile/LinkManager";
import {
  browserAvatarFileAdapter,
  createAvatarPreviewSession,
  createAvatarUploadPayload,
  validateAvatarFile,
} from "@/features/dev/profile/avatarUploadModel";
import { MAX_BIO_LENGTH, MAX_LINKS } from "@/features/dev/profile/types";
import { formatFileSize } from "@/features/dev/profile/utils";

import { ContributorDangerZone } from "./ContributorDangerZone";
import { OrderingPanel, type OrderablePanelItem } from "./OrderingPanel";
import {
  addAlias,
  buildContributorPatch,
  filterContributors,
  isContributorFormDirty,
  sortReports,
  sortWorks,
  toContributorForm,
  type ContributorFormState,
  type ContributorReport,
  type ContributorWork,
  type EditorContributorProfile,
} from "./contributorsModel";

type SaveState = EditorActionStatusState | "idle";

type ContributorDetail = {
  profile: EditorContributorProfile;
  works: ContributorWork[];
  reports: ContributorReport[];
};

export type ContributorsTabProps = {
  /** The shared contributor directory, fetched by the dev shell. */
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
};

function initialsFor(name: string, key: string): string {
  const basis = (name || key).trim();
  const initials = basis
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
  return initials || key.slice(0, 2).toUpperCase();
}

function workMeta(work: ContributorWork): string {
  const parts = [work.role, work.type, work.effectSlug ?? "", work.createdAt?.slice(0, 10) ?? ""];
  return parts.filter(Boolean).join(" · ");
}

function reportMeta(report: ContributorReport): string {
  const parts = [report.authorName, report.tripDate ?? "", report.featured ? "featured" : ""];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Contributors — the editor-side view of the people the site credits.
 *
 * Reads the contributor directory the shell already subscribes to (see
 * `tabNeedsContributorProfiles`) for the rail, and fetches the rest of one
 * contributor on selection through `/api/dev/contributor-profile`: the stored
 * fields the public projection drops, plus the replications and reports whose
 * order the panels below curate. It reads no substance article, so it renders
 * without waiting on the corpus drain.
 */
export function ContributorsTab({ profiles, isDirectoryLoading }: ContributorsTabProps) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<ContributorDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [form, setForm] = useState<ContributorFormState | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileSaveState, setProfileSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);

  const [workOrder, setWorkOrder] = useState<string[]>([]);
  const [reportOrder, setReportOrder] = useState<string[]>([]);
  const [workSaveState, setWorkSaveState] = useState<SaveState>("idle");
  const [reportSaveState, setReportSaveState] = useState<SaveState>("idle");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const directory = useMemo(
    () =>
      [...profiles].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [profiles],
  );
  const visibleProfiles = useMemo(() => filterContributors(directory, search), [directory, search]);

  const resolvedKey = useMemo(() => {
    if (directory.some((profile) => profile.key === selectedKey)) {
      return selectedKey;
    }
    return visibleProfiles[0]?.key ?? "";
  }, [directory, selectedKey, visibleProfiles]);

  // One fetch per selection. `reloadToken` is how a save re-reads the row it
  // just wrote, since this endpoint is a plain request and not a subscription.
  useEffect(() => {
    if (!resolvedKey) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/dev/contributor-profile?key=${encodeURIComponent(resolvedKey)}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          profile?: EditorContributorProfile;
          works?: ContributorWork[];
          reports?: ContributorReport[];
        };

        if (!response.ok || !payload.profile) {
          throw new Error(payload.error ?? "That contributor could not be loaded.");
        }

        if (cancelled) {
          return;
        }

        setDetail({
          profile: payload.profile,
          works: sortWorks(payload.works ?? []),
          reports: sortReports(payload.reports ?? []),
        });
        setForm(toContributorForm(payload.profile));
        setWorkOrder([...payload.profile.replicationOrder]);
        setReportOrder([...payload.profile.reportOrder]);
        setAvatarFile(null);
        setAliasDraft("");
        setProfileSaveState("idle");
        setWorkSaveState("idle");
        setReportSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setForm(null);
          setDetailError(
            error instanceof Error ? error.message : "That contributor could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, resolvedKey]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const preview = createAvatarPreviewSession(avatarFile, browserAvatarFileAdapter);
    setAvatarPreviewUrl(preview.source);
    return preview.dispose;
  }, [avatarFile]);

  const updateForm = useCallback((patch: Partial<ContributorFormState>) => {
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
    setProfileSaveState("idle");
  }, []);

  const handleAvatarFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    const validation = validateAvatarFile(file);
    if (validation.ok === false) {
      setNotice({ tone: "danger", title: "Avatar rejected", message: validation.message });
      return;
    }

    setAvatarFile(file);
    setNotice({ tone: "info", message: "Avatar ready. Save the profile to publish it." });
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!detail || !form) {
      return;
    }

    setProfileSaveState("saving");
    setNotice(null);

    try {
      const avatarUpload = avatarFile
        ? await createAvatarUploadPayload(avatarFile, browserAvatarFileAdapter)
        : undefined;

      const response = await fetch("/api/dev/contributor-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: detail.profile.key,
          ...buildContributorPatch(form),
          ...(avatarUpload ? { avatarUpload } : {}),
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The profile could not be saved.");
      }

      setProfileSaveState("saved");
      setNotice({
        tone: "success",
        message: `Saved ${detail.profile.displayName}. The public contributor page is live with it now.`,
      });
      setReloadToken((token) => token + 1);
    } catch (error) {
      setProfileSaveState("error");
      setNotice({
        tone: "danger",
        title: "Save failed",
        message: error instanceof Error ? error.message : "The profile could not be saved.",
      });
    }
  }, [avatarFile, detail, form]);

  const saveOrdering = useCallback(
    async (which: "works" | "reports") => {
      if (!detail) {
        return;
      }

      const setState = which === "works" ? setWorkSaveState : setReportSaveState;
      setState("saving");
      setNotice(null);

      try {
        const response = await fetch("/api/dev/contributor-profile/ordering", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: detail.profile.key,
            ...(which === "works" ? { replicationOrder: workOrder } : { reportOrder: reportOrder }),
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          prunedReplicationSlugs?: string[];
          prunedReportSlugs?: string[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "The order could not be saved.");
        }

        const pruned =
          which === "works" ? payload.prunedReplicationSlugs ?? [] : payload.prunedReportSlugs ?? [];

        setState("saved");
        setNotice({
          tone: pruned.length > 0 ? "warning" : "success",
          message:
            pruned.length > 0
              ? `Order saved. Dropped ${pruned.length} position(s) whose item no longer exists: ${pruned.join(", ")}.`
              : "Order saved. The contributor page renders it now.",
        });
        setReloadToken((token) => token + 1);
      } catch (error) {
        setState("error");
        setNotice({
          tone: "danger",
          title: "Order not saved",
          message: error instanceof Error ? error.message : "The order could not be saved.",
        });
      }
    },
    [detail, reportOrder, workOrder],
  );

  const workItems: OrderablePanelItem[] = useMemo(
    () =>
      (detail?.works ?? []).map((work) => ({
        slug: work.slug,
        title: work.title || work.slug,
        meta: workMeta(work),
      })),
    [detail?.works],
  );

  const reportItems: OrderablePanelItem[] = useMemo(
    () =>
      (detail?.reports ?? []).map((report) => ({
        slug: report.slug,
        title: report.title || report.slug,
        meta: reportMeta(report),
      })),
    [detail?.reports],
  );

  const knownAuthorNames = useMemo(
    () => Array.from(new Set((detail?.reports ?? []).map((report) => report.authorName).filter(Boolean))),
    [detail?.reports],
  );

  const isProfileDirty =
    detail && form ? isContributorFormDirty(detail.profile, form, avatarFile !== null) : false;

  if (isDirectoryLoading && directory.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:users"
          tone="accent"
          loading
          align="center"
          title="Loading contributors"
          description="Pulling the contributor directory into the editor."
        />
      </div>
    );
  }

  const trimmedAvatarUrl = form?.avatarUrl.trim() ?? "";

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:users"
        title="Contributors"
        description="Every contributor profile the site credits: identity, bio, links, aliases, and the order their work appears in on their public page."
        actions={
          <EditorStatusPill tone="neutral">
            {`${directory.length} profile${directory.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <EditorField
              label="Search"
              description="Matches a display name, a profile key, or any stored alias."
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, key, or alias"
                />
              )}
            </EditorField>

            <div className="space-y-2">
              {visibleProfiles.map((profile) => (
                <EditorListItem
                  key={profile.key}
                  active={profile.key === resolvedKey}
                  title={profile.displayName}
                  subtitle={
                    profile.aliases.length > 0
                      ? `${profile.key} · ${profile.aliases.slice(0, 3).join(", ")}`
                      : profile.key
                  }
                  onSelect={() => {
                    setSelectedKey(profile.key);
                    setNotice(null);
                  }}
                />
              ))}
              {visibleProfiles.length === 0 ? (
                <p className="theme-text-faint text-sm">No contributor matches that search.</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            {notice ? <EditorNotice notice={notice} /> : null}

            {detailError ? (
              <StateCard
                icon="lucide:triangle-alert"
                tone="danger"
                align="center"
                title="Could not load that contributor"
                description={detailError}
              />
            ) : null}

            {isDetailLoading && !detail ? (
              <StateCard
                icon="lucide:user-round"
                tone="accent"
                loading
                align="center"
                title="Loading profile"
                description="Fetching the stored profile, replications, and reports."
              />
            ) : null}

            {detail && form ? (
              <>
                <EditorSection
                  headingLevel="h3"
                  icon="lucide:id-card"
                  title="Identity"
                  actions={
                    <Button asChild variant="glass" size="pill" className="text-xs font-medium">
                      <Link
                        href={`/contributors/${detail.profile.key.toLowerCase()}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <Icon icon="lucide:external-link" size={14} />
                        View public profile
                      </Link>
                    </Button>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contributor-display-name">Display name</Label>
                      <Input
                        id="contributor-display-name"
                        value={form.displayName}
                        onChange={(event) => updateForm({ displayName: event.target.value })}
                        placeholder="Contributor name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contributor-role">Role</Label>
                      <Input
                        id="contributor-role"
                        value={form.role}
                        onChange={(event) => updateForm({ role: event.target.value })}
                        placeholder="Editor, Researcher, Artist…"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="contributor-membership-email">Membership email</Label>
                      <Input
                        id="contributor-membership-email"
                        type="email"
                        value={form.membershipEmail}
                        onChange={(event) => updateForm({ membershipEmail: event.target.value })}
                        placeholder="name@example.com"
                      />
                      <p className="theme-text-faint text-xs">
                        Links this profile to a sign-in, so the owner edits it themselves. Clearing
                        it leaves the profile editor-curated only.
                      </p>
                    </div>
                  </div>

                  <p className="theme-text-faint text-xs">
                    {`Key ${detail.profile.key}`}
                    {detail.profile.updatedAt
                      ? ` · last saved ${detail.profile.updatedAt.slice(0, 10)}`
                      : ""}
                    {detail.profile.updatedBy ? ` by ${detail.profile.updatedBy}` : ""}
                  </p>
                </EditorSection>

                <AvatarUpload
                  avatarPreviewSource={
                    avatarPreviewUrl ??
                    (trimmedAvatarUrl || detail.profile.storedAvatarUrl || null)
                  }
                  avatarInitials={initialsFor(form.displayName, detail.profile.key)}
                  avatarSelectionSummary={
                    avatarFile
                      ? `${avatarFile.name} • ${formatFileSize(avatarFile.size)}`
                      : detail.profile.storedAvatarUrl || trimmedAvatarUrl
                        ? "Using current image"
                        : null
                  }
                  avatarFile={avatarFile}
                  trimmedAvatarUrl={trimmedAvatarUrl}
                  onUploadClick={() => fileInputRef.current?.click()}
                  onClearSelection={() => setAvatarFile(null)}
                  onRemoveAvatar={() => {
                    setAvatarFile(null);
                    updateForm({ avatarUrl: "" });
                  }}
                  fileInputRef={fileInputRef}
                  onFileChange={handleAvatarFileChange}
                  avatarUrl={form.avatarUrl}
                  onAvatarUrlChange={(value) => updateForm({ avatarUrl: value })}
                />

                <BioEditor
                  bio={form.bio}
                  onBioChange={(bio) => updateForm({ bio })}
                  bioLength={form.bio.length}
                />

                <LinkManager
                  links={form.links}
                  onLinkChange={(index, field, value) =>
                    updateForm({
                      links: form.links.map((link, position) =>
                        position === index ? { ...link, [field]: value } : link,
                      ),
                    })
                  }
                  onRemoveLink={(index) =>
                    updateForm({ links: form.links.filter((_, position) => position !== index) })
                  }
                  onAddLink={() =>
                    updateForm({
                      links:
                        form.links.length >= MAX_LINKS
                          ? form.links
                          : [...form.links, { label: "", url: "" }],
                    })
                  }
                  hasPartialLink={form.links.some(
                    (link) => Boolean(link.label.trim()) !== Boolean(link.url.trim()),
                  )}
                />

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:tags"
                  title="Aliases"
                  description="Every byline this profile answers to. Attribution matching and the works list below both resolve through these."
                  actions={<EditorStatusPill tone="neutral">{form.aliases.length}</EditorStatusPill>}
                >
                  <div className="flex flex-wrap gap-2">
                    {form.aliases.map((alias) => (
                      <TagToken
                        key={alias}
                        label={alias}
                        variant="interactive"
                        removeLabel={`Remove alias ${alias}`}
                        onRemove={() =>
                          updateForm({ aliases: form.aliases.filter((entry) => entry !== alias) })
                        }
                      />
                    ))}
                    {form.aliases.length === 0 ? (
                      <p className="theme-text-muted text-sm">
                        No aliases yet. Bylines only match the display name.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={aliasDraft}
                      onChange={(event) => setAliasDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          updateForm({ aliases: addAlias(form.aliases, aliasDraft) });
                          setAliasDraft("");
                        }
                      }}
                      placeholder="Add an alias"
                      aria-label="Add an alias"
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!aliasDraft.trim()}
                      onClick={() => {
                        updateForm({ aliases: addAlias(form.aliases, aliasDraft) });
                        setAliasDraft("");
                      }}
                    >
                      <Icon icon="lucide:plus" size={15} />
                      Add alias
                    </Button>
                  </div>
                </EditorSection>

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:eye-off"
                  title="Visibility & provenance"
                  description="Where this artist's works surface, and how the profile itself is labelled."
                >
                  <EditorCheckbox
                    id="contributor-exclude-from-gallery"
                    label="Exclude from the Replications gallery"
                    description="Hides all of this artist's works on /replications. Effect and substance articles still show them."
                    checked={form.exclude_from_gallery}
                    onChange={(event) =>
                      updateForm({ exclude_from_gallery: event.target.checked })
                    }
                  />
                  <EditorCheckbox
                    id="contributor-archival"
                    label="Archival profile"
                    description={
                      'Shows the public "maintained by staff, not created by this person" notice under the profile handle.'
                    }
                    checked={form.archival}
                    onChange={(event) => updateForm({ archival: event.target.checked })}
                  />
                </EditorSection>

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:message-circle"
                  title="Editor's note"
                  description="Signed staff commentary rendered as a speech bubble under the public bio. Leave the note empty to remove the section."
                >
                  <EditorField
                    id="contributor-staff-note"
                    label="Note (markdown)"
                    counter={`${form.staffNoteMarkdown.length}/${MAX_BIO_LENGTH}`}
                    error={
                      form.staffNoteMarkdown.length > MAX_BIO_LENGTH
                        ? `The note must be ${MAX_BIO_LENGTH} characters or fewer.`
                        : undefined
                    }
                    errorLive
                  >
                    {(fieldProps) => (
                      <Textarea
                        {...fieldProps}
                        className="min-h-[120px] resize-y"
                        value={form.staffNoteMarkdown}
                        onChange={(event) =>
                          updateForm({ staffNoteMarkdown: event.target.value })
                        }
                        placeholder="Why this person's work matters, in the site's voice."
                        variant={
                          form.staffNoteMarkdown.length > MAX_BIO_LENGTH ? "error" : "default"
                        }
                      />
                    )}
                  </EditorField>
                  <div className="space-y-2">
                    <Label htmlFor="contributor-staff-note-attribution">Attribution</Label>
                    <Input
                      id="contributor-staff-note-attribution"
                      value={form.staffNoteAttribution}
                      onChange={(event) =>
                        updateForm({ staffNoteAttribution: event.target.value })
                      }
                      placeholder="Josie Kins · founder"
                      className="max-w-xs"
                    />
                    <p className="theme-text-faint text-xs">
                      Shown beneath the bubble next to Josie&apos;s avatar. Empty falls back to
                      Josie&apos;s public name and role.
                    </p>
                  </div>
                </EditorSection>

                <EditorToolbar variant="split">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      disabled={
                        !isProfileDirty ||
                        profileSaveState === "saving" ||
                        form.bio.length > MAX_BIO_LENGTH ||
                        !form.displayName.trim()
                      }
                      onClick={() => void handleSaveProfile()}
                    >
                      <Icon icon="lucide:save" size={15} />
                      Save profile
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isProfileDirty || profileSaveState === "saving"}
                      onClick={() => {
                        setForm(toContributorForm(detail.profile));
                        setAvatarFile(null);
                        setProfileSaveState("idle");
                      }}
                    >
                      <Icon icon="lucide:rotate-ccw" size={15} />
                      Discard changes
                    </Button>
                  </div>
                  {profileSaveState === "idle" ? (
                    <EditorStatusPill tone={isProfileDirty ? "warning" : "neutral"}>
                      {isProfileDirty ? "Unsaved changes" : "No changes"}
                    </EditorStatusPill>
                  ) : (
                    <EditorActionStatus status={profileSaveState} />
                  )}
                </EditorToolbar>

                <OrderingPanel
                  icon="lucide:image"
                  title="Works"
                  description="Replications credited to this contributor. Curated items lead the gallery on their profile; the rest follow newest first."
                  items={workItems}
                  order={workOrder}
                  savedOrder={detail.profile.replicationOrder}
                  emptyLabel="No replications are credited to this contributor's name or aliases."
                  saveState={workSaveState}
                  onOrderChange={(next) => {
                    setWorkOrder(next);
                    setWorkSaveState("idle");
                  }}
                  onSave={() => void saveOrdering("works")}
                  onReset={() => {
                    setWorkOrder([...detail.profile.replicationOrder]);
                    setWorkSaveState("idle");
                  }}
                />

                <OrderingPanel
                  icon="lucide:notebook-text"
                  title="Reports"
                  description="Trip reports credited to this contributor. Curated items lead their profile; the rest follow by trip date, newest first."
                  items={reportItems}
                  order={reportOrder}
                  savedOrder={detail.profile.reportOrder}
                  emptyLabel="No trip reports are credited to this contributor."
                  saveState={reportSaveState}
                  onOrderChange={(next) => {
                    setReportOrder(next);
                    setReportSaveState("idle");
                  }}
                  onSave={() => void saveOrdering("reports")}
                  onReset={() => {
                    setReportOrder([...detail.profile.reportOrder]);
                    setReportSaveState("idle");
                  }}
                />

                <ContributorDangerZone
                  profileKey={detail.profile.key}
                  displayName={detail.profile.displayName}
                  directory={directory}
                  knownAuthorNames={knownAuthorNames}
                  onCompleted={(message) => {
                    setNotice({ tone: "success", message });
                    setReloadToken((token) => token + 1);
                  }}
                  onProfileRemoved={() => {
                    setSelectedKey("");
                    setDetail(null);
                    setForm(null);
                  }}
                />
              </>
            ) : null}

            {!detail && !isDetailLoading && !detailError ? (
              <p className="theme-text-faint text-sm">
                Select a contributor to edit their profile.
              </p>
            ) : null}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}
