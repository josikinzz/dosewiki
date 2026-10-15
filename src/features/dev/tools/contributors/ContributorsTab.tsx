"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  EditorList,
  EditorListRow,
  EditorPanel,
  EditorSegmentedControl,
  LoadErrorState,
  Notice,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  type EditorNavOption,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { RowSkeletons } from "../home/homeParts";
import { ContributorProfileEditor, ProfileFacts, PublicProfileLink } from "./ContributorProfileEditor";
import { useContributorUnsavedWork } from "./useContributorUnsavedWork";
import { useContributorsController, type ContributorScope, type ContributorsController } from "./useContributorsController";

export type ContributorsTabProps = {
  profiles: readonly NormalizedUserProfile[];
  isDirectoryLoading: boolean;
  canEdit: boolean;
  canApprove: boolean;
  sessionProfileKey: string;
  viewerEmail?: string | null;
  initialScope?: string;
  initialKey?: string;
};

const SCOPE_OPTIONS: EditorNavOption[] = [
  { value: "all", label: "All" },
  { value: "me", label: "Just me" },
];

const DIRTY_GUARD_COPY = {
  title: "Leave this profile?",
  description:
    "This profile has changes that are not saved. Leaving drops them; the stored profile stays as it was.",
};

const LIST_SHORTCUTS = [{ keys: "/", label: "Search contributors" }] as const;

function railCount(visible: number, total: number): string {
  const noun = `profile${total === 1 ? "" : "s"}`;
  return visible === total ? `${total} ${noun}` : `${visible} of ${total} ${noun}`;
}

function startsNarrow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? !window.matchMedia("(min-width: 1024px)").matches
    : false;
}

export function ContributorsTab({
  profiles,
  isDirectoryLoading,
  canEdit,
  canApprove,
  sessionProfileKey,
  viewerEmail,
  initialScope,
  initialKey,
}: ContributorsTabProps) {
  const [narrow] = useState(startsNarrow);
  const controller = useContributorsController({
    profiles,
    canEdit,
    canApprove,
    sessionProfileKey,
    viewerEmail,
    initialScope,
    initialKey,
    startClosed: narrow,
  });
  const {
    scope,
    setScope,
    search,
    setSearch,
    directory,
    visibleProfiles,
    resolvedKey,
    selectProfile,
    closeProfile,
    hasUnsavedChanges,
    notice,
    dismissNotice,
    selfKey,
  } = controller;

  const listRef = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);
  useScrollToDetail(paneRef, tapped);

  const { guard, dialog: dirtyGuardDialog } = useDirtyGuard(hasUnsavedChanges, {
    ...DIRTY_GUARD_COPY,
    warnOnUnload: false,
  });

  useContributorUnsavedWork(controller, "contributors", "Contributors");

  const guardedSelect = useCallback(
    (key: string) => {
      if (key === resolvedKey) {
        titleRef.current?.focus({ preventScroll: true });
        return;
      }
      guard(() => {
        selectProfile(key);
        setTapped(key);
      });
    },
    [guard, resolvedKey, selectProfile],
  );
  const guardedSetScope = useCallback(
    (next: ContributorScope) => {
      if (next === scope) return;
      guard(() => setScope(next));
    },
    [guard, scope, setScope],
  );
  const focusList = () => listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    focusList();
  };
  const close = () =>
    guard(() => {
      closeProfile();
      setTapped(null);
      requestAnimationFrame(focusList);
    });

  const loadedKey = controller.detail?.profile.key ?? null;
  useEffect(() => {
    if (!tapped || loadedKey !== tapped) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [loadedKey, tapped]);

  const searchable = canEdit && scope === "all";
  useDevShortcuts(LIST_SHORTCUTS, searchable);
  useEffect(() => {
    if (!searchable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchable]);

  const directoryLoading = isDirectoryLoading && directory.length === 0;
  const searching = scope === "all" && search.trim().length > 0;
  const openEntry = directory.find((profile) => profile.key === resolvedKey) ?? null;
  const paneOpen = Boolean(resolvedKey);

  const pane = (
    <ProfilePane
      controller={controller}
      fallbackName={openEntry?.displayName ?? null}
      isSelf={resolvedKey === selfKey}
      titleRef={titleRef}
      onClose={canEdit && scope === "all" ? close : undefined}
      onBackToList={canEdit ? backToList : undefined}
      directoryLoading={directoryLoading}
    />
  );

  return (
    <div className="space-y-8">
      {dirtyGuardDialog}
      <DevToolSection
        tool="contributors"
        title={canEdit ? undefined : "Your profile"}
        description={
          !canEdit
            ? "What your public contributor page shows: your name, picture, bio and links."
            : scope === "me"
              ? "Your own contributor profile, and the order your work appears in on your page."
              : "Every profile the site credits. Open one to edit its name, picture, bio, links and aliases, and the order its work appears in."
        }
      >
        {canEdit ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
            <section
              ref={listRef}
              aria-labelledby="contributors-list-heading"
              className="scroll-mt-24 space-y-3 lg:sticky lg:top-24"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 id="contributors-list-heading" className="type-meta-label theme-text-muted">
                  Profiles
                </h3>
                <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
                  {directoryLoading ? "Loading" : railCount(visibleProfiles.length, directory.length)}
                </p>
              </div>
              <EditorSegmentedControl
                label="Scope"
                value={scope}
                onChange={(value) => guardedSetScope(value as ContributorScope)}
                options={SCOPE_OPTIONS}
              />
              {notice ? <Notice {...notice} dismiss={dismissNotice} className="text-sm" /> : null}
              {scope === "all" ? (
                <div className="relative">
                  <Icon icon="lucide:search" size={15} className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    ref={searchRef}
                    type="search"
                    aria-label="Search"
                    aria-description="Matches a display name, a profile key, or any stored alias."
                    aria-keyshortcuts="/"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && search) {
                        event.preventDefault();
                        setSearch("");
                      }
                    }}
                    placeholder="Name, key, or alias"
                    className="pl-9 pr-9 text-[16px] md:text-sm"
                  />
                  {search ? null : (
                    <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden">
                      <kbd className="theme-dev-kbd">/</kbd>
                    </span>
                  )}
                </div>
              ) : null}

              {directoryLoading ? (
                <RowSkeletons rows={6} label="contributors" />
              ) : (
                <EditorList
                  label="Contributors"
                  items={visibleProfiles}
                  getKey={(profile) => profile.key}
                  selectedKey={resolvedKey || null}
                  onSelect={guardedSelect}
                  estimateRowHeight={60}
                  maxHeight="min(calc(100dvh - 19rem), 680px)"
                  emptyText={
                    scope === "me"
                      ? "No stored profile yet. Your first save creates it."
                      : searching
                        ? "No profile matches that search."
                        : "No contributor profiles yet."
                  }
                  renderItem={(profile, { selected }) => (
                    <ContributorRow
                      profile={profile}
                      active={selected}
                      self={profile.key === selfKey}
                      dirty={selected && hasUnsavedChanges}
                    />
                  )}
                />
              )}
              {searching && visibleProfiles.length === 0 && directory.length > 0 ? (
                <p className="theme-text-muted text-sm">
                  {`Nothing answers to "${search.trim()}" by name, key or alias. `}
                  <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setSearch("")}>
                    Clear the search
                  </Button>
                </p>
              ) : null}
              {!directoryLoading && visibleProfiles.length > 0 ? (
                <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
                  <kbd className="theme-dev-kbd">↑</kbd> <kbd className="theme-dev-kbd">↓</kbd> move
                  {scope === "all" ? (
                    <>
                      , <kbd className="theme-dev-kbd">/</kbd> search
                    </>
                  ) : null}
                  , <kbd className="theme-dev-kbd">?</kbd> every key
                </p>
              ) : null}
            </section>

            <section
              ref={paneRef}
              aria-label={openEntry ? `Profile: ${openEntry.displayName}` : "Profile"}
              className={cn("scroll-mt-24 min-w-0", !paneOpen && "hidden lg:block")}
            >
              {paneOpen ? pane : <IdlePane loading={directoryLoading} />}
            </section>
          </div>
        ) : (
          <div className="max-w-4xl">{pane}</div>
        )}
      </DevToolSection>
    </div>
  );
}

function ContributorRow({
  profile,
  active,
  self,
  dirty,
}: {
  profile: NormalizedUserProfile;
  active: boolean;
  self: boolean;
  dirty: boolean;
}) {
  return (
    <EditorListRow active={active} className="min-h-[3.5rem] py-2">
      <ContributorAvatar imageUrl={profile.avatarUrl} name={profile.displayName} size="xs" className="[&>div]:h-9 [&>div]:w-9 [&>div]:text-xs" />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("min-w-0 truncate text-sm font-semibold", active ? "theme-accent-heading" : "theme-text-primary")}>
            <span data-row-name="">{profile.displayName}</span>
            {self ? <span className="theme-text-muted font-normal"> (you)</span> : null}
          </span>
          {dirty ? (
            <span className="theme-text-muted flex shrink-0 items-center gap-1.5 text-xs">
              <span className="sr-only">, </span>
              <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
              <span>Unsaved</span>
            </span>
          ) : null}
        </span>
        <span className="theme-text-faint block truncate text-xs">
          <span className="sr-only">, </span>
          <span className="font-mono">{profile.key}</span>
          {profile.aliases.length > 0 ? ` · ${profile.aliases.slice(0, 3).join(", ")}` : ""}
        </span>
      </span>
    </EditorListRow>
  );
}

function IdlePane({ loading }: { loading: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6" aria-busy={loading || undefined}>
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:id-card" size={18} className="theme-icon-accent shrink-0" />
        {loading ? "Loading the directory" : "Pick a profile to edit"}
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its name, picture, bio, links and aliases open here, with the order its works and reports appear in. Each save
        goes live on the public contributor page.
      </p>
    </EditorPanel>
  );
}

function ProfilePane({
  controller,
  fallbackName,
  isSelf,
  titleRef,
  onClose,
  onBackToList,
  directoryLoading,
}: {
  controller: ContributorsController;
  fallbackName: string | null;
  isSelf: boolean;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
  onClose?: () => void;
  onBackToList?: () => void;
  directoryLoading: boolean;
}) {
  const headingId = useId();
  const { detail, detailError, isDetailLoading, retryDetail, canEdit, canWrite } = controller;
  const profile = detail?.profile ?? null;
  const name = profile?.displayName ?? fallbackName ?? (directoryLoading || isDetailLoading ? "Loading profile" : "Profile");
  const picture = profile ? profile.avatarUrl || profile.storedAvatarUrl || null : null;

  return (
    <EditorPanel className="overflow-visible" data-testid="contributor-pane" aria-labelledby={headingId} role="region">
      <header className="theme-portal-rule relative space-y-2 border-b px-4 py-3.5 sm:px-5">
        {onClose ? (
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
        ) : null}
        {onBackToList ? (
          <div className="pr-12 lg:hidden">
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
              <Icon icon="lucide:arrow-left" size={14} />
              Back to list
            </Button>
          </div>
        ) : null}
        <div className={cn("flex min-w-0 items-center gap-3", onClose && "lg:pr-12")}>
          <ContributorAvatar imageUrl={picture} name={profile?.displayName ?? fallbackName ?? "?"} size="xs" />
          <div className="min-w-0 flex-1 space-y-1">
            <h3
              id={headingId}
              ref={titleRef}
              tabIndex={-1}
              className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
            >
              <span className="sr-only">{canWrite ? "Editing " : "Viewing "}</span>
              {name}
              {isSelf ? <span className="theme-text-muted text-base font-normal"> (you)</span> : null}
            </h3>
            {profile ? <ProfileFacts profile={profile} canEdit={canEdit} /> : null}
          </div>
        </div>
        {profile ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
            <PublicProfileLink profileKey={profile.key} />
            {!canWrite ? (
              <span className="theme-text-faint inline-flex items-center gap-1 text-xs">
                <Icon icon="lucide:lock" size={12} />
                Read only
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        {detailError ? (
          <LoadErrorState what="this profile" message={detailError} onRetry={retryDetail} busy={isDetailLoading} />
        ) : null}
        {!detail && !detailError ? <PaneSkeleton /> : null}
        <ContributorProfileEditor controller={controller} showFacts={false} showSaveLine saveShortcut />
      </div>
    </EditorPanel>
  );
}

function PaneSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading profile</span>
      {[62, 40, 80].map((width) => (
        <div key={width} aria-hidden className="space-y-2.5">
          <span className="theme-skeleton-pulse block h-3.5 w-24 rounded-chip" />
          <span className="theme-skeleton-pulse block h-10 rounded-control" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}
