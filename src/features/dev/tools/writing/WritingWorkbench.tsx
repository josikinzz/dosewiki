"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import {
  EditorActionStatus,
  EditorField,
  EditorListItem,
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  EditorToolbar,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  checkSlugAvailability,
  draftFromRow,
  emptyWritingDraft,
  isEditableHere,
  parseTagList,
  sortWritingEntries,
  suggestSlug,
  type WritingArticleRow,
  type WritingDraft,
  type WritingKind,
  type WritingListEntry,
} from "./writingEditorModel";

const API_PATH = "/api/dev/writing-article";

const INPUT_CLASS =
  "w-full rounded-lg border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2 text-sm theme-text-primary transition focus:border-[color:var(--theme-accent-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--theme-accent-strong)]/30";

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2.5 font-mono text-[0.8125rem] leading-6 theme-text-primary transition focus:border-[color:var(--theme-accent-strong)] focus:outline-none focus:ring-2 focus:ring-[color:var(--theme-accent-strong)]/30";

type SaveState = EditorActionStatusState | "idle";

/** A pinned rail entry that owns the whole right pane when selected. */
export interface WritingPinnedEntry {
  id: string;
  title: string;
  subtitle: string;
  render: () => ReactNode;
}

interface WritingWorkbenchProps {
  kind: WritingKind;
  heading: string;
  description: string;
  /** Blog posts lead with a cover image and a teaser; articles do not. */
  emphasiseCover?: boolean;
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** Rendered above the list, always first. Used by Writing for About. */
  pinnedEntry?: WritingPinnedEntry;
  /**
   * Deep-linked selection: `/dev/writing/<slug>`, or the pinned entry's id.
   */
  initialSelection?: string;
}

type Selection = { type: "pinned" } | { type: "new" } | { type: "row"; slug: string };

/**
 * The shared Writing/Blog workbench: a rail of the rows of one kind, and a
 * Markdown editor with a live preview rendered through the very component the
 * public page uses, so what the editor sees is what the page will show.
 *
 * The listing and the single-row read are editor-gated Convex queries, which the
 * dev shell's identity-less Convex client cannot call; both go through
 * `/api/dev/writing-article`, as every editor-only read in this repo does.
 */
export function WritingWorkbench({
  kind,
  heading,
  description,
  emphasiseCover = false,
  contributorProfiles,
  profilesLoading = false,
  pinnedEntry,
  initialSelection,
}: WritingWorkbenchProps) {
  const [entries, setEntries] = useState<WritingListEntry[] | null>(null);
  const [selection, setSelection] = useState<Selection>(() =>
    pinnedEntry && (!initialSelection || initialSelection === pinnedEntry.id)
      ? { type: "pinned" }
      : initialSelection
        ? { type: "row", slug: initialSelection }
        : { type: "new" },
  );
  const [draft, setDraft] = useState<WritingDraft>(emptyWritingDraft);
  const [loadedRow, setLoadedRow] = useState<WritingArticleRow | null>(null);
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // True once the editor edits the slug by hand; from then on the title stops
  // driving it, so a late title fix cannot silently move a published URL.
  const slugTouchedRef = useRef(false);

  const refreshList = useCallback(async () => {
    try {
      const response = await fetch(API_PATH);
      const payload = (await response.json()) as {
        articles?: WritingListEntry[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "The article list could not be loaded.");
      }

      setEntries(payload.articles ?? []);
      setListError(null);
    } catch (error) {
      setEntries([]);
      setListError(
        error instanceof Error ? error.message : "The article list could not be loaded.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const kindEntries = useMemo(
    () => sortWritingEntries((entries ?? []).filter((entry) => entry.kind === kind)),
    [entries, kind],
  );

  const selectedSlug = selection.type === "row" ? selection.slug : null;

  // The body of the selected row, fetched on selection. The listing carries no
  // bodies on purpose, so opening an entry is what pays for one.
  useEffect(() => {
    if (!selectedSlug) {
      setLoadedRow(null);
      return;
    }

    let cancelled = false;
    setIsLoadingRow(true);

    void (async () => {
      try {
        const response = await fetch(`${API_PATH}?slug=${encodeURIComponent(selectedSlug)}`);
        const payload = (await response.json()) as {
          article?: WritingArticleRow | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "That article could not be loaded.");
        }

        if (cancelled) {
          return;
        }

        if (!payload.article) {
          setNotice({ tone: "danger", message: "That article is no longer there." });
          setLoadedRow(null);
          return;
        }

        slugTouchedRef.current = true;
        setLoadedRow(payload.article);
        setDraft(draftFromRow(payload.article));
        setSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: "danger",
            title: "Load failed",
            message: error instanceof Error ? error.message : "That article could not be loaded.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRow(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const slugAvailability = checkSlugAvailability(draft.slug, entries ?? [], selectedSlug);
  const readOnly = loadedRow !== null && !isEditableHere(loadedRow);
  const canSave =
    !readOnly &&
    draft.title.trim().length > 0 &&
    (slugAvailability.state === "free" || slugAvailability.state === "current") &&
    saveState !== "saving";

  const startNew = useCallback(() => {
    slugTouchedRef.current = false;
    setSelection({ type: "new" });
    setLoadedRow(null);
    setDraft(emptyWritingDraft());
    setSaveState("idle");
    setNotice(null);
  }, []);

  const updateTitle = useCallback((title: string) => {
    setDraft((current) => ({
      ...current,
      title,
      slug: slugTouchedRef.current ? current.slug : suggestSlug(title),
    }));
  }, []);

  const toggleByline = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      authorProfileKeys: current.authorProfileKeys.includes(key)
        ? current.authorProfileKeys.filter((entry) => entry !== key)
        : [...current.authorProfileKeys, key],
    }));
  }, []);

  const handleSave = useCallback(
    async (status: WritingDraft["status"]) => {
      setSaveState("saving");
      setNotice(null);

      try {
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: draft.slug.trim(),
            kind,
            status,
            title: draft.title.trim(),
            teaser: draft.teaser,
            coverImageUrl: draft.coverImageUrl,
            body: draft.body,
            tags: parseTagList(draft.tags),
            authorProfileKeys: draft.authorProfileKeys,
            publicationDate: draft.publicationDate.trim() || undefined,
          }),
        });

        const payload = (await response.json()) as { slug?: string; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "The article could not be saved.");
        }

        setDraft((current) => ({ ...current, status }));
        setSaveState("saved");
        setSelection({ type: "row", slug: draft.slug.trim() });
        setNotice({
          tone: "success",
          message:
            status === "published"
              ? "Published. The public pages are rebuilding with it now."
              : "Saved as a draft. It stays off the public site until you publish it.",
        });
        await refreshList();
      } catch (error) {
        setSaveState("error");
        setNotice({
          tone: "danger",
          title: "Save failed",
          message: error instanceof Error ? error.message : "The article could not be saved.",
        });
      }
    },
    [draft, kind, refreshList],
  );

  if (entries === null) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:pen-line"
          tone="accent"
          loading
          align="center"
          title={`Loading ${heading.toLowerCase()}`}
          description="Pulling the editor listing, drafts included."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:pen-line"
        title={heading}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <EditorStatusPill tone="neutral">
              {`${kindEntries.length} ${kindEntries.length === 1 ? "entry" : "entries"}`}
            </EditorStatusPill>
            <Button type="button" variant="accent" size="sm" onClick={startNew}>
              <Icon icon="lucide:plus" size={15} />
              New
            </Button>
          </div>
        }
      >
        {listError ? (
          <EditorNotice notice={{ tone: "danger", title: "List unavailable", message: listError }} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            {pinnedEntry ? (
              <EditorListItem
                active={selection.type === "pinned"}
                title={pinnedEntry.title}
                subtitle={pinnedEntry.subtitle}
                badge={<EditorStatusPill tone="info">Pinned</EditorStatusPill>}
                onSelect={() => {
                  setSelection({ type: "pinned" });
                  setNotice(null);
                }}
              />
            ) : null}

            {selection.type === "new" ? (
              <EditorListItem
                active
                title={draft.title.trim() || "Untitled"}
                subtitle="New — unsaved"
                badge={<EditorStatusPill tone="warning">New</EditorStatusPill>}
                onSelect={() => undefined}
              />
            ) : null}

            {kindEntries.map((entry) => (
              <EditorListItem
                key={entry.slug}
                active={selectedSlug === entry.slug}
                title={entry.title}
                subtitle={entry.slug}
                badge={
                  <EditorStatusPill tone={entry.status === "draft" ? "warning" : "success"}>
                    {entry.status === "draft" ? "Draft" : "Live"}
                  </EditorStatusPill>
                }
                onSelect={() => {
                  setSelection({ type: "row", slug: entry.slug });
                  setNotice(null);
                }}
              />
            ))}

            {kindEntries.length === 0 ? (
              <p className="theme-text-faint px-1 text-sm">Nothing written here yet.</p>
            ) : null}
          </div>

          <div className="space-y-6">
            {selection.type === "pinned" && pinnedEntry ? (
              pinnedEntry.render()
            ) : isLoadingRow ? (
              <p className="theme-text-faint text-sm">Loading…</p>
            ) : (
              <>
                {notice ? <EditorNotice notice={notice} /> : null}

                {readOnly ? (
                  <EditorNotice
                    notice={{
                      tone: "warning",
                      title: "Read-only",
                      message:
                        "This is an archived VCode article. This editor writes Markdown, so it will not rewrite the body it cannot speak.",
                    }}
                  />
                ) : null}

                <EditorField label="Title">
                  <input
                    className={INPUT_CLASS}
                    value={draft.title}
                    disabled={readOnly}
                    onChange={(event) => updateTitle(event.target.value)}
                  />
                </EditorField>

                <EditorField
                  label="Slug"
                  description={
                    kind === "blog" ? "The post lives at /blog/<slug>." : "The article lives at /articles/<slug>."
                  }
                  counter={slugStatusLabel(slugAvailability.state)}
                >
                  <input
                    className={INPUT_CLASS}
                    value={draft.slug}
                    disabled={readOnly}
                    onChange={(event) => {
                      slugTouchedRef.current = true;
                      setDraft((current) => ({ ...current, slug: event.target.value }));
                    }}
                  />
                  {"message" in slugAvailability ? (
                    <p className="theme-text-faint mt-1.5 text-xs">{slugAvailability.message}</p>
                  ) : null}
                </EditorField>

                {emphasiseCover ? (
                  <EditorField
                    label="Cover image URL"
                    description="Shown on the blog index card and above the post."
                  >
                    <input
                      className={INPUT_CLASS}
                      value={draft.coverImageUrl}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, coverImageUrl: event.target.value }))
                      }
                    />
                  </EditorField>
                ) : null}

                <EditorField
                  label="Teaser"
                  description={
                    emphasiseCover
                      ? "The standfirst under the title, and the blurb on the index card."
                      : "One or two sentences, shown under the title and in listings."
                  }
                  counter={`${draft.teaser.length} characters`}
                >
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={draft.teaser}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, teaser: event.target.value }))
                    }
                  />
                </EditorField>

                <EditorField label="Byline" description="Contributor profiles credited on the page.">
                  {profilesLoading ? (
                    <p className="theme-text-faint text-sm">Loading contributors…</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {contributorProfiles.map((profile) => {
                        const active = draft.authorProfileKeys.includes(profile.key);
                        return (
                          <Button
                            key={profile.key}
                            type="button"
                            size="sm"
                            variant={active ? "accent" : "secondary"}
                            disabled={readOnly}
                            onClick={() => toggleByline(profile.key)}
                          >
                            {profile.displayName}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </EditorField>

                <EditorField label="Tags" description="Comma separated.">
                  <input
                    className={INPUT_CLASS}
                    value={draft.tags}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                  />
                </EditorField>

                <EditorField label="Publication date" description="YYYY-MM-DD.">
                  <input
                    className={INPUT_CLASS}
                    value={draft.publicationDate}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, publicationDate: event.target.value }))
                    }
                  />
                </EditorField>

                <EditorField
                  label="Body"
                  description="Markdown. Headings become the article's contents rail."
                  counter={`${draft.body.length} characters`}
                >
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={20}
                    value={draft.body}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, body: event.target.value }))
                    }
                  />
                </EditorField>

                <EditorToolbar variant="split">
                  <div className="flex flex-wrap items-center gap-2">
                    <EditorSegmentedControl
                      label="Publication state"
                      value={draft.status}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          status: value as WritingDraft["status"],
                        }))
                      }
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "published", label: "Published" },
                      ]}
                    />
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      disabled={!canSave}
                      onClick={() => void handleSave(draft.status)}
                    >
                      <Icon icon="lucide:save" size={15} />
                      {draft.status === "published" ? "Save & publish" : "Save draft"}
                    </Button>
                  </div>
                  {saveState === "idle" ? (
                    <EditorStatusPill tone={draft.status === "published" ? "success" : "warning"}>
                      {draft.status === "published" ? "Public" : "Draft — not public"}
                    </EditorStatusPill>
                  ) : (
                    <EditorActionStatus status={saveState} />
                  )}
                </EditorToolbar>

                <EditorSection
                  headingLevel="h3"
                  icon="lucide:eye"
                  title="Preview"
                  description="Rendered with the same Markdown components the public page uses."
                >
                  <PublicMarkdownBody content={draft.body} />
                </EditorSection>
              </>
            )}
          </div>
        </div>
      </EditorSection>
    </div>
  );
}

function slugStatusLabel(state: string): string {
  switch (state) {
    case "free":
      return "Available";
    case "current":
      return "Current slug";
    case "taken":
      return "Taken";
    case "invalid":
      return "Invalid";
    default:
      return "";
  }
}
