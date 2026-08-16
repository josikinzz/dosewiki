"use client";

/**
 * Banner Studio — `/dev` → Banners, deep-linked at `/dev/banners/<slug>`.
 *
 * Two jobs with very different frequencies live in one tab (design brief §3):
 * `Presets` authors the five-or-so banners that will ever exist, `Coverage`
 * audits what a reader actually sees on one substance. This module owns
 * everything the two views must not disagree about — the preset list, the loaded
 * corpus, the draft, every write, and the rollout readout.
 *
 * Two disciplines are load-bearing. Banners are opt-in: nothing here maps a
 * classification onto a rendered banner, and the candidate finder's class
 * matchers only ever produce slugs for an editor to enable by hand. And saving
 * is never optimistic — the route's echoed `enabledSlugs` is adopted verbatim
 * because the server drops slugs that no longer resolve, and a pruned slug that
 * silently stayed on screen would be a lie about what the public site shows.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  compareWarningBanners,
  isWarningBannerLinkSection,
  isWarningBannerTone,
  normalizeEnabledSlugs,
  normalizeLinks,
  normalizeMatchers,
  type WarningBannerLink,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import {
  EditorNavTabs,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { api } from "../../../../../convex/_generated/api";
import { CoverageView } from "./CoverageView";
import { PresetsView } from "./PresetsView";
import { WarningBannersBoundary } from "./WarningBannersBoundary";
import {
  cachedWarningBannerTargets,
  fetchWarningBannerTargets,
  type WarningBannerTarget,
} from "./warningBannerTargets";

const WARNING_BANNER_API = "/api/dev/warning-banner";

/**
 * The stored row as it arrives from `warningBannerPresets`. `tone` and
 * `links[].sectionId` are `v.string()` on the wire, so they are narrowed below
 * rather than trusted — the union lives in `src/data/substanceWarningBanners.ts`
 * and the validator cannot express it.
 */
type WarningBannerPresetDoc = {
  key: string;
  label: string;
  tone: string;
  icon: string;
  severityLabel: string;
  headline: string;
  points: string[];
  links: { label: string; sectionId: string }[];
  priority: number;
  enabled: boolean;
  enabledSlugs: string[];
  candidateMatchers: string[];
};

type StudioView = "presets" | "coverage";

type SaveState = EditorActionStatusState | "idle";

/**
 * `origin === null` marks a preset that does not exist yet, which is what makes
 * the key field editable and Save an insert rather than an update.
 */
type PresetEditor = {
  origin: WarningBannerPreset | null;
  draft: WarningBannerPreset;
};

const BLANK_PRESET: WarningBannerPreset = {
  key: "",
  label: "",
  tone: "danger",
  icon: "",
  severityLabel: "",
  headline: "",
  points: [""],
  links: [],
  priority: 0,
  // Both opt-in gates start shut, so a half-written preset cannot reach a
  // reader between its first Save and the editor finishing the copy.
  enabled: false,
  enabledSlugs: [],
  candidateMatchers: [],
};

export type WarningBannersTabProps = {
  /** `/dev/banners/<slug>` — opens Coverage on that substance. */
  initialSubstanceSlug?: string;
};

/**
 * Exported entry point. The boundary sits outside `WarningBannersStudio` because
 * `useQuery` throws during that component's render when Convex cannot answer, and
 * a boundary cannot catch a throw from itself.
 */
export function WarningBannersTab(props: WarningBannersTabProps) {
  return (
    <WarningBannersBoundary>
      <WarningBannersStudio {...props} />
    </WarningBannersBoundary>
  );
}

function WarningBannersStudio({ initialSubstanceSlug }: WarningBannersTabProps) {
  const rows = useQuery(api.warningBanners.listPresets) as
    | WarningBannerPresetDoc[]
    | undefined;

  const presets = useMemo(() => {
    const mapped = (rows ?? []).map((row): WarningBannerPreset => {
      const links = row.links.flatMap((link): WarningBannerLink[] =>
        isWarningBannerLinkSection(link.sectionId)
          ? [{ label: link.label, sectionId: link.sectionId }]
          : [],
      );
      return {
        key: row.key,
        label: row.label,
        // A row whose tone predates the union would otherwise render an
        // unstyled banner; `caution` is the quietest surface to fall back to,
        // and the tone selector shows the editor what it landed on.
        tone: isWarningBannerTone(row.tone) ? row.tone : "caution",
        icon: row.icon,
        severityLabel: row.severityLabel,
        headline: row.headline,
        points: row.points,
        links: normalizeLinks(links),
        priority: row.priority,
        enabled: row.enabled,
        enabledSlugs: row.enabledSlugs,
        candidateMatchers: row.candidateMatchers,
      };
    });
    return mapped.sort(compareWarningBanners);
  }, [rows]);

  const [targets, setTargets] = useState<WarningBannerTarget[]>(
    () => cachedWarningBannerTargets ?? [],
  );
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsToken, setTargetsToken] = useState(0);
  const [view, setView] = useState<StudioView>(
    initialSubstanceSlug ? "coverage" : "presets",
  );
  const [coverageSlug, setCoverageSlug] = useState(initialSubstanceSlug ?? "");
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const [iconValid, setIconValid] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WarningBannerPreset | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWarningBannerTargets({ refresh: targetsToken > 0 }).then(
      (items) => {
        if (!cancelled) {
          setTargets(items);
          setTargetsError(null);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setTargetsError(
            error instanceof Error ? error.message : "The substance list could not be loaded.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [targetsToken]);

  // A deep link can arrive while the tab is already mounted — an editor reading
  // an article clicks through to `/dev/banners/<slug>` and the controller hands
  // down a new slug rather than remounting. Mirrors `ReplicationStudioTab`.
  useEffect(() => {
    if (initialSubstanceSlug) {
      setCoverageSlug(initialSubstanceSlug);
      setView("coverage");
    }
  }, [initialSubstanceSlug]);

  /**
   * The blast radius, and the loudest thing on the page (design brief §2). A
   * substance counts once however many presets reach it, because the question
   * being answered is "does a reader see a banner here", not "how many".
   */
  const liveSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const preset of presets) {
      if (!preset.enabled) {
        continue;
      }
      for (const slug of preset.enabledSlugs) {
        slugs.add(slug);
      }
    }
    return slugs;
  }, [presets]);

  /**
   * One POST is every write in this tool: authoring copy, enabling a class of
   * substances, and disabling one slug all submit the whole preset. Returns the
   * server's `enabledSlugs` for the caller to adopt, or `null` when the write
   * failed and the caller must leave stored state alone.
   */
  const submitPreset = useCallback(
    async (preset: WarningBannerPreset): Promise<string[] | null> => {
      const submitted = normalizeEnabledSlugs(preset.enabledSlugs);
      setSaveState("saving");
      setNotice(null);

      try {
        const response = await fetch(WARNING_BANNER_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: preset.key.trim(),
            label: preset.label.trim(),
            tone: preset.tone,
            icon: preset.icon.trim(),
            severityLabel: preset.severityLabel.trim(),
            headline: preset.headline.trim(),
            points: preset.points.map((point) => point.trim()).filter(Boolean),
            links: normalizeLinks(preset.links),
            priority: preset.priority,
            enabled: preset.enabled,
            enabledSlugs: submitted,
            candidateMatchers: normalizeMatchers(preset.candidateMatchers),
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          enabledSlugs?: string[];
        };
        const echoed = payload.enabledSlugs;
        if (!response.ok || !echoed) {
          throw new Error(payload.error ?? "The preset could not be saved.");
        }

        setSaveState("saved");

        const dropped = submitted.filter((slug) => !echoed.includes(slug));
        if (dropped.length > 0) {
          setNotice({
            tone: "warning",
            title: `${dropped.length} slug${dropped.length === 1 ? "" : "s"} dropped on save`,
            message: (
              <>
                {"Saved, but these do not resolve to an article and were removed: "}
                <span className="font-mono">{dropped.join(", ")}</span>
                {". Everything else is stored as submitted."}
              </>
            ),
          });
        }

        return echoed;
      } catch (error) {
        setSaveState("error");
        setNotice({
          tone: "danger",
          title: "Couldn't save that preset",
          message: error instanceof Error ? error.message : "The preset could not be saved.",
        });
        return null;
      }
    },
    [],
  );

  /**
   * Every enablement change, from Coverage's single `Disable on <slug>` to the
   * candidate finder's `Enable all N candidates`, funnels through here so all
   * of them write straight through and all of them offer Undo. Reversible and
   * high-frequency actions get no confirm dialog — one there would be clicked
   * through blindly (design brief §7); only deleting authored prose confirms.
   *
   * A plain function rather than a `useCallback` so Undo can re-enter it with
   * the previous list, which is the whole of the undo mechanism.
   */
  async function commitEnabledSlugs(
    preset: WarningBannerPreset,
    nextSlugs: string[],
    summary: string,
  ) {
    const previous = preset.enabledSlugs;
    const echoed = await submitPreset({ ...preset, enabledSlugs: nextSlugs });
    if (!echoed) {
      return;
    }

    const adopted: WarningBannerPreset = { ...preset, enabledSlugs: echoed };
    // Keep an open drawer in step with a write made from inside it, so the
    // dirty pill does not claim unsaved changes the server already has.
    if (editor && (editor.origin === null || editor.origin.key === preset.key)) {
      setEditor({ origin: adopted, draft: adopted });
    }

    setNotice({
      tone: "info",
      message: summary,
      actions: (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void commitEnabledSlugs(
              adopted,
              previous,
              `Restored the previous list for “${preset.label || preset.key}”.`,
            );
          }}
        >
          <Icon icon="lucide:undo-2" size={15} />
          Undo
        </Button>
      ),
    });
  }

  const openPreset = useCallback((preset: WarningBannerPreset | null) => {
    setEditor(preset ? { origin: preset, draft: preset } : null);
    setSaveState("idle");
    setNotice(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor) {
      return;
    }
    const echoed = await submitPreset(editor.draft);
    if (!echoed) {
      return;
    }
    // Not optimism: the write returned OK, so the copy fields are stored as
    // submitted and only `enabledSlugs` may have been pruned. Re-seeding origin
    // and draft together is what clears the dirty pill.
    const adopted: WarningBannerPreset = { ...editor.draft, enabledSlugs: echoed };
    setEditor({ origin: adopted, draft: adopted });
  }, [editor, submitPreset]);

  const handleDelete = useCallback(async () => {
    const preset = pendingDelete;
    if (!preset) {
      return;
    }
    setPendingDelete(null);
    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch(WARNING_BANNER_API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: preset.key }),
      });
      const payload = (await response.json()) as { error?: string; removed?: boolean };
      if (!response.ok) {
        throw new Error(payload.error ?? "The preset could not be deleted.");
      }
      setSaveState("saved");
      setEditor(null);
      setNotice({
        tone: "info",
        message: `Deleted “${preset.label || preset.key}”. Nothing renders it now.`,
      });
    } catch (error) {
      setSaveState("error");
      setNotice({
        tone: "danger",
        title: "Couldn't delete that preset",
        message: error instanceof Error ? error.message : "The preset could not be deleted.",
      });
    }
  }, [pendingDelete]);

  if (rows === undefined) {
    return (
      <div className="mx-auto mt-10 max-w-xl">
        <StateCard
          icon="lucide:triangle-alert"
          tone="accent"
          loading
          align="center"
          title="Loading banner presets"
          description="Reading the stored presets and the substances each one is enabled on."
        />
      </div>
    );
  }

  const isDirty = editor
    ? editor.origin === null || JSON.stringify(editor.origin) !== JSON.stringify(editor.draft)
    : false;
  const nothingLive = liveSlugs.size === 0;
  // A new preset has no row to expand, so nothing in the table is marked open.
  const openKey = editor?.origin?.key ?? null;

  return (
    <div className="mt-6 space-y-8 md:mt-8">
      <EditorSection
        icon="lucide:triangle-alert"
        title="Banner Studio"
        description="Drug-class safety banners. A preset renders on a substance only when it is enabled and that substance is on its list — never because of how the article is classified."
        actions={
          <EditorStatusPill tone="neutral">
            {`${presets.length} preset${presets.length === 1 ? "" : "s"}`}
          </EditorStatusPill>
        }
      >
        {/* The rollout readout. Deliberately the largest type in the tool: no
            other /dev surface leads with the blast radius of its own data, and
            it stays at zero until an editor acts (design brief §2). */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p
            className={
              nothingLive
                ? "theme-text-primary font-display text-[22px] font-semibold tabular-nums"
                : "font-display text-[22px] font-semibold tabular-nums text-dose-success"
            }
          >
            {targets.length > 0
              ? `${liveSlugs.size} of ${targets.length} substances show a banner`
              : `${liveSlugs.size} substances show a banner`}
          </p>
          {nothingLive ? (
            <p className="theme-text-secondary text-sm">
              No preset is live. Nothing on the public site shows a banner.
            </p>
          ) : null}
        </div>

        {targetsError ? (
          <EditorNotice
            notice={{
              tone: "danger",
              title: "Couldn't load the substance list",
              message: (
                <>
                  {targetsError}
                  {" Candidate suggestions and the Coverage rail stay empty until it loads."}
                </>
              ),
              actions: (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setTargetsToken((token) => token + 1)}
                >
                  <Icon icon="lucide:refresh-cw" size={15} />
                  Retry
                </Button>
              ),
            }}
          />
        ) : null}

        {notice ? <EditorNotice notice={notice} /> : null}

        <EditorNavTabs
          label="Banner Studio views"
          value={view}
          onChange={(next) => setView(next === "coverage" ? "coverage" : "presets")}
          options={[
            { value: "presets", label: "Presets", icon: "lucide:layers", badge: presets.length },
            {
              value: "coverage",
              label: "Coverage",
              icon: "lucide:list-checks",
              badge: liveSlugs.size,
            },
          ]}
        />

        {initialSubstanceSlug ? (
          <p className="theme-text-faint text-xs">
            {"Opened from "}
            <span className="font-mono">{`/dev/banners/${initialSubstanceSlug}`}</span>
            {" — Coverage started on that substance."}
          </p>
        ) : null}

        {view === "presets" ? (
          <PresetsView
            presets={presets}
            targets={targets}
            openKey={openKey}
            draft={editor?.draft ?? null}
            isNew={editor !== null && editor.origin === null}
            isDirty={isDirty}
            saveState={saveState}
            iconValid={iconValid}
            onIconValidityChange={setIconValid}
            onDraftChange={(draft) => {
              setSaveState("idle");
              setEditor((current) => (current ? { ...current, draft } : current));
            }}
            onOpen={openPreset}
            onCreate={() => {
              setEditor({ origin: null, draft: BLANK_PRESET });
              setSaveState("idle");
              setNotice(null);
            }}
            onSave={() => void handleSave()}
            onDiscard={() =>
              setEditor((current) =>
                current?.origin ? { origin: current.origin, draft: current.origin } : null,
              )
            }
            onCommitEnabledSlugs={commitEnabledSlugs}
            onRequestDelete={setPendingDelete}
            onInspectCoverage={(slug) => {
              setCoverageSlug(slug);
              setView("coverage");
            }}
          />
        ) : (
          <CoverageView
            presets={presets}
            targets={targets}
            activeSlug={coverageSlug}
            onActiveSlugChange={setCoverageSlug}
            saveState={saveState}
            onCommitEnabledSlugs={commitEnabledSlugs}
            onEditPreset={(preset) => {
              openPreset(preset);
              setView("presets");
            }}
          />
        )}
      </EditorSection>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete preset</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `“${pendingDelete.label || pendingDelete.key}” is enabled on ${pendingDelete.enabledSlugs.length} substance${pendingDelete.enabledSlugs.length === 1 ? "" : "s"}. Deleting destroys its headline and mechanism points, and it stops rendering everywhere.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingDelete(null)}>
              Keep preset
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete()}>
              <Icon icon="lucide:trash-2" size={15} />
              Delete preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
